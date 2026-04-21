/**
 * useDaemonLifecycle
 *
 * Centralised side effects for the daemon lifecycle. This hook owns ALL
 * long-lived listeners (sidecar stdout/stderr, Tauri daemon-status-changed,
 * /api/daemon/status polling, event-bus handlers) and must be mounted
 * exactly ONCE in the app (in `<App />`).
 *
 * Historically these effects lived inside `useDaemon`, but that hook is
 * consumed from two places (App.tsx + useConnection.ts) which caused every
 * event to be handled twice (notably the startup-timeout error being logged
 * twice). Splitting lifecycle out of the "actions" hook makes the behaviour
 * deterministic and allows the hook to be mounted at a single, well-known
 * location.
 *
 * This hook also owns the bootstrap-aware startup timeout: while the sidecar
 * emits `[bootstrap]` lines (first-run Python environment setup) we extend
 * the activity-reset to `TIMEOUT_BOOTSTRAP` instead of `TIMEOUT_NORMAL`.
 */

import { useEffect, useRef } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useShallow } from 'zustand/react/shallow';
import useAppStore from '../../store/useAppStore';
import { useLogger } from '../../utils/logging';
import { DAEMON_CONFIG, fetchWithTimeout, buildApiUrl } from '../../config/daemon';
import { isSimulationMode } from '../../utils/simulationMode';
import {
  findErrorConfig,
  createErrorFromConfig,
  type HardwareErrorConfig,
} from '../../utils/hardwareErrors';
import { useDaemonEventBus } from './useDaemonEventBus';
import { handleDaemonError } from '../../utils/daemonErrorHandler';
import type { FullAppState } from '../../store/useStore';

interface DaemonStatusChangedPayload {
  current?: string;
  previous?: string;
}

interface DaemonStatusResponse {
  state?: 'not_initialized' | 'starting' | 'running' | 'stopped' | 'stopping' | 'error';
  error?: string;
  version?: string;
  [key: string]: unknown;
}

interface DaemonHardwareErrorEvent {
  errorConfig: HardwareErrorConfig;
  errorLine: string;
}

interface DaemonCrashEvent {
  status: string;
}

interface DaemonStartSuccessEvent {
  existing?: boolean;
  external?: boolean;
  wifi?: boolean;
  simMode?: boolean;
}

type TimeoutId = ReturnType<typeof setTimeout>;
type IntervalId = ReturnType<typeof setInterval>;

// Module-level guard so that even during React StrictMode double-mount or
// accidental duplicate calls, only one lifecycle instance is active.
let lifecycleMounted = false;

