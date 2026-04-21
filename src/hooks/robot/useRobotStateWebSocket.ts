import { useEffect, useRef, useCallback } from 'react';
import useAppStore from '../../store/useAppStore';
import { getWsBaseUrl } from '../../config/daemon';
import { useDaemonEventBus } from '../daemon/useDaemonEventBus';
import type { RobotStateFull } from '../../types/robot';

// WebSocket configuration
const WS_FREQUENCY = 20; // 20Hz for smooth 3D visualization

// Exponential backoff with ±20% jitter. We keep retrying indefinitely: giving
// up was the old behavior and produced a silent "frozen 3D" bug when a
// transient WiFi glitch outlasted the short retry window. Instead, we cap the
// delay so the idle cost stays bounded (~1 attempt / 30s after stabilization).
const WS_RECONNECT_INITIAL_DELAY_MS = 1000;
const WS_RECONNECT_MAX_DELAY_MS = 30000;
const WS_BACKOFF_FACTOR = 2;
const WS_JITTER_RATIO = 0.2;

/** Compute the delay for the Nth reconnect attempt (0-indexed). */
function computeReconnectDelay(attempt: number): number {
  const raw = WS_RECONNECT_INITIAL_DELAY_MS * Math.pow(WS_BACKOFF_FACTOR, attempt);
  const capped = Math.min(raw, WS_RECONNECT_MAX_DELAY_MS);
  const jitter = capped * WS_JITTER_RATIO * (Math.random() * 2 - 1);
  return Math.max(WS_RECONNECT_INITIAL_DELAY_MS, Math.floor(capped + jitter));
}

/**
 * Raw shape of a message sent by /api/state/ws/full on the daemon.
 * Fields may be absent depending on the query parameters set in `buildWsUrl`.
 */
interface DaemonStateMessage {
  control_mode?: unknown;
  head_pose?: { m?: unknown } | unknown;
  head_joints?: unknown;
  body_yaw?: unknown;
  antennas_position?: unknown;
  doa?: {
    angle?: number;
    speech_detected?: boolean;
  } | null;
  timestamp?: number;
}

interface ProcessedStateData {
  control_mode: unknown;
  head_pose: unknown;
  head_joints: unknown;
  body_yaw: unknown;
  antennas_position: unknown;
  passive_joints: unknown;
  doa: { angle: number | undefined; speech_detected: boolean | undefined } | null;
  timestamp: number | undefined;
  dataVersion: number;
}

export interface UseRobotStateWebSocketResult {
  isConnected: boolean;
}

type TimeoutId = ReturnType<typeof setTimeout>;

/**
 * 🚀 Unified WebSocket hook for ALL robot state data
 *
 * Single WebSocket connection streaming at 20Hz:
 * - head_pose (4x4 matrix)
 * - head_joints (7 values)
 * - body_yaw
 * - antennas_position
 * - passive_joints (21 values)
 * - control_mode
 * - doa (Direction of Arrival)
 *
 * All data stored in robotStateFull (Zustand store) - single source of truth.
 */
