/**
 * Centralized configuration for timeouts and daemon management.
 */

import { logApiCall, logPermission, logTimeout, logError, logSuccess } from '../utils/logging';
import { LOG_LIMITS } from '../utils/logging/constants';
import { useStore } from '../store';

// `tauriFetch` is intentionally NOT used here - it has a known bug where the
// body stream never completes (see
// https://github.com/tauri-apps/plugins-workspace/issues/2638). We use the
// browser `fetch` and rely on a local Rust proxy for remote hosts in WiFi mode.

export const DAEMON_CONFIG = {
  TIMEOUTS: {
    HEALTHCHECK: 2000,
    HEALTHCHECK_WIFI: 3500,
    STATE_FULL: 10000,
    COMMAND: 10000,
    STARTUP_CHECK: 3000,
    VERSION: 3000,
    EMOTIONS_CHECK: 3000,
    APPS_LIST: 5000,
    APP_INSTALL: 60000,
    APP_REMOVE: 90000,
    APP_START: 120000,
    APP_STOP: 30000,
    JOB_STATUS: 120000,
    PERMISSION_POPUP_WAIT: 30000,
  },

  // Polling intervals (in milliseconds).
  // Note: Robot state is now streamed via WebSocket (useRobotStateWebSocket) at 20Hz.
  INTERVALS: {
    HEALTHCHECK_POLLING: 3000,
    HEALTHCHECK_POLLING_WIFI: 5000,
    LOGS_FETCH: 1000,
    USB_CHECK: 3000,
    DISCOVERY_SCAN: 10000,
    VERSION_FETCH: 10000,
    APP_STATUS: 2000,
    JOB_POLLING: 500,
    CURRENT_APP_REFRESH: 300,
  },

  CRASH_DETECTION: {
    MAX_TIMEOUTS: 4,
    STARTUP_MAX_ATTEMPTS: 15,
    STARTUP_RETRY_DELAY: 1000,
    JOB_MAX_FAILS: 20,
    JOB_CLEANUP_DELAY: 10000,
  },

  STARTUP: {
    TIMEOUT_NORMAL: 90000,
    TIMEOUT_SIMULATION: 90000,
    // First-run Python bootstrap (uv download, Python install, venv creation,
    // codesigning, GStreamer registry scan, import warmup) can legitimately
    // take several minutes. While the sidecar emits `[bootstrap]` lines we
    // switch to this larger cap to avoid false-positive startup timeouts.
    TIMEOUT_BOOTSTRAP: 600000,
    ACTIVITY_RESET_DELAY: 15000,
  },

  // Re-exports the canonical caps from `utils/logging/constants.LOG_LIMITS` so
  // callers that already depend on `DAEMON_CONFIG` don't have to reach into the
  // logging package. Never duplicate numbers here - update `LOG_LIMITS` instead.
  LOGS: {
    MAX_FRONTEND: LOG_LIMITS.FRONTEND,
    MAX_APP: LOG_LIMITS.APP,
    MAX_DISPLAY: LOG_LIMITS.DISPLAY,
  },

  ANIMATIONS: {
    MODEL_LOAD_TIME: 1000,
    SCAN_DURATION: 3500,
    SCAN_INTERNAL_DELAYS: 250,
    SCAN_COMPLETE_PAUSE: 600,
    SLEEP_DURATION: 4000,
    STARTUP_MIN_DELAY: 2000,
    SPINNER_RENDER_DELAY: 100,
    BUTTON_SPINNER_DELAY: 500,
    STOP_DAEMON_DELAY: 2000,
  },

  MIN_DISPLAY_TIMES: {
    UPDATE_CHECK: 2000,
    USB_CHECK: 2000,
    USB_CHECK_FIRST: 1500,
    APP_UNINSTALL: 4000,
  },

  UPDATE_CHECK: {
    INTERVAL: 3600000,
    STARTUP_DELAY: 500,
    RETRY_DELAY: 1000,
    CHECK_TIMEOUT: 30000,
  },

  MOVEMENT: {
    CONTINUOUS_MOVE_TIMEOUT: 1000,
    MOVEMENT_DETECTION_TIMEOUT: 800,
    COMMAND_LOCK_DURATION: 2000,
    RECORDED_MOVE_LOCK_DURATION: 5000,
    TOLERANCE_SMALL: 0.001,
    TOLERANCE_MEDIUM: 0.005,
    TOLERANCE_LARGE: 0.01,
  },

  APP_INSTALLATION: {
    RESULT_DISPLAY_DELAY: 3000,
    HANDLER_DELAY: 500,
    REFRESH_DELAY: 500,
  },

  // Detection of a pre-existing ("external") daemon running on localhost:8000.
  // Used by the connection screen to propose a one-click shortcut. The probe
  // has three validation layers (Rust ownership, HTTP status, robot endpoint)
  // to avoid false positives from zombie daemons or unrelated services.
  EXTERNAL_PROBE: {
    // Polling cadence while the window is visible.
    POLL_INTERVAL: 3000,
    // Per-HTTP-request timeout. Must stay comfortably under POLL_INTERVAL.
    HTTP_TIMEOUT: 1000,
    // Grace period after we last saw OUR own daemon in a non-stopped state.
    // Prevents treating a dying Tauri-spawned daemon as "external" during its
    // shutdown window (the process usually needs 1-3s to exit cleanly).
    SHUTDOWN_GRACE_MS: 5000,
    // Successful consecutive probes required before flipping to `available`.
    // Downgrades to `unavailable` are immediate (no hysteresis on the "gone" side).
    REQUIRED_CONSECUTIVE: 2,
  },

  // Hardware scan configuration (StartingView / StartupScanView).
  HARDWARE_SCAN: {
    CHECK_INTERVAL: 500,

    // Time-based limits (preferred over attempts: more reliable with request guards).
    DAEMON_TIMEOUT_SECONDS: 90,
    MOVEMENT_TIMEOUT_SECONDS: 15,
    // Legacy attempt-based fallbacks (kept for backwards compatibility).
    DAEMON_MAX_ATTEMPTS: 240,
    MOVEMENT_MAX_ATTEMPTS: 60,

    PROGRESS: {
      SCAN_START: 0,
      SCAN_END: 30,
      DAEMON_CONNECTING_END: 50,
      DAEMON_INITIALIZING_END: 70,
      MOVEMENT_DETECTING_END: 100,
    },

    // Different messages are shown based on elapsed time (in seconds).
    MESSAGE_THRESHOLDS: {
      NORMAL: 0,
      FIRST_LAUNCH: 10,
      TAKING_TIME: 25,
      LONG_WAIT: 40,
      VERY_LONG: 55,
    },
  },

  ENDPOINTS: {
    // BASE_URL is now dynamic - prefer getBaseUrl() over reading these constants directly.
    BASE_URL_LOCAL: 'http://localhost:8000',
    BASE_URL_DEFAULT_WIFI: 'http://reachy-mini.home:8000',
    STATE_FULL: '/api/state/full',
    DAEMON_STATUS: '/api/daemon/status',
    DAEMON_START: '/api/daemon/start',
    DAEMON_STOP: '/api/daemon/stop',
    EMOTIONS_LIST:
      '/api/move/recorded-move-datasets/list/pollen-robotics/reachy-mini-emotions-library',
    VOLUME_CURRENT: '/api/volume/current',
    VOLUME_SET: '/api/volume/set',
    MICROPHONE_CURRENT: '/api/volume/microphone/current',
    MICROPHONE_SET: '/api/volume/microphone/set',
  },

  // Endpoints to NOT log (frequent calls).
  SILENT_ENDPOINTS: ['/api/state/full', '/api/daemon/status', '/api/apps/list-available/installed'],
} as const;

