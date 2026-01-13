import { useState, useCallback, useRef } from 'react';
import { DAEMON_CONFIG, fetchWithTimeout, buildApiUrl, getWsBaseUrl } from '../../../config/daemon';
import useAppStore from '../../../store/useAppStore';
import { ROBOT_STATUS } from '../../../constants/robotStatus';
import { telemetry } from '../../../utils/telemetry';

/**
 * Hook to manage robot wake/sleep state transitions
 *
 * Encapsulates all the logic for:
 * - Enabling/disabling motors
 * - Playing wake_up/goto_sleep animations
 * - Managing state transitions
 * - Polling for animation completion via WebSocket
 *
 * @returns {Object} Wake/sleep controls and state
 */
export function useWakeSleep() {
  const { robotStatus, transitionTo, isStoppingApp, safeToShutdown, setWakeSleepTransitioning } =
    useAppStore();
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [error, setError] = useState(null);

  // Ref to track active WebSocket for cleanup
  const wsRef = useRef(null);

  // Sync local transitioning state with global store
  const setTransitioningState = useCallback(
    value => {
      setIsTransitioning(value);
      setWakeSleepTransitioning(value);
    },
    [setWakeSleepTransitioning]
  );

  // Optimistic UI state - toggle appears checked immediately on wake click
  const [optimisticAwake, setOptimisticAwake] = useState(false);

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
  const enableMotors = useCallback(async () => {
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
  const disableMotors = useCallback(async () => {
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
   * @returns {Promise<{uuid: string}>} Move UUID for tracking completion
   */
  const playWakeUpAnimation = useCallback(async () => {
    const response = await fetchWithTimeout(
      buildApiUrl('/api/move/play/wake_up'),
      { method: 'POST' },
      DAEMON_CONFIG.TIMEOUTS.COMMAND,
      { label: 'Wake up animation' }
    );

    if (!response.ok) {
      throw new Error('Failed to play wake_up animation');
    }

    const data = await response.json();
    return data;
  }, []);

  /**
   * Play goto_sleep animation via API
   * @returns {Promise<{uuid: string}>} Move UUID for tracking completion
   */
  const playGoToSleepAnimation = useCallback(async () => {
    const response = await fetchWithTimeout(
      buildApiUrl('/api/move/play/goto_sleep'),
      { method: 'POST' },
      DAEMON_CONFIG.TIMEOUTS.COMMAND,
      { label: 'Goto sleep animation' }
    );

    if (!response.ok) {
      throw new Error('Failed to play goto_sleep animation');
    }

    const data = await response.json();
    return data;
  }, []);

  /**
   * Wait for a move to complete using WebSocket
   *
   * Connects to /api/move/ws/updates and waits for:
   * - move_completed: resolves successfully
   * - move_failed/move_cancelled: rejects with error
   * - timeout: rejects after max wait time
   *
   * @param {string} moveUuid - UUID of the move to wait for
   * @param {number} timeoutMs - Maximum time to wait (default: 10s)
   * @returns {Promise<void>}
   */
  const waitForMoveCompletion = useCallback(async (moveUuid, timeoutMs = 10000) => {
    // If no UUID provided, fall back to fixed timeout (legacy behavior)
    if (!moveUuid) {
      console.warn('[WakeSleep] No move UUID provided, using fixed timeout');
      await new Promise(resolve => setTimeout(resolve, DAEMON_CONFIG.ANIMATIONS.SLEEP_DURATION));
      return;
    }

    return new Promise((resolve, reject) => {
      let ws = null;
      let timeoutId = null;
      let resolved = false;

      const cleanup = () => {
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

      const finish = (error = null) => {
        if (resolved) return;
        resolved = true;
        cleanup();
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };

      // Set up timeout fallback
      timeoutId = setTimeout(() => {
        console.warn(`[WakeSleep] Timeout waiting for move ${moveUuid}, continuing anyway`);
        finish(); // Resolve on timeout (don't fail the whole operation)
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
            const data = JSON.parse(event.data);

            // Check if this message is for our move
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

        ws.onerror = error => {
          console.warn('[WakeSleep] WebSocket error:', error);
          // Don't fail on WebSocket error, let timeout handle it
        };

        ws.onclose = () => {
          // If WebSocket closes unexpectedly and we haven't resolved yet,
          // wait a bit and resolve (assume animation completed)
          if (!resolved) {
            console.warn('[WakeSleep] WebSocket closed unexpectedly, using fallback timeout');
            setTimeout(() => finish(), 1000);
          }
        };
      } catch (err) {
        console.error('[WakeSleep] Failed to create WebSocket:', err);
        // Fall back to fixed timeout
        cleanup();
        setTimeout(() => finish(), DAEMON_CONFIG.ANIMATIONS.SLEEP_DURATION);
      }
    });
  }, []);

  /**
   * Cleanup WebSocket on unmount
   */
  const cleanupWebSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  /**
   * Wake up the robot
   *
   * Sequence:
   * 1. Enable motors
   * 2. Wait for motors to initialize (300ms)
   * 3. Play wake_up animation
   * 4. Wait for animation to complete (via WebSocket)
   * 5. Transition to ready state
   */
  const wakeUp = useCallback(async () => {
    if (!canToggle || !isSleeping) {
      console.warn('Cannot wake up: invalid state');
      return false;
    }

    setTransitioningState(true);
    setOptimisticAwake(true); // Immediately show toggle as "awake" for better UX
    setError(null);

    try {
      // 1. Enable motors
      await enableMotors();

      // 2. Small delay for motor initialization
      await new Promise(resolve => setTimeout(resolve, 300));

      // 3. Play wake_up animation and get UUID
      const moveData = await playWakeUpAnimation();
      const moveUuid = moveData?.uuid;

      // 4. Wait for animation to complete (via WebSocket polling)
      await waitForMoveCompletion(moveUuid, 10000);

      // 5. Transition to ready
      transitionTo.ready();

      // 📊 Telemetry
      telemetry.robotWakeUp();

      return true;
    } catch (err) {
      console.error('Wake up error:', err);
      setError(err.message);
      setOptimisticAwake(false); // Revert optimistic state on error
      // Stay in sleeping state on error
      return false;
    } finally {
      setTransitioningState(false);
      setOptimisticAwake(false); // Clear optimistic state (real state takes over)
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
   *
   * Sequence:
   * 1. Transition to sleeping state (blocks all actions immediately, but NOT safe to shutdown yet)
   * 2. Play goto_sleep animation
   * 3. Wait for animation to complete (via WebSocket)
   * 4. Disable motors
   * 5. Mark as safe to shutdown
   */
  const goToSleep = useCallback(async () => {
    if (!canToggle || isSleeping) {
      console.warn('Cannot go to sleep: invalid state');
      return false;
    }

    setTransitioningState(true);
    setError(null);

    try {
      // 1. Transition immediately to sleeping (blocks all actions, but NOT safe to shutdown yet)
      transitionTo.sleeping({ safeToShutdown: false });

      // 2. Play goto_sleep animation and get UUID
      const moveData = await playGoToSleepAnimation();
      const moveUuid = moveData?.uuid;

      // 3. Wait for animation to complete (via WebSocket polling)
      await waitForMoveCompletion(moveUuid, 10000);

      // 4. Disable motors
      await disableMotors();

      // 5. NOW it's safe to shutdown (animation done + motors disabled)
      transitionTo.sleeping({ safeToShutdown: true });

      // 📊 Telemetry
      telemetry.robotGoToSleep();

      return true;
    } catch (err) {
      console.error('Go to sleep error:', err);
      setError(err.message);
      // Revert to ready on error
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
  const toggle = useCallback(async () => {
    if (isSleeping) {
      return wakeUp();
    } else {
      return goToSleep();
    }
  }, [isSleeping, wakeUp, goToSleep]);

  return {
    // State (display states include optimistic UI)
    isSleeping: displaySleeping,
    isAwake: displayAwake,
    isTransitioning,
    canToggle,
    error,

    // Actions
    wakeUp,
    goToSleep,
    toggle,
  };
}
