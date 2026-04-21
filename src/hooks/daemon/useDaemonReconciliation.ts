import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import useAppStore from '../../store/useAppStore';
import { ROBOT_STATUS, buildDerivedState } from '../../constants/robotStatus';
import { enableSimulationMode } from '../../utils/simulationMode';
import type { ConnectionMode } from '../../types/robot';

/**
 * Shape of the Rust-side `get_daemon_status` command response.
 * Status values mirror the Rust enum (`Running | Stopped | Error | ...`).
 */
interface DaemonStatusResult {
  status: string;
  connectionMode?: ConnectionMode | null;
}

/**
 * Reconciles JS store state with the Rust daemon on mount.
 *
 * Covers two scenarios:
 * 1. HMR in dev: Vite hot-reloads JS, store may have been recreated,
 *    but import.meta.hot already handles most of this. This hook acts
 *    as a safety net when the HMR data is lost (e.g. full page reload
 *    during dev, or the changed file is useStore.js itself with a
 *    syntax error that breaks the HMR chain).
 * 2. Production webview restart: the Tauri webview can be destroyed
 *    and recreated while the Rust process (and its sidecar) keeps
 *    running. Without reconciliation the user sees the connection
 *    screen even though the daemon is alive.
 *
 * How it works:
 * - On mount, call `get_daemon_status` (Rust command).
 * - If daemon status is "Running" AND JS store says "disconnected",
 *   restore connectionMode + robotStatus so the view router jumps
 *   directly to StartupScanView (which will sync WebSocket data
 *   and then transition to the active view).
 */
export function useDaemonReconciliation(): void {
  const hasRun = useRef<boolean>(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const reconcile = async (): Promise<void> => {
      const { robotStatus, connectionMode } = useAppStore.getState();

      // Only reconcile when the JS store thinks we're disconnected
      if (robotStatus !== ROBOT_STATUS.DISCONNECTED || connectionMode !== null) {
        return;
      }

      try {
        const result = (await invoke('get_daemon_status')) as DaemonStatusResult;
        const { status, connectionMode: rustMode } = result;

        if (status !== 'Running' || !rustMode) {
          return;
        }

        // Restore simulation mode flag if needed
        if (rustMode === 'simulation') {
          enableSimulationMode();
        }

        // In WiFi mode the Rust-side local_proxy preserved the target host
        // across the webview reload. Recover it so features that read
        // `remoteHost` directly (daemon log stream, settings display) work
        // after reconciliation. Best-effort - if the command is missing the
        // user keeps a degraded-but-functional WiFi session.
        let restoredRemoteHost: string | null = null;
        if (rustMode === 'wifi') {
          try {
            const target = (await invoke('get_local_proxy_target')) as string | null;
            if (target) {
              restoredRemoteHost = target;
            }
          } catch {
            // Command not available or state empty - continue with null.
          }
        }

        // Restore the store to "starting" so the view router shows
        // StartupScanView, which handles WebSocket sync + WASM
        // passive_joints before transitioning to the active view.
        useAppStore.setState({
          connectionMode: rustMode,
          remoteHost: restoredRemoteHost,
          isUsbConnected: rustMode !== 'wifi',
          robotStatus: ROBOT_STATUS.STARTING,
          busyReason: null,
          ...buildDerivedState(ROBOT_STATUS.STARTING),
          hardwareError: null,
          startupError: null,
          consecutiveTimeouts: 0,
        });
      } catch {
        // Not in Tauri environment or command failed - nothing to do.
      }
    };

    reconcile();
  }, []);
}
