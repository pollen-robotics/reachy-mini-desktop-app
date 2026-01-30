import { useEffect, useRef } from 'react';
import useAppStore from '../../store/useAppStore';
import { getWsBaseUrl, buildApiUrl, fetchWithTimeout, DAEMON_CONFIG } from '../../config/daemon';

// 🔒 Delay before reconnection to avoid race conditions during HMR
const WS_CLEANUP_DELAY_MS = 100;

/**
 * 🎯 Real-time hook for active moves via WebSocket
 *
 * Responsibilities:
 * - Connect to /api/move/ws/updates WebSocket
 * - Receive real-time updates when moves start/stop
 * - Update activeMoves in store
 *
 * Replaces the old polling of GET /api/move/running every 500ms
 *
 * Benefits:
 * - ⚡ Real-time updates (no 500ms lag)
 * - 🚀 Less network overhead
 * - 🎯 Instant notification when moves complete
 */
export function useActiveMoves(isActive) {
  const { setActiveMoves, isDaemonCrashed } = useAppStore();
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const isMountedRef = useRef(true);
  const reconnectAttemptsRef = useRef(0);
  const isConnectingRef = useRef(false); // 🔒 Prevent multiple simultaneous connections
  const isDaemonCrashedRef = useRef(isDaemonCrashed); // 🔒 Use ref to avoid effect re-runs
  const setActiveMovesRef = useRef(setActiveMoves); // 🔒 Stable ref for callback
  const MAX_RECONNECT_ATTEMPTS = 5;

  // Keep refs in sync
  useEffect(() => {
    isDaemonCrashedRef.current = isDaemonCrashed;
    // If daemon crashes while connected, close the WebSocket
    if (isDaemonCrashed && wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, [isDaemonCrashed]);

  useEffect(() => {
    setActiveMovesRef.current = setActiveMoves;
  }, [setActiveMoves]);

  // Main effect: connect/disconnect based on isActive
  // 🔒 Only depends on isActive - other values accessed via refs to prevent reconnection storms
  useEffect(() => {
    isMountedRef.current = true;
    reconnectAttemptsRef.current = 0;
    isConnectingRef.current = false;

    if (!isActive) {
      // Cleanup existing connection
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      // Clear active moves when not active
      setActiveMovesRef.current([]);
      return;
    }

    // Fetch initial list of active moves via HTTP
    const fetchInitialMoves = async () => {
      try {
        const response = await fetchWithTimeout(
          buildApiUrl('/api/move/running'),
          {},
          DAEMON_CONFIG.TIMEOUTS.COMMAND,
          { silent: true }
        );

        if (response.ok && isMountedRef.current) {
          const data = await response.json();
          if (Array.isArray(data)) {
            setActiveMovesRef.current(data);
          }
        }
      } catch (err) {
        // Ignore errors on initial fetch (WebSocket will handle updates)
      }
    };

    const connectWebSocket = () => {
      // 🔒 Check if daemon crashed (via ref, not dependency)
      if (isDaemonCrashedRef.current) {
        console.warn('[ActiveMoves] Daemon crashed, not connecting');
        return;
      }

      // Check max reconnection attempts
      if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
        console.warn('⚠️ [ActiveMoves] Max reconnection attempts reached');
        return;
      }

      // 🔒 Prevent multiple simultaneous connections
      if (isConnectingRef.current) {
        console.warn('[ActiveMoves] Connection already in progress, skipping');
        return;
      }

      // 🔒 Check if WebSocket already exists and is connecting or open
      if (wsRef.current) {
        const state = wsRef.current.readyState;
        if (state === WebSocket.CONNECTING || state === WebSocket.OPEN) {
          console.warn('[ActiveMoves] WebSocket already active, skipping new connection');
          return;
        }
        // Close stale WebSocket
        wsRef.current.close();
        wsRef.current = null;
      }

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      isConnectingRef.current = true;

      try {
        const wsUrl = `${getWsBaseUrl()}/api/move/ws/updates`;
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          isConnectingRef.current = false;
          reconnectAttemptsRef.current = 0; // Reset on successful connection

          // Fetch initial list of active moves via HTTP
          // (WebSocket only sends updates, not initial state)
          fetchInitialMoves();
        };

        ws.onmessage = event => {
          if (!isMountedRef.current) return;

          try {
            const data = JSON.parse(event.data);

            // The WebSocket sends updates with the following structure:
            // { "type": "move_started", "uuid": "...", "details": "" }
            // { "type": "move_completed", "uuid": "...", "details": "" }
            // { "type": "move_failed", "uuid": "...", "details": "..." }
            // { "type": "move_cancelled", "uuid": "...", "details": "" }

            if (data.type === 'move_started') {
              // Add new move
              setActiveMovesRef.current(prev => {
                const exists = prev.some(m => m.uuid === data.uuid);
                if (exists) return prev;
                return [...prev, { uuid: data.uuid }];
              });
            } else if (
              data.type === 'move_completed' ||
              data.type === 'move_failed' ||
              data.type === 'move_cancelled'
            ) {
              // Remove completed/failed/cancelled move
              setActiveMovesRef.current(prev => prev.filter(m => m.uuid !== data.uuid));
            }
          } catch (err) {
            console.warn('[ActiveMoves] Failed to parse WebSocket message:', err);
          }
        };

        ws.onerror = () => {
          isConnectingRef.current = false;
        };

        ws.onclose = event => {
          isConnectingRef.current = false;
          wsRef.current = null;

          if (!isMountedRef.current) return;
          if (event.code === 1000) return; // Clean close, no reconnect

          // 🔒 Don't reconnect if daemon crashed
          if (isDaemonCrashedRef.current) return;

          reconnectAttemptsRef.current += 1;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);

          // 🔒 Add small delay to avoid race conditions during HMR/fast remounts
          reconnectTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current && !isDaemonCrashedRef.current) {
              connectWebSocket();
            }
          }, delay + WS_CLEANUP_DELAY_MS);
        };

        wsRef.current = ws;
      } catch (err) {
        isConnectingRef.current = false;
        console.error('[ActiveMoves] Failed to create WebSocket:', err);
      }
    };

    // 🔒 Small delay before initial connection to let cleanup complete during HMR
    const initialConnectTimeout = setTimeout(() => {
      if (isMountedRef.current && !isDaemonCrashedRef.current) {
        connectWebSocket();
      }
    }, WS_CLEANUP_DELAY_MS);

    return () => {
      isMountedRef.current = false;
      isConnectingRef.current = false;

      clearTimeout(initialConnectTimeout);

      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [isActive]); // 🔒 Only depends on isActive - other values accessed via refs
}
