import { useCallback, useRef, useEffect } from 'react';
import { useActiveRobotContext } from '../../context';

// Throttle for smooth control (~20fps)
const SEND_THROTTLE_MS = 50;

// WebSocket reconnection settings
const WS_RECONNECT_DELAY_MS = 1000;
const WS_MAX_RECONNECT_ATTEMPTS = 5;
const WS_CLEANUP_DELAY_MS = 100; // 🔒 Delay before reconnection to avoid race conditions

/**
 * Controller API hook with WebSocket support
 * Uses WebSocket for streaming (much lower latency than HTTP)
 * Falls back to HTTP POST if WebSocket unavailable
 */
export function useControllerAPI() {
  const { api } = useActiveRobotContext();
  const { buildApiUrl, fetchWithTimeout, config: DAEMON_CONFIG } = api;

  const lastSendTimeRef = useRef(0);
  const wsRef = useRef(null);
  const wsReconnectAttempts = useRef(0);
  const wsReconnectTimeoutRef = useRef(null);
  const isMountedRef = useRef(true);
  const isConnectingRef = useRef(false); // 🔒 Prevent multiple simultaneous connections

  // 🔒 Store buildApiUrl in ref to avoid dependency changes
  const buildApiUrlRef = useRef(buildApiUrl);
  useEffect(() => {
    buildApiUrlRef.current = buildApiUrl;
  }, [buildApiUrl]);

  /**
   * Build WebSocket URL from HTTP URL
   */
  const buildWsUrl = useCallback(() => {
    const httpUrl = buildApiUrlRef.current('/api/move/ws/set_target');
    // Convert http(s):// to ws(s)://
    return httpUrl.replace(/^http/, 'ws');
  }, []); // 🔒 No dependencies - uses ref

  /**
   * Connect to WebSocket
   */
  const connectWebSocket = useCallback(() => {
    // 🔒 Prevent multiple simultaneous connections
    if (isConnectingRef.current) {
      console.warn('[Controller] Connection already in progress, skipping');
      return;
    }

    // 🔒 Check if WebSocket already exists and is connecting or open
    if (wsRef.current) {
      const state = wsRef.current.readyState;
      if (state === WebSocket.CONNECTING || state === WebSocket.OPEN) {
        console.warn('[Controller] WebSocket already active, skipping new connection');
        return;
      }
      // Close stale WebSocket
      wsRef.current.close();
      wsRef.current = null;
    }

    if (wsReconnectTimeoutRef.current) {
      clearTimeout(wsReconnectTimeoutRef.current);
      wsReconnectTimeoutRef.current = null;
    }

    isConnectingRef.current = true;

    try {
      const ws = new WebSocket(buildWsUrl());

      ws.onopen = () => {
        isConnectingRef.current = false;
        wsReconnectAttempts.current = 0;
      };

      ws.onclose = event => {
        isConnectingRef.current = false;
        wsRef.current = null;

        if (!isMountedRef.current) return;
        if (event.code === 1000) return; // Clean close, no reconnect

        // Auto-reconnect if not a clean close
        if (wsReconnectAttempts.current < WS_MAX_RECONNECT_ATTEMPTS) {
          wsReconnectAttempts.current++;
          // 🔒 Add small delay to avoid race conditions during HMR/fast remounts
          wsReconnectTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current) {
              connectWebSocket();
            }
          }, WS_RECONNECT_DELAY_MS + WS_CLEANUP_DELAY_MS);
        }
      };

      ws.onerror = () => {
        isConnectingRef.current = false;
      };

      ws.onmessage = event => {
        try {
          const data = JSON.parse(event.data);
          if (data.status === 'error') {
            console.warn('[Controller] WebSocket error:', data.detail);
          }
        } catch {
          // Ignore non-JSON messages
        }
      };

      wsRef.current = ws;
    } catch {
      isConnectingRef.current = false;
      // Will fallback to HTTP
    }
  }, [buildWsUrl]);

  /**
   * Disconnect WebSocket
   */
  const disconnectWebSocket = useCallback(() => {
    if (wsReconnectTimeoutRef.current) {
      clearTimeout(wsReconnectTimeoutRef.current);
      wsReconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close(1000);
      wsRef.current = null;
    }
  }, []);

  // Connect WebSocket on mount
  // 🔒 Empty dependency array - only runs on mount/unmount
  useEffect(() => {
    isMountedRef.current = true;
    isConnectingRef.current = false;
    wsReconnectAttempts.current = 0;

    // 🔒 Small delay before initial connection to let cleanup complete during HMR
    const initialConnectTimeout = setTimeout(() => {
      if (isMountedRef.current) {
        connectWebSocket();
      }
    }, WS_CLEANUP_DELAY_MS);

    return () => {
      isMountedRef.current = false;
      isConnectingRef.current = false;
      clearTimeout(initialConnectTimeout);
      disconnectWebSocket();
    };
  }, []); // 🔒 Empty deps - mount/unmount only

  /**
   * Send command via WebSocket (fast path)
   */
  const sendViaWebSocket = useCallback(requestBody => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(requestBody));
      return true;
    }
    return false;
  }, []);

  /**
   * Send command via HTTP (fallback)
   */
  const sendViaHttp = useCallback(
    (requestBody, fireAndForget = true) => {
      const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      };

      return fetchWithTimeout(
        buildApiUrl('/api/move/set_target'),
        options,
        DAEMON_CONFIG.MOVEMENT.CONTINUOUS_MOVE_TIMEOUT,
        { label: 'Set target', silent: true, fireAndForget }
      ).catch(() => {}); // Ignore errors silently
    },
    [buildApiUrl, fetchWithTimeout, DAEMON_CONFIG]
  );

  /**
   * Send command to robot (throttled, prefers WebSocket)
   */
  const sendCommand = useCallback(
    (headPose, antennas, bodyYaw) => {
      const now = Date.now();
      if (now - lastSendTimeRef.current < SEND_THROTTLE_MS) {
        return; // Skip - throttled
      }
      lastSendTimeRef.current = now;

      const requestBody = {
        target_head_pose: headPose,
        target_antennas: antennas,
        target_body_yaw: bodyYaw,
      };

      // Try WebSocket first (much faster)
      if (!sendViaWebSocket(requestBody)) {
        // Fallback to HTTP if WebSocket not connected
        sendViaHttp(requestBody);
      }
    },
    [sendViaWebSocket, sendViaHttp]
  );

  /**
   * Force send command (bypass throttle)
   * Use for final position on drag end
   */
  const forceSendCommand = useCallback(
    (headPose, antennas, bodyYaw) => {
      lastSendTimeRef.current = Date.now();

      const requestBody = {
        target_head_pose: headPose,
        target_antennas: antennas,
        target_body_yaw: bodyYaw,
      };

      // Try WebSocket first
      if (sendViaWebSocket(requestBody)) {
        return Promise.resolve({ status: 'ok' });
      }

      // Fallback to HTTP (wait for response)
      return sendViaHttp(requestBody, false);
    },
    [sendViaWebSocket, sendViaHttp]
  );

  return { sendCommand, forceSendCommand };
}
