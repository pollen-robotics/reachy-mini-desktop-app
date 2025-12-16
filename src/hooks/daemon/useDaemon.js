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
    setIsStarting, 
    setIsStopping,
    setDaemonVersion,
    setStartupError,
    setHardwareError,
    setStartupTimeout,
    clearStartupTimeout
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
    // ✅ Emit start attempt event
    eventBus.emit('daemon:start:attempt');
    
    // First reset errors but don't change view yet
    setStartupError(null);
    setHardwareError(null);
    
    // Wait a moment for React to render the spinner
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
          // Wait to see the spinner in the button
          await new Promise(resolve => setTimeout(resolve, DAEMON_CONFIG.ANIMATIONS.BUTTON_SPINNER_DELAY));
          setIsStarting(true);
          // ✅ Emit success event for existing daemon
          eventBus.emit('daemon:start:success', { existing: true });
          // Daemon already active, no need for startup timeout
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
      
      // Wait to see the spinner in the button, then switch to scan view
      await new Promise(resolve => setTimeout(resolve, DAEMON_CONFIG.ANIMATIONS.BUTTON_SPINNER_DELAY));
      setIsStarting(true);
      
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
  }, [eventBus, setIsStarting, setStartupTimeout]);

  const stopDaemon = useCallback(async () => {
    setIsStopping(true);
    // ✅ Clear startup timeout if daemon is being stopped
    clearStartupTimeout();
    // 🧹 Clear simulation mode from localStorage on shutdown
    disableSimulationMode();
    try {
      // First send robot to sleep position
      try {
        await fetchWithTimeout(
          buildApiUrl('/api/move/play/goto_sleep'),
          { method: 'POST' },
          DAEMON_CONFIG.TIMEOUTS.COMMAND,
          { label: 'Sleep before shutdown' }
        );
        // Wait for movement to complete
        await new Promise(resolve => setTimeout(resolve, DAEMON_CONFIG.ANIMATIONS.SLEEP_DURATION));
      } catch (e) {
        // Robot already inactive or sleep error
      }
      
      // Then kill the daemon
      await invoke('stop_daemon');
      // ✅ No need to manually checkStatus - useDaemonHealthCheck will detect the change automatically
      setTimeout(() => {
        setIsStopping(false);
      }, DAEMON_CONFIG.ANIMATIONS.STOP_DAEMON_DELAY);
    } catch (e) {
      console.error(e);
      setIsStopping(false);
    }
  }, [setIsStopping, clearStartupTimeout]);

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

