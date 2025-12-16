import React, { useEffect, useMemo, useCallback, useRef, useState } from 'react';

import { useDaemon, useDaemonHealthCheck } from '../hooks/daemon';
import { useUsbDetection, useLogs, useWindowResize, useUpdater, useUpdateViewState, usePermissions, useUsbCheckTiming } from '../hooks/system';
import { useViewRouter, ViewRouterWrapper } from '../hooks/system/useViewRouter';
import { useRobotCommands, useRobotState } from '../hooks/robot';
import { DAEMON_CONFIG, setAppStoreInstance } from '../config/daemon';
import { isDevMode } from '../utils/devMode';
import useAppStore from '../store/useAppStore';

function App() {
  // Initialize the store in daemon.js for centralized logging
  useEffect(() => {
    setAppStoreInstance(useAppStore);
  }, []);
  const { daemonVersion, hardwareError, isTransitioning, setIsTransitioning, setHardwareError, connectionMode } = useAppStore();
  const { isActive, isStarting, isStopping, startupError, startDaemon, stopDaemon, fetchDaemonVersion } = useDaemon();
  const { isUsbConnected, usbPortName, checkUsbRobot } = useUsbDetection();
  const { sendCommand, playRecordedMove, isCommandRunning } = useRobotCommands();
  const { logs, fetchLogs } = useLogs();
  
  // 🔐 Permissions check (macOS only)
  // Blocks the app until camera and microphone permissions are granted
  const { allGranted: permissionsGranted, cameraGranted, microphoneGranted, hasChecked } = usePermissions({ checkInterval: 2000 });
  const [isRestarting, setIsRestarting] = useState(false);
  const restartTimerRef = useRef(null);
  const restartStartedRef = useRef(false);
  // Track if permissions were already granted on the first check (mount)
  const permissionsGrantedOnFirstCheckRef = useRef(null);
  
  // Check if permissions were already granted on first check (to avoid restart loop)
  useEffect(() => {
    if (hasChecked && permissionsGrantedOnFirstCheckRef.current === null) {
      // First check completed - remember if permissions were already granted
      permissionsGrantedOnFirstCheckRef.current = permissionsGranted;
      if (permissionsGranted) {
        console.log('[App] ✅ Permissions already granted on first check - no restart needed');
      } else {
        console.log('[App] ❌ Permissions not granted on first check - will restart when granted');
      }
    }
  }, [hasChecked, permissionsGranted]);
  
  // Handle restart when permissions are granted
  useEffect(() => {
    // Only start restart flow if:
    // 1. Permissions are granted
    // 2. We haven't started the restart yet
    // 3. Permissions were NOT already granted on first check (to avoid restart loop)
    if (
      permissionsGranted && 
      !restartStartedRef.current && 
      permissionsGrantedOnFirstCheckRef.current === false
    ) {
      restartStartedRef.current = true;
      const isDev = isDevMode();
      setIsRestarting(true);
      
      console.log('[App] 🔄 Permissions just granted - restarting app...');
      
      if (isDev) {
        // Dev mode: show restart UI for 3 seconds, then continue (simulate restart)
        restartTimerRef.current = setTimeout(() => {
          setIsRestarting(false);
          restartTimerRef.current = null;
        }, 3000); // 3 seconds in dev mode
      } else {
        // Production: wait 4 seconds then restart
        // Note: relaunch() is cross-platform (Windows, macOS, Linux)
        restartTimerRef.current = setTimeout(async () => {
          try {
            const { relaunch } = await import('@tauri-apps/plugin-process');
            await relaunch();
            // If relaunch succeeds, this code won't execute (app will restart)
          } catch (error) {
            console.error('[App] ❌ Failed to restart app:', error);
            console.error('[App] Error details:', {
              message: error.message,
              name: error.name,
              code: error.code,
            });
            // Reset state so user can try again
            setIsRestarting(false);
            restartStartedRef.current = false;
            restartTimerRef.current = null;
          }
        }, 4000); // 4 seconds in production
      }
    }
    
    return () => {
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }
    };
  }, [permissionsGranted]);
  
  // 🔄 Automatic update system
  // Tries to fetch latest.json directly - if it works, we have internet + we know if there's an update
  // In dev mode, skip automatic check but still show the view for minimum time
  const isDev = isDevMode();
  const {
    updateAvailable,
    isChecking,
    isDownloading,
    downloadProgress,
    error: updateError,
    checkForUpdates,
    installUpdate,
  } = useUpdater({
    autoCheck: !isDev, // Disable auto check in dev mode
    checkInterval: DAEMON_CONFIG.UPDATE_CHECK.INTERVAL,
    silent: false,
  });
  
  // 🔍 DEBUG: Force update check in dev mode for testing
  useEffect(() => {
    if (isDev) {
      console.log('🔍 DEV MODE: Update check disabled by default');
      console.log('   To test update check, call checkForUpdates() manually in DevTools console');
      console.log('   Or temporarily set autoCheck: true in useUpdater hook');
    }
  }, [isDev, checkForUpdates]);
  
  // ✨ Update view state management with useReducer
  // Handles all cases: dev mode, production mode, minimum display time, errors
  const shouldShowUpdateView = useUpdateViewState({
    isDev,
    isChecking,
    updateAvailable,
    isDownloading,
    updateError,
    isActive,
    isStarting,
    isStopping,
  });
  
  // 🕐 USB check timing - manages when to start USB check after update view
  const { shouldShowUsbCheck } = useUsbCheckTiming(shouldShowUpdateView);
  
  // 🎯 Centralized robot state polling (SINGLE place for /api/state/full calls)
  useRobotState(isActive);
  
  // 🏥 Centralized health check (monitors robotStateFull updates for crash detection)
  useDaemonHealthCheck();
  
  
  // ⚡ Cleanup is handled on Rust side in lib.rs:
  // - Signal handler (SIGTERM/SIGINT) → cleanup_system_daemons()
  // - on_window_event(CloseRequested) → kill_daemon()
  // - on_window_event(Destroyed) → cleanup_system_daemons()
  // → No need for JS handler (avoids redundancy)

  // Determine current view for automatic resize
  const currentView = useMemo(() => {
    // Compact view: ClosingView (stopping)
    if (isStopping) {
      return 'compact';
    }
    
    // ⚡ Expanded view: daemon active OR transitioning (but NEVER during StartingView)
    // BLOCK resize as long as isStarting = true (scan in progress)
    if (!isStarting && (isActive || isTransitioning) && !hardwareError) {
      return 'expanded';
    }
    
    // Compact view: all others (FindingRobot, Starting, ReadyToStart)
    return 'compact';
  }, [isActive, hardwareError, isStopping, isTransitioning, isStarting]);

  // Hook to automatically resize the window
  useWindowResize(currentView);

  useEffect(() => {
    // ✅ checkStatus removed - useDaemonHealthCheck handles status checking automatically
    // It polls every 1.33s and updates isActive, so no need for separate 3s polling
    fetchLogs();
    fetchDaemonVersion();
    
    // ⚠️ IMPORTANT: Don't check USB until update check is complete
    // This ensures UpdateView is shown FIRST, before USB check
    if (!shouldShowUpdateView) {
      checkUsbRobot();
    }
    
    const logsInterval = setInterval(fetchLogs, DAEMON_CONFIG.INTERVALS.LOGS_FETCH);
    const usbInterval = setInterval(() => {
      // Only check USB if update check is complete
      if (!shouldShowUpdateView) {
        checkUsbRobot();
      }
    }, DAEMON_CONFIG.INTERVALS.USB_CHECK);
    const versionInterval = setInterval(fetchDaemonVersion, DAEMON_CONFIG.INTERVALS.VERSION_FETCH);
    return () => {
      clearInterval(logsInterval);
      clearInterval(usbInterval);
      clearInterval(versionInterval);
    };
  }, [fetchLogs, checkUsbRobot, fetchDaemonVersion, shouldShowUpdateView]);

  // Stop daemon automatically if USB robot gets disconnected (USB mode only)
  // 🌐 WiFi mode doesn't use isUsbConnected, so skip this check
  useEffect(() => {
    if (connectionMode === 'usb' && !isUsbConnected && isActive) {
      stopDaemon();
    }
  }, [connectionMode, isUsbConnected, isActive, stopDaemon]);

  // Reset hardware error when returning to ready-to-start view
  useEffect(() => {
    if (isUsbConnected && !isActive && !isStarting && hardwareError) {
      setHardwareError(null);
    }
  }, [isUsbConnected, isActive, isStarting, hardwareError, setHardwareError]);

  // ✅ Callback to close TransitionView when apps are loaded
  // ⚠️ IMPORTANT: All hooks must be called before conditional returns
  const handleAppsReady = useCallback(() => {
    if (isTransitioning) {
      setIsTransitioning(false);
    }
  }, [isTransitioning, setIsTransitioning]);

  // Determine which view to display based on app state
  const viewConfig = useViewRouter({
    permissionsGranted,
    isRestarting,
    shouldShowUpdateView,
    isChecking,
    isDownloading,
    downloadProgress,
    updateAvailable,
    updateError,
    onInstallUpdate: installUpdate,
    shouldShowUsbCheck,
    isUsbConnected,
    connectionMode,
    isStarting,
    isStopping,
    isActive,
    isTransitioning,
    hardwareError,
    startupError,
    startDaemon,
    stopDaemon,
    sendCommand,
    playRecordedMove,
    isCommandRunning,
    logs,
    daemonVersion,
    usbPortName,
    onAppsReady: handleAppsReady,
  });

  return <ViewRouterWrapper viewConfig={viewConfig} />;
}

export default App;