/**
 * Loose store-shaped type that lets `setAppStoreInstance` accept either the
 * Zustand `useAppStore` hook or a compatible object exposing `getState`.
 */
export interface AppStoreLike {
  getState: () => { isInstalling?: boolean };
}

let appStoreInstance: AppStoreLike | null = null;

export function setAppStoreInstance(store: AppStoreLike | null): void {
  appStoreInstance = store;
}

export interface FetchLogOptions {
  silent?: boolean;
  label?: string | null;
  fireAndForget?: boolean;
}

export interface PermissionDeniedError extends Error {
  name: 'PermissionDeniedError';
  originalError?: unknown;
}

export interface SystemPopupTimeoutError extends Error {
  name: 'SystemPopupTimeoutError';
  originalError?: unknown;
  duration?: number;
}

/** Detect if an error is related to denied permission (cross-platform). */
function isPermissionDeniedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { message?: string; name?: string };

  const errorMsg = err.message?.toLowerCase() || '';
  const errorName = err.name?.toLowerCase() || '';

  const permissionPatterns = [
    'permission denied',
    'access denied',
    'eacces',
    'eperm',
    'unauthorized',
    'forbidden',
    'user denied',
    'user cancelled',
    'operation not permitted',
  ];

  return permissionPatterns.some(
    pattern => errorMsg.includes(pattern) || errorName.includes(pattern)
  );
}

