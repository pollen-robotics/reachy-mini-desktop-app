import {
  LOG_LEVELS,
  LOG_PREFIXES,
  LOG_CATEGORIES,
  type LogLevel,
  type LogCategory,
} from './constants';

interface AddFrontendLogOptions {
  userFacing?: boolean;
}

/**
 * Subset of the store API the logger needs.
 * We avoid importing the full store type to keep this module dependency-light
 * and to break the import cycle (`daemon.ts -> logging -> store -> slices`).
 */
interface LogsStoreApi {
  addFrontendLog?: (
    message: string,
    level: LogLevel,
    category: LogCategory,
    options?: AddFrontendLogOptions
  ) => void;
  addAppLog?: (message: string, appName: string, level: LogLevel) => void;
}

interface ZustandStore {
  getState: () => LogsStoreApi;
}

let _store: ZustandStore | null = null;

/**
 * Resolve (and cache) the Zustand logs store.
 * Triggers the dynamic import the first time it is called and returns `null`
 * until the import completes.
 *
 * Note: secondary windows have their own store instance that is hydrated by
 * the `windowSync` middleware. Logger calls from secondary windows therefore
 * land in the local store but are NOT synced back to the main window (main is
 * the only emitter in the windowSync contract). In practice every log-emitting
 * code path runs in the main window, so this is fine; if that ever changes,
 * add a reverse child→main broadcast rather than reintroducing a silent emit.
 */
const getLogsStore = (): LogsStoreApi | null => {
  try {
    if (!_store) {
      const mod = import('../../store') as Promise<{ useStore: ZustandStore }>;
      mod
        .then(m => {
          _store = m.useStore;
        })
        .catch(() => {});
      return null;
    }
    return _store.getState();
  } catch {
    return null;
  }
};

const addLog = (
  message: string,
  level: LogLevel = LOG_LEVELS.INFO,
  category: LogCategory = LOG_CATEGORIES.FRONTEND,
  options?: AddFrontendLogOptions
): void => {
  const logsStore = getLogsStore();
  if (logsStore?.addFrontendLog) {
    logsStore.addFrontendLog(message, level, category, options);
  }
};

export const logInfo = (message: string, category: LogCategory = LOG_CATEGORIES.FRONTEND): void => {
  addLog(message, LOG_LEVELS.INFO, category);
};

export const logSuccess = (
  message: string,
  category: LogCategory = LOG_CATEGORIES.FRONTEND
): void => {
  addLog(message, LOG_LEVELS.SUCCESS, category);
};

export const logWarning = (
  message: string,
  category: LogCategory = LOG_CATEGORIES.FRONTEND
): void => {
  addLog(message, LOG_LEVELS.WARNING, category);
};

export const logError = (
  message: string,
  category: LogCategory = LOG_CATEGORIES.FRONTEND
): void => {
  addLog(message, LOG_LEVELS.ERROR, category);
};

export const logApiCall = (
  method: string,
  endpoint: string,
  success: boolean,
  details: string = ''
): void => {
  const message = details ? `${method} ${endpoint}: ${details}` : `${method} ${endpoint}`;
  addLog(message, success ? LOG_LEVELS.SUCCESS : LOG_LEVELS.ERROR, LOG_CATEGORIES.FRONTEND);
};

export const logDaemon = (message: string, level: LogLevel = LOG_LEVELS.INFO): void => {
  const formattedMessage = `${LOG_PREFIXES.DAEMON} ${message}`;
  addLog(formattedMessage, level, LOG_CATEGORIES.DAEMON);
};

export const logApp = (
  appName: string,
  message: string,
  level: LogLevel = LOG_LEVELS.INFO
): void => {
  const store = getLogsStore();
  if (store?.addAppLog) {
    store.addAppLog(message, appName, level);
  }
};

export const logUserAction = (action: string, details: string = ''): void => {
  const message = details ? `${action}: ${details}` : action;
  addLog(message, LOG_LEVELS.INFO, LOG_CATEGORIES.FRONTEND);
};

export const logPermission = (message: string): void => {
  addLog(message, LOG_LEVELS.WARNING, LOG_CATEGORIES.FRONTEND);
};

export const logTimeout = (message: string): void => {
  addLog(message, LOG_LEVELS.WARNING, LOG_CATEGORIES.FRONTEND);
};

/**
 * Non-React counterpart of {@link UseLoggerResult.event}. Flags the entry as
 * user-facing so it is shown in simple mode regardless of the regex allowlist.
 */
export const logEvent = (
  message: string,
  level: LogLevel = LOG_LEVELS.INFO,
  category: LogCategory = LOG_CATEGORIES.FRONTEND
): void => {
  addLog(message, level, category, { userFacing: true });
};
