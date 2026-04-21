/**
 * 🌐 Robot Discovery Hook
 *
 * Scans for available robots via USB and WiFi in parallel.
 * Used by `FindingRobotView` to detect and list connection options.
 *
 * V2: Uses native Rust discovery (mDNS, cache, static peers) for reliability.
 * Supports multiple WiFi robots with selection.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import useAppStore from '../../store/useAppStore';
import { DAEMON_CONFIG } from '../../config/daemon';

/**
 * Raw robot payload returned by the `discover_robots` Tauri command.
 * Matches `RobotInfo` in `src-tauri/src/discovery/mod.rs`.
 */
export interface RawDiscoveredRobot {
  name: string;
  ip: string;
  port: number;
  discovery_method: string;
  hostname: string | null;
}

/**
 * Robot augmented with a UI-friendly display host.
 */
export interface DiscoveredRobot extends RawDiscoveredRobot {
  displayHost: string;
}

export interface UsbRobotState {
  available: boolean;
  portName: string | null;
}

export interface WifiRobotsState {
  available: boolean;
  robots: DiscoveredRobot[];
  selectedRobot: DiscoveredRobot | null;
}

export interface WifiRobotCompat {
  available: boolean;
  host: string | null;
}

export interface UseRobotDiscoveryResult {
  isScanning: boolean;
  usbRobot: UsbRobotState;
  wifiRobots: WifiRobotsState;
  wifiRobot: WifiRobotCompat;
  hasAnyRobot: boolean;
  selectWifiRobot: (robot: DiscoveredRobot | null) => void;
  startScanning: () => void;
  stopScanning: () => void;
  refresh: () => void;
}

type IntervalId = ReturnType<typeof setInterval>;

/**
 * Check if a USB robot is connected.
 */
async function checkUsbRobot(): Promise<UsbRobotState> {
  try {
    const portName = (await invoke('check_usb_robot')) as string | null;
    return { available: portName !== null, portName };
  } catch {
    return { available: false, portName: null };
  }
}

/**
 * Hard upper-bound for a single `discover_robots` call. The Rust command has
 * its own internal deadlines (~3s for mDNS, plus cache + static peer checks),
 * so anything past this cap means Rust is hung. We bail and let the next scan
 * cycle retry on a fresh command instance.
 */
const DISCOVER_TIMEOUT_MS = 8000;

/**
 * Discover WiFi robots using the native Rust discovery system.
 * Uses cache → static peers → mDNS in order for speed.
 */
async function checkWifiRobotV2(): Promise<{ available: boolean; robots: DiscoveredRobot[] }> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('discover_robots timeout')), DISCOVER_TIMEOUT_MS);
  });

  try {
    const rawRobots = (await Promise.race([
      invoke('discover_robots'),
      timeoutPromise,
    ])) as RawDiscoveredRobot[] | null;

    if (rawRobots && rawRobots.length > 0) {
      const robots: DiscoveredRobot[] = rawRobots.map(robot => ({
        ...robot,
        displayHost: robot.ip,
      }));

      return { available: true, robots };
    }

    return { available: false, robots: [] };
  } catch {
    return { available: false, robots: [] };
  }
}

/**
 * Robot Discovery Hook.
 *
 * Scans for USB and WiFi robots in parallel.
 * Returns the current state of discovered robots.
 */
export function useRobotDiscovery(): UseRobotDiscoveryResult {
  const isFirstCheck = useAppStore(state => state.isFirstCheck);
  const setIsFirstCheck = useAppStore(state => state.setIsFirstCheck);

  // Discovery state.
  const [isScanning, setIsScanning] = useState<boolean>(true);
  const [usbRobot, setUsbRobot] = useState<UsbRobotState>({
    available: false,
    portName: null,
  });
  const [wifiRobots, setWifiRobots] = useState<WifiRobotsState>({
    available: false,
    robots: [],
    selectedRobot: null,
  });

  // Refs for interval management.
  const scanIntervalRef = useRef<IntervalId | null>(null);
  const isMountedRef = useRef<boolean>(true);
  // Prevent overlapping scans.
  const isScanningRef = useRef<boolean>(false);

  const selectWifiRobot = useCallback((robot: DiscoveredRobot | null): void => {
    setWifiRobots(prev => ({ ...prev, selectedRobot: robot }));
  }, []);

  /**
   * Perform a single discovery scan (USB + WiFi in parallel).
   */
  const performScan = useCallback(async (): Promise<void> => {
    if (isScanningRef.current) {
      return;
    }

    isScanningRef.current = true;
    const startTime = Date.now();

    try {
      const usbPromise = checkUsbRobot();
      const wifiPromise = checkWifiRobotV2();

      // Get USB result first (it's fast).
      const usbResult = await usbPromise;

      // Update USB immediately so the user sees it (don't wait for slow WiFi check).
      if (isMountedRef.current) {
        setUsbRobot(usbResult);
      }

      // Wait for WiFi (may be slow on first discovery, fast with cache).
      const wifiResult = await wifiPromise;

      // Ensure minimum delay on first check for smooth UX.
      if (isFirstCheck) {
        const elapsed = Date.now() - startTime;
        const minDelay = DAEMON_CONFIG.MIN_DISPLAY_TIMES.USB_CHECK_FIRST;

        if (elapsed < minDelay) {
          await new Promise<void>(resolve => setTimeout(resolve, minDelay - elapsed));
        }

        setIsFirstCheck(false);
      }

      if (isMountedRef.current) {
        setWifiRobots(prev => {
          // Auto-select when exactly 1 robot is found, otherwise keep previous
          // selection if it's still valid.
          const selectedRobot =
            wifiResult.robots.length === 1
              ? wifiResult.robots[0]
              : prev.selectedRobot && wifiResult.robots.some(r => r.ip === prev.selectedRobot!.ip)
                ? prev.selectedRobot
                : null;

          return {
            available: wifiResult.available,
            robots: wifiResult.robots,
            selectedRobot,
          };
        });
        setIsScanning(false);
      }
    } finally {
      isScanningRef.current = false;
    }
  }, [isFirstCheck, setIsFirstCheck]);

  const startScanning = useCallback((): void => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
    }

    setIsScanning(true);

    performScan();

    scanIntervalRef.current = setInterval(() => {
      if (isMountedRef.current) {
        performScan();
      }
    }, DAEMON_CONFIG.INTERVALS.DISCOVERY_SCAN);
  }, [performScan]);

  const stopScanning = useCallback((): void => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    setIsScanning(false);
  }, []);

  const refresh = useCallback((): void => {
    setIsScanning(true);
    performScan();
  }, [performScan]);

  // Start scanning on mount, cleanup on unmount.
  useEffect(() => {
    isMountedRef.current = true;
    // Reset scanning flag on mount (fixes HMR issues).
    isScanningRef.current = false;
    startScanning();

    return () => {
      isMountedRef.current = false;
      stopScanning();
    };
  }, [startScanning, stopScanning]);

  // Backward-compatible `wifiRobot` derived property.
  const wifiRobot = useMemo<WifiRobotCompat>(() => {
    if (!wifiRobots.available || wifiRobots.robots.length === 0) {
      return { available: false, host: null };
    }
    const robot = wifiRobots.selectedRobot ?? wifiRobots.robots[0];
    return { available: true, host: robot.displayHost };
  }, [wifiRobots]);

  return {
    isScanning,
    usbRobot,
    wifiRobots,
    wifiRobot,

    hasAnyRobot: usbRobot.available || wifiRobots.available,

    selectWifiRobot,
    startScanning,
    stopScanning,
    refresh,
  };
}

export default useRobotDiscovery;