/** Detect if a timeout might be due to a system popup. */
function isLikelySystemPopupTimeout(error: unknown, duration: number, timeoutMs: number): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { name?: string };
  if (err.name !== 'TimeoutError') return false;

  // If the timeout arrives close to the limit it is most likely a popup that
  // blocked execution for almost the entire timeout window.
  const timeoutRatio = duration / timeoutMs;
  return timeoutRatio > 0.9;
}

/**
 * Helper to create a fetch with a timeout AND automatic logging.
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number,
  logOptions: FetchLogOptions = {}
): Promise<Response> {
  const { silent = false, label = null, fireAndForget = false } = logOptions;
  const { signal: externalSignal, ...forwardedOptions } = options;

  const currentBaseUrl = getBaseUrl();
  const endpoint = url
    .replace(currentBaseUrl, '')
    .replace(DAEMON_CONFIG.ENDPOINTS.BASE_URL_LOCAL, '');
  const baseEndpoint = endpoint.split('?')[0];

  const shouldBeSilent =
    silent || DAEMON_CONFIG.SILENT_ENDPOINTS.some(e => baseEndpoint.startsWith(e));

  const method = options.method || 'GET';
  const startTime = Date.now();

  // For fire-and-forget requests (e.g. continuous movement) we skip the abort
  // signal so a slow network does not cancel the request prematurely.
  let controller: AbortController | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  if (!fireAndForget) {
    controller = new AbortController();
    timeoutId = setTimeout(() => controller?.abort(), timeoutMs);

    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener('abort', () => controller?.abort());
      }
    }
  }

  try {
    const response = await fetch(url, {
      ...forwardedOptions,
      method,
      headers: options.headers,
      body: options.body,
      signal: controller?.signal || externalSignal,
    });

    if (timeoutId) clearTimeout(timeoutId);

    if (!shouldBeSilent) {
      if (label) {
        if (response.ok) {
          logSuccess(label);
        } else {
          logError(`${label} failed (${response.status})`);
        }
      } else {
        logApiCall(method, baseEndpoint, response.ok, response.ok ? '' : `(${response.status})`);
      }
    }

    return response;
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);
    const duration = Date.now() - startTime;
    const errObj = error as { name?: string; message?: string };

    if (!shouldBeSilent) {
      if (label) {
        if (errObj.name === 'AbortError') {
          logTimeout(`${label} (timeout)`);
        } else {
          logError(`${label} (${errObj.message || 'error'})`);
        }
      } else {
        if (errObj.name === 'AbortError') {
          logTimeout(`${method} ${baseEndpoint} (timeout)`);
        } else {
          logError(`${method} ${baseEndpoint} (${errObj.message || 'error'})`);
        }
      }
    }

    if (isPermissionDeniedError(error)) {
      const permissionError = new Error(
        'Permission denied by user or system'
      ) as PermissionDeniedError;
      permissionError.name = 'PermissionDeniedError';
      permissionError.originalError = error;

      if (!shouldBeSilent) {
        const logLabel = label || `${method} ${baseEndpoint}`;
        logPermission(`${logLabel} (permission denied)`);
      }

      throw permissionError;
    }

    if (isLikelySystemPopupTimeout(error, duration, timeoutMs)) {
      const popupError = new Error(
        'Request timed out - system permission popup may be waiting'
      ) as SystemPopupTimeoutError;
      popupError.name = 'SystemPopupTimeoutError';
      popupError.originalError = error;
      popupError.duration = duration;

      if (!shouldBeSilent) {
        const logLabel = label || `${method} ${baseEndpoint}`;
        logTimeout(`${logLabel} (timeout - check system permissions)`);
      }

      throw popupError;
    }

    if (!shouldBeSilent) {
      const errorMsg =
        errObj.name === 'AbortError' || errObj.name === 'TimeoutError'
          ? 'timeout'
          : (errObj.message ?? 'error');
      logApiCall(method, baseEndpoint, false, errorMsg);
    }

    throw error;
  }
}

/**
 * Get the current base URL based on connection mode.
 *
 * In all modes we currently target `http://localhost:8000`. In WiFi mode the
 * local Rust proxy forwards to the remote host. This avoids the
 * `tauriFetch` body stream bug by using native fetch everywhere.
 */
