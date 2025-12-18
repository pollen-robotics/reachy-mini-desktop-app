/**
 * Centralized configuration for timeouts and daemon management
 */

import { logApiCall, logPermission, logTimeout, logError, logSuccess } from '../utils/logging';
import { useRobotStore } from '../store/useRobotStore';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

export const DAEMON_CONFIG = {
  // API timeouts (in milliseconds)
  TIMEOUTS: {
    HEALTHCHECK: 1333,      // Ping every ~1.33s to detect crash in 4s (3 timeouts)
    STATE_FULL: 5000,       // Read full state with all motors
    COMMAND: 10000,         // Movement commands (can be long)
    STARTUP_CHECK: 2000,    // Per startup attempt
    VERSION: 3000,          // Daemon info (lightweight endpoint)
    EMOTIONS_CHECK: 3000,   // Emotions library check
    APPS_LIST: 5000,        // Available apps list
    APP_INSTALL: 60000,     // Launch installation (increased for system popups)
    APP_REMOVE: 90000,      // Uninstall app (increased for system popups)
    APP_START: 120000,      // Start app (2 minutes)
    APP_STOP: 30000,        // Stop app
    JOB_STATUS: 120000,     // Poll job status (long installations)
    PERMISSION_POPUP_WAIT: 30000, // Max wait for system popup (macOS/Windows)
  },
  
  // Polling intervals (in milliseconds)
  INTERVALS: {
    // ✅ STATUS_CHECK removed - useRobotState handles status checking via polling (every 500ms)
    LOGS_FETCH: 1000,         // Logs every 1s
    USB_CHECK: 1000,          // USB every 1s
    VERSION_FETCH: 10000,     // Version every 10s
    ROBOT_STATE: 500,         // ✅ OPTIMIZED: Robot state (position, motors) every 500ms (was 300ms) to reduce re-renders
    APP_STATUS: 2000,         // Current app status every 2s
    JOB_POLLING: 500,         // Poll job install/remove every 500ms
    CURRENT_APP_REFRESH: 300, // Delay before refresh after stop app
  },
  
  // Crash detection
  CRASH_DETECTION: {
    MAX_TIMEOUTS: 3,           // Crash after 3 timeouts over 4 seconds (~1.33s × 3)
    STARTUP_MAX_ATTEMPTS: 15,  // 15 attempts of 1s = 15s max on startup
    STARTUP_RETRY_DELAY: 1000, // Wait 1s between each attempt
    JOB_MAX_FAILS: 20,         // 20 polling failures = job failed
    JOB_CLEANUP_DELAY: 10000,  // 10s before cleaning up a failed job
  },
  
  // Startup timeouts (in milliseconds)
  STARTUP: {
    TIMEOUT_NORMAL: 30000,     // 30s for normal mode (robot connected)
    TIMEOUT_SIMULATION: 180000, // 3 minutes for simulation mode (MuJoCo install can take time)
    ACTIVITY_RESET_DELAY: 15000, // Reset timeout when we see activity (logs from sidecar)
  },
  
  // Log management
  LOGS: {
    MAX_FRONTEND: 500,   // Max frontend logs (user actions, API calls) - increased for better history
    MAX_APP: 1000,       // Max app logs (more verbose than frontend) - increased for better history
    MAX_DISPLAY: 10000,  // Max logs to keep in memory (virtualization handles rendering efficiently)
  },
  
  // Animation/transition durations
  ANIMATIONS: {
    MODEL_LOAD_TIME: 1000,       // ⚡ 3D model loading time (margin)
    SCAN_DURATION: 3000,         // 3D mesh scan duration
    SCAN_INTERNAL_DELAYS: 250,   // X-ray return delay for last mesh
    SCAN_COMPLETE_PAUSE: 600,    // ⚡ Pause to SEE scan success before transition
    SLEEP_DURATION: 4000,        // goto_sleep duration before kill
    STARTUP_MIN_DELAY: 2000,     // Delay before first check on startup
    SPINNER_RENDER_DELAY: 100,   // Delay to render spinner before starting daemon
    BUTTON_SPINNER_DELAY: 500,   // Delay to see spinner in button before view switch
    STOP_DAEMON_DELAY: 2000,     // Delay after stopping daemon before resetting state
  },
  
  // Minimum display times for views (UX smoothness)
  MIN_DISPLAY_TIMES: {
    UPDATE_CHECK: 2000,          // Minimum time to show update check (2s)
    USB_CHECK: 2000,              // Minimum time to show USB check (2s)
    USB_CHECK_FIRST: 1500,        // Minimum delay for first USB check (1.5s)
    APP_UNINSTALL: 4000,         // Minimum display time for uninstall result (4s)
  },
  
  // Update check intervals
  UPDATE_CHECK: {
    INTERVAL: 3600000,            // Check for updates every hour (1h)
    STARTUP_DELAY: 2000,          // Delay before first check on startup (2s)
    RETRY_DELAY: 1000,            // Delay between retry attempts (1s)
    CHECK_TIMEOUT: 30000,         // Timeout for check() call (30s) - prevents infinite blocking
  },
  
  // Robot movement and commands
  MOVEMENT: {
    CONTINUOUS_MOVE_TIMEOUT: 1000, // Timeout for continuous move requests (1s - needs to be long for WiFi)
    MOVEMENT_DETECTION_TIMEOUT: 800, // Timeout to detect if robot is moving (800ms)
    COMMAND_LOCK_DURATION: 2000,   // Default lock duration for commands (2s)
    RECORDED_MOVE_LOCK_DURATION: 5000, // Lock duration for recorded moves (5s)
    // Tolerance values for movement detection
    TOLERANCE_SMALL: 0.001,  // For precise detection (HardwareScanView)
    TOLERANCE_MEDIUM: 0.005, // For array comparisons (arraysEqual default)
    TOLERANCE_LARGE: 0.01,   // For movement filtering (useRobotPowerState)
  },
  
  // App installation delays
  APP_INSTALLATION: {
    RESULT_DISPLAY_DELAY: 3000,   // Delay after showing success state before closing (3s)
    HANDLER_DELAY: 500,            // Small delay in app handlers (500ms)
    REFRESH_DELAY: 500,            // Delay before refreshing app list (500ms)
  },
  
  // Hardware scan configuration (StartingView / HardwareScanView)
  HARDWARE_SCAN: {
    // Polling configuration
    CHECK_INTERVAL: 500,           // Check every 500ms
    
    // Timeouts (in attempts, multiply by CHECK_INTERVAL for ms)
    DAEMON_MAX_ATTEMPTS: 240,      // 240 × 500ms = 120s max wait for daemon
    MOVEMENT_MAX_ATTEMPTS: 60,     // 60 × 500ms = 30s max wait for movements
    
    // Progress bar distribution (percentages)
    PROGRESS: {
      SCAN_START: 0,               // 3D scan starts at 0%
      SCAN_END: 30,                // 3D scan ends at 30% (fast phase)
      DAEMON_CONNECTING_END: 50,   // Daemon connecting ends at 50%
      DAEMON_INITIALIZING_END: 70, // Daemon initializing ends at 70%
      MOVEMENT_DETECTING_END: 100, // Movement detection ends at 100%
    },
    
    // Message thresholds (in seconds) - show different messages based on elapsed time
    MESSAGE_THRESHOLDS: {
      NORMAL: 0,                   // 0-10s: Normal messages
      FIRST_LAUNCH: 10,            // 10-25s: "First launch may take longer..."
      TAKING_TIME: 25,             // 25-40s: "Installing dependencies..."
      LONG_WAIT: 40,               // 40-55s: "Almost there..."
      VERY_LONG: 55,               // 55s+: "If this persists, check connection..."
    },
  },
  
  // API endpoints
  ENDPOINTS: {
    // ⚠️ BASE_URL is now dynamic - use getBaseUrl() instead of DAEMON_CONFIG.ENDPOINTS.BASE_URL
    BASE_URL_LOCAL: 'http://localhost:8000',
    BASE_URL_DEFAULT_WIFI: 'http://reachy-mini.home:8000',
    STATE_FULL: '/api/state/full',
    DAEMON_STATUS: '/api/daemon/status',
    // 🌐 WiFi daemon control (handshake for remote sessions)
    DAEMON_START: '/api/daemon/start',
    DAEMON_STOP: '/api/daemon/stop',
    EMOTIONS_LIST: '/api/move/recorded-move-datasets/list/pollen-robotics/reachy-mini-emotions-library',
    VOLUME_CURRENT: '/api/volume/current',
    VOLUME_SET: '/api/volume/set',
    MICROPHONE_CURRENT: '/api/volume/microphone/current',
    MICROPHONE_SET: '/api/volume/microphone/set',
  },
  
  // Endpoints to NOT log (frequent polling)
  SILENT_ENDPOINTS: [
    '/api/state/full',      // Poll every 3s
    '/api/daemon/status',   // Poll every 10s
    '/api/apps/list-available/installed', // Called frequently when fetching apps
  ],
};

