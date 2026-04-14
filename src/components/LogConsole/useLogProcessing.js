import { useMemo } from 'react';
import { DAEMON_CONFIG } from '../../config/daemon';
import { normalizeLog, formatTimestamp } from './utils';
import { shouldFilterLog } from '../../utils/logging/logFilters';

/**
 * Allowlist for simple mode - user-facing events only.
 * Errors always pass. Everything else must match a pattern.
 */
const SIMPLE_ALLOWLIST = [
  /^connected to/i,
  /disconnected/i,
  /connection lost/i,
  /^enable motors/i,
  /^disable motors/i,
  /motors? (enabled|disabled|stiff|compliant)/i,
  /^(installing|uninstalling|starting|stopping|updating)\s/i,
  /app.*completed/i,
  /app.*stopped unexpectedly/i,
  /set (speaker |microphone )?volume/i,
  /^(mute|unmute)\s/i,
  /^wake up/i,
  /^goto sleep/i,
  /^sleep animation/i,
  /^playing (emotion|dance|action):/i,
  /^manual control (started|ended)/i,
  /cache cleared/i,
  /apps? reset/i,
  /hf (oauth|logout)/i,
  /^daemon (started|stopped|updated|restarted)/i,
  /^(update completed|update likely completed)/i,
  /^simulation mode/i,
];

const isSimpleModeVisible = log => {
  if (log.level === 'error') return true;
  const msg = log.message || '';
  return SIMPLE_ALLOWLIST.some(p => p.test(msg));
};

const inferCategory = log => {
  if (log.category === 'daemon' || log.category === 'app' || log.category === 'frontend') {
    return log.category;
  }
  if (log.source === 'app') return 'app';
  if (log.source === 'frontend' || log.source === 'api') return 'frontend';
  if (log.source === 'daemon') return 'daemon';
  return 'frontend';
};

function safeNormalize(log, fallbackSource, fallbackCategory) {
  try {
    const normalized = normalizeLog(log);
    return {
      ...normalized,
      category: log.category || inferCategory(normalized),
    };
  } catch (error) {
    return {
      message: `[Normalize error: ${error.message}]`,
      source: fallbackSource,
      category: fallbackCategory,
      timestamp: formatTimestamp(Date.now()),
      timestampNumeric: Date.now(),
      level: 'error',
    };
  }
}

/**
 * Merge pre-sorted arrays by timestampNumeric (avoids full sort).
 * Each input array is already in chronological order.
 */
function mergeByTimestamp(daemonLogs, frontendLogs, appLogs) {
  const result = [];
  let di = 0,
    fi = 0,
    ai = 0;
  const dLen = daemonLogs.length,
    fLen = frontendLogs.length,
    aLen = appLogs.length;

  while (di < dLen || fi < fLen || ai < aLen) {
    const dTs = di < dLen ? daemonLogs[di].timestampNumeric || 0 : Infinity;
    const fTs = fi < fLen ? frontendLogs[fi].timestampNumeric || 0 : Infinity;
    const aTs = ai < aLen ? appLogs[ai].timestampNumeric || 0 : Infinity;

    if (dTs <= fTs && dTs <= aTs) {
      result.push(daemonLogs[di++]);
    } else if (fTs <= aTs) {
      result.push(frontendLogs[fi++]);
    } else {
      result.push(appLogs[ai++]);
    }
  }
  return result;
}

/**
 * Hook to process and normalize all logs.
 * Supports simple + dev modes with category, level, and search filtering.
 *
 * Performance: daemon/frontend/app logs arrive pre-sorted so we merge
 * instead of concat+sort. Deduplication uses a single pass.
 */
export const useLogProcessing = (
  logs,
  frontendLogs,
  appLogs,
  includeStoreLogs,
  simpleStyle,
  { mode = 'simple', categoryFilters = null, search = '' } = {}
) => {
  return useMemo(() => {
    const safeLogs = Array.isArray(logs) ? logs : [];
    const safeFrontendLogs = Array.isArray(frontendLogs) ? frontendLogs : [];
    const safeAppLogs = Array.isArray(appLogs) ? appLogs : [];

    // simpleStyle = legacy inline overlay, minimal processing
    if (simpleStyle) {
      return safeLogs
        .map(log => {
          try {
            return normalizeLog(log);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    }

    // --- Normalize each source independently (preserves insertion order) ---

    const isDev = mode === 'dev';

    const normalizedDaemon = [];
    const daemonDedup = new Map();
    for (let i = 0; i < safeLogs.length; i++) {
      const raw = safeLogs[i];

      // In simple mode, pre-filter noisy logs before normalizing (cheaper)
      if (!isDev) {
        try {
          const msg =
            typeof raw === 'string'
              ? raw
              : raw && typeof raw === 'object' && raw.message != null
                ? String(raw.message)
                : String(raw || '');
          if (shouldFilterLog(msg)) continue;
        } catch {
          continue;
        }
      }

      const log = safeNormalize(raw, 'daemon', 'daemon');

      // Dedup: skip same message within 1s
      const key = log.message;
      const prevTs = daemonDedup.get(key);
      if (prevTs && log.timestampNumeric > 0 && log.timestampNumeric - prevTs < 1000) continue;
      daemonDedup.set(key, log.timestampNumeric || 0);

      normalizedDaemon.push(log);
    }

    const normalizedFrontend = [];
    const frontendSeen = new Set();
    for (let i = 0; i < safeFrontendLogs.length; i++) {
      const raw = safeFrontendLogs[i];
      const log = safeNormalize(raw, 'frontend', 'frontend');
      log.level = raw.level || log.level || 'info';

      const dedupKey = `${log.timestampNumeric || ''}|${log.source}|${log.message}`;
      if (frontendSeen.has(dedupKey)) continue;
      frontendSeen.add(dedupKey);

      normalizedFrontend.push(log);
    }

    const normalizedApp = [];
    for (let i = 0; i < safeAppLogs.length; i++) {
      const raw = safeAppLogs[i];
      const log = safeNormalize(raw, 'app', 'app');
      normalizedApp.push(log);
    }

    // --- Merge (already sorted per-source) ---
    const merged = mergeByTimestamp(normalizedDaemon, normalizedFrontend, normalizedApp);

    // --- Collapse repeated daemon errors within 10s ---
    const errorSeen = new Map();
    let filtered = merged;
    if (merged.length > 0) {
      filtered = merged.filter(log => {
        if (log.source === 'daemon' && log.level === 'error') {
          const ts = log.timestampNumeric || 0;
          const prev = errorSeen.get(log.message);
          if (prev && ts - prev < 10000) return false;
          errorSeen.set(log.message, ts);
        }
        return true;
      });
    }

    // --- Mode-specific filtering ---
    if (mode === 'simple') {
      filtered = filtered.filter(isSimpleModeVisible);
    } else {
      if (categoryFilters && categoryFilters.length > 0) {
        filtered = filtered.filter(log => categoryFilters.includes(log.category));
      }
      if (search) {
        const lower = search.toLowerCase();
        filtered = filtered.filter(log => (log.message || '').toLowerCase().includes(lower));
      }
    }

    // --- Cap display count ---
    const maxDisplay = DAEMON_CONFIG?.LOGS?.MAX_DISPLAY || 1000;
    if (includeStoreLogs && filtered.length > maxDisplay) {
      return filtered.slice(-maxDisplay);
    }

    return filtered;
  }, [logs, frontendLogs, appLogs, includeStoreLogs, simpleStyle, mode, categoryFilters, search]);
};
