import { useEffect, useRef, useCallback } from 'react';
import useAppStore from '../../store/useAppStore';
import { getWsBaseUrl, isWiFiMode } from '../../config/daemon';
import { useDaemonEventBus } from '../daemon/useDaemonEventBus';

// WebSocket configuration
const WS_FREQUENCY = 20; // 20Hz for smooth 3D visualization
const WS_RECONNECT_DELAY_MS = 1000;
const WS_MAX_RECONNECT_ATTEMPTS = 5;
const WS_MAX_WIFI_RECONNECT_ATTEMPTS = 3;
const WS_CLEANUP_DELAY_MS = 100; // Delay before reconnection to avoid race conditions

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
export function useRobotStateWebSocket(isActive) {
  const isDaemonCrashed = useAppStore(state => state.isDaemonCrashed);
  const setRobotStateFull = useAppStore(state => state.setRobotStateFull);
  const eventBus = useDaemonEventBus();

  // Refs for WebSocket management (avoid re-render loops)
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const isMountedRef = useRef(true);
  const isWiFiRef = useRef(false);
  const dataVersionRef = useRef(0);
  const isConnectingRef = useRef(false); // 🔒 Prevent multiple simultaneous connections

  // Store refs for stable callbacks (avoid dependency changes triggering reconnections)
  const setRobotStateFullRef = useRef(setRobotStateFull);
  const eventBusRef = useRef(eventBus);
  const isDaemonCrashedRef = useRef(isDaemonCrashed); // 🔒 Use ref to avoid effect re-runs

  // Keep refs in sync (without triggering effect re-runs)
  useEffect(() => {
    setRobotStateFullRef.current = setRobotStateFull;
  }, [setRobotStateFull]);

  useEffect(() => {
    eventBusRef.current = eventBus;
  }, [eventBus]);

  useEffect(() => {
    isDaemonCrashedRef.current = isDaemonCrashed;
    // If daemon crashes while connected, close the WebSocket
    if (isDaemonCrashed && wsRef.current) {
      console.warn('[RobotState WS] Daemon crashed, closing WebSocket');
      wsRef.current.close(1000);
      wsRef.current = null;
    }
  }, [isDaemonCrashed]);

  /**
   * Build WebSocket URL with all required parameters
   * Note: control_mode is included by default in daemon's get_full_state()
   * Note: passive_joints are NOT requested - they're calculated via WASM client-side
   */
  const buildWsUrl = useCallback(() => {
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
   * Process incoming WebSocket data and update store
   */
  const processData = useCallback(data => {
    dataVersionRef.current++;

    // 🎯 Get current passive_joints from store (calculated via WASM)
    // Daemon NEVER sends passive_joints - they're always calculated client-side
    const currentState = useAppStore.getState();
    const existingPassiveJoints = currentState.robotStateFull?.data?.passive_joints;

    const stateData = {
      control_mode: data.control_mode,
      head_pose: data.head_pose?.m || data.head_pose,
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
    });

    // Emit event
    eventBusRef.current.emit('robot:state:updated', { data: stateData });
  }, []); // No dependencies - uses refs

  // Main effect: connect/disconnect based on isActive
  // 🔒 Only depends on isActive - other values accessed via refs to prevent reconnection storms
  useEffect(() => {
    isMountedRef.current = true;
    reconnectAttemptsRef.current = 0;
    isWiFiRef.current = isWiFiMode();
    isConnectingRef.current = false;

    if (!isActive) {
      // Clear state when inactive
      setRobotStateFullRef.current({
        data: null,
        lastUpdate: null,
        error: null,
      });

      // Cleanup
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

    // Connect WebSocket
    const connectWebSocket = () => {
      // 🔒 Check if daemon crashed (via ref, not dependency)
      if (isDaemonCrashedRef.current) {
        console.warn('[RobotState WS] Daemon crashed, not connecting');
        return;
      }

      const maxAttempts = isWiFiRef.current
        ? WS_MAX_WIFI_RECONNECT_ATTEMPTS
        : WS_MAX_RECONNECT_ATTEMPTS;

      if (reconnectAttemptsRef.current >= maxAttempts) {
        console.warn(`[RobotState WS] Max reconnection attempts (${maxAttempts}) reached`);
        return;
      }

      // 🔒 Prevent multiple simultaneous connections
      if (isConnectingRef.current) {
        console.warn('[RobotState WS] Connection already in progress, skipping');
        return;
      }

      // 🔒 Check if WebSocket already exists and is connecting or open
      if (wsRef.current) {
        const state = wsRef.current.readyState;
        if (state === WebSocket.CONNECTING || state === WebSocket.OPEN) {
          console.warn('[RobotState WS] WebSocket already active, skipping new connection');
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
        const wsUrl = buildWsUrl();
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          isConnectingRef.current = false;
          reconnectAttemptsRef.current = 0;
          console.log('[RobotState WS] Connected');
        };

        ws.onmessage = event => {
          if (!isMountedRef.current) return;

          try {
            const data = JSON.parse(event.data);
            processData(data);
          } catch (err) {
            console.warn('[RobotState WS] Failed to parse message:', err);
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

          reconnectAttemptsRef.current++;

          if (reconnectAttemptsRef.current < maxAttempts) {
            // 🔒 Add small delay to avoid race conditions during HMR/fast remounts
            reconnectTimeoutRef.current = setTimeout(() => {
              if (isMountedRef.current && !isDaemonCrashedRef.current) {
                connectWebSocket();
              }
            }, WS_RECONNECT_DELAY_MS + WS_CLEANUP_DELAY_MS);
          }
        };

        wsRef.current = ws;
      } catch (err) {
        isConnectingRef.current = false;
        console.error('[RobotState WS] Failed to connect:', err);
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

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      if (wsRef.current) {
        wsRef.current.close(1000);
        wsRef.current = null;
      }
    };
  }, [isActive, buildWsUrl, processData]); // 🔒 Removed isDaemonCrashed - accessed via ref

  return {
    isConnected: wsRef.current?.readyState === WebSocket.OPEN,
  };
}