/**
 * Store instance (lazy loaded to avoid circular dependency)
 */
let appStoreInstance = null;
export function setAppStoreInstance(store) {
  appStoreInstance = store;
}

/**
 * Helper to create a fetch with timeout AND automatic logging
 * @param {string} url - Full URL
 * @param {object} options - Fetch options (method, body, etc.)
 * @param {number} timeoutMs - Timeout in ms
 * @param {object} logOptions - Logging options
 * @param {boolean} logOptions.silent - Don't log this call (for polling)
 * @param {string} logOptions.label - Custom label for log
 */
/**
 * Detects if an error is related to denied permission (cross-platform)
 */
function isPermissionDeniedError(error) {
  if (!error) return false;
  
  const errorMsg = error.message?.toLowerCase() || '';
  const errorName = error.name?.toLowerCase() || '';
  
  // Common patterns for denied permissions
  const permissionPatterns = [
    'permission denied',
    'access denied',
    'eacces', // macOS/Linux permission error code
    'eperm',  // Permission error code
    'unauthorized',
    'forbidden',
    'user denied',
    'user cancelled',
    'operation not permitted',
  ];
  
  return permissionPatterns.some(pattern => 
    errorMsg.includes(pattern) || errorName.includes(pattern)
  );
}

/**
 * Detects if a timeout might be due to a system popup
 */
