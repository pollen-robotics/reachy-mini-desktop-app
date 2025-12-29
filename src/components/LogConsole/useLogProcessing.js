import { useMemo } from 'react';
import { DAEMON_CONFIG } from '../../config/daemon';
import { normalizeLog, formatTimestamp } from './utils';

/**
 * Hook to process and normalize all logs
 */
export const useLogProcessing = (logs, frontendLogs, appLogs, includeStoreLogs, simpleStyle) => {
  return useMemo(() => {
    // Validate inputs
    const safeLogs = Array.isArray(logs) ? logs : [];
    const safeFrontendLogs = Array.isArray(frontendLogs) ? frontendLogs : [];
    const safeAppLogs = Array.isArray(appLogs) ? appLogs : [];
    
    if (simpleStyle) {
      return safeLogs.map(log => {
        try {
          // Use normalizeLog for consistent timestamp parsing
          return normalizeLog(log);
        } catch (error) {
          // Skip invalid logs in simple mode
          return null;
        }
      }).filter(Boolean); // Remove null entries
    }
    
    // Filter out repetitive daemon lifecycle logs
    const repetitiveDaemonLogs = [
      '🧹 Cleaning up existing daemons...',
      '🧹 Cleaning up existing daemons (simulation mode)...',
      '✓ Daemon started via embedded sidecar',
      '✓ Daemon started in simulation mode (mockup-sim) via embedded sidecar',
      '✓ Daemon stopped',
    ];
    
    const filteredLogs = safeLogs.filter(log => {
      try {
        const message = typeof log === 'string' 
          ? log 
          : (log && typeof log === 'object' && log.message != null) 
            ? String(log.message)
            : String(log || '');
        return !repetitiveDaemonLogs.some(pattern => message.includes(pattern));
      } catch (error) {
        // Skip logs that can't be processed
        return false;
      }
    });
    
    // Combine all logs with their original order preserved
    // Wrap in try-catch to handle normalization errors
    const allLogs = [
      ...filteredLogs.map((log, idx) => {
        try {
          return { ...normalizeLog(log), order: idx };
        } catch (error) {
          // Return a safe fallback log
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
    
    // Deduplication - simplified since we no longer add daemon logs to frontendLogs
    // For daemon logs, deduplicate by message with time window (they can repeat but not within 1 second)
    // For frontend/app logs, deduplicate exact duplicates (same timestamp, same message, same source)
    const seen = new Set();
    const daemonLogsSeen = new Map(); // Track daemon logs with timestamps
    const uniqueLogs = allLogs.filter((log, index) => {
      // For daemon logs, check if same message appeared recently (within 1 second)
      if (log.source === 'daemon') {
        const messageKey = log.message;
        // Use the log's timestamp if available, otherwise use index as a stable key
        const timestamp = log.timestampNumeric > 0 ? log.timestampNumeric : index;
        
        // Check if we've seen this message recently (only for logs with real timestamps)
        if (log.timestampNumeric > 0) {
          const lastSeen = daemonLogsSeen.get(messageKey);
          if (lastSeen && typeof lastSeen === 'number' && lastSeen > 1000000000000 && (timestamp - lastSeen) < 1000) {
            // Same message within 1 second = duplicate, skip it
            return false;
          }
        }
        
        // Update last seen timestamp
        daemonLogsSeen.set(messageKey, timestamp);
        return true;
      }
      
      // For frontend/app logs, use exact timestamp to allow same message at different times
      // Only deduplicate if EXACT same timestamp AND same message AND same source
      const tsKey = log.timestampNumeric || log.timestamp || '';
      const key = `${tsKey}|${log.source}|${log.message}|${log.appName || ''}`;
      
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
    
    // Sort: preserve original order as primary, use timestamp only for same-order items
    // The 'order' field encodes the source: daemon=0-999999, frontend=1000000+, app=2000000+
    // Within the same source, use timestamp if available, otherwise preserve insertion order
    const sortedLogs = uniqueLogs.sort((a, b) => {
      const aOrder = a.order || 0;
      const bOrder = b.order || 0;
      
      // Different sources: use order (daemon < frontend < app)
      // This preserves the order in which logs were added to their respective arrays
      if (Math.floor(aOrder / 1000000) !== Math.floor(bOrder / 1000000)) {
        // Cross-source: if both have valid timestamps, use them
        const aHasTimestamp = a.timestampNumeric && a.timestampNumeric > 0;
        const bHasTimestamp = b.timestampNumeric && b.timestampNumeric > 0;
        if (aHasTimestamp && bHasTimestamp) {
          return a.timestampNumeric - b.timestampNumeric;
        }
        // Otherwise use order (preserves array order)
        return aOrder - bOrder;
      }
      
      // Same source: use timestamp if both have it, otherwise use order
      const aHasTimestamp = a.timestampNumeric && a.timestampNumeric > 0;
      const bHasTimestamp = b.timestampNumeric && b.timestampNumeric > 0;
      if (aHasTimestamp && bHasTimestamp) {
        return a.timestampNumeric - b.timestampNumeric;
      }
      
      // Fallback to order within same source
      return aOrder - bOrder;
    });
    
    // Filter out excessive duplicate daemon errors (keep only last 1 of same error within 10 seconds)
    // This prevents the console from being flooded with the same error
    // Note: Errors are already filtered at source in useDaemonStartupLogs, but we keep this as a safety net
    const errorCounts = new Map();
    const filteredSortedLogs = sortedLogs.filter((log, index) => {
      // Only filter daemon errors (frontend logs with [Daemon] prefix no longer exist)
      if (log.source === 'daemon' && log.level === 'error') {
        const errorKey = log.message;
        const now = log.timestampNumeric || Date.now();
        
        // Get last seen time for this error
        const lastSeen = errorCounts.get(errorKey);
        
        // If we've seen this exact error within the last 10 seconds, skip it
        if (lastSeen && (now - lastSeen) < 10000) {
          return false;
        }
        
        // Update last seen timestamp
        errorCounts.set(errorKey, now);
      }
      
      return true;
    });
    
    // Limit to MAX_DISPLAY
    const finalLogs = includeStoreLogs && filteredSortedLogs.length > DAEMON_CONFIG.LOGS.MAX_DISPLAY
      ? filteredSortedLogs.slice(-DAEMON_CONFIG.LOGS.MAX_DISPLAY)
      : filteredSortedLogs;
    
    return finalLogs;
  }, [logs, frontendLogs, appLogs, includeStoreLogs, simpleStyle]);
};

