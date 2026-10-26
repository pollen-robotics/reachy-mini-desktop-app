/**
 * Mirror the app's telemetry choice onto the connected daemon, which sends
 * its own anonymous usage data (reachy_mini#1472). Kept out of `index.ts`:
 * the store imports that module, and `config/daemon` imports the store.
 */
import { DAEMON_CONFIG, buildApiUrl, fetchWithTimeout } from '../../config/daemon';
import { isTelemetryEnabled } from './index';

export interface DaemonTelemetryStatus {
  enabled: boolean;
  /** An environment variable on the robot forces telemetry off. */
  disabled_by_env: boolean;
}

/** Robots (hardware ids) whose choice this app already set or migrated. */
const HANDLED_ROBOTS_KEY = 'telemetry_daemon_handled';

/** The connected daemon's choice, or `null` when there's no daemon or it predates the API. */
export async function getDaemonTelemetry(): Promise<DaemonTelemetryStatus | null> {
  try {
    const response = await fetchWithTimeout(
      buildApiUrl('/api/telemetry'),
      {},
      DAEMON_CONFIG.TIMEOUTS.COMMAND,
      { silent: true }
    );
    if (!response.ok) return null;
    return (await response.json()) as DaemonTelemetryStatus;
  } catch {
    return null;
  }
}

/**
 * Set the connected daemon's choice. Resolves the stored status, or `null`
 * when the daemon is unreachable, refused it, or predates the API (404).
 */
export async function setDaemonTelemetry(enabled: boolean): Promise<DaemonTelemetryStatus | null> {
  try {
    const response = await fetchWithTimeout(
      buildApiUrl('/api/telemetry'),
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      },
      DAEMON_CONFIG.TIMEOUTS.COMMAND,
      { label: `${enabled ? 'Enable' : 'Disable'} daemon telemetry` }
    );
    if (response.ok) return (await response.json()) as DaemonTelemetryStatus;
    if (response.status !== 404) {
      console.warn(`[Telemetry] Daemon refused the choice: ${response.status}`);
    }
  } catch (error) {
    console.warn('[Telemetry] Could not reach the daemon:', error);
  }
  return null;
}

async function getHardwareId(): Promise<string | null> {
  try {
    const response = await fetchWithTimeout(
      buildApiUrl('/api/daemon/hardware-id'),
      {},
      DAEMON_CONFIG.TIMEOUTS.COMMAND,
      { silent: true }
    );
    if (!response.ok) return null;
    const data = (await response.json()) as { hardware_id: string | null };
    return data.hardware_id || null;
  } catch {
    return null;
  }
}

function handledRobots(): string[] {
  try {
    const stored = JSON.parse(localStorage.getItem(HANDLED_ROBOTS_KEY) ?? '[]') as unknown;
    return Array.isArray(stored) ? stored.filter(id => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function addHandledRobot(id: string): void {
  const ids = handledRobots();
  if (ids.includes(id)) return;
  try {
    localStorage.setItem(HANDLED_ROBOTS_KEY, JSON.stringify([...ids, id]));
  } catch (error) {
    console.warn('[Telemetry] Failed to save handled robots:', error);
  }
}

/** Remember that the user set this robot's choice, so the migration skips it. */
export async function markDaemonHandled(): Promise<void> {
  const id = await getHardwareId();
  if (id) addHandledRobot(id);
}

/**
 * One-time migration of an opt-out made in the app before the daemon had
 * telemetry: sent once per robot, never "on", so a later choice made on the
 * robot (mobile app, API) is never overridden.
 */
export async function syncOptOutToDaemon(): Promise<void> {
  if (isTelemetryEnabled()) return;
  const id = await getHardwareId();
  if (!id || handledRobots().includes(id)) return;
  if (await setDaemonTelemetry(false)) addHandledRobot(id);
}
