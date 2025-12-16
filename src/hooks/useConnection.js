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
import useAppStore from '../store/useAppStore';
import { useDaemon } from './daemon/useDaemon';
import { fetchWithTimeout, buildApiUrl, getBaseUrl, getWsBaseUrl, DAEMON_CONFIG } from '../config/daemon';
import { enableSimulationMode } from '../utils/simulationMode';

/**
 * Connection modes
 */
export const ConnectionMode = {
  USB: 'usb',
  WIFI: 'wifi',
  SIMULATION: 'simulation',
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
  const connect = useCallback(async (mode, options = {}) => {
    if (isStarting || isActive) {
      console.warn('Already connected or connecting');
      return false;
    }

    switch (mode) {
      case ConnectionMode.USB:
        if (!options.portName) {
          console.error('USB mode requires portName option');
          return false;
        }
        startConnection('usb', { portName: options.portName });
        break;

      case ConnectionMode.WIFI:
        if (!options.host) {
          console.error('WiFi mode requires host option');
          return false;
        }
        startConnection('wifi', { remoteHost: options.host });
        break;

      case ConnectionMode.SIMULATION:
        enableSimulationMode();
        startConnection('simulation', { portName: 'simulation' });
        break;

      default:
        console.error(`Unknown connection mode: ${mode}`);
        return false;
    }

    // Start the daemon (handles mode-specific logic internally)
    // Use requestAnimationFrame to ensure state is updated first
    return new Promise((resolve) => {
      requestAnimationFrame(async () => {
        try {
          await startDaemon();
          resolve(true);
        } catch (e) {
          console.error('Connection failed:', e);
          resolve(false);
        }
      });
    });
  }, [isStarting, isActive, startConnection, startDaemon]);

  /**
   * Disconnect from the current robot
   * Works the same for all modes
   */
  const disconnect = useCallback(async () => {
    if (!isActive && !isStarting) {
      console.warn('Not connected');
      return false;
    }

    try {
      await stopDaemon();
      return true;
    } catch (e) {
      console.error('Disconnect failed:', e);
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
  const fetchApi = useCallback(async (endpoint, options = {}, timeout = DAEMON_CONFIG.TIMEOUTS.STATE_FULL) => {
    const url = buildApiUrl(endpoint);
    return fetchWithTimeout(url, options, timeout);
  }, []);

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
  const connectionInfo = useMemo(() => ({
    mode: connectionMode,
    host: connectionMode === 'wifi' ? remoteHost : 'localhost',
    isLocal: connectionMode === 'usb' || connectionMode === 'simulation',
    isRemote: connectionMode === 'wifi',
    isSimulation: connectionMode === 'simulation',
  }), [connectionMode, remoteHost]);

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

