/**
 * Format timestamp to HH:mm:ss string
 * Robust version with error handling
 */
export const formatTimestamp = (timestamp) => {
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
          hour12: false
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
        hour12: false
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
 * Normalize a log entry to a consistent format
 * Robust version with validation and error handling
 */
export const normalizeLog = (log) => {
  try {
    if (log && typeof log === 'object' && log.message != null) {
      // Validate and sanitize message
      const message = String(log.message || '').slice(0, 10000); // Max 10KB
      
      // Validate timestamp
      let timestampNumeric = Date.now();
      if (typeof log.timestamp === 'number' && !isNaN(log.timestamp) && isFinite(log.timestamp)) {
        timestampNumeric = log.timestamp;
      } else if (log.timestampNumeric && typeof log.timestampNumeric === 'number' && !isNaN(log.timestampNumeric) && isFinite(log.timestampNumeric)) {
        timestampNumeric = log.timestampNumeric;
      }
      
      return {
        message,
        source: log.source || 'daemon',
        timestamp: log.timestamp ? formatTimestamp(log.timestamp) : formatTimestamp(timestampNumeric),
        level: log.level || 'info',
        appName: log.appName || undefined,
        timestampNumeric,
      };
    }
    
    if (typeof log === 'string') {
      const now = Date.now();
      return {
        message: log.slice(0, 10000), // Max 10KB
        source: 'daemon',
        timestamp: formatTimestamp(now),
        timestampNumeric: now,
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

