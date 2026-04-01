import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';

import { useDaemon, useDaemonHealthCheck, useDaemonReconciliation } from '../hooks/daemon';
import {
  telemetry,
  initTelemetry,
  updateTelemetryContext,
  setupGlobalErrorHandlers,
  checkPreviousCrash,
} from '../utils/telemetry';
import {
  useUsbDetection,
  useLogs,
  useWindowResize,
  useUpdater,
  useUpdateViewState,
  usePermissions,
  useUsbCheckTiming,
  useDeepLink,
  useWindowVisible,
} from '../hooks/system';
import { useViewRouter, ViewRouterWrapper } from '../hooks/system/useViewRouter';
import { useRobotCommands, useRobotStateWebSocket, useActiveMoves } from '../hooks/robot';
import { DAEMON_CONFIG, setAppStoreInstance } from '../config/daemon';
import { isDevMode } from '../utils/devMode';
import { isSimulationMode, disableSimulationMode } from '../utils/simulationMode';
import useAppStore from '../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';

// 🧹 CRITICAL: Clean stale simMode at module load (BEFORE React mounts)
// This ensures useUsbDetection sees simMode=false on first check
// Fixes bug where app stays in simulation mode after crash/force-quit
if (isSimulationMode()) {
  disableSimulationMode();
}
import { useToast } from '../hooks/useToast';
import Toast from './Toast/Toast';

// Initialize diagnostic export tools (exposes window.reachyDiagnostic)
import '../utils/diagnosticExport';

function App() {
  // Initialize the store in daemon.js for centralized logging
  useEffect(() => {
    setAppStoreInstance(useAppStore);
  }, []);

  // Reconcile JS store with Rust daemon state on mount/HMR
  useDaemonReconciliation();

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
    shouldStreamRobotState,
  } = useAppStore(
    useShallow(state => ({
      daemonVersion: state.daemonVersion,
      hardwareError: state.hardwareError,
      connectionMode: state.connectionMode,
      isAppRunning: state.isAppRunning,
      robotStatus: state.robotStatus,
      busyReason: state.busyReason,
      isInstalling: state.isInstalling,
      isStoppingApp: state.isStoppingApp,
      isCommandRunning: state.isCommandRunning,
      darkMode: state.darkMode,
      setPendingDeepLinkInstall: state.setPendingDeepLinkInstall,
      shouldStreamRobotState: state.shouldStreamRobotState,
    }))
  );
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
  const isWindowVisible = useWindowVisible();

  // 🍞 Global toast for deep link feedback
  const { toast, toastProgress, showToast, handleCloseToast } = useToast();

  // 📊 Telemetry: Initialize, track app lifecycle, and install crash handlers
  useEffect(() => {
    const init = async () => {
      // eslint-disable-next-line no-undef
      const appVersion = __APP_VERSION__;

      // Initialize telemetry with super properties (OS, versions)
      await initTelemetry({ appVersion });

      // Catch uncaught JS errors and send them to PostHog
      setupGlobalErrorHandlers();

      // Check for a previous Rust-side crash and report it
      await checkPreviousCrash();

      // Track app started
      telemetry.appStarted({ version: appVersion });
    };

    init().catch(err => {
      console.error('[App] Telemetry init failed:', err);
    });

    // Track app closed on unmount/window close
    const handleBeforeUnload = () => {
      telemetry.appClosed();
      // 🧹 Clean up simulation mode to prevent stale flag on next launch
      disableSimulationMode();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      telemetry.appClosed();
      disableSimulationMode();
    };
  }, []);

  // 📊 Telemetry: Update context when daemon version is available
  useEffect(() => {
    if (daemonVersion && daemonVersion !== 'unknown') {
      updateTelemetryContext({ daemon_version: daemonVersion });
    }
  }, [daemonVersion]);

  // 🔗 Deep link handler - at root level for global access
  // Note: Toast is shown in ActiveRobotView when processing completes (with accurate status)
  const handleDeepLinkInstall = useCallback(
    appName => {
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

  // Daemon health check (GET /api/daemon/status, USB 3s / WiFi 5s)
  // 4 consecutive timeouts → transitionTo.crashed()
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
            }
          } catch (e) {
            // Ignore errors during cleanup
          }

          // Don't prevent close - let it proceed
        });
      } catch (e) {}
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
    if (!isWindowVisible) return;

    fetchLogs();
    fetchDaemonVersion();

    const shouldPollUsb = !connectionMode;

    if (!shouldShowUpdateView && shouldPollUsb) {
      checkUsbRobot();
    }

    const logsInterval = setInterval(fetchLogs, DAEMON_CONFIG.INTERVALS.LOGS_FETCH);
    const usbInterval = setInterval(() => {
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
  }, [
    fetchLogs,
    checkUsbRobot,
    fetchDaemonVersion,
    shouldShowUpdateView,
    connectionMode,
    isWindowVisible,
  ]);

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
