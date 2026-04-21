import { useMemo } from 'react';
import { DAEMON_CONFIG } from '../../config/daemon';
import { normalizeLog, formatTimestamp } from './utils';
import { shouldFilterLog } from '../../utils/logging/logFilters';
import type { LogEntry, LogCategory, LogMode } from '../../types/store';

/**
 * Allowlist for simple mode - user-facing events only.
 * Errors always pass. Everything else must match a pattern.
 */
const SIMPLE_ALLOWLIST: RegExp[] = [
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
  // First-run Python environment setup: the StartupScanView renders a
  // LogConsole during bootstrap so the user sees what's happening instead of
  // staring at a blank spinner. Matches both top-level bootstrap markers
  // (`[bootstrap] Installing ...`) and streamed subprocess output
  // (`[bootstrap] [prewarm:.venv] ...`). Keep anchored with `^` to avoid
  // picking up unrelated mentions of the word "bootstrap" elsewhere.
  /^\[bootstrap\]/i,
];

const isSimpleModeVisible = (log: LogEntry): boolean => {
  if (log.level === 'error') return true;
  // Explicit user-facing tag (via `logger.event()` / `useLogger().event()`)
  // always wins over the regex allowlist below. The allowlist remains as a
  // fallback so legacy call sites keep behaving exactly as before.
  if (log.userFacing === true) return true;
  const msg = log.message || '';
  return SIMPLE_ALLOWLIST.some(p => p.test(msg));
};

const inferCategory = (log: LogEntry & { category?: LogCategory }): LogCategory => {
  if (log.category === 'daemon' || log.category === 'app' || log.category === 'frontend') {
    return log.category;
  }
  if (log.source === 'app') return 'app';
  if (log.source === 'frontend' || (log.source as string) === 'api') return 'frontend';
  if (log.source === 'daemon') return 'daemon';
  return 'frontend';
};

function safeNormalize(
  log: unknown,
  fallbackSource: LogEntry['source'],
  fallbackCategory: LogCategory
): LogEntry {
  try {
    const normalized = normalizeLog(log);
    const rawCat = (log as { category?: LogCategory } | null)?.category;
    return {
      ...normalized,
      category: rawCat || inferCategory(normalized),
    };
  } catch (error) {
    const err = error as Error;
    return {
      message: `[Normalize error: ${err.message}]`,
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
function mergeByTimestamp(
  daemonLogs: LogEntry[],
  frontendLogs: LogEntry[],
  appLogs: LogEntry[]
): LogEntry[] {
  const result: LogEntry[] = [];
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

export interface UseLogProcessingOptions {
  mode?: LogMode;
  categoryFilters?: LogCategory[] | null;
  search?: string;
}

/**
 * Hook to process and normalize all logs.
 * Supports simple + dev modes with category, level, and search filtering.
 *
 * Performance: daemon/frontend/app logs arrive pre-sorted so we merge
 * instead of concat+sort. Deduplication uses a single pass.
 */
export const useLogProcessing = (
  logs: unknown[] | null | undefined,
  frontendLogs: unknown[] | null | undefined,
  appLogs: unknown[] | null | undefined,
  includeStoreLogs: boolean,
  simpleStyle: boolean,
  { mode = 'simple', categoryFilters = null, search = '' }: UseLogProcessingOptions = {}
): LogEntry[] => {
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
        .filter((x): x is LogEntry => Boolean(x));
    }

    // --- Normalize each source independently (preserves insertion order) ---

    const isDev = mode === 'dev';

    const normalizedDaemon: LogEntry[] = [];
    const daemonDedup = new Map<string, number>();
    for (let i = 0; i < safeLogs.length; i++) {
      const raw = safeLogs[i];

      // In simple mode, pre-filter noisy logs before normalizing (cheaper).
      // Skip this filter when showing only local logs (includeStoreLogs=false).
      if (!isDev && includeStoreLogs) {
        try {
          const msg =
            typeof raw === 'string'
              ? raw
              : raw && typeof raw === 'object' && (raw as { message?: unknown }).message != null
                ? String((raw as { message?: unknown }).message)
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

    const normalizedFrontend: LogEntry[] = [];
    const frontendSeen = new Set<string>();
    for (let i = 0; i < safeFrontendLogs.length; i++) {
      const raw = safeFrontendLogs[i] as { level?: LogEntry['level'] } | null;
      const log = safeNormalize(raw, 'frontend', 'frontend');
      log.level = (raw && raw.level) || log.level || 'info';

      const dedupKey = `${log.timestampNumeric || ''}|${log.source}|${log.message}`;
      if (frontendSeen.has(dedupKey)) continue;
      frontendSeen.add(dedupKey);

      normalizedFrontend.push(log);
    }

    const normalizedApp: LogEntry[] = [];
    for (let i = 0; i < safeAppLogs.length; i++) {
      const raw = safeAppLogs[i];
      const log = safeNormalize(raw, 'app', 'app');
      normalizedApp.push(log);
    }

    // --- Merge (already sorted per-source) ---
    const merged = mergeByTimestamp(normalizedDaemon, normalizedFrontend, normalizedApp);

    // --- Collapse repeated daemon errors within 10s ---
    const errorSeen = new Map<string, number>();
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
    // Skip simple-mode allowlist when only showing local logs (no store logs),
    // since those are explicitly added by the component and should always appear.
    if (mode === 'simple' && includeStoreLogs) {
      filtered = filtered.filter(isSimpleModeVisible);
    } else if (mode !== 'simple') {
      if (categoryFilters && categoryFilters.length > 0) {
        filtered = filtered.filter(log =>
          log.category ? categoryFilters.includes(log.category) : false
        );
      }
      if (search) {
        const lower = search.toLowerCase();
        filtered = filtered.filter(log => (log.message || '').toLowerCase().includes(lower));
      }
    }

    // --- Cap display count ---
    const maxDisplay =
      (DAEMON_CONFIG as unknown as { LOGS?: { MAX_DISPLAY?: number } })?.LOGS?.MAX_DISPLAY || 1000;
    if (includeStoreLogs && filtered.length > maxDisplay) {
      return filtered.slice(-maxDisplay);
    }

    return filtered;
  }, [logs, frontendLogs, appLogs, includeStoreLogs, simpleStyle, mode, categoryFilters, search]);
};