function isLikelySystemPopupTimeout(error, duration, timeoutMs) {
  if (error?.name !== 'TimeoutError') return false;
  
  // If timeout arrives very close to the limit, it's probably a popup
  // that blocked execution for almost the entire timeout
  const timeoutRatio = duration / timeoutMs;
  return timeoutRatio > 0.9; // 90% of timeout elapsed
}

export async function fetchWithTimeout(url, options = {}, timeoutMs, logOptions = {}) {
  const { silent = false, label = null, fireAndForget = false } = logOptions;
  
  // Extract endpoint from URL (handle both local and remote URLs)
  const currentBaseUrl = getBaseUrl();
  const endpoint = url.replace(currentBaseUrl, '').replace(DAEMON_CONFIG.ENDPOINTS.BASE_URL_LOCAL, '');
  const baseEndpoint = endpoint.split('?')[0]; // Without query params
  
  // Check if it's a silent endpoint
  const shouldBeSilent = silent || DAEMON_CONFIG.SILENT_ENDPOINTS.some(e => baseEndpoint.startsWith(e));
  
  const method = options.method || 'GET';
  const startTime = Date.now();
  
  // 🔧 UNIFIED: Always use tauriFetch for ALL requests
  // tauriFetch from @tauri-apps/plugin-http:
  // - ✅ Supports body JSON (via standard Request API)
  // - ✅ Supports AbortController.signal (calls fetch_cancel on abort)
  // - ✅ Bypasses WebView restrictions (CORS, PNA) for remote/WiFi
  // - ✅ Works for localhost, remote IPs, and HTTPS
  
  // For fire-and-forget requests (like continuous movement), don't use abort signal
  // This prevents premature cancellation on slow networks (WiFi)
  let controller = null;
  let timeoutId = null;
  
  if (!fireAndForget) {
    // Create AbortController for timeout + external signal combination
    controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    // Combine external signal with timeout signal if provided
    if (options.signal) {
      const externalSignal = options.signal;
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener('abort', () => controller.abort());
      }
    }
  }
  
  try {
    const response = await tauriFetch(url, {
      method: options.method || 'GET',
      headers: options.headers,
      body: options.body,
      signal: controller?.signal,
      connectTimeout: timeoutMs,
    });
    
    if (timeoutId) clearTimeout(timeoutId);
    const duration = Date.now() - startTime;
    
    // Log result if not silent
    if (!shouldBeSilent) {
      if (label) {
        // Use custom label for better user experience
        // Always log, even if response is not ok (to show user what happened)
        if (response.ok) {
          logSuccess(label);
        } else {
          logError(`${label} failed (${response.status})`);
        }
      } else {
        // Use standard API call logging
      logApiCall(method, baseEndpoint, response.ok, response.ok ? '' : `(${response.status})`);
      }
    }
    
    return response;
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);
    const duration = Date.now() - startTime;
    
    // Log error if not silent
    if (!shouldBeSilent) {
      if (label) {
        // Use custom label for error
        if (error.name === 'AbortError') {
          logTimeout(`${label} (timeout)`);
        } else {
          logError(`${label} (${error.message || 'error'})`);
        }
      } else {
        // Use standard error logging
        if (error.name === 'AbortError') {
          logTimeout(`${method} ${baseEndpoint} (timeout)`);
        } else {
          logError(`${method} ${baseEndpoint} (${error.message || 'error'})`);
        }
      }
    }
    
    // Detect permission errors
    if (isPermissionDeniedError(error)) {
      const permissionError = new Error('Permission denied by user or system');
      permissionError.name = 'PermissionDeniedError';
      permissionError.originalError = error;
      
      if (!shouldBeSilent) {
        const logLabel = label || `${method} ${baseEndpoint}`;
        logPermission(`${logLabel} (permission denied)`);
      }
      
      throw permissionError;
    }
    
    // Detect timeouts potentially due to system popups
    if (isLikelySystemPopupTimeout(error, duration, timeoutMs)) {
      const popupError = new Error('Request timed out - system permission popup may be waiting');
      popupError.name = 'SystemPopupTimeoutError';
      popupError.originalError = error;
      popupError.duration = duration;
      
      if (!shouldBeSilent) {
        const logLabel = label || `${method} ${baseEndpoint}`;
        logTimeout(`${logLabel} (timeout - check system permissions)`);
      }
      
      throw popupError;
    }
    
    // Log standard error if not silent
    if (!shouldBeSilent) {
      const logLabel = label || `${method} ${baseEndpoint}`;
      const errorMsg = error.name === 'AbortError' || error.name === 'TimeoutError' 
        ? 'timeout' 
        : error.message;
      logApiCall(method, baseEndpoint, false, errorMsg);
    }
    
    throw error;
  }
}

