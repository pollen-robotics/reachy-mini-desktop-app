import { fetchWithTimeout } from '../config/daemon';

/**
 * Pre-flight validation for a WiFi target host, used before committing to the
 * full `startDaemon` sequence. Returns a definitive outcome so the caller can
 * decide whether to connect or surface a clear error instead of waiting out
 * the ~90s startup timeout when the address is wrong.
 *
 * Scope (minimal on purpose):
 *   - Confirm the host is reachable on port 8000.
 *   - Confirm SOMETHING Reachy-shaped is answering (a JSON body that exposes
 *     at least one of `state`, `status`, or `version`).
 *
 * Non-goals (intentional):
 *   - We do NOT probe `/api/state/full`. That endpoint only returns 200 once
 *     the daemon has finished initializing, so using it as a shape check would
 *     false-reject daemons in perfectly valid transitional states
 *     (`starting`, `not_initialized`, ...). Readiness is the job of the
 *     startup polling in `useDaemonLifecycle`, not of this pre-flight.
 *   - We do NOT whitelist specific state values. The daemon exposes a fluid
 *     set across versions; the only value we treat as a hard stop here is
 *     `state === 'error'`, which is a definitive "won't work" signal.
 */

const PROBE_TIMEOUT_MS = 2500;

interface DaemonStatusBody {
  state?: unknown;
  status?: unknown;
  version?: unknown;
}

function normalizeHost(host: string): string {
  const trimmed = host.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
  return trimmed.includes(':') ? trimmed : `${trimmed}:8000`;
}

export interface WifiProbeResult {
  ok: boolean;
  /** `null` on success. Otherwise a short code for the failure class. */
  reason: null | 'unreachable' | 'wrong_service' | 'daemon_error';
}

/**
 * Probe a remote host to confirm it's running a Reachy daemon. Short-timeout,
 * no retries: callers are expected to fail fast and let the user correct the
 * target. Bypasses the local_proxy on purpose - we want to validate the real
 * endpoint, not a cached proxy state.
 */
export async function probeWifiHost(host: string): Promise<WifiProbeResult> {
  const normalized = normalizeHost(host);
  const base = `http://${normalized}`;

  let statusBody: DaemonStatusBody | null = null;
  try {
    const response = await fetchWithTimeout(
      `${base}/api/daemon/status`,
      {},
      PROBE_TIMEOUT_MS,
      { silent: true }
    );
    if (!response.ok) {
      return { ok: false, reason: 'wrong_service' };
    }
    try {
      statusBody = (await response.json()) as DaemonStatusBody;
    } catch {
      // Non-JSON body on /api/daemon/status → definitely not a Reachy daemon.
      return { ok: false, reason: 'wrong_service' };
    }
  } catch {
    return { ok: false, reason: 'unreachable' };
  }

  if (!statusBody || typeof statusBody !== 'object') {
    return { ok: false, reason: 'wrong_service' };
  }

  // Shape gate: require at least one Reachy-typical field. Kept permissive on
  // purpose - the exact field name (`state` vs `status`) and the set of valid
  // state values drift across daemon versions, so we only bail if NONE of the
  // expected fields is present.
  const hasReachyShape =
    'state' in statusBody || 'status' in statusBody || 'version' in statusBody;
  if (!hasReachyShape) {
    return { ok: false, reason: 'wrong_service' };
  }

  // Only one value is a hard stop: an explicit error state reported by the
  // daemon itself. Everything else is a "maybe not ready yet" that the normal
  // startup polling will resolve.
  if (statusBody.state === 'error' || statusBody.status === 'error') {
    return { ok: false, reason: 'daemon_error' };
  }

  return { ok: true, reason: null };
}
