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
    resetAll,
  } = useAppStore();
  
  // Derived from robotStatus (state machine)
  // Include 'sleeping' in isActive so window resizes on connection (not just on wake)
  const isActive = robotStatus === 'sleeping' || robotStatus === 'ready' || robotStatus === 'busy';
  const isStarting = robotStatus === 'starting';
  const isStopping = robotStatus === 'stopping';
  
  const eventBus = useDaemonEventBus();
  
  // Register event handlers (centralized error handling)
  useEffect(() => {
    const unsubStartSuccess = eventBus.on('daemon:start:success', (data) => {
      if (data?.simMode) {
        logger.info('Daemon started in simulation mode (mockup-sim)');
      }
    });
    
    const unsubStartError = eventBus.on('daemon:start:error', (error) => {
      handleDaemonError('startup', error);
      clearStartupTimeout();
    });
    
    const unsubStartTimeout = eventBus.on('daemon:start:timeout', () => {
      const currentState = useAppStore.getState();
      if (!currentState.isActive && currentState.isStarting) {
        handleDaemonError('timeout', {
          message: 'Daemon did not become active within 30 seconds. Please check the robot connection.'
        });
      }
    });
    
    const unsubCrash = eventBus.on('daemon:crash', (data) => {
      const currentState = useAppStore.getState();
      if (currentState.isStarting) {
        handleDaemonError('crash', {
          message: `Daemon process terminated unexpectedly (status: ${data.status})`
        }, { status: data.status });
        clearStartupTimeout();
      }
    });
    
    const unsubHardwareError = eventBus.on('daemon:hardware:error', (data) => {
      const currentState = useAppStore.getState();
      const shouldProcess = currentState.isStarting || currentState.hardwareError;
      
      if (!shouldProcess) {
        return;
      }
      
      if (data.errorConfig) {
        const errorObject = createErrorFromConfig(data.errorConfig, data.errorLine);
        setHardwareError(errorObject);
        transitionTo.starting();
      } else if (data.isGeneric) {
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

  const fetchDaemonVersion = useCallback(async () => {
    try {
      const response = await fetchWithTimeoutSkipInstall(
        buildApiUrl(DAEMON_CONFIG.ENDPOINTS.DAEMON_STATUS),
        {},
        DAEMON_CONFIG.TIMEOUTS.VERSION,
        { silent: true }
      );
      if (response.ok) {
        const data = await response.json();
        setDaemonVersion(data.version || null);
      }
    } catch (error) {
      if (error.name === 'SkippedError') {
        return;
      }
    }
  }, [setDaemonVersion]);

  // Listen to sidecar termination events to detect immediate crashes
  useEffect(() => {
    let unlistenTerminated;
    
    const setupTerminationListener = async () => {
      try {
        unlistenTerminated = await listen('sidecar-terminated', (event) => {
          if (!isStarting) {
            return;
          }
          
          const status = typeof event.payload === 'string' 
            ? event.payload 
            : event.payload?.toString() || 'unknown';
          
          eventBus.emit('daemon:crash', { status });
        });
      } catch (error) {
        console.error('[Daemon] Failed to setup termination listener:', error);
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
  useEffect(() => {
    let unlistenStderr;
    
    const setupStderrListener = async () => {
      try {
        unlistenStderr = await listen('sidecar-stderr', (event) => {
          const currentState = useAppStore.getState();
          const shouldProcess = isStarting || currentState.hardwareError;
          
          if (!shouldProcess) {
            return;
          }
          
          const errorLine = typeof event.payload === 'string' 
            ? event.payload 
            : event.payload?.toString() || '';
          
          const errorConfig = findErrorConfig(errorLine);
          
          if (errorConfig) {
            eventBus.emit('daemon:hardware:error', { errorConfig, errorLine });
          } else if (errorLine.includes('RuntimeError')) {
            eventBus.emit('daemon:hardware:error', { 
              errorConfig: null, 
              errorLine,
              isGeneric: true 
            });
          }
        });
      } catch (error) {
        console.error('[Daemon] Failed to setup stderr listener:', error);
      }
    };
    
    setupStderrListener();
    
    return () => {
      if (unlistenStderr) {
        unlistenStderr();
      }
    };
  }, [isStarting, eventBus]);

  // Listen to sidecar stdout events to reset timeout when we see activity
  useEffect(() => {
    let unlistenStdout;
    let lastActivityReset = 0;
    
    const setupStdoutListener = async () => {
      try {
        unlistenStdout = await listen('sidecar-stdout', () => {
          const currentState = useAppStore.getState();
          
          if (!currentState.isStarting || currentState.isActive) {
            return;
          }
          
          const now = Date.now();
          if (now - lastActivityReset < DAEMON_CONFIG.STARTUP.ACTIVITY_RESET_DELAY) {
            return;
          }
          lastActivityReset = now;
          
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
        });
      } catch (error) {
        console.error('[Daemon] Failed to setup stdout listener:', error);
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
    const currentConnectionMode = useAppStore.getState().connectionMode;
    
    // WiFi mode: daemon is remote, initialize it if needed
    if (currentConnectionMode === 'wifi') {
      eventBus.emit('daemon:start:attempt');
      
      await new Promise(resolve => setTimeout(resolve, DAEMON_CONFIG.ANIMATIONS.SPINNER_RENDER_DELAY));
      
      try {
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
        
        // Start daemon WITHOUT wake_up - robot stays sleeping
        if (statusData.state === 'not_initialized' || statusData.state === 'starting' || statusData.state === 'stopped' || statusData.state === 'stopping') {
          try {
            await fetchWithTimeout(
              buildApiUrl('/api/daemon/start?wake_up=false'),
              { method: 'POST' },
              DAEMON_CONFIG.TIMEOUTS.STARTUP_CHECK * 2,
              { label: 'WiFi daemon start' }
            );
          } catch (e) {
            // Request sent, response may be delayed
          }
        }
        
        eventBus.emit('daemon:start:success', { existing: true, wifi: true });
        
      } catch (e) {
        console.error('[Daemon] WiFi connection failed:', e.message);
        resetAll();
        eventBus.emit('daemon:start:error', new Error(`WiFi daemon error: ${e.message}`));
      }
      return;
    }
    
    // USB/Simulation mode
    eventBus.emit('daemon:start:attempt');
    
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
          useAppStore.getState().transitionTo.ready();
          eventBus.emit('daemon:start:success', { existing: true });
          return;
        }
      } catch (e) {
        // No daemon detected, starting new one
      }

      const simMode = isSimulationMode();

      invoke('start_daemon', { simMode: simMode }).then(() => {
        eventBus.emit('daemon:start:success', { existing: false, simMode });
      }).catch((e) => {
        eventBus.emit('daemon:start:error', e);
      });
      
      await new Promise(resolve => setTimeout(resolve, DAEMON_CONFIG.ANIMATIONS.BUTTON_SPINNER_DELAY));
      
      const startupTimeout = simMode 
        ? DAEMON_CONFIG.STARTUP.TIMEOUT_SIMULATION 
        : DAEMON_CONFIG.STARTUP.TIMEOUT_NORMAL;
      
      const timeoutId = setTimeout(() => {
        const currentState = useAppStore.getState();
        if (!currentState.isActive && currentState.isStarting) {
          eventBus.emit('daemon:start:timeout');
        }
      }, startupTimeout);
      setStartupTimeout(timeoutId);
      
    } catch (e) {
      eventBus.emit('daemon:start:error', e);
    }
  }, [eventBus, setStartupTimeout, resetAll]);

  const stopDaemon = useCallback(async () => {
    const currentConnectionMode = useAppStore.getState().connectionMode;
    const currentIsAppRunning = useAppStore.getState().isAppRunning;
    
    transitionTo.stopping();
    clearStartupTimeout();
    disableSimulationMode();
    
    // Stop any running app first
    if (currentIsAppRunning) {
      try {
        await fetchWithTimeout(
          buildApiUrl('/api/apps/stop-current-app'),
          { method: 'POST' },
          DAEMON_CONFIG.TIMEOUTS.APP_STOP,
          { label: 'Stop app before shutdown', silent: true }
        );
      } catch (e) {
        // Continue with shutdown
      }
    }
    
    // Wait for any daemon goto_target to complete
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // WiFi mode: stop daemon then disconnect
    if (currentConnectionMode === 'wifi') {
      try {
        await fetchWithTimeout(
          buildApiUrl('/api/daemon/stop?goto_sleep=false'),
          { method: 'POST' },
          DAEMON_CONFIG.TIMEOUTS.COMMAND,
          { label: 'Daemon stop' }
        );
      } catch (e) {
        // Continue with reset
      }
      
      setTimeout(() => {
        resetAll();
      }, DAEMON_CONFIG.ANIMATIONS.STOP_DAEMON_DELAY);
      return;
    }
    
    // USB/Simulation mode
    try {
      try {
        await fetchWithTimeout(
          buildApiUrl('/api/daemon/stop?goto_sleep=false'),
          { method: 'POST' },
          DAEMON_CONFIG.TIMEOUTS.COMMAND,
          { label: 'Daemon stop' }
        );
      } catch (e) {
        // Continue with kill
      }
      
      await invoke('stop_daemon');
      
      setTimeout(() => {
        resetAll();
      }, DAEMON_CONFIG.ANIMATIONS.STOP_DAEMON_DELAY);
    } catch (e) {
      console.error('[Daemon] Stop failed:', e.message);
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
