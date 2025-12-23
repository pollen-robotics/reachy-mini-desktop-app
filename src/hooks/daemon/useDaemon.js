import { useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import useAppStore from '../../store/useAppStore';
import { useLogger } from '../../utils/logging';
import { DAEMON_CONFIG, fetchWithTimeout, fetchWithTimeoutSkipInstall, buildApiUrl } from '../../config/daemon';
import { isSimulationMode, disableSimulationMode } from '../../utils/simulationMode';
import { findErrorConfig, createErrorFromConfig } from '../../utils/hardwareErrors';
import { useDaemonEventBus } from './useDaemonEventBus';
import { handleDaemonError } from '../../utils/daemonErrorHandler';

export const useDaemon = () => {
  const logger = useLogger();
  const { 
    robotStatus,
    startupError,
    // Note: connectionMode is read via getState() inside callbacks for fresh value
    transitionTo,
    setDaemonVersion,
    setStartupError,
    setHardwareError,
    setStartupTimeout,
    clearStartupTimeout,
    resetAll, // ✅ Use resetAll instead of resetConnection to also clear apps
  } = useAppStore();
  
  // Derived from robotStatus (state machine)
  const isActive = robotStatus === 'ready' || robotStatus === 'busy';
  const isStarting = robotStatus === 'starting';
  const isStopping = robotStatus === 'stopping';
  
  // ✅ Event Bus for centralized event handling
  const eventBus = useDaemonEventBus();
  
  // ✅ Register event handlers (centralized error handling)
  useEffect(() => {
    // Handle daemon start success
    const unsubStartSuccess = eventBus.on('daemon:start:success', (data) => {
      // Daemon started successfully - no action needed here
      // useRobotState will detect when it becomes active
      if (data?.simMode) {
        logger.info('Daemon started in simulation mode (MuJoCo)');
      }
    });
    
    // Handle daemon start error
    const unsubStartError = eventBus.on('daemon:start:error', (error) => {
      handleDaemonError('startup', error);
      clearStartupTimeout();
    });
    
    // Handle daemon start timeout
    const unsubStartTimeout = eventBus.on('daemon:start:timeout', () => {
      const currentState = useAppStore.getState();
      if (!currentState.isActive && currentState.isStarting) {
        handleDaemonError('timeout', {
          message: 'Daemon did not become active within 30 seconds. Please check the robot connection.'
        });
      }
    });
    
    // Handle daemon crash
    const unsubCrash = eventBus.on('daemon:crash', (data) => {
      const currentState = useAppStore.getState();
      if (currentState.isStarting) {
        handleDaemonError('crash', {
          message: `Daemon process terminated unexpectedly (status: ${data.status})`
        }, { status: data.status });
        clearStartupTimeout();
      }
    });
    
    // Handle hardware error from stderr
    const unsubHardwareError = eventBus.on('daemon:hardware:error', (data) => {
      const currentState = useAppStore.getState();
      const shouldProcess = currentState.isStarting || currentState.hardwareError;
      
      if (!shouldProcess) {
        return;
      }
      
      if (data.errorConfig) {
        // Specific error config found
        const errorObject = createErrorFromConfig(data.errorConfig, data.errorLine);
        setHardwareError(errorObject);
        transitionTo.starting(); // Keep in starting state to show error
      } else if (data.isGeneric) {
        // Generic runtime error - don't override specific error if already set
        const currentError = currentState.hardwareError;
        if (!currentError || !currentError.type) {
          handleDaemonError('hardware', data.errorLine);
        }
      }
    });
    
    return () => {
      unsubStartSuccess();
      unsubStartError();
      unsubStartTimeout();
      unsubCrash();
      unsubHardwareError();
    };
  }, [eventBus, setHardwareError, transitionTo, clearStartupTimeout, logger]);

  // ✅ checkStatus removed - useRobotState handles all status checking
  // It polls /api/state/full every 500ms and handles crash detection via timeout counting
  // No need for duplicate functionality

  const fetchDaemonVersion = useCallback(async () => {
    try {
      // Use skip-install wrapper to avoid checking during installations
      const response = await fetchWithTimeoutSkipInstall(
        buildApiUrl(DAEMON_CONFIG.ENDPOINTS.DAEMON_STATUS),
        {},
        DAEMON_CONFIG.TIMEOUTS.VERSION,
        { silent: true } // ⚡ Don't log version checks
      );
      if (response.ok) {
        const data = await response.json();
        // API returns an object with the version
        setDaemonVersion(data.version || null);
        // ✅ No resetTimeouts() here, handled by useRobotState
      }
    } catch (error) {
      // Skip during installation (expected)
      if (error.name === 'SkippedError') {
        return;
      }
      // ✅ No incrementTimeouts() here, handled by useRobotState
    }
  }, [setDaemonVersion]);

  // ✅ Listen to sidecar termination events to detect immediate crashes
  // Migrated to Event Bus: emits 'daemon:crash' event
  useEffect(() => {
    let unlistenTerminated;
    
    const setupTerminationListener = async () => {
      try {
        unlistenTerminated = await listen('sidecar-terminated', (event) => {
          // Only process if daemon is starting
          if (!isStarting) {
            return;
          }
          
          const status = typeof event.payload === 'string' 
            ? event.payload 
            : event.payload?.toString() || 'unknown';
          
          // ✅ Emit event to bus instead of handling directly
          eventBus.emit('daemon:crash', { status });
        });
      } catch (error) {
        console.error('Failed to setup sidecar-terminated listener:', error);
      }
    };
    
    setupTerminationListener();
    
    return () => {
      if (unlistenTerminated) {
        unlistenTerminated();
      }
    };
  }, [isStarting, eventBus]);

  // Listen to sidecar stderr events to detect hardware errors
  // Migrated to Event Bus: emits 'daemon:hardware:error' event
  useEffect(() => {
    let unlistenStderr;
    
    const setupStderrListener = async () => {
      try {
        unlistenStderr = await listen('sidecar-stderr', (event) => {
          // ✅ Process errors when starting OR when there's already a hardware error
          // This ensures we re-detect errors even after a restart
          const currentState = useAppStore.getState();
          const shouldProcess = isStarting || currentState.hardwareError;
          
          if (!shouldProcess) {
            return;
          }
          
          // Extract error line from payload (can be string or object)
          const errorLine = typeof event.payload === 'string' 
            ? event.payload 
            : event.payload?.toString() || '';
          
          // Use centralized error detection
          const errorConfig = findErrorConfig(errorLine);
          
          if (errorConfig) {
            // ✅ Emit event to bus instead of handling directly
            eventBus.emit('daemon:hardware:error', { errorConfig, errorLine });
          } else if (errorLine.includes('RuntimeError')) {
            // Generic runtime error - no specific config found
            // ✅ Emit as generic hardware error
            eventBus.emit('daemon:hardware:error', { 
              errorConfig: null, 
              errorLine,
              isGeneric: true 
            });
          }
        });
      } catch (error) {
        console.error('Failed to setup sidecar-stderr listener:', error);
      }
    };
    
    setupStderrListener();
    
    return () => {
      if (unlistenStderr) {
        unlistenStderr();
      }
    };
  }, [isStarting, eventBus]); // Note: hardwareError checked inside listener via getState()

  // 🎭 Listen to sidecar stdout events to reset timeout when we see activity
  // This makes startup more resilient - as long as we see logs, we know something is happening
  useEffect(() => {
    let unlistenStdout;
    let lastActivityReset = 0;
    
    const setupStdoutListener = async () => {
      try {
        unlistenStdout = await listen('sidecar-stdout', () => {
          const currentState = useAppStore.getState();
          
          // Only reset timeout during startup phase
          if (!currentState.isStarting || currentState.isActive) {
            return;
          }
          
          // Throttle resets to avoid excessive timeout recreation (every 15s max)
          const now = Date.now();
          if (now - lastActivityReset < DAEMON_CONFIG.STARTUP.ACTIVITY_RESET_DELAY) {
            return;
          }
          lastActivityReset = now;
          
          // Clear existing timeout and set a new one
          clearStartupTimeout();
          
          const simMode = isSimulationMode();
          const startupTimeout = simMode 
            ? DAEMON_CONFIG.STARTUP.TIMEOUT_SIMULATION 
            : DAEMON_CONFIG.STARTUP.TIMEOUT_NORMAL;
          
          const newTimeoutId = setTimeout(() => {
            const state = useAppStore.getState();
            if (!state.isActive && state.isStarting) {
              eventBus.emit('daemon:start:timeout');
            }
          }, startupTimeout);
          
          setStartupTimeout(newTimeoutId);
          console.log('🎭 Startup timeout reset - activity detected from sidecar');
        });
      } catch (error) {
        console.error('Failed to setup sidecar-stdout listener:', error);
      }
    };
    
    setupStdoutListener();
    
    return () => {
      if (unlistenStdout) {
        unlistenStdout();
      }
    };
  }, [eventBus, clearStartupTimeout, setStartupTimeout]);

  const startDaemon = useCallback(async () => {
    // 🌐 Read connectionMode from store at execution time (not render time)
    // This ensures we have the latest value after startConnection() is called
    const currentConnectionMode = useAppStore.getState().connectionMode;
    
    // 🌐 WiFi mode: daemon is remote, initialize it if needed
    // Then let HardwareScanView handle the detection (same as USB)
    // This ensures the scan animation plays consistently
    if (currentConnectionMode === 'wifi') {
      console.log('🌐 WiFi mode: checking remote daemon');
      eventBus.emit('daemon:start:attempt');
      
      // Wait a moment for React to render the scan view
      await new Promise(resolve => setTimeout(resolve, DAEMON_CONFIG.ANIMATIONS.SPINNER_RENDER_DELAY));
      
      try {
        // Check daemon status
        const statusResponse = await fetchWithTimeout(
          buildApiUrl(DAEMON_CONFIG.ENDPOINTS.DAEMON_STATUS),
          {},
          DAEMON_CONFIG.TIMEOUTS.STARTUP_CHECK,
          { label: 'WiFi daemon status check' }
        );
        
        if (!statusResponse.ok) {
          throw new Error(`Daemon status check failed: ${statusResponse.status}`);
        }
        
        const statusData = await statusResponse.json();
        console.log(`🌐 WiFi daemon state: ${statusData.state}`);
        
        // ⚠️ ALWAYS wake up the robot in WiFi mode!
        // - If daemon is not_initialized/starting/stopped: use /api/daemon/start?wake_up=true
        // - If daemon is already running: use /api/move/play/wake_up (explicit wake up)
        // This is because stopDaemon sends goto_sleep but daemon keeps running on the Pi
        if (statusData.state === 'not_initialized' || statusData.state === 'starting' || statusData.state === 'stopped') {
          console.log(`🌐 Daemon needs restart (state: ${statusData.state}), starting with wake_up...`);
          try {
            await fetchWithTimeout(
              buildApiUrl('/api/daemon/start?wake_up=true'),
              { method: 'POST' },
              DAEMON_CONFIG.TIMEOUTS.STARTUP_CHECK * 2,
              { label: 'WiFi daemon start' }
            );
          } catch (e) {
            console.log('🌐 Daemon start request sent (response may be delayed)');
          }
        } else if (statusData.state === 'running') {
          // Daemon already running - send explicit wake_up move
          console.log(`🌐 Daemon already running, sending wake_up move...`);
          try {
            await fetchWithTimeout(
              buildApiUrl('/api/move/play/wake_up'),
              { method: 'POST' },
              DAEMON_CONFIG.TIMEOUTS.COMMAND,
              { label: 'WiFi robot wake up' }
            );
            // Wait for wake up animation to complete
            console.log(`🌐 Waiting for wake_up animation...`);
            await new Promise(resolve => setTimeout(resolve, DAEMON_CONFIG.ANIMATIONS.SLEEP_DURATION));
          } catch (e) {
            console.log('🌐 Wake up move sent (robot may already be awake)');
          }
        }
        
        // ✅ Don't call transitionTo.ready() here!
        // Let HardwareScanView detect when daemon is ready via its health checks
        // This ensures the scan animation plays (same UX as USB mode)
        console.log('🌐 WiFi daemon accessible - HardwareScanView will handle transition');
        eventBus.emit('daemon:start:success', { existing: true, wifi: true });
        
        // Note: isStarting stays true, HardwareScanView will:
        // 1. Show the scan animation
        // 2. Poll until daemon is fully ready (control_mode available)
        // 3. Call onScanComplete() which sets isStarting=false, isActive=true
        
      } catch (e) {
        console.error('🌐 WiFi daemon connection failed:', e);
        resetAll(); // ✅ Use resetAll to also clear apps
        eventBus.emit('daemon:start:error', new Error(`WiFi daemon error: ${e.message}`));
      }
      return;
    }
    
    // ✅ USB/Simulation mode - startConnection() already set isStarting=true
    // Emit start attempt event
    eventBus.emit('daemon:start:attempt');
    
    // Wait a moment for React to render
    await new Promise(resolve => setTimeout(resolve, DAEMON_CONFIG.ANIMATIONS.SPINNER_RENDER_DELAY));
    
    try {
      // Check if daemon already running
      try {
        const response = await fetchWithTimeout(
          buildApiUrl(DAEMON_CONFIG.ENDPOINTS.STATE_FULL),
          {},
          DAEMON_CONFIG.TIMEOUTS.STARTUP_CHECK,
          { label: 'Check existing daemon' }
        );
        if (response.ok) {
          // Daemon already active - transition to ready
          useAppStore.getState().transitionTo.ready();
          eventBus.emit('daemon:start:success', { existing: true });
          return;
        }
      } catch (e) {
        // No daemon detected, starting new one
      }

      // 🎭 Check if simulation mode is enabled
      const simMode = isSimulationMode();

      // Launch new daemon (non-blocking - we don't wait for it)
      // Pass sim_mode parameter to backend
      invoke('start_daemon', { simMode: simMode }).then(() => {
        // ✅ Emit success event (handler will log sim mode message)
        eventBus.emit('daemon:start:success', { existing: false, simMode });
      }).catch((e) => {
        // ✅ Emit error event instead of handling directly
        eventBus.emit('daemon:start:error', e);
      });
      
      // Wait a bit for daemon to initialize
      await new Promise(resolve => setTimeout(resolve, DAEMON_CONFIG.ANIMATIONS.BUTTON_SPINNER_DELAY));
      // Note: isStarting already set by startConnection() in FindingRobotView
      
      // ✅ Set explicit startup timeout - longer for simulation mode (MuJoCo install takes time)
      const startupTimeout = simMode 
        ? DAEMON_CONFIG.STARTUP.TIMEOUT_SIMULATION 
        : DAEMON_CONFIG.STARTUP.TIMEOUT_NORMAL;
      
      const timeoutId = setTimeout(() => {
        const currentState = useAppStore.getState();
        if (!currentState.isActive && currentState.isStarting) {
          // ✅ Emit timeout event instead of handling directly
          eventBus.emit('daemon:start:timeout');
        }
      }, startupTimeout);
      setStartupTimeout(timeoutId);
      
      // ✅ HardwareScanView will call transitionTo.ready() when scan completes + daemon responds
      // useRobotState polls every 500ms for health check (crash detection)
      // No need for manual polling or checkStatus calls
    } catch (e) {
      // ✅ Emit error event instead of handling directly
      eventBus.emit('daemon:start:error', e);
    }
  }, [eventBus, setStartupTimeout, resetAll]);

  const stopDaemon = useCallback(async () => {
    // 🌐 Read connectionMode from store at execution time
    const currentConnectionMode = useAppStore.getState().connectionMode;
    const currentIsAppRunning = useAppStore.getState().isAppRunning;
    const currentAppName = useAppStore.getState().currentAppName;
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🛑 SHUTDOWN SEQUENCE STARTED');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Mode: ${currentConnectionMode}`);
    console.log(`   App running: ${currentIsAppRunning}${currentAppName ? ` (${currentAppName})` : ''}`);
    
    transitionTo.stopping();
    console.log('   → State: robotStatus = stopping');
    
    // ✅ Clear startup timeout if daemon is being stopped
    clearStartupTimeout();
    // 🧹 Clear simulation mode from localStorage on shutdown
    disableSimulationMode();
    
    // 🛡️ First, stop any running app to avoid command conflicts
    // This prevents jerky movements when goto_sleep conflicts with app commands
    // ⚠️ ONLY call stop-current-app if an app is actually running
    // Calling it on an already-stopped app seems to cause wake_up side effects
    // ⚠️ ALWAYS wait 1.5s before sending goto_sleep
    // Even if isAppRunning=false, an app might have just stopped and the daemon
    // Python is still executing its goto_target(INIT_HEAD_POSE) which takes ~1s
    // This prevents race conditions where goto_target and goto_sleep conflict
    if (currentIsAppRunning) {
      try {
        console.log('');
        console.log('📱 STEP 1: Stop running app');
        console.log(`   → Sending stop-current-app...`);
        await fetchWithTimeout(
          buildApiUrl('/api/apps/stop-current-app'),
          { method: 'POST' },
          DAEMON_CONFIG.TIMEOUTS.APP_STOP,
          { label: 'Stop app before shutdown', silent: true }
        );
        console.log('   ✅ App stop command sent');
      } catch (e) {
        console.log(`   ⚠️ Failed to stop app: ${e.message}`);
      }
    } else {
      console.log('');
      console.log('📱 STEP 1: No app running');
    }
    
    // Always wait for any potential goto_target to complete
    // This handles the case where user stopped app manually right before shutdown
    console.log('   → Waiting 1.5s for any daemon goto_target to complete...');
    await new Promise(resolve => setTimeout(resolve, 1500));
    console.log('   ✅ Safe to send goto_sleep');
    
    // 🌐 WiFi mode: stop daemon (with goto_sleep + motor disable), then disconnect
    if (currentConnectionMode === 'wifi') {
      console.log('');
      console.log('🌐 WIFI MODE: Disconnect sequence');
      
      // Call daemon stop API (same as dashboard) - this will:
      // 1. Move robot to sleep position
      // 2. Disable motors (MotorControlMode.Disabled)
      // 3. Set daemon state to 'stopped' (but process keeps running on Pi)
      try {
        console.log('');
        console.log('😴 STEP 2: Stop daemon with goto_sleep');
        console.log('   → Sending /api/daemon/stop?goto_sleep=true...');
        await fetchWithTimeout(
          buildApiUrl('/api/daemon/stop?goto_sleep=true'),
          { method: 'POST' },
          DAEMON_CONFIG.TIMEOUTS.COMMAND * 2, // Longer timeout for full stop sequence
          { label: 'Daemon stop with sleep' }
        );
        console.log(`   → Waiting ${DAEMON_CONFIG.ANIMATIONS.SLEEP_DURATION}ms for sleep animation...`);
        await new Promise(resolve => setTimeout(resolve, DAEMON_CONFIG.ANIMATIONS.SLEEP_DURATION));
        console.log('   ✅ Daemon stopped, motors disabled');
      } catch (e) {
        console.log(`   ⚠️ Daemon stop command skipped: ${e.message}`);
      }
      
      // Reset connection state to return to FindingRobotView
      console.log('');
      console.log('🔄 STEP 3: Reset state');
      console.log(`   → Scheduling resetAll in ${DAEMON_CONFIG.ANIMATIONS.STOP_DAEMON_DELAY}ms...`);
      setTimeout(() => {
        console.log('   → Calling resetAll()');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🛑 SHUTDOWN COMPLETE (WiFi)');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        resetAll();
      }, DAEMON_CONFIG.ANIMATIONS.STOP_DAEMON_DELAY);
      return;
    }
    
    // USB/Simulation mode: stop daemon (with goto_sleep + motor disable), then kill process
    console.log('');
    console.log('🔌 USB/SIMULATION MODE: Shutdown sequence');
    
    try {
      // Call daemon stop API (same as dashboard) - this will:
      // 1. Move robot to sleep position
      // 2. Disable motors (MotorControlMode.Disabled)
      // 3. Stop the backend gracefully
      try {
        console.log('');
        console.log('😴 STEP 2: Stop daemon with goto_sleep');
        console.log('   → Sending /api/daemon/stop?goto_sleep=true...');
        await fetchWithTimeout(
          buildApiUrl('/api/daemon/stop?goto_sleep=true'),
          { method: 'POST' },
          DAEMON_CONFIG.TIMEOUTS.COMMAND * 2, // Longer timeout for full stop sequence
          { label: 'Daemon stop with sleep' }
        );
        console.log(`   → Waiting ${DAEMON_CONFIG.ANIMATIONS.SLEEP_DURATION}ms for sleep animation...`);
        await new Promise(resolve => setTimeout(resolve, DAEMON_CONFIG.ANIMATIONS.SLEEP_DURATION));
        console.log('   ✅ Daemon stopped, motors disabled');
      } catch (e) {
        console.log(`   ⚠️ Daemon stop command skipped: ${e.message}`);
      }
      
      // Then kill the daemon process
      console.log('');
      console.log('💀 STEP 3: Kill daemon process');
      console.log('   → Invoking stop_daemon...');
      await invoke('stop_daemon');
      console.log('   ✅ Daemon killed');
      
      // Reset connection state to return to FindingRobotView
      console.log('');
      console.log('🔄 STEP 4: Reset state');
      console.log(`   → Scheduling resetAll in ${DAEMON_CONFIG.ANIMATIONS.STOP_DAEMON_DELAY}ms...`);
      setTimeout(() => {
        console.log('   → Calling resetAll()');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🛑 SHUTDOWN COMPLETE (USB)');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        resetAll();
      }, DAEMON_CONFIG.ANIMATIONS.STOP_DAEMON_DELAY);
    } catch (e) {
      console.error('❌ Error stopping daemon:', e);
      resetAll();
    }
  }, [clearStartupTimeout, resetAll, transitionTo]);

  return {
    isActive,
    isStarting,
    isStopping,
    startupError,
    startDaemon,
    stopDaemon,
    fetchDaemonVersion,
  };
};

