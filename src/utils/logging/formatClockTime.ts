/**
 * Shared clock-time formatter for every log UI in the app.
 *
 * Single source of truth - used by `logsSlice` (frontend/app log ingestion),
 * `LogConsole/utils.normalizeLog`, `useDaemonLogStream`, and the standalone
 * `LogViewerWindow`. All produce `HH:mm:ss` in the viewer's local timezone
 * on a 24-hour clock.
 *
 * Keep this helper dependency-free so it can be reused by any log UI without
 * dragging React, Intl polyfills, or the Zustand store.
 */

let _formatter: Intl.DateTimeFormat | null = null;
try {
  _formatter = new Intl.DateTimeFormat('en-GB', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
} catch {
  _formatter = null;
}

/**
 * Format a millisecond timestamp as `HH:mm:ss`. Defaults to `Date.now()`.
 */
export function formatClockTime(ms: number = Date.now()): string {
  if (_formatter) {
    return _formatter.format(ms);
  }
  // Best-effort fallback when Intl isn't available (e.g. restricted runtimes).
  return new Date(ms).toISOString().substring(11, 19);
}

/**
 * Coerce an arbitrary timestamp-ish value into `HH:mm:ss`.
 *
 *   - pre-formatted `"HH:MM:SS"` string → passed through untouched
 *   - millisecond epoch number in a plausible range → formatted
 *   - anything else → current wall-clock time
 *
 * Used by `normalizeLog` which ingests heterogeneous payloads (raw daemon
 * strings, partially-hydrated objects, numeric timestamps from the Rust ring
 * buffer). Keep it permissive on purpose.
 */
export function formatClockTimeFlexible(input: unknown): string {
  if (typeof input === 'string' && input.length === 8 && input[2] === ':') {
    return input;
  }
  if (typeof input === 'number' && input > 1000000000000 && input < 2000000000000) {
    return formatClockTime(input);
  }
  return formatClockTime();
}
