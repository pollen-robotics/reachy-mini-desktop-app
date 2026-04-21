/**
 * Hook to scan WiFi networks from the local machine (not the Reachy daemon).
 * Uses a Tauri command to scan available networks on macOS/Windows/Linux.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';

/**
 * Shape returned by the `scan_local_wifi_networks` Tauri command.
 */
export interface WifiNetwork {
  ssid: string;
  signal_strength: number | null;
  is_reachy_hotspot: boolean;
}

export interface UseLocalWifiScanOptions {
  /** Start scanning automatically on mount. */
  autoScan?: boolean;
  /** Interval between scans in ms (0 = no auto-refresh). */
  scanInterval?: number;
}

export interface UseLocalWifiScanResult {
  networks: WifiNetwork[];
  reachyHotspots: WifiNetwork[];
  hasReachyHotspot: boolean;
  isScanning: boolean;
  error: string | null;
  lastScanTime: Date | null;
  scan: () => Promise<WifiNetwork[]>;
  getNetworkBySSID: (ssid: string) => WifiNetwork | undefined;
}

type IntervalId = ReturnType<typeof setInterval>;

export function useLocalWifiScan({
  autoScan = false,
  scanInterval = 0,
}: UseLocalWifiScanOptions = {}): UseLocalWifiScanResult {
  const [networks, setNetworks] = useState<WifiNetwork[]>([]);
  const [reachyHotspots, setReachyHotspots] = useState<WifiNetwork[]>([]);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null);
  const intervalRef = useRef<IntervalId | null>(null);

  // Ref to prevent overlapping scans.
  const isScanningRef = useRef<boolean>(false);

  /**
   * Scan for available WiFi networks.
   */
  const scan = useCallback(async (): Promise<WifiNetwork[]> => {
    if (isScanningRef.current) {
      return [];
    }

    isScanningRef.current = true;
    setIsScanning(true);
    setError(null);

    try {
      const result = (await invoke('scan_local_wifi_networks')) as WifiNetwork[];
      setNetworks(result);
      setLastScanTime(new Date());

      const hotspots = result.filter(n => n.is_reachy_hotspot);
      setReachyHotspots(hotspots);
      console.log(
        '[wifi-scan] Networks found:',
        result.map(
          n => `${n.ssid} (${n.signal_strength}dBm${n.is_reachy_hotspot ? ' ★REACHY' : ''})`
        )
      );

      return result;
    } catch (err: unknown) {
      const message =
        typeof err === 'string'
          ? err
          : err instanceof Error
            ? err.message
            : 'Failed to scan WiFi networks';
      setError(message);
      return [];
    } finally {
      isScanningRef.current = false;
      setIsScanning(false);
    }
  }, []);

  // Auto-scan on mount if enabled.
  useEffect(() => {
    if (autoScan) {
      scan();
    }
  }, [autoScan, scan]);

  // Auto-refresh interval.
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
    return undefined;
  }, [scanInterval, scan]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const getNetworkBySSID = useCallback(
    (ssid: string): WifiNetwork | undefined => networks.find(n => n.ssid === ssid),
    [networks]
  );

  return {
    networks,
    reachyHotspots,
    hasReachyHotspot: reachyHotspots.length > 0,

    isScanning,
    error,
    lastScanTime,

    scan,

    getNetworkBySSID,
  };
}

export default useLocalWifiScan;
