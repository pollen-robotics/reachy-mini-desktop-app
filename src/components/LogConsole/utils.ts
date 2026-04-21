import type { LogEntry } from '../../types/store';
import type { LogLevel } from '../../types/api';
import { formatClockTimeFlexible } from '../../utils/logging/formatClockTime';

/**
 * Format timestamp to `HH:mm:ss`, passing through strings that already look
 * like a formatted time. Thin re-export of {@link formatClockTimeFlexible}
 * kept for backward compatibility with existing imports.
 */
export const formatTimestamp = formatClockTimeFlexible;

/**
 * Normalize a log entry to a consistent format.
 * Hot path - called for every log every poll cycle.
 */
export const normalizeLog = (log: unknown): LogEntry => {
  // Object with message property (frontend/app logs, or already-normalized)
  if (log && typeof log === 'object' && (log as { message?: unknown }).message != null) {
    const rec = log as {
      message: unknown;
      source?: LogEntry['source'];
      timestamp?: unknown;
      timestampNumeric?: unknown;
      level?: LogLevel;
      appName?: string;
      userFacing?: boolean;
    };
    const message = typeof rec.message === 'string' ? rec.message : String(rec.message);

    let tsNum = 0;
    if (typeof rec.timestampNumeric === 'number' && rec.timestampNumeric > 0) {
      tsNum = rec.timestampNumeric;
    } else if (typeof rec.timestamp === 'number' && rec.timestamp > 1000000000000) {
      tsNum = rec.timestamp;
    }

    return {
      message,
      source: rec.source || 'daemon',
      timestamp:
        tsNum > 0
          ? formatTimestamp(tsNum)
          : typeof rec.timestamp === 'string'
            ? rec.timestamp
            : formatTimestamp(Date.now()),
      level: rec.level || 'info',
      appName: rec.appName || undefined,
      timestampNumeric: tsNum || Date.now(),
      ...(rec.userFacing === true ? { userFacing: true } : {}),
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
