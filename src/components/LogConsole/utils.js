// Shared formatter - created once, reused for every timestamp
let _formatter;
try {
  _formatter = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
} catch {
  _formatter = null;
}

/**
 * Format timestamp to HH:mm:ss string.
 * Uses a cached Intl.DateTimeFormat for performance.
 */
export const formatTimestamp = timestamp => {
  if (typeof timestamp === 'string' && timestamp.length === 8 && timestamp[2] === ':') {
    return timestamp;
  }

  let ms;
  if (typeof timestamp === 'number' && timestamp > 1000000000000 && timestamp < 2000000000000) {
    ms = timestamp;
  } else {
    ms = Date.now();
  }

  if (_formatter) {
    return _formatter.format(ms);
  }
  // Fallback
  return new Date(ms).toISOString().substring(11, 19);
};

/**
 * Normalize a log entry to a consistent format.
 * Hot path - called for every log every poll cycle.
 */
export const normalizeLog = log => {
  // Object with message property (frontend/app logs, or already-normalized)
  if (log && typeof log === 'object' && log.message != null) {
    const message = typeof log.message === 'string' ? log.message : String(log.message);

    let tsNum = 0;
    if (typeof log.timestampNumeric === 'number' && log.timestampNumeric > 0) {
      tsNum = log.timestampNumeric;
    } else if (typeof log.timestamp === 'number' && log.timestamp > 1000000000000) {
      tsNum = log.timestamp;
    }

    return {
      message,
      source: log.source || 'daemon',
      timestamp:
        tsNum > 0
          ? formatTimestamp(tsNum)
          : typeof log.timestamp === 'string'
            ? log.timestamp
            : formatTimestamp(Date.now()),
      level: log.level || 'info',
      appName: log.appName || undefined,
      timestampNumeric: tsNum || Date.now(),
    };
  }

  // Raw string from Rust VecDeque: "TIMESTAMP|MESSAGE"
  if (typeof log === 'string') {
    const pipeIdx = log.indexOf('|');
    if (pipeIdx > 0 && pipeIdx < 16) {
      const ts = parseInt(log.substring(0, pipeIdx), 10);
      if (ts > 1600000000000 && ts < 2000000000000) {
        return {
          message: log.substring(pipeIdx + 1),
          source: 'daemon',
          timestamp: formatTimestamp(ts),
          timestampNumeric: ts,
          level: 'info',
        };
      }
    }
    return {
      message: log,
      source: 'daemon',
      timestamp: '',
      timestampNumeric: 0,
      level: 'info',
    };
  }

  const now = Date.now();
  return {
    message: String(log || ''),
    source: 'daemon',
    timestamp: formatTimestamp(now),
    timestampNumeric: now,
    level: 'info',
  };
};
