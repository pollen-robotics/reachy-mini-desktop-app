/**
 * Logs Slice - Manages all types of logs (daemon, frontend, app)
 *
 * Two display modes:
 *   - "simple": user-facing actions only (errors, user actions, key events)
 *   - "dev":    everything with category/level filters and search
 *
 * Note: We intentionally import ONLY from `utils/logging/constants` (a
 * dependency-light module with no store references). We do NOT import
 * `config/daemon` because that module pulls in the store, which would create a
 * `config/daemon → useStore → slices` cycle.
 */
import type { StateCreator } from 'zustand';
import type { LogLevel } from '../../types/api';
import type {
  AddFrontendLogOptions,
  AppState,
  LogCategory,
  LogEntry,
  LogsSlice,
  LogsSliceState,
} from '../../types/store';
import { LOG_LIMITS } from '../../utils/logging/constants';
import { formatClockTime } from '../../utils/logging/formatClockTime';

const MAX_FRONTEND_LOGS = LOG_LIMITS.FRONTEND;
const MAX_APP_LOGS = LOG_LIMITS.APP;

const ALL_CATEGORIES: LogCategory[] = ['daemon', 'app', 'frontend'];

export const logsInitialState: LogsSliceState = {
  logs: [],
  frontendLogs: [],
  appLogs: [],

  logMode: 'simple',
  logSearch: '',
  logCategoryFilters: [...ALL_CATEGORIES],
};

const VALID_FRONTEND_LEVELS: LogLevel[] = ['info', 'success', 'warning', 'error'];
const VALID_APP_LEVELS: LogLevel[] = ['info', 'warning', 'error'];

/**
 * Create logs slice
 */
export const createLogsSlice: StateCreator<AppState, [], [], LogsSlice> = set => ({
  ...logsInitialState,

  // Set daemon logs. Callers must pass already-normalized entries (see
  // `useLogs.fetchLogs`, `useDaemonLogStream`). Dedup compares the tail by
  // content rather than reference so re-emitting the same buffer across
  // windowSync hops (which creates fresh objects on each deserialize) is a
  // no-op.
  setLogs: newLogs =>
    set(state => {
      if (state.logs === newLogs) return state;
      if (
        Array.isArray(state.logs) &&
        Array.isArray(newLogs) &&
        state.logs.length === newLogs.length &&
        state.logs.length > 0
      ) {
        const a = state.logs[state.logs.length - 1];
        const b = newLogs[newLogs.length - 1];
        if (a && b && a.message === b.message && a.timestampNumeric === b.timestampNumeric) {
          return state;
        }
      }
      return { logs: newLogs };
    }),

  // Append daemon entries (used by remote/WS producers). Caps to
  // `LOG_LIMITS.DISPLAY` so wifi sessions don't grow unbounded.
  appendLogs: entries =>
    set(state => {
      if (!entries || entries.length === 0) return state;
      const next = state.logs.concat(entries);
      const capped = next.length > LOG_LIMITS.DISPLAY ? next.slice(-LOG_LIMITS.DISPLAY) : next;
      return { logs: capped };
    }),

  addFrontendLog: (
    message: string,
    level: LogLevel = 'info',
    category: LogCategory = 'frontend',
    options?: AddFrontendLogOptions
  ) => {
    if (message == null) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[addFrontendLog] Received null/undefined message, skipping');
      }
      return;
    }

    const normalizedLevel: LogLevel = VALID_FRONTEND_LEVELS.includes(level) ? level : 'info';
    const sanitizedMessage = String(message).slice(0, 10000);

    try {
      const now = Date.now();
      const formattedTimestamp = formatClockTime(now);

      set(state => {
        const newLog: LogEntry = {
          timestamp: formattedTimestamp,
          timestampNumeric: now,
          message: sanitizedMessage,
          source: 'frontend',
          category: category || 'frontend',
          level: normalizedLevel,
          ...(options?.userFacing ? { userFacing: true } : {}),
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

  addAppLog: (message: string, appName?: string, level: LogLevel = 'info') => {
    if (message == null) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[addAppLog] Received null/undefined message, skipping');
      }
      return;
    }

    const sanitizedMessage = String(message).slice(0, 10000);
    const sanitizedAppName = appName ? String(appName).slice(0, 100) : undefined;
    const sanitizedLevel: LogLevel = VALID_APP_LEVELS.includes(level) ? level : 'info';

    try {
      const now = Date.now();
      const formattedTimestamp = formatClockTime(now);

      const newLog: LogEntry = {
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

  clearAppLogs: (appName?: string) =>
    set(state => ({
      appLogs: appName ? state.appLogs.filter(log => log.appName !== appName) : [],
    })),

  clearAllLogs: () =>
    set({
      logs: [],
      frontendLogs: [],
      appLogs: [],
    }),

  setLogMode: mode => set({ logMode: mode }),
  setLogSearch: search => set({ logSearch: search }),
  toggleLogCategory: (category: LogCategory) =>
    set(state => {
      const current = state.logCategoryFilters;
      return {
        logCategoryFilters: current.includes(category)
          ? current.filter(c => c !== category)
          : [...current, category],
      };
    }),
});
