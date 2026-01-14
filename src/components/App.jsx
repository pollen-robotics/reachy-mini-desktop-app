import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';

import { useDaemon, useDaemonHealthCheck } from '../hooks/daemon';
import { telemetry } from '../utils/telemetry';
import {
  useUsbDetection,
  useLogs,
  useWindowResize,
  useUpdater,
  useUpdateViewState,
  usePermissions,
  useUsbCheckTiming,
  useDeepLink,
} from '../hooks/system';
import { useViewRouter, ViewRouterWrapper } from '../hooks/system/useViewRouter';
import { useRobotCommands, useRobotStateWebSocket, useActiveMoves } from '../hooks/robot';
import { DAEMON_CONFIG, setAppStoreInstance } from '../config/daemon';
import { isDevMode } from '../utils/devMode';
import useAppStore from '../store/useAppStore';
import { useToast } from '../hooks/useToast';
import Toast from './Toast/Toast';

// Initialize diagnostic export tools (exposes window.reachyDiagnostic)
import '../utils/diagnosticExport';

function App() {
  // Initialize the store in daemon.js for centralized logging
  useEffect(() => {
    setAppStoreInstance(useAppStore);
  }, []);

  // 📊 Telemetry: Track app lifecycle
  useEffect(() => {
    // Track app started (runs once on mount)
    // eslint-disable-next-line no-undef
    telemetry.appStarted({ version: __APP_VERSION__ });

    // Track app closed on unmount/window close
    const handleBeforeUnload = () => {
      telemetry.appClosed();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      telemetry.appClosed();
    };
  }, []);
  const {
    daemonVersion,
    hardwareError,
    connectionMode,
    isAppRunning,
    robotStatus,
    busyReason,
    isInstalling,
    isStoppingApp,
    isCommandRunning,
    darkMode,
    setPendingDeepLinkInstall,
    shouldStreamRobotState, // 🎯 Flag to start WebSocket early (during HardwareScanView)
  } = useAppStore();
  const {
    isActive,
    isStarting,
    isStopping,
    startupError,
    startDaemon,
    stopDaemon,
    fetchDaemonVersion,
  } = useDaemon();
  const { isUsbConnected, usbPortName, checkUsbRobot } = useUsbDetection();
  const { sendCommand, playRecordedMove } = useRobotCommands(); // Note: isCommandRunning comes from store
  const { logs, fetchLogs } = useLogs();

  // 🍞 Global toast for deep link feedback
  const { toast, toastProgress, showToast, handleCloseToast } = useToast();

  // 🔗 Deep link handler - at root level for global access
  // Note: Toast is shown in ActiveRobotView when processing completes (with accurate status)
  const handleDeepLinkInstall = useCallback(
    appName => {
      console.log('[App] Deep link install requested for:', appName);
      // Store pending install - ActiveRobotView will pick it up and process it
      setPendingDeepLinkInstall(appName);
    },
    [setPendingDeepLinkInstall]
  );

  useDeepLink({
    isActive,
    isAppRunning,
    // Detailed busy state for specific error messages
    robotStatus,
    busyReason,
    isInstalling,
    isStoppingApp,
    isCommandRunning,
    onInstallRequest: handleDeepLinkInstall,
    showToast,
  });

  // 🔐 Permissions check (macOS only)
  // Blocks the app until camera and microphone permissions are granted
  const {
    allGranted: permissionsGranted,
    cameraGranted,
    microphoneGranted,
    hasChecked,
  } = usePermissions({ checkInterval: 2000 });
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

  // 🎯 Daemon health check (POST /health-check every 2.5s)
  // Handles crash detection via timeout counting (3 consecutive timeouts = crash)
  useDaemonHealthCheck(isActive);

  // 🚀 Unified WebSocket for ALL robot state
  // Streams at 20Hz: head_pose, head_joints, body_yaw, antennas, passive_joints, control_mode, doa
  // 🎯 Start early when shouldStreamRobotState=true (HardwareScanView sets this when daemon is ready)
  useRobotStateWebSocket(isActive || shouldStreamRobotState);

  // 🎯 Real-time active moves tracking (WebSocket /api/move/ws/updates)
  // Replaces the old polling of GET /api/move/running every 500ms
  useActiveMoves(isActive);

  // ⚡ Cleanup for USB/Simulation: handled on Rust side in lib.rs
  // ⚡ Cleanup for WiFi: must be done in JS because daemon is on remote Pi
  // Uses Tauri window close event (more reliable than beforeunload in WebView)
  useEffect(() => {
    // Only setup WiFi cleanup if connected via WiFi
    if (connectionMode !== 'wifi') return;

    let unlisten = null;

    const setupCloseListener = async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
        const currentWindow = getCurrentWindow();

        unlisten = await currentWindow.onCloseRequested(async () => {
          console.log('[App] Window close requested - cleaning up WiFi daemon');

          try {
            const remoteHost = useAppStore.getState().remoteHost;
            if (remoteHost) {
              const host = remoteHost.includes('://') ? remoteHost : `http://${remoteHost}`;
              const baseUrl = host.endsWith(':8000') ? host : `${host}:8000`;
              const url = `${baseUrl}/api/daemon/stop?goto_sleep=false`;

              // Use tauriFetch (bypasses CORS) with a short timeout
              await tauriFetch(url, {
                method: 'POST',
                connectTimeout: 2000,
              }).catch(() => {});

              console.log('[App] WiFi daemon stop sent');
            }
          } catch (e) {
            // Ignore errors during cleanup
            console.warn('[App] WiFi cleanup error:', e.message);
          }

          // Don't prevent close - let it proceed
        });
      } catch (e) {
        console.warn('[App] Failed to setup close listener:', e.message);
      }
    };

    setupCloseListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [connectionMode]);

  // Determine current view for automatic resize
  const currentView = useMemo(() => {
    // Compact view: ClosingView (stopping)
    if (isStopping) {
      return 'compact';
    }

    // Expanded view: daemon active
    if (isActive && !hardwareError) {
      return 'expanded';
    }

    // Compact view: all others (FindingRobot, Starting, ReadyToStart)
    return 'compact';
  }, [isActive, hardwareError, isStopping]);

  // Hook to automatically resize the window
  useWindowResize(currentView);

  useEffect(() => {
    // Fetch logs and version on mount
    fetchLogs();
    fetchDaemonVersion();

    // 🔌 USB polling: ONLY when searching for a robot (not connected)
    // Once connected, the daemon handles everything (healthcheck detects disconnection)
    // This prevents race conditions where polling could set isUsbConnected=false during startup
    const shouldPollUsb = !connectionMode;

    // ⚠️ IMPORTANT: Don't check USB until update check is complete
    // This ensures UpdateView is shown FIRST, before USB check
    if (!shouldShowUpdateView && shouldPollUsb) {
      checkUsbRobot();
    }

    const logsInterval = setInterval(fetchLogs, DAEMON_CONFIG.INTERVALS.LOGS_FETCH);
    const usbInterval = setInterval(() => {
      // Only check USB if update check is complete AND we should poll
      if (!shouldShowUpdateView && shouldPollUsb) {
        checkUsbRobot();
      }
    }, DAEMON_CONFIG.INTERVALS.USB_CHECK);
    const versionInterval = setInterval(fetchDaemonVersion, DAEMON_CONFIG.INTERVALS.VERSION_FETCH);
    return () => {
      clearInterval(logsInterval);
      clearInterval(usbInterval);
      clearInterval(versionInterval);
    };
  }, [fetchLogs, checkUsbRobot, fetchDaemonVersion, shouldShowUpdateView, connectionMode]);

  // ✅ USB disconnection detection is handled by:
  // 1. Daemon health check (daemon stops responding → crash detection)
  // 2. USB polling only runs when !connectionMode (searching for robot)
  // 3. startConnection() sets isUsbConnected atomically, no race condition

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
  });

  return (
    <>
      <ViewRouterWrapper viewConfig={viewConfig} />
      {/* 🍞 Global Toast - single instance for all notifications */}
      <Toast
        toast={toast}
        toastProgress={toastProgress}
        onClose={handleCloseToast}
        darkMode={darkMode}
      />
    </>
  );
}

export default App;
