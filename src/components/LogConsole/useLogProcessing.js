import { useMemo } from 'react';
import { DAEMON_CONFIG } from '../../config/daemon';
import { normalizeLog, formatTimestamp, categorizeLogSource } from './utils';
import { shouldFilterLog } from '../../utils/logging/logFilters';

/**
 * Hook to process and normalize all logs
 *
 * Filtering is handled by the centralized logFilters utility.
 */
export const useLogProcessing = (
  logs,
  frontendLogs,
  appLogs,
  includeStoreLogs,
  simpleStyle,
  daemonLogFilters = []
) => {
  return useMemo(() => {
    // Validate inputs
    const safeLogs = Array.isArray(logs) ? logs : [];
    const safeFrontendLogs = Array.isArray(frontendLogs) ? frontendLogs : [];
    const safeAppLogs = Array.isArray(appLogs) ? appLogs : [];

    if (simpleStyle) {
      return safeLogs
        .map(log => {
          try {
            return normalizeLog(log);
          } catch (error) {
            return null;
          }
        })
        .filter(Boolean);
    }

    const hasActiveFilters = daemonLogFilters.length > 0;

    // Always apply noise filtering (shouldFilterLog hides internal system noise).
    // Category filtering happens as a final pass after sorting.
    const filteredLogs = safeLogs.filter(log => {
      try {
        const message =
          typeof log === 'string'
            ? log
            : log && typeof log === 'object' && log.message != null
              ? String(log.message)
              : String(log || '');
        return !shouldFilterLog(message);
      } catch (error) {
        return false;
      }
    });

    // Combine all logs with their original order preserved
    const allLogs = [
      ...filteredLogs.map((log, idx) => {
        try {
          return { ...normalizeLog(log), order: idx };
        } catch (error) {
          return {
            message: `[Error normalizing log: ${error.message}]`,
            source: 'daemon',
            timestamp: formatTimestamp(Date.now()),
            timestampNumeric: Date.now(),
            level: 'error',
            order: idx,
          };
        }
      }),
      ...safeFrontendLogs.map((log, idx) => {
        try {
          return { ...normalizeLog(log), order: 1000000 + idx, level: log.level || 'info' };
        } catch (error) {
          return {
            message: `[Error normalizing frontend log: ${error.message}]`,
            source: 'frontend',
            timestamp: formatTimestamp(Date.now()),
            timestampNumeric: Date.now(),
            level: 'error',
            order: 1000000 + idx,
          };
        }
      }),
      ...safeAppLogs.map((log, idx) => {
        try {
          return { ...normalizeLog(log), order: 2000000 + idx };
        } catch (error) {
          return {
            message: `[Error normalizing app log: ${error.message}]`,
            source: 'app',
            timestamp: formatTimestamp(Date.now()),
            timestampNumeric: Date.now(),
            level: 'error',
            order: 2000000 + idx,
          };
        }
      }),
    ];

    // Deduplication
    const seen = new Set();
    const daemonLogsSeen = new Map();
    const uniqueLogs = allLogs.filter((log, index) => {
      if (log.source === 'daemon') {
        const messageKey = log.message;
        const timestamp = log.timestampNumeric > 0 ? log.timestampNumeric : index;

        if (log.timestampNumeric > 0) {
          const lastSeen = daemonLogsSeen.get(messageKey);
          if (
            lastSeen &&
            typeof lastSeen === 'number' &&
            lastSeen > 1000000000000 &&
            timestamp - lastSeen < 1000
          ) {
            return false;
          }
        }

        daemonLogsSeen.set(messageKey, timestamp);
        return true;
      }

      const tsKey = log.timestampNumeric || log.timestamp || '';
      const key = `${tsKey}|${log.source}|${log.message}|${log.appName || ''}`;

      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });

    // Sort by timestamp
    const sortedLogs = uniqueLogs.sort((a, b) => {
      const aOrder = a.order || 0;
      const bOrder = b.order || 0;

      if (Math.floor(aOrder / 1000000) !== Math.floor(bOrder / 1000000)) {
        const aHasTimestamp = a.timestampNumeric && a.timestampNumeric > 0;
        const bHasTimestamp = b.timestampNumeric && b.timestampNumeric > 0;
        if (aHasTimestamp && bHasTimestamp) {
          return a.timestampNumeric - b.timestampNumeric;
        }
        return aOrder - bOrder;
      }

      const aHasTimestamp = a.timestampNumeric && a.timestampNumeric > 0;
      const bHasTimestamp = b.timestampNumeric && b.timestampNumeric > 0;
      if (aHasTimestamp && bHasTimestamp) {
        return a.timestampNumeric - b.timestampNumeric;
      }

      return aOrder - bOrder;
    });

    // Filter duplicate errors
    const errorCounts = new Map();
    const filteredSortedLogs = sortedLogs.filter((log, index) => {
      if (log.source === 'daemon' && log.level === 'error') {
        const errorKey = log.message;
        const now = log.timestampNumeric || Date.now();

        const lastSeen = errorCounts.get(errorKey);

        if (lastSeen && now - lastSeen < 10000) {
          return false;
        }

        errorCounts.set(errorKey, now);
      }

      return true;
    });

    // Apply category filter when daemon log filters are active.
    // Uses content-based categorization (not the stored source) to correctly classify
    // logs regardless of which hook/store path they came through.
    // Frontend logs always pass through.
    const categoryFiltered = hasActiveFilters
      ? filteredSortedLogs.filter(log => {
          if (log.source === 'frontend') return true;
          const cat = categorizeLogSource(log.message || '');
          return daemonLogFilters.includes(cat);
        })
      : filteredSortedLogs;

    // Limit to MAX_DISPLAY
    const finalLogs =
      includeStoreLogs && categoryFiltered.length > DAEMON_CONFIG.LOGS.MAX_DISPLAY
        ? categoryFiltered.slice(-DAEMON_CONFIG.LOGS.MAX_DISPLAY)
        : categoryFiltered;

    return finalLogs;
  }, [logs, frontendLogs, appLogs, includeStoreLogs, simpleStyle, daemonLogFilters]);
};
