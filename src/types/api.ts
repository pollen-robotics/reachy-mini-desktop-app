/**
 * Typed Tauri IPC helpers.
 *
 * Usage at the call site:
 *
 * ```ts
 * import { invoke } from '@/types/api';
 *
 * const daemons = await invoke<DaemonInfo[]>('list_daemons');
 * ```
 *
 * We deliberately do NOT maintain an exhaustive mapping of every command
 * here: typing each `invoke` opportunistically at the call site scales
 * better than a giant shared registry that drifts. Specialized helpers
 * can live alongside their call sites.
 */
import { invoke as tauriInvoke, type InvokeArgs } from '@tauri-apps/api/core';

/**
 * Generic wrapper around Tauri's `invoke` that preserves the return type.
 * Falls back to `window.__TAURI__.core.invoke` when running in the mocked
 * browser/web mode installed by [src/main.tsx](../main.tsx).
 */
export function invoke<T>(cmd: string, args?: InvokeArgs): Promise<T> {
  return tauriInvoke<T>(cmd, args);
}

// ============================================================================
// DAEMON HTTP ENDPOINTS
// ============================================================================

/**
 * Response of `/api/state/full` when queried without WebSocket.
 * Loose shape - refined in later phases when the hook is migrated.
 */
export interface DaemonStateResponse {
  control_mode?: string;
  head_pose?: { m: number[] } | number[];
  head_joints?: number[];
  body_yaw?: number;
  antennas_position?: number[];
  passive_joints?: number[];
  timestamp?: number;
  [key: string]: unknown;
}

/**
 * Response of `/api/daemon/status`.
 */
export interface DaemonStatusResponse {
  status?: string;
  version?: string;
  [key: string]: unknown;
}

/**
 * Log level used across the app (frontend logs, app logs, daemon logs).
 *
 * Not every producer emits every level:
 *   - `'success'` is only used by user-facing frontend events (e.g. a finished
 *     install). The daemon-line parser never produces it.
 *   - `'debug'` is only emitted by the daemon-line parser when the Python
 *     logger prints a `DEBUG`-level record. Frontend/app producers ignore it.
 *
 * Consumers that need a narrower alphabet should `Exclude<LogLevel, …>` from
 * this type instead of declaring a parallel union.
 */
export type LogLevel = 'info' | 'success' | 'warning' | 'error' | 'debug';
