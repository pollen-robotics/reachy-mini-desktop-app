import React, { useEffect, useMemo, useCallback, useState } from 'react';
import { Box } from '@mui/material';
import { RobotNotDetectedView, StartingView, ReadyToStartView, TransitionView, ActiveRobotView, ClosingView } from '../views';
import useAppStore from '../store/useAppStore';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getVersion } from '@tauri-apps/api/app';
import AppTopBar from './AppTopBar';
import { useDaemon } from '../hooks/useDaemon';
import { useDaemonHealthCheck } from '../hooks/useDaemonHealthCheck';
import { useUsbDetection } from '../hooks/useUsbDetection';
import { useRobotCommands } from '../hooks/useRobotCommands';
import { useLogs } from '../hooks/useLogs';
import { useWindowResize } from '../hooks/useWindowResize';
import { useUpdater } from '../hooks/useUpdater';
import { DAEMON_CONFIG, setAppStoreInstance } from '../config/daemon';

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
  const {
    updateAvailable,
    isChecking,
    isDownloading,
    downloadProgress,
    error: updateError,
    checkForUpdates,
    installUpdate,
    dismissUpdate,
  } = useUpdater({
    autoCheck: true,
    checkInterval: 3600000, // Check every hour
    silent: false,
  });
  
  // 🏥 Centralized health check (SINGLE place for crash detection)
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

  useEffect(() => {
    // ✅ checkStatus removed - useDaemonHealthCheck handles status checking automatically
    // It polls every 1.33s and updates isActive, so no need for separate 3s polling
    fetchLogs();
    checkUsbRobot();
    fetchDaemonVersion();
    const logsInterval = setInterval(fetchLogs, DAEMON_CONFIG.INTERVALS.LOGS_FETCH);
    const usbInterval = setInterval(checkUsbRobot, DAEMON_CONFIG.INTERVALS.USB_CHECK);
    const versionInterval = setInterval(fetchDaemonVersion, DAEMON_CONFIG.INTERVALS.VERSION_FETCH);
    return () => {
      clearInterval(logsInterval);
      clearInterval(usbInterval);
      clearInterval(versionInterval);
    };
  }, [fetchLogs, checkUsbRobot, fetchDaemonVersion]);

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

  // Conditional view: Robot not connected
  if (!isUsbConnected) {
    return (
      <>
        <AppTopBar />
        <RobotNotDetectedView />
      </>
    );
  }

  // ⚡ PRIORITY: Starting daemon (visual scan)
  // Must remain visible even if isTransitioning becomes true
  // Also show if hardwareError is set (even if isStarting becomes false)
  if (isStarting || hardwareError) {
    return (
      <>
        <AppTopBar />
        <StartingView startupError={hardwareError || startupError} startDaemon={startDaemon} />
      </>
    );
  }

  // Intermediate view: Transition after scan - simple spinner during resize
  // ✅ Render ActiveRobotView in background to load apps, but display TransitionView on top
  if (isTransitioning) {
    return (
      <>
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
      </>
    );
  }

  // Intermediate view: Stopping daemon - show spinner
  if (isStopping) {
    return (
      <>
        <AppTopBar />
        <ClosingView />
      </>
    );
  }

  // Main view: Robot connected but daemon not active - show start screen
  if (isUsbConnected && !isActive && !isStarting) {
    return (
      <>
        <AppTopBar />
      <ReadyToStartView 
        startDaemon={startDaemon} 
        isStarting={isStarting} 
        usbPortName={usbPortName}
        updateAvailable={updateAvailable}
        isChecking={isChecking}
        isDownloading={isDownloading}
        downloadProgress={downloadProgress}
        updateError={updateError}
        onInstallUpdate={installUpdate}
        onDismissUpdate={dismissUpdate}
        onCheckUpdates={checkForUpdates}
      />
      </>
    );
  }

  // ⚠️ If hardware error detected, stay blocked on StartingView
  if (hardwareError) {
    return (
      <>
        <AppTopBar />
        <StartingView startupError={hardwareError} />
      </>
    );
  }

  // Full control view: Robot connected and daemon active
  return (
    <>
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
    </>
  );
}

export default App;