export function getBaseUrl(): string {
  return DAEMON_CONFIG.ENDPOINTS.BASE_URL_LOCAL;
}

/** Get WebSocket base URL based on connection mode. */
export function getWsBaseUrl(): string {
  const httpUrl = getBaseUrl();
  return httpUrl.replace('http://', 'ws://').replace('https://', 'wss://');
}

/** Check whether the app is currently in WiFi mode. */
export function isWiFiMode(): boolean {
  const { connectionMode } = useStore.getState();
  return connectionMode === 'wifi';
}

/** Build a full API URL (dynamic based on connection mode). */
export function buildApiUrl(endpoint: string): string {
  const baseUrl = getBaseUrl();
  return `${baseUrl}${endpoint}`;
}

/**
 * Get daemon hostname only (without protocol or port).
 * Used for remapping app URLs to the correct robot host.
 */
export function getDaemonHostname(): string {
  const { connectionMode, remoteHost } = useStore.getState();

  if (connectionMode === 'wifi' && remoteHost) {
    const cleanHost = remoteHost.replace(/^https?:\/\//, '');
    return cleanHost.replace(/:8000$/, '');
  }

  return 'localhost';
}

/** Helper to check if installation is in progress (skip API calls during install). */
export function isInstalling(): boolean {
  if (!appStoreInstance) return false;
  return Boolean(appStoreInstance.getState().isInstalling);
}

export interface SkippedError extends Error {
  name: 'SkippedError';
}

/**
 * Wrapper for `fetchWithTimeout` that throws `SkippedError` when an
 * installation is in progress.
 */
export async function fetchWithTimeoutSkipInstall(
  url: string,
  options: RequestInit = {},
  timeoutMs: number,
  logOptions: FetchLogOptions = {}
): Promise<Response> {
  if (isInstalling()) {
    const skipError = new Error('Skipped during installation') as SkippedError;
    skipError.name = 'SkippedError';
    throw skipError;
  }
  return fetchWithTimeout(url, options, timeoutMs, logOptions);
}

/** Alias for `fetchWithTimeout` for external URLs (non-daemon endpoints). */
export async function fetchExternal(
  url: string,
  options: RequestInit = {},
  timeoutMs: number,
  logOptions: FetchLogOptions = {}
): Promise<Response> {
  return fetchWithTimeout(url, options, timeoutMs, logOptions);
}
