import { useLogsStore } from '../../store/useLogsStore';
import useAppStore from '../../store/useAppStore';
import { LOG_LEVELS, LOG_EMOJIS, LOG_PREFIXES } from './constants';

/**
 * Helper to safely get logs store instance
 */
const getLogsStore = () => {
  try {
    return useLogsStore.getState();
  } catch (e) {
    // Fallback for cases where store might not be initialized
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Logger] Logs store not available:', e);
    }
    return null;
  }
};

/**
 * Helper to add log (synchronous for main window, async fallback for secondary windows)
 * In main window: adds directly to store (synchronous)
 * In secondary windows: emits event to main window (async, but we don't wait)
 */
const addLog = (message, level = LOG_LEVELS.INFO) => {
  // Main window: add directly to logs store (synchronous, fast path)
  const logsStore = getLogsStore();
  if (logsStore?.addFrontendLog) {
    logsStore.addFrontendLog(message, level);
    return;
  }
  
  // Fallback: try async window detection (for secondary windows or if store not available)
  // We don't await this to keep functions synchronous
  (async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const { emit } = await import('@tauri-apps/api/event');
      const currentWindow = await getCurrentWindow();
      if (currentWindow.label !== 'main') {
        await emit('add-log', { message, level });
      }
    } catch (error) {
      // Silently fail - logs are not critical
    }
  })();
};

/**
 * Static logging functions for use outside React components
 * 
 * These functions can be used in utility files, event handlers, etc.
 * where React hooks are not available.
 * 
 * @example
 * ```javascript
 * import { logSuccess, logError } from '@/utils/logging';
 * 
 * async function fetchData() {
 *   try {
 *     const data = await fetch('/api/data');
 *     logSuccess('Data fetched successfully');
 *     return data;
 *   } catch (error) {
 *     logError('Failed to fetch data', error.message);
 *   }
 * }
 * ```
 */

/**
 * Log an info message
 */
export const logInfo = (message, context = {}) => {
  addLog(message, LOG_LEVELS.INFO);
};

/**
 * Log a success message
 */
export const logSuccess = (message, context = {}) => {
  if (process.env.NODE_ENV === 'development') {
    console.log('[logSuccess] Adding log:', message);
  }
  addLog(message, LOG_LEVELS.SUCCESS);
};

/**
 * Log a warning message
 */
export const logWarning = (message, context = {}) => {
  addLog(message, LOG_LEVELS.WARNING);
};

/**
 * Log an error message
 */
export const logError = (message, context = {}) => {
  addLog(message, LOG_LEVELS.ERROR);
};

/**
 * Log an API call
 */
export const logApiCall = (method, endpoint, success, details = '') => {
  const message = details 
    ? `${method} ${endpoint}: ${details}`
    : `${method} ${endpoint}`;
  addLog(message, success ? LOG_LEVELS.SUCCESS : LOG_LEVELS.ERROR);
};

/**
 * Log a daemon message
 */
export const logDaemon = (message, level = LOG_LEVELS.INFO) => {
  const formattedMessage = `${LOG_PREFIXES.DAEMON} ${message}`;
  addLog(formattedMessage, level);
};

/**
 * Log an app message (uses addAppLog)
 */
export const logApp = (appName, message, level = LOG_LEVELS.INFO) => {
  const appStore = useAppStore.getState();
  if (appStore?.addAppLog) {
    appStore.addAppLog(message, appName, level);
  }
};

/**
 * Log a user action
 */
export const logUserAction = (action, details = '') => {
  const message = details 
    ? `${action}: ${details}`
    : action;
  addLog(message, LOG_LEVELS.INFO);
};

/**
 * Log a permission-related message
 */
export const logPermission = (message) => {
  addLog(message, LOG_LEVELS.WARNING);
};

/**
 * Log a timeout message
 */
export const logTimeout = (message) => {
  addLog(message, LOG_LEVELS.WARNING);
};

