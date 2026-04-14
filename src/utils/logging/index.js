// Hook for React components
export { useLogger } from './useLogger';

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
} from './logger';

// Constants
export { LOG_LEVELS, LOG_EMOJIS, LOG_PREFIXES, LOG_CATEGORIES, CATEGORY_META } from './constants';

// Log filtering (single source of truth for simple-mode noise reduction)
export { FILTERED_PATTERNS, shouldFilterLog } from './logFilters';
