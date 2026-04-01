/**
 * Format timestamp to HH:mm:ss string
 * Robust version with error handling
 */
export const formatTimestamp = timestamp => {
  try {
    if (typeof timestamp === 'string' && /^\d{2}:\d{2}:\d{2}$/.test(timestamp)) {
      return timestamp;
    }
    if (typeof timestamp === 'number' && !isNaN(timestamp) && isFinite(timestamp)) {
      // Validate timestamp is reasonable (not too far in past/future)
      const now = Date.now();
      const maxDiff = 365 * 24 * 60 * 60 * 1000; // 1 year
      if (Math.abs(timestamp - now) > maxDiff) {
        // Invalid timestamp, use current time
        timestamp = now;
      }

      try {
        return new Date(timestamp).toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        });
      } catch (e) {
        // Fallback if toLocaleTimeString fails
        return new Date(timestamp).toISOString().substring(11, 19);
      }
    }
    // Fallback to current time
    const now = Date.now();
    try {
      return new Date(now).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
    } catch (e) {
      return new Date(now).toISOString().substring(11, 19);
    }
  } catch (error) {
    // Ultimate fallback
    return new Date().toISOString().substring(11, 19);
  }
};

/**
 * Categorize a log line by its source based on logger name prefixes.
 * Returns 'daemon', 'api', or 'app'.
 */
export function categorizeLogSource(message) {
  if (message.includes('uvicorn.access') || message.includes('uvicorn.error')) return 'api';
  if (
    message.includes('reachy_mini.apps') ||
    message.includes('_app.') ||
    message.includes('[app]')
  )
    return 'app';
  return 'daemon';
}

/**
 * Normalize a log entry to a consistent format
 * Robust version with validation and error handling
 */
export const normalizeLog = log => {
  try {
    if (log && typeof log === 'object' && log.message != null) {
      // Validate and sanitize message
      const message = String(log.message || '').slice(0, 10000); // Max 10KB

      // Validate timestamp
      let timestampNumeric = Date.now();
      if (typeof log.timestamp === 'number' && !isNaN(log.timestamp) && isFinite(log.timestamp)) {
        timestampNumeric = log.timestamp;
      } else if (
        log.timestampNumeric &&
        typeof log.timestampNumeric === 'number' &&
        !isNaN(log.timestampNumeric) &&
        isFinite(log.timestampNumeric)
      ) {
        timestampNumeric = log.timestampNumeric;
      }

      return {
        message,
        source: log.source || categorizeLogSource(message),
        timestamp: log.timestamp
          ? formatTimestamp(log.timestamp)
          : formatTimestamp(timestampNumeric),
        level: log.level || 'info',
        appName: log.appName || undefined,
        timestampNumeric,
      };
    }

    if (typeof log === 'string') {
      // Parse Rust logs with format "TIMESTAMP|MESSAGE"
      // If no pipe found, treat as legacy log without timestamp
      const pipeIndex = log.indexOf('|');
      let message = log;
      let timestampNumeric = 0;

      if (pipeIndex > 0 && pipeIndex < 20) {
        // Potential timestamp prefix (Unix millis is ~13 digits)
        const potentialTimestamp = log.substring(0, pipeIndex);
        const parsedTs = parseInt(potentialTimestamp, 10);

        // Validate it looks like a Unix timestamp (reasonable range)
        if (!isNaN(parsedTs) && parsedTs > 1600000000000 && parsedTs < 2000000000000) {
          timestampNumeric = parsedTs;
          message = log.substring(pipeIndex + 1);
        }
      }

      return {
        message: message.slice(0, 10000), // Max 10KB
        source: categorizeLogSource(message),
        timestamp: timestampNumeric > 0 ? formatTimestamp(timestampNumeric) : '',
        timestampNumeric,
        level: 'info',
      };
    }

    // Fallback for any other type
    const now = Date.now();
    return {
      message: String(log || 'Invalid log entry').slice(0, 10000),
      source: 'daemon',
      timestamp: formatTimestamp(now),
      timestampNumeric: now,
      level: 'info',
    };
  } catch (error) {
    // Ultimate fallback - return a safe log entry
    const now = Date.now();
    return {
      message: `[Log normalization error: ${error.message}]`,
      source: 'daemon',
      timestamp: formatTimestamp(now),
      timestampNumeric: now,
      level: 'error',
    };
  }
};
