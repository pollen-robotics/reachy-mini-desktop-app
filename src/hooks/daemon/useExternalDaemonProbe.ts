import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { DAEMON_CONFIG, fetchWithTimeout } from '../../config/daemon';
import { useWindowVisible } from '../system/useWindowVisible';

/**
 * Probe the local network for a pre-existing ("external") Reachy daemon on
 * localhost:8000 that this app did *not* spawn itself.
 *
 * Why this is tricky:
 * 1. Rust owns the sidecar process, so a plain HTTP probe cannot tell whether
 *    the daemon answering the request is ours or someone else's.
 * 2. After `stop_daemon`, the sidecar's HTTP server can keep responding for
 *    ~1-3s until the process fully exits, which looks exactly like a genuine
 *    external daemon unless we add a grace window.
 * 3. `/api/daemon/status` can return states like `not_initialized` where the
 *    HTTP server is up but the daemon cannot actually talk to the robot.
 * 4. Any other service on port 8000 would also answer 200; we must confirm
 *    it's *really* a Reachy daemon before proposing the shortcut.
 *
 * Strategy (three validation layers):
 *   A. Rust ownership gate: `invoke('get_daemon_status')` tells us whether WE
 *      currently own a daemon. If status is Starting/Running/Stopping, the
 *      process responding on :8000 is almost certainly ours, so we bail out.
 *      We also track `lastOwnedAt` to enforce a post-shutdown grace window.
 *   B. HTTP status probe: must return 200 AND `state` in {running, ready}.
 *      `not_initialized` and `started` are explicitly rejected because the
 *      daemon is not yet usable for robot communication.
 *   C. Reachy-shape probe: GET `/api/state/full`. A generic HTTP server on
 *      port 8000 would 404 here; a Reachy daemon responds with JSON. This
 *      catches the case where some unrelated service happens to mimic the
 *      daemon-status endpoint.
 *
 * Hysteresis:
 *   - Going UP (unavailable -> available) requires N consecutive full-stack
 *     successes (default 2) to absorb transient flaps.
 *   - Going DOWN (available -> unavailable) is immediate on any failure.
 *
 * Lifecycle:
 *   - Paused when the window is hidden (saves battery, avoids stale data).
 *   - Resets counters on visibility resume so we re-confirm from scratch.
 *   - Exposes a synchronous `probe()` for connect-time revalidation.
 */

type RustDaemonStatus = 'Idle' | 'Starting' | 'Running' | 'Stopping' | 'Crashed' | (string & {});

interface RustStatusPayload {
  status: RustDaemonStatus;
  connectionMode: string | null;
}

interface DaemonStatusBody {
  state?: string;
}

const USABLE_EXTERNAL_STATES = new Set(['running', 'ready']);
const OWNED_RUST_STATES = new Set<RustDaemonStatus>(['Starting', 'Running', 'Stopping']);

export interface UseExternalDaemonProbeOptions {
  /**
   * When false, polling stops and the hook reports `unavailable`. Use to gate
   * detection while the app is busy connecting/disconnecting so we don't
   * flicker the "Connect" banner during transitions.
   */
  enabled: boolean;
}

export interface UseExternalDaemonProbeResult {
  /** True only after {@link REQUIRED_CONSECUTIVE} successful full-stack probes. */
  available: boolean;
  /**
   * Run the full probe pipeline once, synchronously, and return the result.
   * Intended for connect-time revalidation right before invoking
   * `connect(EXTERNAL)` so we don't hand off to a daemon that just died.
   */
  probe: () => Promise<boolean>;
}

async function probeRustOwnership(): Promise<RustStatusPayload | null> {
  try {
    const payload = (await invoke('get_daemon_status')) as RustStatusPayload;
    return payload ?? null;
  } catch {
    return null;
  }
}

async function probeDaemonStatusEndpoint(timeoutMs: number): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(
      'http://localhost:8000/api/daemon/status',
      {},
      timeoutMs,
      { silent: true }
    );
    if (!response.ok) return false;
    const data = (await response.json()) as DaemonStatusBody | null;
    return Boolean(data && data.state && USABLE_EXTERNAL_STATES.has(data.state));
  } catch {
    return false;
  }
}

async function probeReachyShape(timeoutMs: number): Promise<boolean> {
  try {
    const response = await fetchWithTimeout('http://localhost:8000/api/state/full', {}, timeoutMs, {
      silent: true,
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function useExternalDaemonProbe({
  enabled,
}: UseExternalDaemonProbeOptions): UseExternalDaemonProbeResult {
  const [available, setAvailable] = useState<boolean>(false);

  // Timestamp (ms) of the last moment we saw OUR own daemon in a non-idle
  // state. Used to suppress detection during the post-shutdown grace window.
  const lastOwnedAtRef = useRef<number>(0);
  // Consecutive successful probes counter (for up-hysteresis).
  const successStreakRef = useRef<number>(0);

  const isVisible = useWindowVisible(() => {
    // On resume, start from a clean slate so we re-validate before showing
    // the banner. Avoids trusting stale state from when the app was hidden.
    successStreakRef.current = 0;
    setAvailable(false);
  });

  const runSingleProbe = useCallback(async (): Promise<boolean> => {
    const { EXTERNAL_PROBE } = DAEMON_CONFIG;

    const rust = await probeRustOwnership();
    if (rust && OWNED_RUST_STATES.has(rust.status)) {
      // It's ours (actively running or shutting down). Not external.
      lastOwnedAtRef.current = Date.now();
      return false;
    }

    // Rust considers the sidecar gone, but the OS process may still be
    // tearing down. Respect a grace window to avoid labeling a zombie as
    // external right after the user clicks "disconnect".
    const sinceOwned = Date.now() - lastOwnedAtRef.current;
    if (lastOwnedAtRef.current > 0 && sinceOwned < EXTERNAL_PROBE.SHUTDOWN_GRACE_MS) {
      return false;
    }

    const statusOk = await probeDaemonStatusEndpoint(EXTERNAL_PROBE.HTTP_TIMEOUT);
    if (!statusOk) return false;

    const shapeOk = await probeReachyShape(EXTERNAL_PROBE.HTTP_TIMEOUT);
    if (!shapeOk) return false;

    return true;
  }, []);

  // Public probe() used for connect-time revalidation. Returns a definitive
  // boolean without touching the hysteresis counters.
  const probe = useCallback(async (): Promise<boolean> => {
    return runSingleProbe();
  }, [runSingleProbe]);

  // Polling loop.
  useEffect(() => {
    if (!enabled || !isVisible) {
      successStreakRef.current = 0;
      setAvailable(false);
      return;
    }

    let cancelled = false;

    const tick = async (): Promise<void> => {
      const ok = await runSingleProbe();
      if (cancelled) return;

      if (ok) {
        successStreakRef.current += 1;
        if (successStreakRef.current >= DAEMON_CONFIG.EXTERNAL_PROBE.REQUIRED_CONSECUTIVE) {
          setAvailable(true);
        }
      } else {
        // Fail-fast on any failure: drop the banner immediately.
        successStreakRef.current = 0;
        setAvailable(false);
      }
    };

    void tick();
    const interval = setInterval(() => {
      void tick();
    }, DAEMON_CONFIG.EXTERNAL_PROBE.POLL_INTERVAL);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [enabled, isVisible, runSingleProbe]);

  return { available, probe };
}
