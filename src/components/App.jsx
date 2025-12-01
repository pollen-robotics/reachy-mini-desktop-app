import React, { useEffect, useMemo, useCallback, useState } from 'react';
import { Box } from '@mui/material';

import { RobotNotDetectedView, StartingView, ReadyToStartView, TransitionView, ActiveRobotView, ClosingView, UpdateView } from '../views';
import QuickActionsWindow from '../views/windows/QuickActionsWindow';
import PositionControlWindow from '../views/windows/PositionControlWindow';
import AppTopBar from './AppTopBar';
import { useDaemon, useDaemonHealthCheck } from '../hooks/daemon';
import { useUsbDetection, useLogs, useWindowResize, useUpdater } from '../hooks/system';
import { useRobotCommands, useRobotState } from '../hooks/robot';
import { DAEMON_CONFIG, setAppStoreInstance } from '../config/daemon';
import useAppStore from '../store/useAppStore';

function App() {
  // Initialize the store in daemon.js for centralized logging
  useEffect(() => {
    setAppStoreInstance(useAppStore);
  }, []);

  // Initialize window manager on app startup
  useEffect(() => {
    import('../utils/windowManager').then(({ initializeWindowManager, closeAllSecondaryWindows }) => {
      initializeWindowManager();
      
      // Close all secondary windows on hot reload (dev only)
      if (import.meta.hot) {
        import.meta.hot.on('vite:beforeUpdate', async () => {
          console.log('🔄 Hot reload detected - closing all secondary windows');
          await closeAllSecondaryWindows();
        });
        
        // Also close on full page reload
        window.addEventListener('beforeunload', async () => {
          await closeAllSecondaryWindows();
        });
      }
    });
  }, []);

  // Check if this is a window view (detected via hash)
  const windowView = useMemo(() => {
    const hash = window.location.hash;
    if (hash === '#quick-actions') return 'quick-actions';
    if (hash === '#position-control') return 'position-control';
    return null;
  }, []);

  // Render window views directly (standalone windows)
  // These windows need minimal setup - they use the store directly
  if (windowView === 'quick-actions') {
    return <QuickActionsWindow />;
  }

  if (windowView === 'position-control') {
    return <PositionControlWindow />;
  }
  const { daemonVersion, hardwareError, isTransitioning, setIsTransitioning, setHardwareError } = useAppStore();
  const { isActive, isStarting, isStopping, startupError, startDaemon, stopDaemon, fetchDaemonVersion } = useDaemon();
  const { isUsbConnected, usbPortName, checkUsbRobot } = useUsbDetection();
  const { sendCommand, playRecordedMove, isCommandRunning } = useRobotCommands();
  const { logs, fetchLogs } = useLogs();
  
  // 🔄 Automatic update system
  // Tries to fetch latest.json directly - if it works, we have internet + we know if there's an update
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
    checkInterval: DAEMON_CONFIG.UPDATE_CHECK.INTERVAL,
    silent: false,
  });
  
  // 🕐 Track view start times to ensure minimum display duration (DRY)
  const [updateCheckStartTime, setUpdateCheckStartTime] = useState(() => Date.now()); // Initialize immediately
  const [usbCheckStartTime, setUsbCheckStartTime] = useState(null);
  const [showUpdateViewForced, setShowUpdateViewForced] = useState(true); // Start with true to show UpdateView first
  
  // Update check tracking - ensures minimum 2.5s display
  useEffect(() => {
    if (isChecking && updateCheckStartTime === null) {
      // Start tracking when check begins
      const startTime = Date.now();
      setUpdateCheckStartTime(startTime);
      setShowUpdateViewForced(true);
    } else if (!isChecking && !updateAvailable && !isDownloading && !updateError && updateCheckStartTime !== null && showUpdateViewForced) {
      // Check completed without update - ensure minimum display time
      const elapsed = Date.now() - updateCheckStartTime;
      if (elapsed < DAEMON_CONFIG.MIN_DISPLAY_TIMES.UPDATE_CHECK) {
        // Keep showing for remaining minimum time
        const remainingTime = DAEMON_CONFIG.MIN_DISPLAY_TIMES.UPDATE_CHECK - elapsed;
        const timer = setTimeout(() => {
          setShowUpdateViewForced(false);
          setUpdateCheckStartTime(null);
        }, remainingTime);
        return () => clearTimeout(timer);
      } else {
        // Minimum time already elapsed
        setShowUpdateViewForced(false);
        setUpdateCheckStartTime(null);
      }
    }
    // Ensure minimum display time is tracked from the start
    // This handles the case where check hasn't started yet but we want to show UpdateView
  }, [isChecking, updateAvailable, isDownloading, updateError, updateCheckStartTime, showUpdateViewForced]);
  
  // Ensure minimum display time even if check hasn't started yet
  // Also handle error case: allow continuation after minimum time + error grace period
  useEffect(() => {
    if (updateCheckStartTime !== null && showUpdateViewForced) {
      const elapsed = Date.now() - updateCheckStartTime;
      const minTime = DAEMON_CONFIG.MIN_DISPLAY_TIMES.UPDATE_CHECK;
      
      // If error occurred, allow continuation after minimum time + 1s grace period
      if (updateError && elapsed >= minTime + 1000) {
        setShowUpdateViewForced(false);
        setUpdateCheckStartTime(null);
        return;
      }
      
      // Normal case: wait for minimum time
      if (!isChecking && !updateAvailable && !isDownloading && !updateError) {
        if (elapsed >= minTime) {
          setShowUpdateViewForced(false);
          setUpdateCheckStartTime(null);
        } else {
          const remainingTime = minTime - elapsed;
          const timer = setTimeout(() => {
            setShowUpdateViewForced(false);
            setUpdateCheckStartTime(null);
          }, remainingTime);
          return () => clearTimeout(timer);
        }
      }
    }
  }, [updateCheckStartTime, showUpdateViewForced, isChecking, updateAvailable, isDownloading, updateError]);
  
  // USB check tracking - track when first USB check happens
  const { isFirstCheck } = useAppStore();
  
  // Determine if UpdateView should be shown (ALWAYS FIRST, before USB)
  // Must be defined before useEffects that use it
  const shouldShowUpdateView = useMemo(() => {
    // Don't show if daemon is active/starting/stopping
    if (isActive || isStarting || isStopping) return false;
    
    // Show if checking, downloading, update available, or error
    if (isChecking || updateAvailable || isDownloading || updateError) return true;
    
    // Show if forced (minimum display time not elapsed yet)
    if (showUpdateViewForced) return true;
    
    return false;
  }, [isActive, isStarting, isStopping, isChecking, updateAvailable, isDownloading, updateError, showUpdateViewForced]);
  
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
      <>
        <AppTopBar />
        <UpdateView
          isChecking={isChecking}
          isDownloading={isDownloading}
          downloadProgress={downloadProgress}
          updateAvailable={updateAvailable}
          updateError={updateError}
          onInstallUpdate={installUpdate}
        />
      </>
    );
  }

  // 🔌 PRIORITY 2: USB check view - Show during USB detection (minimum 2s)
  // Only show if update check is complete
  if (shouldShowUsbCheck) {
    return (
      <>
        <AppTopBar />
        <RobotNotDetectedView />
      </>
    );
  }

  // 🔌 PRIORITY 3: Robot not connected (after USB check minimum time)
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
  // Note: ClosingView has its own integrated topbar, so no AppTopBar needed
  if (isStopping) {
    return <ClosingView />;
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
      />
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

