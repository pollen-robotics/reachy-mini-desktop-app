/**
 * 🔌 useConnection - Unified connection interface
 *
 * Abstracts USB, WiFi, and Simulation modes behind a single interface.
 * The rest of the app doesn't need to know which mode is active.
 *
 * @example
 * const { connect, disconnect, isConnected, fetchApi } = useConnection();
 *
 * // Connect to any mode - same API
 * await connect('usb', { portName: '/dev/cu.usbmodem...' });
 * await connect('wifi', { host: 'reachy-mini.home' });
 * await connect('simulation');
 *
 * // Disconnect - same for all modes
 * await disconnect();
 *
 * // API calls - automatically routed to correct host
 * const response = await fetchApi('/api/state/full');
 */

import { useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import useAppStore from '../store/useAppStore';
import { useDaemon } from './daemon/useDaemon';
import {
  fetchWithTimeout,
  buildApiUrl,
  getBaseUrl,
  getWsBaseUrl,
  DAEMON_CONFIG,
} from '../config/daemon';
import { enableSimulationMode } from '../utils/simulationMode';
import { telemetry } from '../utils/telemetry';
import type { ConnectionMode as ConnectionModeType } from '../types/robot';

/**
 * Options accepted by the `connect` function.
 *
 * Field names differ slightly from the store's internal
 * `StartConnectionOptions` (we use `host` here for WiFi, mapped to
 * `remoteHost` in the store for backwards compat with callers).
 */
export interface ConnectOptions {
  /** USB serial port name (USB mode) */
  portName?: string;
  /** Remote WiFi host (WiFi mode) */
  host?: string;
}

/**
 * Connection modes (runtime enum).
 *
 * Historically named `ConnectionMode` for backwards compatibility with the
 * ~50 consumer files. The string-literal type is exported from
 * `types/robot.ts` under the same name - TypeScript handles the dual
 * namespace (value vs type) gracefully.
 */
export const ConnectionMode = {
  USB: 'usb',
  WIFI: 'wifi',
  SIMULATION: 'simulation',
  EXTERNAL: 'external',
} as const satisfies Record<string, ConnectionModeType>;

interface ConnectionInfo {
  mode: ConnectionModeType | null;
  host: string;
  isLocal: boolean;
  isRemote: boolean;
  isSimulation: boolean;
}

export interface UseConnectionResult {
  // State
  isConnected: boolean;
  isConnecting: boolean;
  isDisconnecting: boolean;
  connectionMode: ConnectionModeType | null;
  connectionInfo: ConnectionInfo;

  // Actions
  connect: (mode: ConnectionModeType, options?: ConnectOptions) => Promise<boolean>;
  disconnect: () => Promise<boolean>;
  resetConnection: () => void;

  // API
  fetchApi: (endpoint: string, options?: RequestInit, timeout?: number) => Promise<Response>;
  buildApiUrl: (endpoint: string) => string;
  apiBaseUrl: string;
  wsBaseUrl: string;

  // Constants
  ConnectionMode: typeof ConnectionMode;
}

/**
 * Unified connection hook
 * Provides a consistent interface regardless of connection type
 */
export function useConnection(): UseConnectionResult {
  const {
    connectionMode,
    remoteHost,
    isActive,
    isStarting,
    isStopping,
    startConnection,
    resetConnection,
  } = useAppStore();

  const { startDaemon, stopDaemon } = useDaemon();

  /**
   * Connect to a robot.
   * Returns `true` if the connection attempt reached `startDaemon()` successfully,
   * `false` otherwise (invalid options, already connected, or daemon startup error).
   */
  const connect = useCallback(
    async (mode: ConnectionModeType, options: ConnectOptions = {}): Promise<boolean> => {
      // ⚠️ Block connection if already connected, connecting, OR stopping
      // This prevents race conditions when rapidly cycling connections
      if (isStarting || isActive || isStopping) {
        return false;
      }

      // 🧹 Defensive cleanup: clear any stale local_proxy from a previous attempt
      // (e.g. a failed WiFi try that didn't reach the normal disconnect flow).
      // Without this, a leftover proxy on 127.0.0.1:8000 routes all subsequent
      // traffic (incl. a local sim daemon launch) to the stale WiFi target.
      try {
        await invoke('clear_local_proxy_target');
      } catch {
        // Best effort - if the backend isn't ready, proceed anyway.
      }

      switch (mode) {
        case ConnectionMode.USB:
          if (!options.portName) {
            return false;
          }
          startConnection('usb', { portName: options.portName });
          break;

        case ConnectionMode.WIFI:
          if (!options.host) {
            return false;
          }
          // Set local proxy target for WiFi mode (bypasses browser PNA restrictions).
          // The Rust command now waits for every listener to confirm its bind
          // before returning, so any error here means the proxy is NOT up and
          // we must NOT proceed - otherwise requests on localhost:8000 would
          // either fail or (worse) hit whatever other service holds the port.
          try {
            await invoke('set_local_proxy_target', { host: options.host });
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e ?? 'unknown error');
            telemetry.connectionError({
              mode,
              error_type: 'proxy_bind_failed',
              error_message: message.slice(0, 200),
            });
            return false;
          }
          startConnection('wifi', { remoteHost: options.host });
          break;

        case ConnectionMode.SIMULATION:
          enableSimulationMode();
          startConnection('simulation', { portName: 'simulation' });
          break;

        case ConnectionMode.EXTERNAL:
          // Tell Rust backend to skip daemon cleanup on app close
          try {
            await invoke('set_daemon_external_mode', { external: true });
          } catch {
            // External-mode flag is a hint - continue even on failure.
          }
          startConnection('external');
          break;

        default:
          return false;
      }

      // Start the daemon (handles mode-specific logic internally).
      // Use requestAnimationFrame to ensure state is updated first.
      return new Promise<boolean>(resolve => {
        requestAnimationFrame(async () => {
          try {
            await startDaemon();
            resolve(true);
          } catch (e: unknown) {
            // 📊 Telemetry - Track connection failure (safety net).
            // Most errors flow through handleDaemonError() via eventBus;
            // this catch only hits on unexpected JS-level exceptions.
            const message = e instanceof Error ? e.message : String(e ?? 'Unknown error');
            telemetry.connectionError({
              mode,
              error_type: 'connection_failed_unexpected',
              error_message: message.slice(0, 200),
            });

            resolve(false);
          }
        });
      });
    },
    [isStarting, isActive, isStopping, startConnection, startDaemon]
  );

  /**
   * Disconnect from the current robot.
   * Works the same for all modes.
   */
  const disconnect = useCallback(async (): Promise<boolean> => {
    if (!isActive && !isStarting) {
      return false;
    }

    try {
      // stopDaemon handles clear_local_proxy_target internally for WiFi mode
      // (after graceful shutdown so HTTP requests can still reach the remote daemon).
      await stopDaemon();
      return true;
    } catch {
      return false;
    }
  }, [isActive, isStarting, stopDaemon]);

  /**
   * Fetch from the daemon API
   * Automatically routes to the correct host based on connection mode
   */
  const fetchApi = useCallback(
    async (
      endpoint: string,
      options: RequestInit = {},
      timeout: number = DAEMON_CONFIG.TIMEOUTS.STATE_FULL
    ): Promise<Response> => {
      const url = buildApiUrl(endpoint);
      return fetchWithTimeout(url, options, timeout);
    },
    []
  );

  /**
   * Current API base URL (useful for WebSocket connections or external use)
   */
  const apiBaseUrl = useMemo(
    () => getBaseUrl(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [connectionMode, remoteHost]
  );

  /**
   * Current WebSocket base URL
   */
  const wsBaseUrl = useMemo(
    () => getWsBaseUrl(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [connectionMode, remoteHost]
  );

  const connectionInfo = useMemo<ConnectionInfo>(
    () => ({
      mode: connectionMode,
      host: connectionMode === 'wifi' ? (remoteHost ?? '') : 'localhost',
      isLocal: connectionMode === 'usb' || connectionMode === 'simulation',
      isRemote: connectionMode === 'wifi',
      isSimulation: connectionMode === 'simulation',
    }),
    [connectionMode, remoteHost]
  );

  return {
    // ═══════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════

    /** Is connected and ready */
    isConnected: isActive,

    /** Is currently connecting */
    isConnecting: isStarting,

    /** Is currently disconnecting */
    isDisconnecting: isStopping,

    /** Current connection mode */
    connectionMode,

    /** Connection details */
    connectionInfo,

    // ═══════════════════════════════════════════════════════════════════
    // ACTIONS
    // ═══════════════════════════════════════════════════════════════════

    connect,
    disconnect,
    resetConnection,

    // ═══════════════════════════════════════════════════════════════════
    // API
    // ═══════════════════════════════════════════════════════════════════

    fetchApi,
    buildApiUrl,
    apiBaseUrl,
    wsBaseUrl,

    // ═══════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════

    ConnectionMode,
  };
}

export default useConnection;
