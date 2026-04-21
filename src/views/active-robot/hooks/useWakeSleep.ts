import { useState, useCallback, useRef } from 'react';
import { DAEMON_CONFIG, fetchWithTimeout, buildApiUrl, getWsBaseUrl } from '../../../config/daemon';
import useAppStore from '../../../store/useAppStore';
import { ROBOT_STATUS } from '../../../constants/robotStatus';
import { telemetry } from '../../../utils/telemetry';

type TimeoutId = ReturnType<typeof setTimeout>;

interface MovePlayResponse {
  uuid?: string;
  [key: string]: unknown;
}

interface MoveWebSocketMessage {
  uuid?: string;
  type?: 'move_started' | 'move_completed' | 'move_failed' | 'move_cancelled' | string;
  details?: string;
  [key: string]: unknown;
}

export interface UseWakeSleepResult {
  isSleeping: boolean;
  isAwake: boolean;
  isTransitioning: boolean;
  canToggle: boolean;
  error: string | null;
  wakeUp: () => Promise<boolean>;
  goToSleep: () => Promise<boolean>;
  toggle: () => Promise<boolean>;
}

/**
 * Hook to manage robot wake/sleep state transitions
 *
 * Encapsulates all the logic for:
 * - Enabling/disabling motors
 * - Playing wake_up/goto_sleep animations
 * - Managing state transitions
 * - Polling for animation completion via WebSocket
 */
