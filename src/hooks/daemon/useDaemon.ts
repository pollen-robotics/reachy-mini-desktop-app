/**
 * useDaemon
 *
 * Actions + state-selector hook for the daemon. The side effects
 * (event-bus handlers, sidecar listeners, daemon-status polling,
 * startup-timeout management) are now owned by `useDaemonLifecycle`, which
 * must be mounted exactly ONCE in the app (in `<App />`).
 *
 * This split was introduced because `useDaemon` used to be consumed from
 * two places (App.tsx + useConnection.ts), causing every daemon event to
 * be handled twice (notably the startup-timeout error being logged
 * twice on first launch).
 */

import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useShallow } from 'zustand/react/shallow';
import useAppStore from '../../store/useAppStore';
import {
  DAEMON_CONFIG,
  fetchWithTimeout,
  fetchWithTimeoutSkipInstall,
  buildApiUrl,
} from '../../config/daemon';
import { isSimulationMode, disableSimulationMode } from '../../utils/simulationMode';
import { useDaemonEventBus } from './useDaemonEventBus';
import { closeAllAppWindows } from '../../utils/windowManager';
import type { AppState } from '../../types/store';
import type { FullAppState } from '../../store/useStore';

interface DaemonStatusResponse {
  state?: 'not_initialized' | 'starting' | 'running' | 'stopped' | 'stopping' | 'error';
  error?: string;
  version?: string;
  [key: string]: unknown;
}

export interface UseDaemonResult {
  isActive: boolean;
  isStarting: boolean;
  isStopping: boolean;
  startupError: AppState['startupError'];
  startDaemon: () => Promise<void>;
  stopDaemon: () => Promise<void>;
  fetchDaemonVersion: () => Promise<void>;
}

type TimeoutId = ReturnType<typeof setTimeout>;

