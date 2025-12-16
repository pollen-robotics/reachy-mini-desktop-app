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
    isActive,
    isStarting,
    isStopping,
    startupError,
    // Note: connectionMode is read via getState() inside callbacks for fresh value
    setIsStarting, 
    setIsStopping,
    setIsActive,
    setDaemonVersion,
    setStartupError,
    setHardwareError,
    setStartupTimeout,
    clearStartupTimeout,
    resetConnection
  } = useAppStore();
  
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
        setIsStarting(true);
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
  }, [eventBus, setHardwareError, setIsStarting, clearStartupTimeout, logger]);

  // ✅ checkStatus removed - useDaemonHealthCheck handles all status checking
  // It polls every 1.33s, updates isActive, and handles crash detection
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
        // ✅ No resetTimeouts() here, handled by useDaemonHealthCheck
      }
    } catch (error) {
      // Skip during installation (expected)
      if (error.name === 'SkippedError') {
        return;
      }
      // ✅ No incrementTimeouts() here, handled by useDaemonHealthCheck
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
        
        // If daemon is not initialized or starting, wake it up
        if (statusData.state === 'not_initialized' || statusData.state === 'starting') {
          console.log(`🌐 WiFi daemon needs initialization, sending wake_up...`);
          try {
            await fetchWithTimeout(
              buildApiUrl('/api/daemon/start?wake_up=true'),
              { method: 'POST' },
              DAEMON_CONFIG.TIMEOUTS.STARTUP_CHECK * 2,
              { label: 'WiFi daemon initialization' }
            );
          } catch (e) {
            // Ignore errors here - daemon might already be starting
            console.log('🌐 Wake up request sent (response may be delayed)');
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
        resetConnection();
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
      
      // ✅ useDaemonHealthCheck will detect when daemon is ready automatically
      // It polls every 1.33s and updates isActive when daemon responds
      // No need for manual polling or checkStatus calls
    } catch (e) {
      // ✅ Emit error event instead of handling directly
      eventBus.emit('daemon:start:error', e);
    }
  }, [eventBus, setStartupTimeout, resetConnection]);

  const stopDaemon = useCallback(async () => {
    // 🌐 Read connectionMode from store at execution time
    const currentConnectionMode = useAppStore.getState().connectionMode;
    console.log('🛑 stopDaemon called, connectionMode:', currentConnectionMode);
    
    setIsStopping(true);
    console.log('🛑 isStopping set to true');
    // ✅ Clear startup timeout if daemon is being stopped
    clearStartupTimeout();
    // 🧹 Clear simulation mode from localStorage on shutdown
    disableSimulationMode();
    
    // 🌐 WiFi mode: just disconnect, daemon stays running on remote
    if (currentConnectionMode === 'wifi') {
      console.log('🌐 WiFi mode: disconnecting from remote daemon');
      
      // Send robot to sleep position before disconnecting
      try {
        console.log('🌐 Sending goto_sleep command...');
        await fetchWithTimeout(
          buildApiUrl('/api/move/play/goto_sleep'),
          { method: 'POST' },
          DAEMON_CONFIG.TIMEOUTS.COMMAND,
          { label: 'Sleep before disconnect' }
        );
        console.log('🌐 goto_sleep sent, waiting for animation...');
        await new Promise(resolve => setTimeout(resolve, DAEMON_CONFIG.ANIMATIONS.SLEEP_DURATION));
        console.log('🌐 Sleep animation complete');
      } catch (e) {
        // Robot already inactive or sleep error - continue with disconnect
        console.log('🌐 Sleep command skipped (robot may be inactive):', e.message);
      }
      
      // Reset connection state to return to FindingRobotView
      // Note: resetConnection() sets isStopping=false atomically
      console.log('🌐 Scheduling resetConnection...');
      setTimeout(() => {
        console.log('🌐 Calling resetConnection()');
        resetConnection();
      }, DAEMON_CONFIG.ANIMATIONS.STOP_DAEMON_DELAY);
      return;
    }
    
    // USB/Simulation mode: kill local daemon
    console.log('🔌 USB/Simulation mode: stopping local daemon');
    try {
      // First send robot to sleep position
      try {
        console.log('🔌 Sending goto_sleep command...');
        await fetchWithTimeout(
          buildApiUrl('/api/move/play/goto_sleep'),
          { method: 'POST' },
          DAEMON_CONFIG.TIMEOUTS.COMMAND,
          { label: 'Sleep before shutdown' }
        );
        console.log('🔌 goto_sleep sent, waiting for animation...');
        // Wait for movement to complete
        await new Promise(resolve => setTimeout(resolve, DAEMON_CONFIG.ANIMATIONS.SLEEP_DURATION));
        console.log('🔌 Sleep animation complete');
      } catch (e) {
        // Robot already inactive or sleep error
        console.log('🔌 Sleep command skipped:', e.message);
      }
      
      // Then kill the daemon
      console.log('🔌 Killing daemon process...');
      await invoke('stop_daemon');
      console.log('🔌 Daemon killed, scheduling resetConnection...');
      // Reset connection state to return to FindingRobotView
      // Note: resetConnection() sets isStopping=false atomically
      setTimeout(() => {
        console.log('🔌 Calling resetConnection()');
        resetConnection();
      }, DAEMON_CONFIG.ANIMATIONS.STOP_DAEMON_DELAY);
    } catch (e) {
      console.error('🔌 Error stopping daemon:', e);
      resetConnection();
    }
  }, [clearStartupTimeout, resetConnection, setIsStopping]);

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