/**
 * 🌐 Get the current base URL based on connection mode
 * - WiFi mode: uses remoteHost from store (e.g. 'http://reachy-mini.home:8000')
 * - USB/Simulation: uses localhost
 */
export function getBaseUrl() {
  const { connectionMode, remoteHost } = useRobotStore.getState();
  
  if (connectionMode === 'wifi' && remoteHost) {
    // Ensure proper URL format
    const host = remoteHost.includes('://') ? remoteHost : `http://${remoteHost}`;
    return host.endsWith(':8000') ? host : `${host}:8000`;
  }
  
  // Default: local daemon (USB or simulation)
  return DAEMON_CONFIG.ENDPOINTS.BASE_URL_LOCAL;
}

/**
 * 🌐 Get WebSocket base URL based on connection mode
 */
export function getWsBaseUrl() {
  const httpUrl = getBaseUrl();
  return httpUrl.replace('http://', 'ws://').replace('https://', 'wss://');
}

/**
 * 🌐 Check if currently in WiFi mode
 * @returns {boolean} True if connected via WiFi
 */
export function isWiFiMode() {
  const { connectionMode } = useRobotStore.getState();
  return connectionMode === 'wifi';
}

/**
 * Helper to build full API URL (now dynamic based on connection mode)
 */
export function buildApiUrl(endpoint) {
  const baseUrl = getBaseUrl();
  const fullUrl = `${baseUrl}${endpoint}`;
  
  // 🔍 DEBUG: Log URL generation for debugging connection mode issues
  if (endpoint.includes('set_target') || endpoint.includes('daemon')) {
    const { connectionMode, remoteHost } = useRobotStore.getState();
    console.log(`🔗 [buildApiUrl] mode=${connectionMode}, host=${remoteHost}, url=${fullUrl}`);
  }
  
  return fullUrl;
}

/**
 * 🌐 Get daemon hostname only (without protocol or port)
 * Used for remapping app URLs to the correct robot host
 * @returns {string} Hostname like 'localhost', 'reachy-mini.home', or '192.168.1.18'
 */
export function getDaemonHostname() {
  const { connectionMode, remoteHost } = useRobotStore.getState();
  
  if (connectionMode === 'wifi' && remoteHost) {
    // Strip protocol if present
    const cleanHost = remoteHost.replace(/^https?:\/\//, '');
    // Strip port if present
    return cleanHost.replace(/:8000$/, '');
  }
  
  // Default: localhost
  return 'localhost';
}

/**
 * Helper to check if installation is in progress (skip API calls during install)
 * @returns {boolean} True if installation is in progress
 */
export function isInstalling() {
  if (!appStoreInstance) return false;
  return appStoreInstance.getState().isInstalling;
}

/**
 * Check if device is online
 * @returns {boolean} True if online, false if offline
 */
export function isOnline() {
  if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
    return navigator.onLine;
  }
  // Default to online if navigator not available
  return true;
}

/**
 * Helper wrapper for fetchWithTimeout that skips during installation
 * @param {string} url - Full URL
 * @param {object} options - Fetch options
 * @param {number} timeoutMs - Timeout in ms
 * @param {object} logOptions - Logging options
 * @returns {Promise<Response>} Fetch response or throws error
 */
export async function fetchWithTimeoutSkipInstall(url, options = {}, timeoutMs, logOptions = {}) {
  if (isInstalling()) {
    const skipError = new Error('Skipped during installation');
    skipError.name = 'SkippedError';
    throw skipError;
  }
  return fetchWithTimeout(url, options, timeoutMs, logOptions);
}

/**
 * Alias for fetchWithTimeout for external URLs (non-daemon endpoints)
 * @param {string} url - Full external URL
 * @param {object} options - Fetch options
 * @param {number} timeoutMs - Timeout in ms
 * @param {object} logOptions - Logging options
 * @returns {Promise<Response>} Fetch response or throws error
 */
export async function fetchExternal(url, options = {}, timeoutMs, logOptions = {}) {
  return fetchWithTimeout(url, options, timeoutMs, logOptions);
}


