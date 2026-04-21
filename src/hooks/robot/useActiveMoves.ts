import { useEffect, useRef } from 'react';
import useAppStore from '../../store/useAppStore';
import { getWsBaseUrl, buildApiUrl, fetchWithTimeout, DAEMON_CONFIG } from '../../config/daemon';

/**
 * WebSocket updates emitted by /api/move/ws/updates.
 */
type MoveUpdateType = 'move_started' | 'move_completed' | 'move_failed' | 'move_cancelled';

interface MoveUpdate {
  type: MoveUpdateType;
  uuid: string;
  details?: string;
}

interface ActiveMove {
  uuid: string;
  [key: string]: unknown;
}

type TimeoutId = ReturnType<typeof setTimeout>;

/**
 * 🎯 Real-time hook for active moves via WebSocket
 *
 * Responsibilities:
 * - Connect to /api/move/ws/updates WebSocket
 * - Receive real-time updates when moves start/stop
 * - Update activeMoves in store
 *
 * Replaces the old polling of GET /api/move/running every 500ms.
 *
 * Benefits:
 * - ⚡ Real-time updates (no 500ms lag)
 * - 🚀 Less network overhead
 * - 🎯 Instant notification when moves complete
 */
export function useActiveMoves(isActive: boolean): void {
  const { setActiveMoves, isDaemonCrashed } = useAppStore();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<TimeoutId | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const reconnectAttemptsRef = useRef<number>(0);
  const MAX_RECONNECT_ATTEMPTS = 5;

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;

      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    // Don't connect if not active or daemon crashed
    if (!isActive || isDaemonCrashed) {
      // Cleanup existing connection
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      // Clear active moves when not active
      if (!isActive) {
        setActiveMoves([]);
      }

      return;
    }

    // Fetch initial list of active moves via HTTP
    const fetchInitialMoves = async (): Promise<void> => {
      try {
        const response: Response = await fetchWithTimeout(
          buildApiUrl('/api/move/running'),
          {},
          DAEMON_CONFIG.TIMEOUTS.COMMAND,
          { silent: true }
        );

        if (response.ok && isMountedRef.current) {
          const data = (await response.json()) as unknown;
          if (Array.isArray(data)) {
            setActiveMoves(data);
          }
        }
      } catch {
        // Ignore errors on initial fetch (WebSocket will handle updates).
      }
    };

    const connectWebSocket = (): void => {
      // Check max reconnection attempts
      if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
        return;
      }

      try {
        const wsUrl = `${getWsBaseUrl()}/api/move/ws/updates`;
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          reconnectAttemptsRef.current = 0; // Reset on successful connection

          // Fetch initial list of active moves via HTTP
          // (WebSocket only sends updates, not initial state).
          fetchInitialMoves();
        };

        ws.onmessage = (event: MessageEvent<string>) => {
          if (!isMountedRef.current) return;

          try {
            const data = JSON.parse(event.data) as MoveUpdate;

            // Expected WebSocket update shapes:
            //   { "type": "move_started", "uuid": "...", "details": "" }
            //   { "type": "move_completed", "uuid": "...", "details": "" }
            //   { "type": "move_failed", "uuid": "...", "details": "..." }
            //   { "type": "move_cancelled", "uuid": "...", "details": "" }

            if (data.type === 'move_started') {
              setActiveMoves(prev => {
                const moves = prev as ActiveMove[];
                const exists = moves.some(m => m.uuid === data.uuid);
                if (exists) return moves;
                return [...moves, { uuid: data.uuid }];
              });
            } else if (
              data.type === 'move_completed' ||
              data.type === 'move_failed' ||
              data.type === 'move_cancelled'
            ) {
              setActiveMoves(prev => (prev as ActiveMove[]).filter(m => m.uuid !== data.uuid));
            }
          } catch {
            // Malformed message - skip.
          }
        };

        ws.onerror = () => {
          // Errors flow through onclose - nothing actionable here.
        };

        ws.onclose = () => {
          if (!isMountedRef.current) return;

          wsRef.current = null;

          // Attempt to reconnect if still active
          if (isActive && !isDaemonCrashed) {
            reconnectAttemptsRef.current += 1;
            const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);

            reconnectTimeoutRef.current = setTimeout(() => {
              if (isMountedRef.current && isActive && !isDaemonCrashed) {
                connectWebSocket();
              }
            }, delay);
          }
        };

        wsRef.current = ws;
      } catch {
        // WebSocket constructor can throw on invalid URLs - skip.
      }
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [isActive, isDaemonCrashed, setActiveMoves]);
}
