/**
 * Hook to scan WiFi networks from the local machine (not the Reachy daemon)
 * Uses Tauri command to scan available networks on macOS/Windows/Linux
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';

/**
 * @typedef {Object} WifiNetwork
 * @property {string} ssid - Network name
 * @property {number|null} signal_strength - Signal strength (dBm or percentage)
 * @property {boolean} is_reachy_hotspot - Whether this looks like a Reachy hotspot
 */

/**
 * Hook to scan local WiFi networks
 * @param {Object} options
 * @param {boolean} [options.autoScan=false] - Start scanning automatically on mount
 * @param {number} [options.scanInterval=5000] - Interval between scans in ms (0 = no auto-refresh)
 * @returns {Object}
 */
export function useLocalWifiScan({ autoScan = false, scanInterval = 0 } = {}) {
  const [networks, setNetworks] = useState([]);
  const [reachyHotspots, setReachyHotspots] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState(null);
  const [lastScanTime, setLastScanTime] = useState(null);
  const intervalRef = useRef(null);

  /**
   * Scan for available WiFi networks
   */
  const scan = useCallback(async () => {
    setIsScanning(true);
    setError(null);
    
    try {
      const result = await invoke('scan_local_wifi_networks');
      setNetworks(result);
      setLastScanTime(new Date());
      
      // Extract Reachy hotspots
      const hotspots = result.filter(n => n.is_reachy_hotspot);
      setReachyHotspots(hotspots);
      
      return result;
    } catch (err) {
      console.error('[useLocalWifiScan] Scan failed:', err);
      setError(typeof err === 'string' ? err : err.message || 'Failed to scan WiFi networks');
      return [];
    } finally {
      setIsScanning(false);
    }
  }, []);

  // Auto-scan on mount if enabled
  useEffect(() => {
    if (autoScan) {
      scan();
    }
  }, [autoScan, scan]);

  // Auto-refresh interval
  useEffect(() => {
    if (scanInterval > 0) {
      intervalRef.current = setInterval(() => {
        scan();
      }, scanInterval);
      
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }
  }, [scanInterval, scan]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    // Data
    networks,
    reachyHotspots,
    hasReachyHotspot: reachyHotspots.length > 0,
    
    // State
    isScanning,
    error,
    lastScanTime,
    
    // Actions
    scan,
    
    // Helpers
    getNetworkBySSID: useCallback(
      (ssid) => networks.find(n => n.ssid === ssid),
      [networks]
    ),
  };
}

export default useLocalWifiScan;

