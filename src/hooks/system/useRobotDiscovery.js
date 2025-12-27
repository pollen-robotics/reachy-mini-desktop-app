/**
 * 🌐 Robot Discovery Hook
 *
 * Scans for available robots via USB and WiFi in parallel.
 * Used by FindingRobotView to detect and list connection options.
 *
 * WiFi discovery uses Tauri's mDNS-based discovery (Rust side) which:
 * - Works cross-platform (macOS, Windows, Linux)
 * - Always returns an IP address (not hostname) for reliable connections
 * - Bypasses WebView mDNS resolution issues
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import useAppStore from '../../store/useAppStore';
import { DAEMON_CONFIG } from '../../config/daemon';

// Track last logged WiFi host to avoid repetitive logs
let lastLoggedWifiHost = null;

/**
 * Discover WiFi robot using Tauri's mDNS discovery
 * Returns an IP address (not hostname) for reliable connections
 * @returns {Promise<{available: boolean, host: string | null, hostname: string | null}>}
 */
async function checkWifiRobot() {
  try {
    // Use Tauri command for mDNS discovery (pure Rust, cross-platform)
    // This resolves hostnames to IPs and probes the daemon
    const result = await invoke('discover_reachy_robot');

    if (result) {
      // Only log when host changes (found new robot or different host)
      if (lastLoggedWifiHost !== result.ip) {
        const methodInfo =
          result.discovery_method === 'mdns'
            ? `via mDNS (${result.hostname})`
            : `via ${result.discovery_method}`;
        console.log(`🌐 WiFi robot found at ${result.ip} ${methodInfo}`);
        lastLoggedWifiHost = result.ip;
      }

      // Return IP for connections, but keep hostname for display
      return {
        available: true,
        host: result.ip, // Always use IP for actual connections
        hostname: result.hostname || null, // mDNS hostname for display (e.g. "reachy-mini.local")
      };
    }

    // Log when robot is lost (was found before, now gone)
    if (lastLoggedWifiHost !== null) {
      console.log('🌐 WiFi robot disconnected');
      lastLoggedWifiHost = null;
    }

    return { available: false, host: null, hostname: null };
  } catch (e) {
    console.error('WiFi discovery error:', e);

    // Log when robot is lost due to error
    if (lastLoggedWifiHost !== null) {
      console.log('🌐 WiFi robot disconnected (discovery error)');
      lastLoggedWifiHost = null;
    }

    return { available: false, host: null, hostname: null };
  }
}

/**
 * Check if a USB robot is connected
 * @returns {Promise<{available: boolean, portName: string | null}>}
 */
async function checkUsbRobot() {
  try {
    const portName = await invoke('check_usb_robot');
    return { available: portName !== null, portName };
  } catch (e) {
    console.error('USB check error:', e);
    return { available: false, portName: null };
  }
}

/**
 * Robot Discovery Hook
 *
 * Scans for USB and WiFi robots in parallel.
 * Returns the current state of discovered robots.
 *
 * WiFi discovery always returns an IP address (resolved via mDNS in Rust),
 * ensuring reliable connections without WebView mDNS issues.
 */
export function useRobotDiscovery() {
  const isFirstCheck = useAppStore(state => state.isFirstCheck);
  const setIsFirstCheck = useAppStore(state => state.setIsFirstCheck);

  // Discovery state
  const [isScanning, setIsScanning] = useState(true);
  const [usbRobot, setUsbRobot] = useState({ available: false, portName: null });
  const [wifiRobot, setWifiRobot] = useState({ available: false, host: null, hostname: null });

  // Refs for interval management
  const scanIntervalRef = useRef(null);
  const isMountedRef = useRef(true);
  const isScanningRef = useRef(false); // Prevent overlapping scans

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
      const [usbResult, wifiResult] = await Promise.all([checkUsbRobot(), checkWifiRobot()]);

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
        setUsbRobot(usbResult);
        setWifiRobot(wifiResult);
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
    startScanning();

    return () => {
      isMountedRef.current = false;
      stopScanning();
    };
  }, [startScanning, stopScanning]);

  return {
    // State
    isScanning,
    usbRobot, // { available: boolean, portName: string | null }
    wifiRobot, // { available: boolean, host: string | null, hostname: string | null } - host is IP, hostname is mDNS name

    // Helpers
    hasAnyRobot: usbRobot.available || wifiRobot.available,

    // Actions
    startScanning,
    stopScanning,
    refresh,
  };
}

export default useRobotDiscovery;
