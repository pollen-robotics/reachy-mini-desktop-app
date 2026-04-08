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

/**
 * Connection modes
 */
export const ConnectionMode = {
  USB: 'usb',
  WIFI: 'wifi',
  SIMULATION: 'simulation',
  EXTERNAL: 'external',
};

/**
 * Unified connection hook
 * Provides a consistent interface regardless of connection type
 */
export function useConnection() {
  // Get state from stores
  const {
    connectionMode,
    remoteHost,
    isActive,
    isStarting,
    isStopping,
    startConnection,
    resetConnection,
  } = useAppStore();

  // Get daemon functions
  const { startDaemon, stopDaemon } = useDaemon();

  /**
   * Connect to a robot
   * @param {string} mode - 'usb' | 'wifi' | 'simulation'
   * @param {object} options - Connection options
   * @param {string} options.portName - USB port name (for USB mode)
   * @param {string} options.host - Remote host (for WiFi mode)
   */
  const connect = useCallback(
    async (mode, options = {}) => {
      // ⚠️ Block connection if already connected, connecting, OR stopping
      // This prevents race conditions when rapidly cycling connections
      if (isStarting || isActive || isStopping) {
        return false;
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
          // Set local proxy target for WiFi mode (bypasses browser PNA restrictions)
          try {
            await invoke('set_local_proxy_target', { host: options.host });
          } catch (e) {}
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
          } catch (e) {}
          startConnection('external');
          break;

        default:
          return false;
      }

      // Start the daemon (handles mode-specific logic internally)
      // Use requestAnimationFrame to ensure state is updated first
      return new Promise(resolve => {
        requestAnimationFrame(async () => {
          try {
            await startDaemon();
            resolve(true);
          } catch (e) {
            // 📊 Télémétrie - Track échec de connexion (safety net)
            // Note: La plupart des erreurs passent par handleDaemonError() via eventBus
            // Ce catch n'est atteint que pour des erreurs JS inattendues
            const errorMessage = e?.message || String(e) || 'Unknown error';
            telemetry.connectionError({
              mode,
              error_type: 'connection_failed_unexpected',
              error_message: errorMessage.slice(0, 200), // Tronquer pour éviter les données sensibles
            });

            resolve(false);
          }
        });
      });
    },
    [isStarting, isActive, isStopping, startConnection, startDaemon]
  );

  /**
   * Disconnect from the current robot
   * Works the same for all modes
   */
  const disconnect = useCallback(async () => {
    if (!isActive && !isStarting) {
      return false;
    }

    try {
      // stopDaemon handles clear_local_proxy_target internally for WiFi mode
      // (after graceful shutdown so HTTP requests can still reach the remote daemon)
      await stopDaemon();
      return true;
    } catch (e) {
      return false;
    }
  }, [isActive, isStarting, stopDaemon]);

  /**
   * Fetch from the daemon API
   * Automatically routes to the correct host based on connection mode
   * @param {string} endpoint - API endpoint (e.g. '/api/state/full')
   * @param {object} options - Fetch options
   * @param {number} timeout - Timeout in ms (default: 5000)
   */
  const fetchApi = useCallback(
    async (endpoint, options = {}, timeout = DAEMON_CONFIG.TIMEOUTS.STATE_FULL) => {
      const url = buildApiUrl(endpoint);
      return fetchWithTimeout(url, options, timeout);
    },
    []
  );

  /**
   * Get the current API base URL
   * Useful for WebSocket connections or external use
   */
  const apiBaseUrl = useMemo(() => getBaseUrl(), [connectionMode, remoteHost]);

  /**
   * Get the current WebSocket base URL
   */
  const wsBaseUrl = useMemo(() => getWsBaseUrl(), [connectionMode, remoteHost]);

  /**
   * Connection info object
   */
  const connectionInfo = useMemo(
    () => ({
      mode: connectionMode,
      host: connectionMode === 'wifi' ? remoteHost : 'localhost',
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

    /** Current connection mode ('usb' | 'wifi' | 'simulation' | null) */
    connectionMode,

    /** Connection details */
    connectionInfo,

    // ═══════════════════════════════════════════════════════════════════
    // ACTIONS
    // ═══════════════════════════════════════════════════════════════════

    /** Connect to a robot */
    connect,

    /** Disconnect from the current robot */
    disconnect,

    /** Reset connection state (force return to selection screen) */
    resetConnection,

    // ═══════════════════════════════════════════════════════════════════
    // API
    // ═══════════════════════════════════════════════════════════════════

    /** Fetch from daemon API (auto-routes to correct host) */
    fetchApi,

    /** Build full API URL for an endpoint */
    buildApiUrl,

    /** Current API base URL */
    apiBaseUrl,

    /** Current WebSocket base URL */
    wsBaseUrl,

    // ═══════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════

    /** Available connection modes */
    ConnectionMode,
  };
}

export default useConnection;