export function useRobotStateWebSocket(isActive: boolean): UseRobotStateWebSocketResult {
  const isDaemonCrashed = useAppStore(state => state.isDaemonCrashed);
  const setRobotStateFull = useAppStore(state => state.setRobotStateFull);
  const eventBus = useDaemonEventBus();

  // Refs for WebSocket management (avoid re-render loops)
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<TimeoutId | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);
  const dataVersionRef = useRef<number>(0);

  // Store refs for stable callbacks
  const setRobotStateFullRef = useRef(setRobotStateFull);
  const eventBusRef = useRef(eventBus);

  // Keep refs in sync
  useEffect(() => {
    setRobotStateFullRef.current = setRobotStateFull;
  }, [setRobotStateFull]);

  useEffect(() => {
    eventBusRef.current = eventBus;
  }, [eventBus]);

  /**
   * Build WebSocket URL with all required parameters.
   * Note: control_mode is included by default in daemon's get_full_state().
   * Note: passive_joints are NOT requested - they're calculated via WASM client-side.
   */
  const buildWsUrl = useCallback((): string => {
    const baseUrl = getWsBaseUrl();
    const params = new URLSearchParams({
      frequency: WS_FREQUENCY.toString(),
      with_head_pose: 'true',
      use_pose_matrix: 'true',
      with_head_joints: 'true',
      with_body_yaw: 'true',
      with_antenna_positions: 'true',
      // 🦀 passive_joints NOT requested - calculated via WASM client-side
      with_doa: 'true', // 🎤 Direction of Arrival from microphone array
    });
    return `${baseUrl}/api/state/ws/full?${params.toString()}`;
  }, []);

  /**
   * Process incoming WebSocket data and update store.
   */
  const processData = useCallback((data: DaemonStateMessage): void => {
    dataVersionRef.current++;

    // 🎯 Get current passive_joints from store (calculated via WASM).
    // Daemon NEVER sends passive_joints - they're always calculated client-side.
    const currentState = useAppStore.getState();
    const existingPassiveJoints = (
      currentState.robotStateFull?.data as { passive_joints?: unknown } | null | undefined
    )?.passive_joints;

    const headPoseRaw = data.head_pose as { m?: unknown } | unknown;
    const headPose =
      headPoseRaw && typeof headPoseRaw === 'object' && 'm' in (headPoseRaw as object)
        ? (headPoseRaw as { m?: unknown }).m
        : headPoseRaw;

    const stateData: ProcessedStateData = {
      control_mode: data.control_mode,
      head_pose: headPose,
      head_joints: data.head_joints,
      body_yaw: data.body_yaw,
      antennas_position: data.antennas_position,
      // 🦀 passive_joints are NEVER from daemon - always preserve WASM-calculated values
      passive_joints: existingPassiveJoints,
      // 🎤 Direction of Arrival from microphone array
      doa: data.doa
        ? {
            angle: data.doa.angle,
            speech_detected: data.doa.speech_detected,
          }
        : null,
      timestamp: data.timestamp,
      dataVersion: dataVersionRef.current,
    };

    // Use ref to avoid dependency on setRobotStateFull
    setRobotStateFullRef.current({
      data: stateData,
      lastUpdate: Date.now(),
      error: null,
    } as RobotStateFull);

    eventBusRef.current.emit('robot:state:updated', { data: stateData });
  }, []); // No dependencies - uses refs

  // Main effect: connect/disconnect based on isActive
  useEffect(() => {
    isMountedRef.current = true;
    reconnectAttemptsRef.current = 0;

    if (!isActive) {
      // Clear state when inactive
      setRobotStateFullRef.current({
        data: null,
        lastUpdate: null,
        error: null,
      } as RobotStateFull);

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close(1000);
        wsRef.current = null;
      }
      return;
    }

    if (isDaemonCrashed) {
      if (wsRef.current) {
        wsRef.current.close(1000);
        wsRef.current = null;
      }
      return;
    }

    const connectWebSocket = (): void => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      try {
        const wsUrl = buildWsUrl();
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          reconnectAttemptsRef.current = 0;
        };

        ws.onmessage = (event: MessageEvent<string>) => {
          if (!isMountedRef.current) return;

          try {
            const data = JSON.parse(event.data) as DaemonStateMessage;
            processData(data);
          } catch {
            // Malformed JSON - skip this frame.
          }
        };

        ws.onerror = () => {
          // Errors surface through onclose with a non-1000 code.
        };

        ws.onclose = (event: CloseEvent) => {
          wsRef.current = null;

          if (!isMountedRef.current) return;
          if (event.code === 1000) return;

          const delay = computeReconnectDelay(reconnectAttemptsRef.current);
          reconnectAttemptsRef.current++;

          reconnectTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current) {
              connectWebSocket();
            }
          }, delay);
        };

        wsRef.current = ws;
      } catch {
        // WebSocket constructor can throw on invalid URLs - skip.
      }
    };

    // Reset backoff and force an immediate reconnect when the app becomes
    // interactive again (tab visible, network back online). After a long
    // sleep/VPN toggle the cached delay could otherwise be at its cap.
    const forceReconnect = (): void => {
      if (!isMountedRef.current) return;
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

      reconnectAttemptsRef.current = 0;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      connectWebSocket();
    };

    const handleVisibility = (): void => {
      if (document.visibilityState === 'visible') {
        forceReconnect();
      }
    };

    window.addEventListener('online', forceReconnect);
    document.addEventListener('visibilitychange', handleVisibility);

    connectWebSocket();

    return () => {
      isMountedRef.current = false;

      window.removeEventListener('online', forceReconnect);
      document.removeEventListener('visibilitychange', handleVisibility);

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      if (wsRef.current) {
        wsRef.current.close(1000);
        wsRef.current = null;
      }
    };
  }, [isActive, isDaemonCrashed, buildWsUrl, processData]);

  return {
    isConnected: wsRef.current?.readyState === WebSocket.OPEN,
  };
}
