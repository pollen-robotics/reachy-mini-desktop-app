import { useCallback, useRef, useEffect } from 'react';
import { useActiveRobotContext } from '../../context';
import { TIMING, WS_RETRY } from '@utils/inputConstants';
import type { HeadPose } from '@utils/targetSmoothing';

interface CommandRequestBody {
  target_head_pose: HeadPose;
  target_antennas: [number, number] | number[];
  target_body_yaw: number;
}

interface UseControllerAPIReturn {
  sendCommand: (headPose: HeadPose, antennas: [number, number] | number[], bodyYaw: number) => void;
  forceSendCommand: (
    headPose: HeadPose,
    antennas: [number, number] | number[],
    bodyYaw: number
  ) => Promise<unknown> | void;
}

interface SendOptions {
  /** If true, skip the throttle window and reset its timer. */
  force?: boolean;
  /** If true, discard the HTTP response promise (fire-and-forget). */
  fireAndForget?: boolean;
}

export function useControllerAPI(): UseControllerAPIReturn {
  const { api } = useActiveRobotContext();
  const { buildApiUrl, fetchWithTimeout, config: DAEMON_CONFIG } = api;

  const lastSendTimeRef = useRef<number>(0);
  const wsRef = useRef<WebSocket | null>(null);
  const wsReconnectAttempts = useRef<number>(0);
  const wsReconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildWsUrl = useCallback(
    (): string => buildApiUrl('/api/move/ws/set_target').replace(/^http/, 'ws'),
    [buildApiUrl]
  );

  const connectWebSocket = useCallback((): void => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    if (wsReconnectTimeoutRef.current) {
      clearTimeout(wsReconnectTimeoutRef.current);
      wsReconnectTimeoutRef.current = null;
    }

    try {
      const ws = new WebSocket(buildWsUrl());

      ws.onopen = () => {
        wsReconnectAttempts.current = 0;
      };

      ws.onclose = event => {
        wsRef.current = null;

        if (event.code !== 1000 && wsReconnectAttempts.current < WS_RETRY.MAX_ATTEMPTS) {
          wsReconnectAttempts.current++;
          wsReconnectTimeoutRef.current = setTimeout(connectWebSocket, TIMING.WS_RECONNECT_DELAY);
        }
      };

      ws.onerror = () => {};

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
      // Will fallback to HTTP
    }
  }, [buildWsUrl]);

  const disconnectWebSocket = useCallback((): void => {
    if (wsReconnectTimeoutRef.current) {
      clearTimeout(wsReconnectTimeoutRef.current);
      wsReconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close(1000);
      wsRef.current = null;
    }
  }, []);

  useEffect(() => {
    connectWebSocket();
    return () => disconnectWebSocket();
  }, [connectWebSocket, disconnectWebSocket]);

  const sendViaWebSocket = useCallback((requestBody: CommandRequestBody): boolean => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(requestBody));
      return true;
    }
    return false;
  }, []);

  const sendViaHttp = useCallback(
    (requestBody: CommandRequestBody, fireAndForget: boolean = true): Promise<unknown> => {
      // TODO(ts): DAEMON_CONFIG is typed as Record<string, unknown>; narrow upstream
      const timeoutMs = (DAEMON_CONFIG as { MOVEMENT: { CONTINUOUS_MOVE_TIMEOUT: number } })
        .MOVEMENT.CONTINUOUS_MOVE_TIMEOUT;

      return fetchWithTimeout(
        buildApiUrl('/api/move/set_target'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        },
        timeoutMs,
        { label: 'Set target', silent: true, fireAndForget }
      ).catch(() => {});
    },
    [buildApiUrl, fetchWithTimeout, DAEMON_CONFIG]
  );

  const send = useCallback(
    (
      headPose: HeadPose,
      antennas: [number, number] | number[],
      bodyYaw: number,
      { force = false, fireAndForget = true }: SendOptions = {}
    ): Promise<unknown> | void => {
      const now = Date.now();
      if (!force && now - lastSendTimeRef.current < TIMING.SEND_THROTTLE) {
        return;
      }
      lastSendTimeRef.current = now;

      const requestBody: CommandRequestBody = {
        target_head_pose: headPose,
        target_antennas: antennas,
        target_body_yaw: bodyYaw,
      };

      if (sendViaWebSocket(requestBody)) {
        return force ? Promise.resolve({ status: 'ok' }) : undefined;
      }
      return sendViaHttp(requestBody, fireAndForget);
    },
    [sendViaWebSocket, sendViaHttp]
  );

  const sendCommand = useCallback(
    (headPose: HeadPose, antennas: [number, number] | number[], bodyYaw: number): void => {
      send(headPose, antennas, bodyYaw);
    },
    [send]
  );

  const forceSendCommand = useCallback(
    (
      headPose: HeadPose,
      antennas: [number, number] | number[],
      bodyYaw: number
    ): Promise<unknown> | void =>
      send(headPose, antennas, bodyYaw, { force: true, fireAndForget: false }),
    [send]
  );

  return { sendCommand, forceSendCommand };
}
