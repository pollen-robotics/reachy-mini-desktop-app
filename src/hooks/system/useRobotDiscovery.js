/**
 * 🌐 Robot Discovery Hook
 *
 * Scans for available robots via USB and WiFi in parallel.
 * Used by FindingRobotView to detect and list connection options.
 *
 * V2: Uses native Rust discovery (mDNS, cache, static peers) for reliability.
 * Supports multiple WiFi robots with selection.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import useAppStore from '../../store/useAppStore';
import { DAEMON_CONFIG } from '../../config/daemon';

/**
 * Check if a USB robot is connected
 * @returns {Promise<{available: boolean, portName: string | null}>}
 */
async function checkUsbRobot() {
  try {
    const portName = await invoke('check_usb_robot');
    return { available: portName !== null, portName };
  } catch (e) {
    return { available: false, portName: null };
  }
}

/**
 * Discover WiFi robots using the native Rust discovery system
 * Uses cache → static peers → mDNS in order for speed
 * @returns {Promise<{available: boolean, robots: Array}>}
 */
async function checkWifiRobotV2() {
  try {
    const rawRobots = await invoke('discover_robots');

    if (rawRobots && rawRobots.length > 0) {
      const robots = rawRobots.map(robot => ({
        ...robot,
        displayHost: robot.ip,
      }));

      return { available: true, robots };
    }

    return { available: false, robots: [] };
  } catch (e) {
    return { available: false, robots: [] };
  }
}

/**
 * Robot Discovery Hook
 *
 * Scans for USB and WiFi robots in parallel.
 * Returns the current state of discovered robots.
 */
export function useRobotDiscovery() {
  const isFirstCheck = useAppStore(state => state.isFirstCheck);
  const setIsFirstCheck = useAppStore(state => state.setIsFirstCheck);
  const cleanupBlacklist = useAppStore(state => state.cleanupBlacklist);

  // Discovery state
  const [isScanning, setIsScanning] = useState(true);
  const [usbRobot, setUsbRobot] = useState({ available: false, portName: null });
  const [wifiRobots, setWifiRobots] = useState({
    available: false,
    robots: [],
    selectedRobot: null,
  });

  // Refs for interval management
  const scanIntervalRef = useRef(null);
  const isMountedRef = useRef(true);
  const isScanningRef = useRef(false); // Prevent overlapping scans

  // Cleanup expired blacklist entries periodically
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      cleanupBlacklist();
    }, 2000); // Every 2 seconds

    return () => clearInterval(cleanupInterval);
  }, [cleanupBlacklist]);

  /**
   * Select a specific WiFi robot from the discovered list
   */
  const selectWifiRobot = useCallback(robot => {
    setWifiRobots(prev => ({ ...prev, selectedRobot: robot }));
  }, []);

  /**
   * Perform a single discovery scan (USB + WiFi in parallel)
   */
  const performScan = useCallback(async () => {
    // Skip if already scanning (prevents callback accumulation)
    if (isScanningRef.current) {
      return;
    }

    isScanningRef.current = true;
    const startTime = Date.now();

    try {
      // Scan USB and WiFi in parallel
      const usbPromise = checkUsbRobot();
      const wifiPromise = checkWifiRobotV2();

      // Get USB result first (it's fast)
      const usbResult = await usbPromise;

      // Update USB immediately so user sees it (don't wait for slow WiFi check)
      if (isMountedRef.current) {
        setUsbRobot(usbResult);
      }

      // Wait for WiFi (may be slow on first discovery, fast with cache)
      const wifiResult = await wifiPromise;

      // Ensure minimum delay on first check for smooth UX
      if (isFirstCheck) {
        const elapsed = Date.now() - startTime;
        const minDelay = DAEMON_CONFIG.MIN_DISPLAY_TIMES.USB_CHECK_FIRST;

        if (elapsed < minDelay) {
          await new Promise(resolve => setTimeout(resolve, minDelay - elapsed));
        }

        setIsFirstCheck(false);
      }

      // Only update state if still mounted
      if (isMountedRef.current) {
        setWifiRobots(prev => {
          // Auto-select when exactly 1 robot found
          const selectedRobot =
            wifiResult.robots.length === 1
              ? wifiResult.robots[0]
              : // Keep previous selection if still valid
                prev.selectedRobot && wifiResult.robots.some(r => r.ip === prev.selectedRobot.ip)
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

  /**
   * Start continuous scanning
   */
  const startScanning = useCallback(() => {
    // Clear any existing interval
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
    }

    setIsScanning(true);

    // Perform initial scan immediately
    performScan();

    // Then scan periodically
    scanIntervalRef.current = setInterval(() => {
      if (isMountedRef.current) {
        performScan();
      }
    }, DAEMON_CONFIG.INTERVALS.USB_CHECK);
  }, [performScan]);

  /**
   * Stop scanning
   */
  const stopScanning = useCallback(() => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    setIsScanning(false);
  }, []);

  /**
   * Refresh scan manually
   */
  const refresh = useCallback(() => {
    setIsScanning(true);
    performScan();
  }, [performScan]);

  // Start scanning on mount, cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    // Reset scanning flag on mount (fixes HMR issues)
    isScanningRef.current = false;
    startScanning();

    return () => {
      isMountedRef.current = false;
      stopScanning();
    };
  }, [startScanning, stopScanning]);

  // Backward-compatible wifiRobot derived property
  const wifiRobot = useMemo(() => {
    if (!wifiRobots.available || wifiRobots.robots.length === 0) {
      return { available: false, host: null };
    }
    const robot = wifiRobots.selectedRobot || wifiRobots.robots[0];
    return { available: true, host: robot.displayHost };
  }, [wifiRobots]);

  return {
    // State
    isScanning,
    usbRobot, // { available: boolean, portName: string | null }
    wifiRobots, // { available: boolean, robots: Array, selectedRobot: object | null }
    wifiRobot, // backward-compat: { available: boolean, host: string | null }

    // Helpers
    hasAnyRobot: usbRobot.available || wifiRobots.available,

    // Actions
    selectWifiRobot,
    startScanning,
    stopScanning,
    refresh,
  };
}

export default useRobotDiscovery;