export function useDaemonLifecycle(): void {
  const logger = useLogger();
  const { isStarting, transitionTo, setHardwareError, setStartupTimeout, clearStartupTimeout } =
    useAppStore(
      useShallow((state: FullAppState) => ({
        isStarting: state.isStarting,
        transitionTo: state.transitionTo,
        setHardwareError: state.setHardwareError,
        setStartupTimeout: state.setStartupTimeout,
        clearStartupTimeout: state.clearStartupTimeout,
      }))
    );

  const eventBus = useDaemonEventBus();

  // Bootstrap tracking: when the sidecar emits `[bootstrap]` messages we
  // extend the startup timeout until `Setup complete` is observed (or the
  // hook unmounts). This keeps the UX responsive on first launch without
  // falsely timing out during multi-minute Python setup steps.
  const isBootstrappingRef = useRef<boolean>(false);
  const lastActivityResetRef = useRef<number>(0);

  // ─────────────────────────────────────────────────────────────────────────
  // Mount guard: warn and bail if this hook is mounted twice.
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (lifecycleMounted) {
      logger.warning(
        '[useDaemonLifecycle] Already mounted - duplicate instance detected. ' +
          'This hook must only be called once (in <App />).'
      );
      return;
    }
    lifecycleMounted = true;
    return () => {
      lifecycleMounted = false;
    };
  }, [logger]);

  // ─────────────────────────────────────────────────────────────────────────
  // Event-bus handlers (hardware errors, crashes, timeout, start results).
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsubStartSuccess = eventBus.on('daemon:start:success', data => {
      const payload = data as DaemonStartSuccessEvent | null;
      if (payload?.simMode) {
        logger.info('Daemon started in simulation mode (mockup-sim)');
      }
    });

    const unsubStartError = eventBus.on('daemon:start:error', error => {
      handleDaemonError('startup', error as Error | string | object);
      clearStartupTimeout();
    });

    const unsubStartTimeout = eventBus.on('daemon:start:timeout', () => {
      const currentState = useAppStore.getState();
      if (!currentState.isActive && currentState.isStarting) {
        const wasBootstrapping = isBootstrappingRef.current;
        const capSeconds = Math.round(
          (wasBootstrapping
            ? DAEMON_CONFIG.STARTUP.TIMEOUT_BOOTSTRAP
            : isSimulationMode()
              ? DAEMON_CONFIG.STARTUP.TIMEOUT_SIMULATION
              : DAEMON_CONFIG.STARTUP.TIMEOUT_NORMAL) / 1000
        );
        handleDaemonError('timeout', {
          message: wasBootstrapping
            ? `Daemon did not become active within ${capSeconds} seconds during first-run setup. Please check the robot connection or restart the app.`
            : `Daemon did not become active within ${capSeconds} seconds. Please check the robot connection.`,
        });
      }
    });

    const unsubCrash = eventBus.on('daemon:crash', data => {
      const payload = data as DaemonCrashEvent;
      const currentState = useAppStore.getState();
      if (currentState.isStarting) {
        handleDaemonError(
          'crash',
          { message: `Daemon process terminated unexpectedly (status: ${payload.status})` },
          { status: payload.status }
        );
        clearStartupTimeout();
      }
    });

    const unsubHardwareError = eventBus.on('daemon:hardware:error', data => {
      const payload = data as DaemonHardwareErrorEvent;
      const currentState = useAppStore.getState();
      const shouldProcess = currentState.isStarting || currentState.hardwareError;
      if (!shouldProcess) return;

      if (payload.errorConfig) {
        const errorObject = createErrorFromConfig(payload.errorConfig, payload.errorLine);
        setHardwareError(errorObject);
        transitionTo.starting();
        handleDaemonError('hardware', payload.errorLine, { code: payload.errorConfig.code });
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

  // ─────────────────────────────────────────────────────────────────────────
  // Tauri `daemon-status-changed` event → instant crash detection.
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let isMounted = true;
    let unlisten: UnlistenFn | null = null;

    const setup = async (): Promise<void> => {
      try {
        const u = await listen<DaemonStatusChangedPayload>('daemon-status-changed', event => {
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
        if (isMounted) unlisten = u;
        else u();
      } catch {
        // Listener setup can fail outside of Tauri; nothing to do.
      }
    };

    setup();

    return () => {
      isMounted = false;
      if (unlisten) unlisten();
    };
  }, [eventBus, clearStartupTimeout]);

  // ─────────────────────────────────────────────────────────────────────────
  // Sidecar stderr → detect known hardware errors.
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let isMounted = true;
    let unlisten: UnlistenFn | null = null;

    const setup = async (): Promise<void> => {
      try {
        const u = await listen<unknown>('sidecar-stderr', event => {
          if (!isMounted) return;
          const currentState = useAppStore.getState();
          const shouldProcess = currentState.isStarting || currentState.hardwareError;
          if (!shouldProcess) return;

          const payload = event.payload;
          const errorLine =
            typeof payload === 'string' ? payload : payload != null ? String(payload) : '';
          const errorConfig = findErrorConfig(errorLine);
          if (errorConfig) {
            eventBus.emit('daemon:hardware:error', { errorConfig, errorLine });
          }
        });
        if (isMounted) unlisten = u;
        else u();
      } catch {
        // Listener setup can fail outside of Tauri; nothing to do.
      }
    };

    setup();

    return () => {
      isMounted = false;
      if (unlisten) unlisten();
    };
  }, [eventBus]);

  // ─────────────────────────────────────────────────────────────────────────
  // Poll /api/daemon/status during startup.
  //
  // This is the SINGLE source of truth for "daemon is ready":
  // - `state === 'running'` on /api/daemon/status
  //   AND /api/state/full returns 200
  //   → emit `daemon:ready` (exactly once per start cycle).
  // - `state === 'error'` with an error message
  //   → emit `daemon:hardware:error` (or fall back to generic startup error).
  //
  // Anything else (not_initialized, starting, stopping, 5xx, network error)
  // → keep polling. The startup timeout (managed separately below) will
  // eventually fire if the daemon never becomes ready.
  // ─────────────────────────────────────────────────────────────────────────
  const daemonStatusPollRef = useRef<IntervalId | null>(null);
  const daemonReadyEmittedRef = useRef<boolean>(false);

  // Reset the "ready emitted" latch whenever a new startup cycle begins.
  useEffect(() => {
    if (isStarting) {
      daemonReadyEmittedRef.current = false;
    }
  }, [isStarting]);

  useEffect(() => {
    if (!isStarting) {
      if (daemonStatusPollRef.current) {
        clearInterval(daemonStatusPollRef.current);
        daemonStatusPollRef.current = null;
      }
      return;
    }

    const startDelay: TimeoutId = setTimeout(() => {
      if (!useAppStore.getState().isStarting) return;

      const stopPolling = (): void => {
        if (daemonStatusPollRef.current) {
          clearInterval(daemonStatusPollRef.current);
          daemonStatusPollRef.current = null;
        }
      };

      const pollDaemonStatus = async (): Promise<void> => {
        const state = useAppStore.getState();
        if (!state.isStarting || state.isActive) {
          stopPolling();
          return;
        }

        try {
          const response: Response = await fetchWithTimeout(
            buildApiUrl(DAEMON_CONFIG.ENDPOINTS.DAEMON_STATUS),
            {},
            DAEMON_CONFIG.TIMEOUTS.STARTUP_CHECK,
            { silent: true }
          );
          if (!response.ok) return;

          const data = (await response.json()) as DaemonStatusResponse;

          // Error path: Python reports a structured failure.
          if (data.state === 'error' && data.error) {
            const errorConfig = findErrorConfig(data.error);
            if (errorConfig) {
              eventBus.emit('daemon:hardware:error', {
                errorConfig,
                errorLine: data.error,
              });
            } else {
              handleDaemonError('startup', { message: data.error });
              clearStartupTimeout();
            }
            stopPolling();
            return;
          }

          // Ready path: Python reports running AND the backend is actually
          // serving state (dependencies.get_backend requires backend.ready).
          // Both checks are needed because `state === 'running'` flips before
          // media/wake-up finishes, whereas `/api/state/full` only returns 200
          // once the backend is fully operational.
          if (data.state === 'running' && !daemonReadyEmittedRef.current) {
            try {
              const stateResponse: Response = await fetchWithTimeout(
                buildApiUrl(DAEMON_CONFIG.ENDPOINTS.STATE_FULL),
                {},
                DAEMON_CONFIG.TIMEOUTS.STATE_FULL,
                { silent: true }
              );
              if (stateResponse.ok) {
                daemonReadyEmittedRef.current = true;
                eventBus.emit('daemon:ready', { via: 'poll' });
                stopPolling();
              }
            } catch {
              // Backend not fully serving state yet - keep polling.
            }
          }
        } catch {
          // Daemon not reachable yet - expected during early startup.
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

  // ─────────────────────────────────────────────────────────────────────────
  // Sidecar stdout/stderr → bootstrap detection + activity-based timeout reset.
  //
  // When `[bootstrap]` lines are observed, we flip `isBootstrappingRef` and
  // use `TIMEOUT_BOOTSTRAP` (10 min) until `Setup complete` arrives. After
  // that we revert to TIMEOUT_NORMAL / TIMEOUT_SIMULATION.
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let isMounted = true;
    let unlistenStdout: UnlistenFn | null = null;
    let unlistenStderr: UnlistenFn | null = null;

    const extractMessage = (payload: unknown): string => {
      if (typeof payload === 'string') return payload;
      if (payload == null) return '';
      const maybe = (payload as { toString?: () => string }).toString;
      return typeof maybe === 'function' ? maybe.call(payload) : '';
    };

    const updateBootstrapFlag = (msg: string): void => {
      if (!msg) return;
      if (msg.includes('[bootstrap]')) {
        if (msg.includes('Setup complete')) {
          isBootstrappingRef.current = false;
        } else {
          isBootstrappingRef.current = true;
        }
      }
    };

    const resetStartupTimeoutOnActivity = (event: { payload: unknown }): void => {
      if (!isMounted) return;

      const msg = extractMessage(event.payload);
      updateBootstrapFlag(msg);

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
      const startupTimeout: number = isBootstrappingRef.current
        ? DAEMON_CONFIG.STARTUP.TIMEOUT_BOOTSTRAP
        : simMode
          ? DAEMON_CONFIG.STARTUP.TIMEOUT_SIMULATION
          : DAEMON_CONFIG.STARTUP.TIMEOUT_NORMAL;

      const newTimeoutId: TimeoutId = setTimeout(() => {
        const state = useAppStore.getState();
        if (!state.isActive && state.isStarting) {
          eventBus.emit('daemon:start:timeout');
        }
      }, startupTimeout);

      setStartupTimeout(newTimeoutId);
    };

    const setup = async (): Promise<void> => {
      try {
        const uStdout = await listen('sidecar-stdout', resetStartupTimeoutOnActivity);
        const uStderr = await listen('sidecar-stderr', resetStartupTimeoutOnActivity);
        if (isMounted) {
          unlistenStdout = uStdout;
          unlistenStderr = uStderr;
        } else {
          uStdout();
          uStderr();
        }
      } catch {
        // Listener setup can fail outside of Tauri; nothing to do.
      }
    };

    setup();

    return () => {
      isMounted = false;
      if (unlistenStdout) unlistenStdout();
      if (unlistenStderr) unlistenStderr();
      // Reset state on unmount so a subsequent mount starts clean.
      isBootstrappingRef.current = false;
      lastActivityResetRef.current = 0;
    };
  }, [eventBus, clearStartupTimeout, setStartupTimeout]);

  // Reset bootstrap flag when isStarting becomes false (successful boot or reset).
  useEffect(() => {
    if (!isStarting) {
      isBootstrappingRef.current = false;
      lastActivityResetRef.current = 0;
    }
  }, [isStarting]);
}
