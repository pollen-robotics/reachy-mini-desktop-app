import React, { useEffect, useMemo, useCallback, useState } from 'react';
import { Box } from '@mui/material';

import { RobotNotDetectedView, StartingView, ReadyToStartView, TransitionView, ActiveRobotView, ClosingView, UpdateView } from '../views';
import AppTopBar from './AppTopBar';
import { useDaemon, useDaemonHealthCheck } from '../hooks/daemon';
import { useUsbDetection, useLogs, useWindowResize, useUpdater, useUpdateViewState } from '../hooks/system';
import { useRobotCommands, useRobotState } from '../hooks/robot';
import { DAEMON_CONFIG, setAppStoreInstance } from '../config/daemon';
import { isDevMode } from '../utils/devMode';
import useAppStore from '../store/useAppStore';

function App() {
  // Initialize the store in daemon.js for centralized logging
  useEffect(() => {
    setAppStoreInstance(useAppStore);
  }, []);
  const { daemonVersion, hardwareError, isTransitioning, setIsTransitioning, setHardwareError } = useAppStore();
  const { isActive, isStarting, isStopping, startupError, startDaemon, stopDaemon, fetchDaemonVersion } = useDaemon();
  const { isUsbConnected, usbPortName, checkUsbRobot } = useUsbDetection();
  const { sendCommand, playRecordedMove, isCommandRunning } = useRobotCommands();
  const { logs, fetchLogs } = useLogs();
  
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
  
  // 🕐 USB check tracking - track when first USB check happens
  const [usbCheckStartTime, setUsbCheckStartTime] = useState(null);
  const { isFirstCheck } = useAppStore();
  
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
  
  // Start USB check only after update check is complete
  useEffect(() => {
    // Don't start USB check if update view is still showing
    if (shouldShowUpdateView) {
      // Reset USB check start time if update view is showing
      if (usbCheckStartTime !== null) {
        setUsbCheckStartTime(null);
      }
      return;
    }
    
    // Start USB check tracking after update check completes (first time only)
    // Only start if update view is NOT showing and we haven't started yet
    if (usbCheckStartTime === null && isFirstCheck && !shouldShowUpdateView) {
      setUsbCheckStartTime(Date.now());
    }
  }, [shouldShowUpdateView, usbCheckStartTime, isFirstCheck]);
  
  // Reset USB check tracking after minimum time
  useEffect(() => {
    if (usbCheckStartTime !== null && !isFirstCheck) {
      // Only reset after first check is complete
      const elapsed = Date.now() - usbCheckStartTime;
      if (elapsed >= DAEMON_CONFIG.MIN_DISPLAY_TIMES.USB_CHECK) {
        setUsbCheckStartTime(null);
      } else {
        const timer = setTimeout(() => {
          setUsbCheckStartTime(null);
        }, DAEMON_CONFIG.MIN_DISPLAY_TIMES.USB_CHECK - elapsed);
        return () => clearTimeout(timer);
      }
    }
  }, [usbCheckStartTime, isFirstCheck]);
  
  // Determine if USB check should be shown (after update check)
  const shouldShowUsbCheck = useMemo(() => {
    // Don't show if update view is still showing
    if (shouldShowUpdateView) return false;
    
    // Don't show if daemon is active/starting/stopping
    if (isActive || isStarting || isStopping) return false;
    
    // Show if USB check minimum time hasn't elapsed yet (during first check)
    if (usbCheckStartTime !== null && isFirstCheck) {
      const elapsed = Date.now() - usbCheckStartTime;
      return elapsed < DAEMON_CONFIG.MIN_DISPLAY_TIMES.USB_CHECK;
    }
    
    return false;
  }, [shouldShowUpdateView, isActive, isStarting, isStopping, usbCheckStartTime, isFirstCheck]);
  
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
    
    // Compact view: all others (RobotNotDetected, Starting, ReadyToStart)
    return 'compact';
  }, [isActive, hardwareError, isStopping, isTransitioning, isStarting]);

  // Hook to automatically resize the window
  useWindowResize(currentView);

  // Start USB check only after update check is complete
  useEffect(() => {
    // Don't start USB check if update view is still showing
    if (shouldShowUpdateView) return;
    
    // Start USB check after update check completes
    if (usbCheckStartTime === null && isFirstCheck) {
      setUsbCheckStartTime(Date.now());
    }
  }, [shouldShowUpdateView, usbCheckStartTime, isFirstCheck]);

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

  // Stop daemon automatically if robot gets disconnected
  useEffect(() => {
    if (!isUsbConnected && isActive) {
      stopDaemon();
    }
  }, [isUsbConnected, isActive, stopDaemon]);

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

  // 🔄 PRIORITY 1: Update view - ALWAYS FIRST, before everything else
  // Show when checking for updates or when update is available/installing
  // Ensures minimum display time of 2.5 seconds
  if (shouldShowUpdateView) {
    return (
      <Box sx={{ position: 'relative', width: '100%', height: '100vh' }}>
        <AppTopBar />
        <UpdateView
          isChecking={isChecking}
          isDownloading={isDownloading}
          downloadProgress={downloadProgress}
          updateAvailable={updateAvailable}
          updateError={updateError}
          onInstallUpdate={installUpdate}
        />
      </Box>
    );
  }

  // 🔌 PRIORITY 2: USB check view - Show during USB detection (minimum 2s)
  // Only show if update check is complete
  if (shouldShowUsbCheck) {
    return (
      <Box sx={{ position: 'relative', width: '100%', height: '100vh' }}>
        <AppTopBar />
        <RobotNotDetectedView />
      </Box>
    );
  }

  // 🔌 PRIORITY 3: Robot not connected (after USB check minimum time)
  if (!isUsbConnected) {
    return (
      <Box sx={{ position: 'relative', width: '100%', height: '100vh' }}>
        <AppTopBar />
        <RobotNotDetectedView />
      </Box>
    );
  }

  // ⚡ PRIORITY: Starting daemon (visual scan)
  // Must remain visible even if isTransitioning becomes true
  // Also show if hardwareError is set (even if isStarting becomes false)
  if (isStarting || hardwareError) {
    return (
      <Box sx={{ position: 'relative', width: '100%', height: '100vh' }}>
        <AppTopBar />
        <StartingView startupError={hardwareError || startupError} startDaemon={startDaemon} />
      </Box>
    );
  }

  // Intermediate view: Transition after scan - simple spinner during resize
  // ✅ Render ActiveRobotView in background to load apps, but display TransitionView on top
  if (isTransitioning) {
    return (
      <Box sx={{ position: 'relative', width: '100%', height: '100vh' }}>
        <AppTopBar />
        {/* ActiveRobotView hidden to load apps in background */}
        <Box sx={{ position: 'absolute', opacity: 0, pointerEvents: 'none', zIndex: -1 }}>
          <ActiveRobotView 
            isActive={isActive}
            isStarting={isStarting}
            isStopping={isStopping}
            stopDaemon={stopDaemon}
            sendCommand={sendCommand}
            playRecordedMove={playRecordedMove}
            isCommandRunning={isCommandRunning}
            logs={logs}
            daemonVersion={daemonVersion}
            usbPortName={usbPortName}
            onAppsReady={handleAppsReady}
          />
        </Box>
        {/* TransitionView visible on top */}
        <TransitionView />
      </Box>
    );
  }

  // Intermediate view: Stopping daemon - show spinner
  // Note: ClosingView has its own integrated topbar, so no AppTopBar needed
  if (isStopping) {
    return <ClosingView />;
  }

  // Main view: Robot connected but daemon not active - show start screen
  if (isUsbConnected && !isActive && !isStarting) {
    return (
      <Box sx={{ position: 'relative', width: '100%', height: '100vh' }}>
        <AppTopBar />
      <ReadyToStartView 
        startDaemon={startDaemon} 
        isStarting={isStarting} 
        usbPortName={usbPortName}
      />
      </Box>
    );
  }

  // Full control view: Robot connected and daemon active
  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100vh' }}>
      <AppTopBar />
      <ActiveRobotView 
        isActive={isActive}
        isStarting={isStarting}
        isStopping={isStopping}
        stopDaemon={stopDaemon}
        sendCommand={sendCommand}
        playRecordedMove={playRecordedMove}
        isCommandRunning={isCommandRunning}
        logs={logs}
        daemonVersion={daemonVersion}
        usbPortName={usbPortName}
        onAppsReady={handleAppsReady}
      />
    </Box>
  );
}

export default App;

