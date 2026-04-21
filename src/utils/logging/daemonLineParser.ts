/**
 * Shared parsing helpers for raw daemon log lines.
 *
 * Both the in-process remote streamer (`useDaemonLogStream`) and the
 * standalone log viewer window (`LogViewerWindow`) ingest identical Python
 * logger output. Keep categorization + level inference in ONE place so they
 * cannot drift apart.
 */

import type { LogLevel } from '../../types/api';

export type DaemonLineCategory = 'daemon' | 'api' | 'app';

/**
 * Subset of {@link LogLevel} the daemon-line parser can produce. `success` is
 * excluded because it is emitted exclusively by user-facing frontend events.
 */
export type DaemonLineLevel = Exclude<LogLevel, 'success'>;

/**
 * Classify a raw log line emitted by the daemon process.
 *
 * Matches the Python logger names:
 *   - uvicorn.*        -> api
 *   - reachy_mini.apps -> app (manager + running apps)
 *   - anything else    -> daemon (bare prints, reachy_mini.*, system output)
 */
export function categorizeDaemonLine(line: string): DaemonLineCategory {
  const lower = line.toLowerCase();
  if (lower.includes('uvicorn.access') || lower.includes('uvicorn.error')) return 'api';
  if (lower.includes('reachy_mini.apps') || lower.includes('_app.') || lower.includes('[app]')) {
    return 'app';
  }
  return 'daemon';
}

/**
 * Infer the level of a daemon line from its formatted text.
 *
 * The daemon uses the standard Python logging format
 * (`%(asctime)s - %(name)s - %(levelname)s - %(message)s`) so we can detect
 * `ERROR`/`WARNING`/`DEBUG` tokens directly.
 */
export function parseDaemonLogLevel(line: string): DaemonLineLevel {
  if (line.includes(' - ERROR - ') || line.includes(' ERROR ')) return 'error';
  if (line.includes(' - WARNING - ') || line.includes(' WARNING ')) return 'warning';
  if (line.includes(' - DEBUG - ')) return 'debug';
  return 'info';
}
