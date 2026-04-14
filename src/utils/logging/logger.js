import { LOG_LEVELS, LOG_PREFIXES, LOG_CATEGORIES } from './constants';

let _store = null;

const getLogsStore = () => {
  try {
    if (!_store) {
      // Lazy import to break circular dependency (daemon.js -> logging -> store -> slices)
      const mod = import('../../store');
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

const addLog = (message, level = LOG_LEVELS.INFO, category = LOG_CATEGORIES.FRONTEND) => {
  const logsStore = getLogsStore();
  if (logsStore?.addFrontendLog) {
    logsStore.addFrontendLog(message, level, category);
    return;
  }

  (async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const { emit } = await import('@tauri-apps/api/event');
      const currentWindow = await getCurrentWindow();
      if (currentWindow.label !== 'main') {
        await emit('add-log', { message, level, category });
      }
    } catch {
      // Silently fail
    }
  })();
};

export const logInfo = (message, category = LOG_CATEGORIES.FRONTEND) => {
  addLog(message, LOG_LEVELS.INFO, category);
};

export const logSuccess = (message, category = LOG_CATEGORIES.FRONTEND) => {
  addLog(message, LOG_LEVELS.SUCCESS, category);
};

export const logWarning = (message, category = LOG_CATEGORIES.FRONTEND) => {
  addLog(message, LOG_LEVELS.WARNING, category);
};

export const logError = (message, category = LOG_CATEGORIES.FRONTEND) => {
  addLog(message, LOG_LEVELS.ERROR, category);
};

export const logApiCall = (method, endpoint, success, details = '') => {
  const message = details ? `${method} ${endpoint}: ${details}` : `${method} ${endpoint}`;
  addLog(message, success ? LOG_LEVELS.SUCCESS : LOG_LEVELS.ERROR, LOG_CATEGORIES.FRONTEND);
};

export const logDaemon = (message, level = LOG_LEVELS.INFO) => {
  const formattedMessage = `${LOG_PREFIXES.DAEMON} ${message}`;
  addLog(formattedMessage, level, LOG_CATEGORIES.DAEMON);
};

export const logApp = (appName, message, level = LOG_LEVELS.INFO) => {
  const store = getLogsStore();
  if (store?.addAppLog) {
    store.addAppLog(message, appName, level);
  }
};

export const logUserAction = (action, details = '') => {
  const message = details ? `${action}: ${details}` : action;
  addLog(message, LOG_LEVELS.INFO, LOG_CATEGORIES.FRONTEND);
};

export const logPermission = message => {
  addLog(message, LOG_LEVELS.WARNING, LOG_CATEGORIES.FRONTEND);
};

export const logTimeout = message => {
  addLog(message, LOG_LEVELS.WARNING, LOG_CATEGORIES.FRONTEND);
};
