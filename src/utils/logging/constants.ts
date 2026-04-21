/**
 * Constants for logging system - single source of truth.
 */

export const LOG_LEVELS = {
  INFO: 'info',
  SUCCESS: 'success',
  WARNING: 'warning',
  ERROR: 'error',
} as const;

export type LogLevel = (typeof LOG_LEVELS)[keyof typeof LOG_LEVELS];

export const LOG_CATEGORIES = {
  DAEMON: 'daemon',
  APP: 'app',
  FRONTEND: 'frontend',
} as const;

export type LogCategory = (typeof LOG_CATEGORIES)[keyof typeof LOG_CATEGORIES];

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
} as const;

export const LOG_PREFIXES = {
  DAEMON: '[Daemon]',
  API: '[API]',
  APP: (appName: string) => `[App: ${appName}]`,
} as const;

export interface CategoryMeta {
  label: string;
  color: string;
}

/**
 * Display metadata for category filter chips (used in LogConsole UI).
 */
export const CATEGORY_META: Record<LogCategory, CategoryMeta> = {
  daemon: { label: 'Daemon', color: '#60a5fa' },
  app: { label: 'Apps', color: '#c084fc' },
  frontend: { label: 'Frontend', color: '#5db3ff' },
};

/**
 * Extended category set used by the standalone `LogViewerWindow`, which
 * additionally displays an `api` chip (uvicorn access/error lines), a
 * `frontend` chip (React-side store events), and an `all` meta-category.
 * Kept here so colors cannot drift from the main LogConsole palette.
 */
export type ViewerCategory = 'all' | 'daemon' | 'api' | 'app' | 'frontend';

/** Concrete entry category (no `all` meta filter). */
export type ViewerEntryCategory = Exclude<ViewerCategory, 'all'>;

export const VIEWER_CATEGORY_META: Record<ViewerCategory, CategoryMeta> = {
  all: { label: 'All', color: '#888' },
  daemon: CATEGORY_META.daemon,
  api: { label: 'API', color: '#34d399' },
  app: { label: 'App', color: '#c084fc' },
  frontend: CATEGORY_META.frontend,
};

/**
 * Ring-buffer caps shared between the Zustand slice, the remote log streamer
 * and the standalone LogViewerWindow. Keep these in one place; `DAEMON_CONFIG`
 * re-exports the relevant subset for consumers that already depend on it.
 *
 * `logsSlice` deliberately imports from here (not from `config/daemon`) to
 * avoid the `config/daemon → useStore → slices` circular import.
 */
export const LOG_LIMITS = {
  /** Max frontend (React-side) log entries retained in the store. */
  FRONTEND: 500,
  /** Max per-app log entries retained in the store. */
  APP: 1000,
  /** Max normalized log entries displayed by LogConsole at once. */
  DISPLAY: 10000,
  /** Max buffered lines coming from the remote daemon WebSocket. */
  REMOTE: 2000,
  /** Max lines retained by the standalone log viewer window. */
  VIEWER: 2000,
  /** Max lines retained by the startup splash mini-console. */
  STARTUP: 50,
} as const;
