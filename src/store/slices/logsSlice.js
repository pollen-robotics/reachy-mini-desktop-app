/**
 * Logs Slice - Manages all types of logs (daemon, frontend, app)
 *
 * Two display modes:
 *   - "simple": user-facing actions only (errors, user actions, key events)
 *   - "dev":    everything with category/level filters and search
 *
 * Note: We don't import DAEMON_CONFIG here to avoid circular dependencies
 * (daemon.js imports useStore which imports slices).
 * We also avoid importing from utils/logging/constants for the same reason;
 * the canonical category list lives there, but we inline the values here.
 */

const MAX_FRONTEND_LOGS = 500;
const MAX_APP_LOGS = 1000;

const ALL_CATEGORIES = ['daemon', 'app', 'frontend'];

export const logsInitialState = {
  logs: [],
  frontendLogs: [],
  appLogs: [],

  logMode: 'simple',
  logSearch: '',
  logCategoryFilters: [...ALL_CATEGORIES],
};

/**
 * Create logs slice
 * @param {Function} set - Zustand set function
 * @param {Function} get - Zustand get function
 * @returns {Object} Logs slice state and actions
 */
export const createLogsSlice = (set, get) => ({
  ...logsInitialState,

  // Set daemon logs - store raw, filtering happens at display time
  setLogs: newLogs =>
    set(state => {
      if (
        state.logs === newLogs ||
        (Array.isArray(state.logs) &&
          Array.isArray(newLogs) &&
          state.logs.length === newLogs.length &&
          state.logs.length > 0 &&
          state.logs[state.logs.length - 1] === newLogs[newLogs.length - 1])
      ) {
        return state;
      }
      return { logs: newLogs };
    }),

  // Add frontend log with optional category
  addFrontendLog: (message, level = 'info', category = 'frontend') => {
    if (message == null) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[addFrontendLog] Received null/undefined message, skipping');
      }
      return;
    }

    const validLevels = ['info', 'success', 'warning', 'error'];
    const normalizedLevel = validLevels.includes(level) ? level : 'info';
    const sanitizedMessage = String(message).slice(0, 10000);

    try {
      const now = Date.now();
      let formattedTimestamp;
      try {
        formattedTimestamp = new Date(now).toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        });
      } catch (e) {
        formattedTimestamp = new Date(now).toISOString().substring(11, 19);
      }

      set(state => {
        const newLog = {
          timestamp: formattedTimestamp,
          timestampNumeric: now,
          message: sanitizedMessage,
          source: 'frontend',
          category: category || 'frontend',
          level: normalizedLevel,
        };

        const newFrontendLogs = [...state.frontendLogs.slice(-MAX_FRONTEND_LOGS), newLog];

        return { frontendLogs: newFrontendLogs };
      });
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[addFrontendLog] Error adding log:', error);
      }
    }
  },

  // Add app log
  addAppLog: (message, appName, level = 'info') => {
    if (message == null) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[addAppLog] Received null/undefined message, skipping');
      }
      return;
    }

    const sanitizedMessage = String(message).slice(0, 10000);
    const sanitizedAppName = appName ? String(appName).slice(0, 100) : undefined;
    const sanitizedLevel = ['info', 'warning', 'error'].includes(level) ? level : 'info';

    try {
      const now = Date.now();
      let formattedTimestamp;
      try {
        formattedTimestamp = new Date(now).toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        });
      } catch (e) {
        formattedTimestamp = new Date(now).toISOString().substring(11, 19);
      }

      const newLog = {
        timestamp: formattedTimestamp,
        timestampNumeric: now,
        message: sanitizedMessage,
        source: 'app',
        appName: sanitizedAppName,
        level: sanitizedLevel,
      };

      set(state => {
        // Deduplication
        const lastLog = state.appLogs[state.appLogs.length - 1];
        const isDuplicate =
          lastLog &&
          lastLog.message === sanitizedMessage &&
          lastLog.appName === sanitizedAppName &&
          lastLog.timestampNumeric &&
          now - lastLog.timestampNumeric < 100;

        if (isDuplicate) {
          return state;
        }

        return {
          appLogs: [...state.appLogs.slice(-MAX_APP_LOGS), newLog],
        };
      });
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[addAppLog] Error adding log:', error);
      }
    }
  },

  // Clear app logs
  clearAppLogs: appName =>
    set(state => ({
      appLogs: appName ? state.appLogs.filter(log => log.appName !== appName) : [],
    })),

  // Clear all logs (for reset)
  clearAllLogs: () =>
    set({
      logs: [],
      frontendLogs: [],
      appLogs: [],
    }),

  // Log mode & filters
  setLogMode: mode => set({ logMode: mode }),
  setLogSearch: search => set({ logSearch: search }),
  toggleLogCategory: category =>
    set(state => {
      const current = state.logCategoryFilters;
      return {
        logCategoryFilters: current.includes(category)
          ? current.filter(c => c !== category)
          : [...current, category],
      };
    }),
});
