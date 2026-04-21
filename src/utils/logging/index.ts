// Hook for React components
export { useLogger } from './useLogger';
export type { UseLoggerResult } from './useLogger';

// Static functions for use outside React components
export {
  logInfo,
  logSuccess,
  logWarning,
  logError,
  logApiCall,
  logDaemon,
  logApp,
  logUserAction,
  logPermission,
  logTimeout,
  logEvent,
} from './logger';

// Constants & types
export {
  LOG_LEVELS,
  LOG_EMOJIS,
  LOG_PREFIXES,
  LOG_CATEGORIES,
  CATEGORY_META,
  VIEWER_CATEGORY_META,
  LOG_LIMITS,
} from './constants';
export type {
  LogLevel,
  LogCategory,
  CategoryMeta,
  ViewerCategory,
  ViewerEntryCategory,
} from './constants';

// Log filtering (single source of truth for simple-mode noise reduction)
export { FILTERED_PATTERNS, shouldFilterLog } from './logFilters';

// Shared line parsing (daemon stdout/stderr → category/level)
export { categorizeDaemonLine, parseDaemonLogLevel } from './daemonLineParser';
export type { DaemonLineCategory, DaemonLineLevel } from './daemonLineParser';

// Resilient WebSocket helper for the daemon `/logs/ws/daemon` endpoint
export { connectDaemonLogWebSocket } from './daemonLogSocket';
export type { DaemonLogSocketHandle, DaemonLogSocketOptions } from './daemonLogSocket';

// Clock formatter shared between every log consumer (HH:mm:ss, 24h)
export { formatClockTime, formatClockTimeFlexible } from './formatClockTime';