export const useDaemon = (): UseDaemonResult => {
  const {
    isActive,
    isStarting,
    isStopping,
    startupError,
    transitionTo,
    setDaemonVersion,
    setStartupTimeout,
    clearStartupTimeout,
    resetAll,
  } = useAppStore(
    useShallow((state: FullAppState) => ({
      isActive: state.isActive,
      isStarting: state.isStarting,
      isStopping: state.isStopping,
      startupError: state.startupError,
      transitionTo: state.transitionTo,
      setDaemonVersion: state.setDaemonVersion,
      setStartupTimeout: state.setStartupTimeout,
      clearStartupTimeout: state.clearStartupTimeout,
      resetAll: state.resetAll,
    }))
  );

  const eventBus = useDaemonEventBus();

  const fetchDaemonVersion = useCallback(async (): Promise<void> => {
    try {
      const response: Response = await fetchWithTimeoutSkipInstall(
        buildApiUrl(DAEMON_CONFIG.ENDPOINTS.DAEMON_STATUS),
        {},
        DAEMON_CONFIG.TIMEOUTS.VERSION,
        { silent: true }
      );
      if (response.ok) {
        const data = (await response.json()) as DaemonStatusResponse;
        setDaemonVersion(data.version || null);
      }
    } catch (error: unknown) {
      const name = (error as { name?: string } | null)?.name;
      if (name === 'SkippedError') {
        return;
      }
    }
  }, [setDaemonVersion]);

  const startDaemon = useCallback(async (): Promise<void> => {
    const currentConnectionMode = useAppStore.getState().connectionMode;

    // External mode: daemon is already running externally, verify it's alive
    // and initialize if needed.
    if (currentConnectionMode === 'external') {
      eventBus.emit('daemon:start:attempt');

      await new Promise<void>(resolve =>
        setTimeout(resolve, DAEMON_CONFIG.ANIMATIONS.SPINNER_RENDER_DELAY)
      );

      try {
        const statusResponse: Response = await fetchWithTimeout(
          buildApiUrl(DAEMON_CONFIG.ENDPOINTS.DAEMON_STATUS),
          {},
          DAEMON_CONFIG.TIMEOUTS.STARTUP_CHECK,
          { label: 'External daemon status check' }
        );

        if (!statusResponse.ok) {
          throw new Error(`External daemon status check failed: ${statusResponse.status}`);
        }

        const statusData = (await statusResponse.json()) as DaemonStatusResponse;

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
          } catch {
            // Request sent, response may be delayed.
          }
        }

        eventBus.emit('daemon:start:success', { existing: true, external: true });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        eventBus.emit('daemon:start:error', new Error(`External daemon error: ${message}`));
        resetAll();
      }
      return;
    }

    // WiFi mode: daemon is remote, initialize it if needed.
    if (currentConnectionMode === 'wifi') {
      eventBus.emit('daemon:start:attempt');

      await new Promise<void>(resolve =>
        setTimeout(resolve, DAEMON_CONFIG.ANIMATIONS.SPINNER_RENDER_DELAY)
      );

      try {
        const statusResponse: Response = await fetchWithTimeout(
          buildApiUrl(DAEMON_CONFIG.ENDPOINTS.DAEMON_STATUS),
          {},
          DAEMON_CONFIG.TIMEOUTS.STARTUP_CHECK,
          { label: 'WiFi daemon status check' }
        );

        if (!statusResponse.ok) {
          throw new Error(`Daemon status check failed: ${statusResponse.status}`);
        }

        const statusData = (await statusResponse.json()) as DaemonStatusResponse;

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
          } catch {
            // Request sent, response may be delayed.
          }
        }

        eventBus.emit('daemon:start:success', { existing: true, wifi: true });
      } catch (e: unknown) {
        // ⚠️ IMPORTANT: Emit error BEFORE resetAll() so telemetry captures the connectionMode
        const message = e instanceof Error ? e.message : String(e);
        eventBus.emit('daemon:start:error', new Error(`WiFi daemon error: ${message}`));

        try {
          await invoke('clear_local_proxy_target');
        } catch {
          // Best effort - nothing actionable if this fails.
        }

        resetAll();
      }
      return;
    }

    // USB / Simulation mode
    eventBus.emit('daemon:start:attempt');

    await new Promise<void>(resolve =>
      setTimeout(resolve, DAEMON_CONFIG.ANIMATIONS.SPINNER_RENDER_DELAY)
    );

    try {
      // Spawn guard: avoid respawning a daemon that's already running AND
      // started in the *same connection mode* (e.g. page reload, HMR,
      // webview restart). Rust `start_daemon` always kills the existing
      // process before spawning a new one, which would cause an unnecessary
      // ~600s bootstrap on first-run reloads.
      //
      // ⚠️ Critically, the guard MUST be mode-aware: if a USB daemon is
      // still (or already) running and the user now requests simulation,
      // we MUST respawn so GStreamer pipelines (camera/microphone) point
      // at the requested source. See bug: USB → Sim kept USB webcam feed.
      //
      // We use `invoke('get_daemon_status')` (Rust-side truth) rather than
      // the sidecar HTTP endpoint: HTTP can lag (socket still answering
      // while the process is dying) and doesn't expose the mode anyway.
      //
      // Detection of the READY state remains uniform: useDaemonLifecycle
      // polls /api/daemon/status + /api/state/full and emits `daemon:ready`
      // once, for both existing and freshly-spawned daemons.
      const { connectionMode: requestedConnectionMode } = useAppStore.getState();
      const simMode = isSimulationMode();

      let daemonAlreadyRunning = false;
      try {
        const result = (await invoke('get_daemon_status')) as {
          status?: string;
          connectionMode?: string | null;
        };
        if (result?.status === 'Running' && result?.connectionMode === requestedConnectionMode) {
          daemonAlreadyRunning = true;
        }
      } catch {
        // Not in Tauri env or command failed: fall through to spawn.
      }

      if (daemonAlreadyRunning) {
        eventBus.emit('daemon:start:success', { existing: true });
      } else {
        invoke('start_daemon', { simMode, connectionMode: requestedConnectionMode })
          .then(() => {
            eventBus.emit('daemon:start:success', { existing: false, simMode });
          })
          .catch((e: unknown) => {
            eventBus.emit('daemon:start:error', e);
          });

        await new Promise<void>(resolve =>
          setTimeout(resolve, DAEMON_CONFIG.ANIMATIONS.BUTTON_SPINNER_DELAY)
        );
      }

      // Initial timeout: this will be reset by the activity listener in
      // `useDaemonLifecycle` as soon as sidecar stdout/stderr arrives. The
      // activity listener also extends the timeout to TIMEOUT_BOOTSTRAP when
      // `[bootstrap]` lines are detected (first-run Python setup).
      // For an already-running daemon, there is no sidecar output to reset
      // the timeout, but useDaemonLifecycle's poll emits `daemon:ready`
      // within a few seconds, well before the 90s budget elapses.
      const startupTimeout: number = simMode
        ? DAEMON_CONFIG.STARTUP.TIMEOUT_SIMULATION
        : DAEMON_CONFIG.STARTUP.TIMEOUT_NORMAL;

      const timeoutId: TimeoutId = setTimeout(() => {
        const currentState = useAppStore.getState();
        if (!currentState.isActive && currentState.isStarting) {
          eventBus.emit('daemon:start:timeout');
        }
      }, startupTimeout);
      setStartupTimeout(timeoutId);
    } catch (e: unknown) {
      eventBus.emit('daemon:start:error', e);
    }
  }, [eventBus, setStartupTimeout, resetAll]);

  /**
   * Graceful shutdown: goto_sleep animation → disable motors → kill daemon
   */
  const performGracefulShutdown = useCallback(async (): Promise<void> => {
    try {
      const sleepResponse: Response = await fetchWithTimeout(
        buildApiUrl('/api/move/play/goto_sleep'),
        { method: 'POST' },
        DAEMON_CONFIG.TIMEOUTS.COMMAND,
        { label: 'Goto sleep animation', silent: true }
      );
      const sleepData = (await sleepResponse.json()) as { uuid?: string } | null;
      const moveUuid = sleepData?.uuid;

      const waitMs = moveUuid ? 6000 : 4000;
      await new Promise<void>(resolve => setTimeout(resolve, waitMs));
    } catch {
      await new Promise<void>(resolve => setTimeout(resolve, 1000));
    }

    try {
      await fetchWithTimeout(
        buildApiUrl('/api/motors/set_mode/disabled'),
        { method: 'POST' },
        DAEMON_CONFIG.TIMEOUTS.COMMAND,
        { label: 'Disable motors', silent: true }
      );
      await new Promise<void>(resolve => setTimeout(resolve, 300));
    } catch {
      // Continue with shutdown even if motor disable fails.
    }
  }, []);

  const stopDaemon = useCallback(async (): Promise<void> => {
    const currentConnectionMode = useAppStore.getState().connectionMode;
    const currentIsAppRunning = useAppStore.getState().isAppRunning;

    transitionTo.stopping();
    clearStartupTimeout();
    disableSimulationMode();

    if (currentIsAppRunning) {
      try {
        await fetchWithTimeout(
          buildApiUrl('/api/apps/stop-current-app'),
          { method: 'POST' },
          DAEMON_CONFIG.TIMEOUTS.APP_STOP,
          { label: 'Stop app before shutdown', silent: true }
        );
      } catch {
        // Continue with shutdown.
      }
    }
    await closeAllAppWindows();
    useAppStore.getState().closeEmbeddedApp();

    await new Promise<void>(resolve => setTimeout(resolve, 500));

    if (currentConnectionMode === 'external') {
      await performGracefulShutdown();
      setTimeout(() => {
        resetAll();
      }, DAEMON_CONFIG.ANIMATIONS.STOP_DAEMON_DELAY);
      return;
    }

    if (currentConnectionMode === 'wifi') {
      await performGracefulShutdown();

      try {
        await fetchWithTimeout(
          buildApiUrl('/api/daemon/stop?goto_sleep=false'),
          { method: 'POST' },
          DAEMON_CONFIG.TIMEOUTS.COMMAND,
          { label: 'Daemon stop' }
        );
      } catch {
        // Continue with reset.
      }

      try {
        await invoke('clear_local_proxy_target');
      } catch {
        // Continue with reset.
      }

      setTimeout(() => {
        resetAll();
      }, DAEMON_CONFIG.ANIMATIONS.STOP_DAEMON_DELAY);
      return;
    }

    // USB / Simulation mode: sleep + disable motors + kill daemon process
    try {
      await performGracefulShutdown();

      try {
        await fetchWithTimeout(
          buildApiUrl('/api/daemon/stop?goto_sleep=false'),
          { method: 'POST' },
          DAEMON_CONFIG.TIMEOUTS.COMMAND,
          { label: 'Daemon stop' }
        );
      } catch {
        // Continue with kill.
      }

      await invoke('stop_daemon');

      setTimeout(() => {
        resetAll();
      }, DAEMON_CONFIG.ANIMATIONS.STOP_DAEMON_DELAY);
    } catch {
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
