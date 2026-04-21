import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';

import {
  useDaemon,
  useDaemonHealthCheck,
  useDaemonReconciliation,
  useDaemonLifecycle,
} from '../hooks/daemon';
import useLogViewerBridge from '../hooks/useLogViewerBridge';
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
import type { FullAppState } from '../store/useStore';

// 🧹 CRITICAL: Clean stale simMode at module load (BEFORE React mounts)
// This ensures useUsbDetection sees simMode=false on first check
// Fixes bug where app stays in simulation mode after crash/force-quit
if (isSimulationMode()) {
  disableSimulationMode();
}
import { useToast } from '../hooks/useToast';
import Toast from './Toast/Toast';

import '../utils/diagnosticExport';

type CurrentView = 'compact' | 'expanded';

function App(): React.ReactElement {
  useEffect(() => {
    setAppStoreInstance(useAppStore);
  }, []);

  useDaemonReconciliation();

  // 🔗 Daemon lifecycle: MUST be mounted exactly once.
  // Owns all sidecar listeners, event-bus handlers, daemon-status polling,
  // and the bootstrap-aware startup timeout. This replaces the lifecycle
  // effects that used to live inside `useDaemon()` (which is now consumed
  // as a pure actions/state hook from multiple places).
  useDaemonLifecycle();

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
    useShallow((state: FullAppState) => ({
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
  const { sendCommand, playRecordedMove } = useRobotCommands();
  const { logs, fetchLogs } = useLogs();
  const isWindowVisible = useWindowVisible();

  // 🍞 Global toast for deep link feedback
  const { toast, toastProgress, showToast, handleCloseToast } = useToast();

  // 📊 Telemetry: Initialize, track app lifecycle, and install crash handlers
  useEffect(() => {
    const init = async (): Promise<void> => {
      const appVersion = __APP_VERSION__;

      await initTelemetry({ appVersion });

      setupGlobalErrorHandlers();

      await checkPreviousCrash();

      telemetry.appStarted({ version: appVersion });
    };

    init().catch((err: unknown) => {
      console.error('[App] Telemetry init failed:', err);
    });

    const handleBeforeUnload = (): void => {
      telemetry.appClosed();
      // 🧹 Clean up simulation mode to prevent stale flag on next launch
      disableSimulationMode();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
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
    (appName: string) => {
      setPendingDeepLinkInstall(appName);
    },
    [setPendingDeepLinkInstall]
  );

  useDeepLink({
    isActive,
    isAppRunning,
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
  const { allGranted: permissionsGranted, hasChecked } = usePermissions({ checkInterval: 2000 });
  const [isRestarting, setIsRestarting] = useState<boolean>(false);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartStartedRef = useRef<boolean>(false);
  const permissionsGrantedOnFirstCheckRef = useRef<boolean | null>(null);

  // Check if permissions were already granted on first check (to avoid restart loop)
  useEffect(() => {
    if (hasChecked && permissionsGrantedOnFirstCheckRef.current === null) {
      permissionsGrantedOnFirstCheckRef.current = permissionsGranted;
    }
  }, [hasChecked, permissionsGranted]);

  // Handle restart when permissions are granted
  useEffect(() => {
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
        }, 3000);
      } else {
        // Production: wait 4 seconds then restart
        // Note: relaunch() is cross-platform (Windows, macOS, Linux)
        restartTimerRef.current = setTimeout(async () => {
          try {
            const { relaunch } = await import('@tauri-apps/plugin-process');
            await relaunch();
          } catch {
            setIsRestarting(false);
            restartStartedRef.current = false;
            restartTimerRef.current = null;
          }
        }, 4000);
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
  // In dev mode, the check runs too: if the update server is unreachable (common in dev),
  // useUpdater silently swallows the error (see isMissingUpdateServer guard).
  const {
    updateAvailable,
    isChecking,
    isDownloading,
    downloadProgress,
    error: updateError,
    installUpdate,
  } = useUpdater({
    autoCheck: true,
    checkInterval: DAEMON_CONFIG.UPDATE_CHECK.INTERVAL,
  });

  // ✨ Update view state management with useReducer
  // `updateAvailable` is `Update | null` from Tauri; the reducer only needs a
  // boolean signal (truthy = update detected).
  const shouldShowUpdateView = useUpdateViewState({
    isChecking,
    updateAvailable: Boolean(updateAvailable),
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

  // Bridge daemon logs to the Log Viewer window (WiFi: WebSocket, Lite: sidecar events are global)
  useLogViewerBridge();

  // 🚀 Unified WebSocket for ALL robot state
  // Streams at 20Hz: head_pose, head_joints, body_yaw, antennas, passive_joints, control_mode, doa
  // 🎯 Start early when shouldStreamRobotState=true (StartupScanView sets this when daemon is ready)
  useRobotStateWebSocket(isActive || shouldStreamRobotState);

  // 🎯 Real-time active moves tracking (WebSocket /api/move/ws/updates)
  // Replaces the old polling of GET /api/move/running every 500ms
  useActiveMoves(isActive);

  // ⚡ Cleanup for USB/Simulation: handled on Rust side in lib.rs
  // ⚡ Cleanup for WiFi: must be done in JS because daemon is on remote Pi
  // Uses Tauri window close event (more reliable than beforeunload in WebView)
  useEffect(() => {
    if (connectionMode !== 'wifi') return;

    let unlisten: (() => void) | null = null;

    const setupCloseListener = async (): Promise<void> => {
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

              await tauriFetch(url, {
                method: 'POST',
                connectTimeout: 2000,
              }).catch(() => {});
            }
          } catch {
            // Ignore errors during cleanup
          }
        });
      } catch {
        // Ignore listener registration failures
      }
    };

    setupCloseListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [connectionMode]);

  const currentView = useMemo<CurrentView>(() => {
    if (isStopping) {
      return 'compact';
    }

    if (isActive && !hardwareError) {
      return 'expanded';
    }

    return 'compact';
  }, [isActive, hardwareError, isStopping]);

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
    // useViewRouter declares these as `(...args: unknown[]) => unknown`, which
    // is contravariant with the strict string-typed signatures returned by
    // `useRobotCommands`. Forward them as opaque callables.
    sendCommand: sendCommand as unknown as (...args: unknown[]) => unknown,
    playRecordedMove: playRecordedMove as unknown as (...args: unknown[]) => unknown,
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
