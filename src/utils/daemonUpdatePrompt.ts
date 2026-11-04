/**
 * Decides when to propose a daemon update right after Start.
 * Kept free of React so the rules are unit-tested.
 */
import type { ConnectionMode } from '../types/robot';

export const SKIPPED_UPDATE_KEY = 'skippedDaemonUpdate';

// Connections already checked this app session. Module-level because the
// viewer hosting the check remounts on view swaps.
const checkedConnections = new Set<string>();

/**
 * True the first time a connection asks, false afterwards. External daemons
 * never qualify: the app can't update a daemon it didn't install.
 */
export function claimUpdateCheck(
  connectionMode: ConnectionMode | null | undefined,
  remoteHost: string | null | undefined
): boolean {
  if (!connectionMode || connectionMode === 'external') return false;
  const key = `${connectionMode}:${remoteHost ?? ''}`;
  if (checkedConnections.has(key)) return false;
  checkedConnections.add(key);
  return true;
}

export function shouldPromptDaemonUpdate(
  info: { is_available?: boolean; available_version?: string } | null,
  skippedVersion: string | null
): boolean {
  return !!info?.is_available && info.available_version !== skippedVersion;
}

/** Test-only: forget which connections were checked. */
export function resetUpdateChecks(): void {
  checkedConnections.clear();
}
