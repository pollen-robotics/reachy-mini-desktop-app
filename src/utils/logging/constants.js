/**
 * Constants for logging system - single source of truth
 */

export const LOG_LEVELS = {
  INFO: 'info',
  SUCCESS: 'success',
  WARNING: 'warning',
  ERROR: 'error',
};

export const LOG_CATEGORIES = {
  DAEMON: 'daemon',
  APP: 'app',
  FRONTEND: 'frontend',
};

export const LOG_EMOJIS = {
  SUCCESS: '✓',
  ERROR: '❌',
  WARNING: '⚠️',
  PERMISSION: '🔒',
  TIMEOUT: '⏱️',
  SIMULATION: '🎭',
  USER_ACTION: '',
  RECEIVE: '📥',
  SEND: '📤',
  INFO: 'ℹ️',
};

export const LOG_PREFIXES = {
  DAEMON: '[Daemon]',
  API: '[API]',
  APP: appName => `[App: ${appName}]`,
};

/**
 * Display metadata for category filter chips (used in LogConsole UI)
 */
export const CATEGORY_META = {
  daemon: { label: 'Daemon', color: '#60a5fa' },
  app: { label: 'Apps', color: '#c084fc' },
  frontend: { label: 'Frontend', color: '#5db3ff' },
};
