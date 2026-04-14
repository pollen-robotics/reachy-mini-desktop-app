import { useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import useAppStore from '../../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { useLogger } from '../../utils/logging';
import {
  DAEMON_CONFIG,
  fetchWithTimeout,
  fetchWithTimeoutSkipInstall,
  buildApiUrl,
} from '../../config/daemon';
import { isSimulationMode, disableSimulationMode } from '../../utils/simulationMode';
import { findErrorConfig, createErrorFromConfig } from '../../utils/hardwareErrors';
import { useDaemonEventBus } from './useDaemonEventBus';
import { handleDaemonError } from '../../utils/daemonErrorHandler';
import { closeAllAppWindows } from '../../utils/windowManager';

export const useDaemon = () => {
  const logger = useLogger();
  const {
    robotStatus,
    isActive,
    isStarting,
    isStopping,
    startupError,
    transitionTo,
    setDaemonVersion,
    setStartupError,
    setHardwareError,
    setStartupTimeout,
    clearStartupTimeout,
    resetAll,
  } = useAppStore(
    useShallow(state => ({
      robotStatus: state.robotStatus,
      isActive: state.isActive,
      isStarting: state.isStarting,
      isStopping: state.isStopping,
      startupError: state.startupError,
      transitionTo: state.transitionTo,
      setDaemonVersion: state.setDaemonVersion,
      setStartupError: state.setStartupError,
      setHardwareError: state.setHardwareError,
      setStartupTimeout: state.setStartupTimeout,
      clearStartupTimeout: state.clearStartupTimeout,
      resetAll: state.resetAll,
    }))
  );

  const eventBus = useDaemonEventBus();

  // Register event handlers (centralized error handling)
  useEffect(() => {
    const unsubStartSuccess = eventBus.on('daemon:start:success', data => {
      if (data?.simMode) {
        logger.info('Daemon started in simulation mode (mockup-sim)');
      }
    });

    const unsubStartError = eventBus.on('daemon:start:error', error => {
      handleDaemonError('startup', error);
      clearStartupTimeout();
    });

    const unsubStartTimeout = eventBus.on('daemon:start:timeout', () => {
      const currentState = useAppStore.getState();
      if (!currentState.isActive && currentState.isStarting) {
        handleDaemonError('timeout', {
          message:
            'Daemon did not become active within 30 seconds. Please check the robot connection.',
        });
      }
    });

    const unsubCrash = eventBus.on('daemon:crash', data => {
      const currentState = useAppStore.getState();
      if (currentState.isStarting) {
        handleDaemonError(
          'crash',
          {
            message: `Daemon process terminated unexpectedly (status: ${data.status})`,
          },
          { status: data.status }
        );
        clearStartupTimeout();
      }
    });

    const unsubHardwareError = eventBus.on('daemon:hardware:error', data => {
      const currentState = useAppStore.getState();
      const shouldProcess = currentState.isStarting || currentState.hardwareError;

      if (!shouldProcess) {
        return;
      }

      if (data.errorConfig) {
        const errorObject = createErrorFromConfig(data.errorConfig, data.errorLine);
        setHardwareError(errorObject);
        transitionTo.starting();
        handleDaemonError('hardware', data.errorLine, { code: data.errorConfig.code });
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

  // Refs to store unlisten functions (avoid race conditions on cleanup)
  const unlistenDaemonStatusRef = useRef(null);
  const unlistenStderrRef = useRef(null);
  const unlistenStdoutRef = useRef(null);
  const unlistenStderrActivityRef = useRef(null);
  const lastActivityResetRef = useRef(0);

  // Listen to Rust-side daemon-status-changed for instant crash detection
  useEffect(() => {
    let isMounted = true;

    const setup = async () => {
      if (unlistenDaemonStatusRef.current) {
        unlistenDaemonStatusRef.current();
        unlistenDaemonStatusRef.current = null;
      }

      try {
        const unlisten = await listen('daemon-status-changed', event => {
          if (!isMounted) return;
          const { current } = event.payload || {};
          if (current === 'Crashed') {
            const currentState = useAppStore.getState();
            if (currentState.isStarting) {
              eventBus.emit('daemon:crash', { status: 'process-terminated' });
              clearStartupTimeout();
            } else if (currentState.isActive) {
              currentState.transitionTo.crashed();
            }
          }
        });

        if (isMounted) {
          unlistenDaemonStatusRef.current = unlisten;
        } else {
          unlisten();
        }
      } catch {}
    };

    setup();

    return () => {
      isMounted = false;
      if (unlistenDaemonStatusRef.current) {
        unlistenDaemonStatusRef.current();
        unlistenDaemonStatusRef.current = null;
      }
    };
  }, [eventBus, clearStartupTimeout]);

  // Listen to sidecar stderr events to detect known hardware errors.
  // Only matches specific patterns from HARDWARE_ERROR_CONFIGS (e.g. "No motors detected",
  // "Camera communication error"). Generic errors (RuntimeError, Exception, etc.) are NOT
  // caught here - they are detected via structured daemon status polling below.
  useEffect(() => {
    let isMounted = true;

    const setupStderrListener = async () => {
      if (unlistenStderrRef.current) {
        unlistenStderrRef.current();
        unlistenStderrRef.current = null;
      }

      try {
        const unlisten = await listen('sidecar-stderr', event => {
          if (!isMounted) return;

          const currentState = useAppStore.getState();
          const shouldProcess = currentState.isStarting || currentState.hardwareError;

          if (!shouldProcess) {
            return;
          }

          const errorLine =
            typeof event.payload === 'string' ? event.payload : event.payload?.toString() || '';

          const errorConfig = findErrorConfig(errorLine);

          if (errorConfig) {
            eventBus.emit('daemon:hardware:error', { errorConfig, errorLine });
          }
        });

        if (isMounted) {
          unlistenStderrRef.current = unlisten;
        } else {
          unlisten();
        }
      } catch {}
    };

    setupStderrListener();

    return () => {
      isMounted = false;
      if (unlistenStderrRef.current) {
        unlistenStderrRef.current();
        unlistenStderrRef.current = null;
      }
    };
  }, [eventBus]);

  // Poll /api/daemon/status during startup to detect daemon-level errors.
  // The Python daemon exposes a structured state machine (DaemonState enum):
  //   not_initialized → starting → running | error
  // When state === "error", the response includes an "error" field with
  // the actual exception message - much more reliable than parsing stderr.
  const daemonStatusPollRef = useRef(null);

  useEffect(() => {
    if (!isStarting) {
      if (daemonStatusPollRef.current) {
        clearInterval(daemonStatusPollRef.current);
        daemonStatusPollRef.current = null;
      }
      return;
    }

    // Wait a few seconds before starting to poll (daemon needs time to start Uvicorn)
    const startDelay = setTimeout(() => {
      if (!useAppStore.getState().isStarting) return;

      const pollDaemonStatus = async () => {
        const state = useAppStore.getState();
        if (!state.isStarting || state.isActive) {
          clearInterval(daemonStatusPollRef.current);
          daemonStatusPollRef.current = null;
          return;
        }

        try {
          const response = await fetchWithTimeout(
            buildApiUrl(DAEMON_CONFIG.ENDPOINTS.DAEMON_STATUS),
            {},
            DAEMON_CONFIG.TIMEOUTS.STARTUP_CHECK,
            { silent: true }
          );

          if (!response.ok) return;

          const data = await response.json();

          if (data.state === 'error' && data.error) {
            // Check if the structured error matches a known hardware error first
            const errorConfig = findErrorConfig(data.error);
            if (errorConfig) {
              eventBus.emit('daemon:hardware:error', {
                errorConfig,
                errorLine: data.error,
              });
            } else {
              // Daemon reported a structured error (e.g. serial port, backend init failure)
              handleDaemonError('startup', { message: data.error });
              clearStartupTimeout();
            }

            clearInterval(daemonStatusPollRef.current);
            daemonStatusPollRef.current = null;
          }
        } catch {
          // Daemon not reachable yet - expected during early startup
        }
      };

      pollDaemonStatus();
      daemonStatusPollRef.current = setInterval(pollDaemonStatus, 2000);
    }, DAEMON_CONFIG.ANIMATIONS.STARTUP_MIN_DELAY || 3000);

    return () => {
      clearTimeout(startDelay);
      if (daemonStatusPollRef.current) {
        clearInterval(daemonStatusPollRef.current);
        daemonStatusPollRef.current = null;
      }
    };
  }, [isStarting, eventBus, clearStartupTimeout]);

  // Listen to sidecar stdout/stderr events to reset timeout when we see activity
  // Daemon logs go to stderr (Python logging), so we must listen to both
  useEffect(() => {
    let isMounted = true;

    const resetStartupTimeoutOnActivity = () => {
      if (!isMounted) return;

      const currentState = useAppStore.getState();

      if (!currentState.isStarting || currentState.isActive) {
        return;
      }

      const now = Date.now();
      if (now - lastActivityResetRef.current < DAEMON_CONFIG.STARTUP.ACTIVITY_RESET_DELAY) {
        return;
      }
      lastActivityResetRef.current = now;

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
    };

    const setupListeners = async () => {
      // Cleanup previous listeners
      if (unlistenStdoutRef.current) {
        unlistenStdoutRef.current();
        unlistenStdoutRef.current = null;
      }
      if (unlistenStderrActivityRef.current) {
        unlistenStderrActivityRef.current();
        unlistenStderrActivityRef.current = null;
      }

      try {
        const unlistenStdout = await listen('sidecar-stdout', resetStartupTimeoutOnActivity);
        const unlistenStderr = await listen('sidecar-stderr', resetStartupTimeoutOnActivity);

        if (isMounted) {
          unlistenStdoutRef.current = unlistenStdout;
          unlistenStderrActivityRef.current = unlistenStderr;
        } else {
          unlistenStdout();
          unlistenStderr();
        }
      } catch {}
    };

    setupListeners();

    return () => {
      isMounted = false;
      if (unlistenStdoutRef.current) {
        unlistenStdoutRef.current();
        unlistenStdoutRef.current = null;
      }
      if (unlistenStderrActivityRef.current) {
        unlistenStderrActivityRef.current();
        unlistenStderrActivityRef.current = null;
      }
    };
  }, [eventBus, clearStartupTimeout, setStartupTimeout]);

  const startDaemon = useCallback(async () => {
    const currentConnectionMode = useAppStore.getState().connectionMode;

    // External mode: daemon is already running externally, verify it's alive and initialize if needed
    if (currentConnectionMode === 'external') {
      eventBus.emit('daemon:start:attempt');

      await new Promise(resolve =>
        setTimeout(resolve, DAEMON_CONFIG.ANIMATIONS.SPINNER_RENDER_DELAY)
      );

      try {
        const statusResponse = await fetchWithTimeout(
          buildApiUrl(DAEMON_CONFIG.ENDPOINTS.DAEMON_STATUS),
          {},
          DAEMON_CONFIG.TIMEOUTS.STARTUP_CHECK,
          { label: 'External daemon status check' }
        );

        if (!statusResponse.ok) {
          throw new Error(`External daemon status check failed: ${statusResponse.status}`);
        }

        const statusData = await statusResponse.json();

        // Start daemon if it's in a non-active state (same logic as WiFi mode)
        if (
          statusData.state === 'not_initialized' ||
          statusData.state === 'starting' ||
          statusData.state === 'stopped' ||
          statusData.state === 'stopping'
        ) {
          try {
            await fetchWithTimeout(
              buildApiUrl('/api/daemon/start?wake_up=false'),
              { method: 'POST' },
              DAEMON_CONFIG.TIMEOUTS.STARTUP_CHECK * 2,
              { label: 'External daemon start' }
            );
          } catch (e) {
            // Request sent, response may be delayed
          }
        }

        eventBus.emit('daemon:start:success', { existing: true, external: true });
      } catch (e) {
        eventBus.emit('daemon:start:error', new Error(`External daemon error: ${e.message}`));
        resetAll();
      }
      return;
    }

    // WiFi mode: daemon is remote, initialize it if needed
    if (currentConnectionMode === 'wifi') {
      eventBus.emit('daemon:start:attempt');

      await new Promise(resolve =>
        setTimeout(resolve, DAEMON_CONFIG.ANIMATIONS.SPINNER_RENDER_DELAY)
      );

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
        if (
          statusData.state === 'not_initialized' ||
          statusData.state === 'starting' ||
          statusData.state === 'stopped' ||
          statusData.state === 'stopping'
        ) {
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
        // ⚠️ IMPORTANT: Emit error BEFORE resetAll() so telemetry captures the connectionMode
        eventBus.emit('daemon:start:error', new Error(`WiFi daemon error: ${e.message}`));
        resetAll();
      }
      return;
    }

    // USB/Simulation mode
    eventBus.emit('daemon:start:attempt');

    await new Promise(resolve =>
      setTimeout(resolve, DAEMON_CONFIG.ANIMATIONS.SPINNER_RENDER_DELAY)
    );

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
      const { connectionMode } = useAppStore.getState();

      invoke('start_daemon', { simMode, connectionMode })
        .then(() => {
          eventBus.emit('daemon:start:success', { existing: false, simMode });
        })
        .catch(e => {
          eventBus.emit('daemon:start:error', e);
        });

      await new Promise(resolve =>
        setTimeout(resolve, DAEMON_CONFIG.ANIMATIONS.BUTTON_SPINNER_DELAY)
      );

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

  /**
   * Graceful shutdown: goto_sleep animation → disable motors → kill daemon
   */
  const performGracefulShutdown = useCallback(async () => {
    try {
      const sleepResponse = await fetchWithTimeout(
        buildApiUrl('/api/move/play/goto_sleep'),
        { method: 'POST' },
        DAEMON_CONFIG.TIMEOUTS.COMMAND,
        { label: 'Goto sleep animation', silent: true }
      );
      const sleepData = await sleepResponse.json();
      const moveUuid = sleepData?.uuid;

      // Wait for the sleep animation to finish (fixed timeout fallback)
      const waitMs = moveUuid ? 6000 : 4000;
      await new Promise(resolve => setTimeout(resolve, waitMs));
    } catch {
      // Animation may fail if robot is in a weird state - continue anyway
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    try {
      await fetchWithTimeout(
        buildApiUrl('/api/motors/set_mode/disabled'),
        { method: 'POST' },
        DAEMON_CONFIG.TIMEOUTS.COMMAND,
        { label: 'Disable motors', silent: true }
      );
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch {
      // Continue with shutdown even if motor disable fails
    }
  }, []);

  const stopDaemon = useCallback(async () => {
    const currentConnectionMode = useAppStore.getState().connectionMode;
    const currentIsAppRunning = useAppStore.getState().isAppRunning;

    transitionTo.stopping();
    clearStartupTimeout();
    disableSimulationMode();

    // Stop any running app and close all app windows
    if (currentIsAppRunning) {
      try {
        await fetchWithTimeout(
          buildApiUrl('/api/apps/stop-current-app'),
          { method: 'POST' },
          DAEMON_CONFIG.TIMEOUTS.APP_STOP,
          { label: 'Stop app before shutdown', silent: true }
        );
      } catch {
        // Continue with shutdown
      }
    }
    await closeAllAppWindows();
    useAppStore.getState().closeEmbeddedApp();

    // Wait for any daemon goto_target to complete
    await new Promise(resolve => setTimeout(resolve, 500));

    // External mode: sleep + disable motors, but don't stop daemon
    if (currentConnectionMode === 'external') {
      await performGracefulShutdown();
      setTimeout(() => {
        resetAll();
      }, DAEMON_CONFIG.ANIMATIONS.STOP_DAEMON_DELAY);
      return;
    }

    // WiFi mode: sleep + disable motors, then tell daemon to stop (we don't kill it)
    if (currentConnectionMode === 'wifi') {
      await performGracefulShutdown();

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

      // Clear the local proxy so discovery doesn't detect a stale forwarded daemon
      try {
        await invoke('clear_local_proxy_target');
      } catch (e) {
        // Continue with reset
      }

      setTimeout(() => {
        resetAll();
      }, DAEMON_CONFIG.ANIMATIONS.STOP_DAEMON_DELAY);
      return;
    }

    // USB/Simulation mode: sleep + disable motors + kill daemon process
    try {
      await performGracefulShutdown();

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
      resetAll();
    }
  }, [clearStartupTimeout, resetAll, transitionTo, performGracefulShutdown]);

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
