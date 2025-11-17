import React, { useEffect, useMemo, useCallback } from 'react';
import { Box } from '@mui/material';
import { RobotNotDetectedView, StartingView, ReadyToStartView, TransitionView, ActiveRobotView, ClosingView } from './views';
import useAppStore from '../store/useAppStore';
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
  const { isActive, isStarting, isStopping, startupError, checkStatus, startDaemon, stopDaemon, fetchDaemonVersion } = useDaemon();
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
  
  // 🤖 Debug: Display state machine transitions
  const robotStatus = useAppStore(state => state.robotStatus);
  const busyReason = useAppStore(state => state.busyReason);
  useEffect(() => {
    const label = useAppStore.getState().getRobotStatusLabel();
    console.log(`🤖 [STATE MACHINE] Status: ${robotStatus}${busyReason ? ` (${busyReason})` : ''} → "${label}"`);
  }, [robotStatus, busyReason]);
  
  // ⚡ Cleanup is handled on Rust side in lib.rs:
  // - Signal handler (SIGTERM/SIGINT) → cleanup_system_daemons()
  // - on_window_event(CloseRequested) → kill_daemon()
  // - on_window_event(Destroyed) → cleanup_system_daemons()
  // → No need for JS handler (avoids redundancy)

  // Determine current view for automatic resize
  const currentView = useMemo(() => {
    // Compact view: ClosingView (stopping)
    if (isStopping) {
      console.log('📐 App - Switching to COMPACT view (stopping daemon)');
      return 'compact';
    }
    
    // ⚡ Expanded view: daemon active OR transitioning (but NEVER during StartingView)
    // BLOCK resize as long as isStarting = true (scan in progress)
    if (!isStarting && (isActive || isTransitioning) && !hardwareError) {
      console.log('📐 App - Switching to EXPANDED view (isActive or TransitionView visible)');
      return 'expanded';
    }
    
    // Compact view: all others (RobotNotDetected, Starting, ReadyToStart)
    console.log(`📐 App - COMPACT view (isActive=${isActive}, isTransitioning=${isTransitioning}, isStarting=${isStarting})`);
    return 'compact';
  }, [isActive, hardwareError, isStopping, isTransitioning, isStarting]);

  // Hook to automatically resize the window
  useWindowResize(currentView);

  useEffect(() => {
    checkStatus();
    fetchLogs();
    checkUsbRobot();
    fetchDaemonVersion();
    const statusInterval = setInterval(checkStatus, DAEMON_CONFIG.INTERVALS.STATUS_CHECK);
    const logsInterval = setInterval(fetchLogs, DAEMON_CONFIG.INTERVALS.LOGS_FETCH);
    const usbInterval = setInterval(checkUsbRobot, DAEMON_CONFIG.INTERVALS.USB_CHECK);
    const versionInterval = setInterval(fetchDaemonVersion, DAEMON_CONFIG.INTERVALS.VERSION_FETCH);
    return () => {
      clearInterval(statusInterval);
      clearInterval(logsInterval);
      clearInterval(usbInterval);
      clearInterval(versionInterval);
    };
  }, [checkStatus, fetchLogs, checkUsbRobot, fetchDaemonVersion]);

  // Stop daemon automatically if robot gets disconnected
  useEffect(() => {
    if (!isUsbConnected && isActive) {
      console.log('⚠️ Robot disconnected during use - stopping daemon');
      stopDaemon();
    }
  }, [isUsbConnected, isActive, stopDaemon]);

  // ✅ Callback to close TransitionView when apps are loaded
  // ⚠️ IMPORTANT: All hooks must be called before conditional returns
  const handleAppsReady = useCallback(() => {
    if (isTransitioning) {
      console.log('✅ Apps loaded, closing TransitionView');
      setIsTransitioning(false);
    }
  }, [isTransitioning, setIsTransitioning]);

  // Conditional view: Robot not connected
  if (!isUsbConnected) {
    return <RobotNotDetectedView />;
  }

  // ⚡ PRIORITY: Starting daemon (visual scan)
  // Must remain visible even if isTransitioning becomes true
  if (isStarting) {
    return <StartingView startupError={startupError} />;
  }

  // Intermediate view: Transition after scan - simple spinner during resize
  // ✅ Render ActiveRobotView in background to load apps, but display TransitionView on top
  if (isTransitioning) {
    return (
      <>
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
    return <ClosingView />;
  }

  // Main view: Robot connected but daemon not active - show start screen
  if (isUsbConnected && !isActive && !isStarting) {
    // Reset hardware error if returning to this view
    if (hardwareError) {
      setHardwareError(null);
    }
    return (
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
    );
  }

  // ⚠️ If hardware error detected, stay blocked on StartingView
  if (hardwareError) {
    return <StartingView startupError={hardwareError} />;
  }

  // Full control view: Robot connected and daemon active
  return (
    <>
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

