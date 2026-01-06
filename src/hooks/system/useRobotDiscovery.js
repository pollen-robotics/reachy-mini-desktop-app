/**
 * 🌐 Robot Discovery Hook
 * 
 * Scans for available robots via USB and WiFi in parallel.
 * Used by FindingRobotView to detect and list connection options.
 * 
 * Uses Tauri HTTP plugin for WiFi discovery to bypass WebView restrictions.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import useAppStore from '../../store/useAppStore';
import { DAEMON_CONFIG } from '../../config/daemon';

// WiFi hosts to check (try multiple in parallel)
// mDNS (.home) doesn't work in WebView, so we also try common IPs
const WIFI_HOSTS_TO_CHECK = [
  'reachy-mini.home',      // mDNS (works in some cases)
  'reachy-mini.local',     // mDNS alternative
  '192.168.1.18',          // Common static IP for Reachy
  // Add more IPs here if needed
];
const WIFI_CHECK_TIMEOUT = 2000; // 2s timeout per host

// Track last logged WiFi host to avoid repetitive logs
let lastLoggedWifiHost = null;

/**
 * Check if a WiFi robot is available at a single host
 * Uses Tauri HTTP plugin to bypass WebView network restrictions
 * @param {string} host - Hostname or IP to check
 * @returns {Promise<{available: boolean, host: string, error?: string}>}
 */
async function checkSingleHost(host) {
  try {
    // Use Tauri fetch which runs in Rust (bypasses WebView restrictions)
    const response = await tauriFetch(`http://${host}:8000/api/daemon/status`, {
      method: 'GET',
      connectTimeout: WIFI_CHECK_TIMEOUT,
    });
    
    if (response.ok) {
      return { available: true, host };
    }
    return { available: false, host, error: `HTTP ${response.status}` };
  } catch (e) {
    // Network error or timeout
    return { available: false, host, error: e.message };
  }
}

import { isReachyHotspot } from '../../constants/wifi';

/**
 * Check if the computer is currently connected to a Reachy hotspot
 * @returns {Promise<boolean>}
 */
async function isOnReachyHotspot() {
  try {
    const currentSsid = await invoke('get_current_wifi_ssid');
    return isReachyHotspot(currentSsid);
  } catch (e) {
    console.warn('Failed to get current WiFi SSID:', e);
    return false;
  }
}

/**
 * Check multiple WiFi hosts in parallel and return the first one that responds
 * @param {Function} isRobotBlacklisted - Function to check if a robot host is blacklisted
 * @returns {Promise<{available: boolean, host: string | null}>}
 */
async function checkWifiRobot(isRobotBlacklisted) {
  // First check if we're on the Reachy hotspot - if so, WiFi mode is not available
  const onHotspot = await isOnReachyHotspot();
  if (onHotspot) {
    if (lastLoggedWifiHost !== 'hotspot-blocked') {
      
      lastLoggedWifiHost = 'hotspot-blocked';
    }
    return { available: false, host: null, onHotspot: true };
  }
  
  // Check all hosts in parallel
  const results = await Promise.all(
    WIFI_HOSTS_TO_CHECK.map(host => checkSingleHost(host))
  );
  
  // Return the first available host (but filter out blacklisted ones)
  const available = results.find(r => r.available && !isRobotBlacklisted(r.host));
  if (available) {
    // Only log when host changes (found new robot or different host)
    if (lastLoggedWifiHost !== available.host) {
      
      lastLoggedWifiHost = available.host;
    }
    return { available: true, host: available.host };
  }
  
  // Check if all available hosts are blacklisted
  const hasBlacklistedRobots = results.some(r => r.available && isRobotBlacklisted(r.host));
  if (hasBlacklistedRobots && lastLoggedWifiHost !== 'blacklisted') {
    
    lastLoggedWifiHost = 'blacklisted';
  }
  
  // Log when robot is lost (was found before, now gone)
  if (lastLoggedWifiHost && lastLoggedWifiHost !== 'hotspot-blocked' && lastLoggedWifiHost !== 'blacklisted' && !hasBlacklistedRobots) {
    
    lastLoggedWifiHost = null;
  }
  
  return { available: false, host: null };
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
 */
export function useRobotDiscovery() {
  const isFirstCheck = useAppStore(state => state.isFirstCheck);
  const setIsFirstCheck = useAppStore(state => state.setIsFirstCheck);
  const cleanupBlacklist = useAppStore(state => state.cleanupBlacklist);
  const isRobotBlacklisted = useAppStore(state => state.isRobotBlacklisted);
  
  // Discovery state
  const [isScanning, setIsScanning] = useState(true);
  const [usbRobot, setUsbRobot] = useState({ available: false, portName: null });
  const [wifiRobot, setWifiRobot] = useState({ available: false, host: null });
  
  // Refs for interval management
  const scanIntervalRef = useRef(null);
  const isMountedRef = useRef(true);
  
  // Cleanup expired blacklist entries periodically
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      cleanupBlacklist();
    }, 2000); // Every 2 seconds
    
    return () => clearInterval(cleanupInterval);
  }, [cleanupBlacklist]);

  /**
   * Perform a single discovery scan (USB + WiFi in parallel)
   */
  const performScan = useCallback(async () => {
    const startTime = Date.now();
    
    // Scan USB and WiFi in parallel
    const [usbResult, wifiResult] = await Promise.all([
      checkUsbRobot(),
      checkWifiRobot(isRobotBlacklisted),
    ]);
    
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
  }, [isFirstCheck, setIsFirstCheck, isRobotBlacklisted]);

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
    usbRobot,      // { available: boolean, portName: string | null }
    wifiRobot,     // { available: boolean, host: string | null }
    
    // Helpers
    hasAnyRobot: usbRobot.available || wifiRobot.available,
    
    // Actions
    startScanning,
    stopScanning,
    refresh,
  };
}

export default useRobotDiscovery;