export function useWakeSleep(): UseWakeSleepResult {
  const { robotStatus, transitionTo, isStoppingApp, safeToShutdown, setWakeSleepTransitioning } =
    useAppStore();
  const [isTransitioning, setIsTransitioning] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Ref to track active WebSocket for cleanup
  const wsRef = useRef<WebSocket | null>(null);

  // Sync local transitioning state with global store
  const setTransitioningState = useCallback(
    (value: boolean) => {
      setIsTransitioning(value);
      setWakeSleepTransitioning(value);
    },
    [setWakeSleepTransitioning]
  );

  // Optimistic UI state - toggle appears checked immediately on wake click
  const [optimisticAwake, setOptimisticAwake] = useState<boolean>(false);

  // Derived states
  const isSleeping = robotStatus === ROBOT_STATUS.SLEEPING;
  const isAwake = robotStatus === ROBOT_STATUS.READY || robotStatus === ROBOT_STATUS.BUSY;
  // Disable toggle when: transitioning, app is stopping, not safe to shutdown (sleep transition), or robot not in valid state
  const canToggle =
    !isTransitioning &&
    !isStoppingApp &&
    (isSleeping ? safeToShutdown : robotStatus === ROBOT_STATUS.READY);

  // For UI display: use optimistic state during wake transition
  const displayAwake = optimisticAwake || isAwake;
  const displaySleeping = !displayAwake;

  /**
   * Enable motors via API
   */
  const enableMotors = useCallback(async (): Promise<unknown> => {
    const response = await fetchWithTimeout(
      buildApiUrl('/api/motors/set_mode/enabled'),
      { method: 'POST' },
      DAEMON_CONFIG.TIMEOUTS.COMMAND,
      { label: 'Enable motors' }
    );

    if (!response.ok) {
      throw new Error('Failed to enable motors');
    }

    // Verify motor status
    const statusResponse = await fetchWithTimeout(
      buildApiUrl('/api/motors/status'),
      { method: 'GET' },
      DAEMON_CONFIG.TIMEOUTS.COMMAND,
      { label: 'Check motor status' }
    );
    const status = await statusResponse.json();

    return status;
  }, []);

  /**
   * Disable motors via API
   */
  const disableMotors = useCallback(async (): Promise<void> => {
    const response = await fetchWithTimeout(
      buildApiUrl('/api/motors/set_mode/disabled'),
      { method: 'POST' },
      DAEMON_CONFIG.TIMEOUTS.COMMAND,
      { label: 'Disable motors' }
    );

    if (!response.ok) {
      throw new Error('Failed to disable motors');
    }
  }, []);

  /**
   * Play wake_up animation via API
   */
  const playWakeUpAnimation = useCallback(async (): Promise<MovePlayResponse> => {
    const response = await fetchWithTimeout(
      buildApiUrl('/api/move/play/wake_up'),
      { method: 'POST' },
      DAEMON_CONFIG.TIMEOUTS.COMMAND,
      { label: 'Wake up animation' }
    );

    if (!response.ok) {
      throw new Error('Failed to play wake_up animation');
    }

    const data = (await response.json()) as MovePlayResponse;
    return data;
  }, []);

  /**
   * Play goto_sleep animation via API
   */
  const playGoToSleepAnimation = useCallback(async (): Promise<MovePlayResponse> => {
    const response = await fetchWithTimeout(
      buildApiUrl('/api/move/play/goto_sleep'),
      { method: 'POST' },
      DAEMON_CONFIG.TIMEOUTS.COMMAND,
      { label: 'Goto sleep animation' }
    );

    if (!response.ok) {
      throw new Error('Failed to play goto_sleep animation');
    }

    const data = (await response.json()) as MovePlayResponse;
    return data;
  }, []);

  /**
   * Wait for a move to complete using WebSocket
   *
   * Connects to /api/move/ws/updates and waits for:
   * - move_completed: resolves successfully
   * - move_failed/move_cancelled: rejects with error
   * - timeout: rejects after max wait time
   */
  const waitForMoveCompletion = useCallback(
    async (moveUuid: string | undefined, timeoutMs: number = 10000): Promise<void> => {
      // If no UUID provided, fall back to fixed timeout (legacy behavior)
      if (!moveUuid) {
        console.warn('[WakeSleep] No move UUID provided, using fixed timeout');
        await new Promise<void>(resolve =>
          setTimeout(resolve, DAEMON_CONFIG.ANIMATIONS.SLEEP_DURATION)
        );
        return;
      }

      return new Promise<void>((resolve, reject) => {
        let ws: WebSocket | null = null;
        let timeoutId: TimeoutId | null = null;
        let resolved = false;

        const cleanup = (): void => {
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          if (ws) {
            ws.close();
            ws = null;
            wsRef.current = null;
          }
        };

        const finish = (err: Error | null = null): void => {
          if (resolved) return;
          resolved = true;
          cleanup();
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        };

        timeoutId = setTimeout(() => {
          console.warn(`[WakeSleep] Timeout waiting for move ${moveUuid}, continuing anyway`);
          finish();
        }, timeoutMs);

        try {
          const wsUrl = `${getWsBaseUrl()}/api/move/ws/updates`;
          ws = new WebSocket(wsUrl);
          wsRef.current = ws;

          ws.onopen = () => {
            // WebSocket connected, now waiting for move completion
          };

          ws.onmessage = event => {
            try {
              const data = JSON.parse(event.data as string) as MoveWebSocketMessage;

              if (data.uuid !== moveUuid) return;

              if (data.type === 'move_completed') {
                finish();
              } else if (data.type === 'move_failed') {
                finish(new Error(`Move failed: ${data.details || 'Unknown error'}`));
              } else if (data.type === 'move_cancelled') {
                finish(new Error('Move was cancelled'));
              }
              // Ignore move_started - we're already waiting
            } catch (err) {
              console.warn('[WakeSleep] Failed to parse WebSocket message:', err);
            }
          };

          ws.onerror = wsErr => {
            console.warn('[WakeSleep] WebSocket error:', wsErr);
            // Don't fail on WebSocket error, let timeout handle it
          };

          ws.onclose = () => {
            if (!resolved) {
              console.warn('[WakeSleep] WebSocket closed unexpectedly, using fallback timeout');
              setTimeout(() => finish(), 1000);
            }
          };
        } catch (err) {
          console.error('[WakeSleep] Failed to create WebSocket:', err);
          cleanup();
          setTimeout(() => finish(), DAEMON_CONFIG.ANIMATIONS.SLEEP_DURATION);
        }
      });
    },
    []
  );

  /**
   * Cleanup WebSocket on unmount
   */
  const cleanupWebSocket = useCallback((): void => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  /**
   * Wake up the robot
   */
  const wakeUp = useCallback(async (): Promise<boolean> => {
    if (!canToggle || !isSleeping) {
      console.warn('Cannot wake up: invalid state');
      return false;
    }

    setTransitioningState(true);
    setOptimisticAwake(true);
    setError(null);

    try {
      await enableMotors();

      await new Promise<void>(resolve => setTimeout(resolve, 300));

      const moveData = await playWakeUpAnimation();
      const moveUuid = moveData?.uuid;

      await waitForMoveCompletion(moveUuid, 10000);

      transitionTo.ready();

      telemetry.robotWakeUp();

      return true;
    } catch (err) {
      console.error('Wake up error:', err);
      setError(err instanceof Error ? err.message : String(err));
      setOptimisticAwake(false);
      return false;
    } finally {
      setTransitioningState(false);
      setOptimisticAwake(false);
      cleanupWebSocket();
    }
  }, [
    canToggle,
    isSleeping,
    enableMotors,
    playWakeUpAnimation,
    waitForMoveCompletion,
    transitionTo,
    setTransitioningState,
    cleanupWebSocket,
  ]);

  /**
   * Put the robot to sleep
   */
  const goToSleep = useCallback(async (): Promise<boolean> => {
    if (!canToggle || isSleeping) {
      console.warn('Cannot go to sleep: invalid state');
      return false;
    }

    setTransitioningState(true);
    setError(null);

    try {
      transitionTo.sleeping({ safeToShutdown: false });

      const moveData = await playGoToSleepAnimation();
      const moveUuid = moveData?.uuid;

      await waitForMoveCompletion(moveUuid, 10000);

      await disableMotors();

      transitionTo.sleeping({ safeToShutdown: true });

      telemetry.robotGoToSleep();

      return true;
    } catch (err) {
      console.error('Go to sleep error:', err);
      setError(err instanceof Error ? err.message : String(err));
      transitionTo.ready();
      return false;
    } finally {
      setTransitioningState(false);
      cleanupWebSocket();
    }
  }, [
    canToggle,
    isSleeping,
    transitionTo,
    playGoToSleepAnimation,
    waitForMoveCompletion,
    disableMotors,
    setTransitioningState,
    cleanupWebSocket,
  ]);

  /**
   * Toggle between wake and sleep states
   */
  const toggle = useCallback(async (): Promise<boolean> => {
    if (isSleeping) {
      return wakeUp();
    } else {
      return goToSleep();
    }
  }, [isSleeping, wakeUp, goToSleep]);

  return {
    isSleeping: displaySleeping,
    isAwake: displayAwake,
    isTransitioning,
    canToggle,
    error,

    wakeUp,
    goToSleep,
    toggle,
  };
}
