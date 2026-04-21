/**
 * Daemon / startup types.
 *
 * The startup flow uses the stages defined in
 * [src/config/startupStages.js](../config/startupStages.js). The daemon
 * event bus is exposed through
 * [src/hooks/daemon/useDaemonEventBus.js](../hooks/daemon/useDaemonEventBus.js).
 */

// ============================================================================
// STARTUP STAGES (see config/startupStages.js for the canonical list)
// ============================================================================

export type StartupStageId =
  | 'scanning'
  | 'starting_simulation'
  | 'connecting'
  | 'initializing'
  | 'detecting'
  | 'complete'
  | 'error';

export interface StartupStage {
  id: StartupStageId;
  label: string;
  description: string;
  progressMin: number;
  progressMax: number;
  isSimOnly: boolean;
  logPatterns?: string[];
}

export interface StageDisplayText {
  title: string;
  subtitle: string;
  boldText: string;
}

// ============================================================================
// HEALTH / CRASH DETECTION
// ============================================================================

export type HealthFailureReason = 'timeout' | 'network' | 'http-error' | 'unknown' | string;

export interface DaemonHealth {
  consecutiveTimeouts: number;
  healthFailureReasons: HealthFailureReason[];
}

// ============================================================================
// EVENT BUS
// ============================================================================

/**
 * Event bus events emitted by daemon/robot hooks.
 * Loose on purpose - refined as hooks get migrated.
 */
export type DaemonEventName =
  | 'robot:state:updated'
  | 'daemon:started'
  | 'daemon:stopped'
  | 'daemon:crashed'
  | string;

export interface DaemonEventMap {
  'robot:state:updated': { data: unknown };
  // Add more as events get typed in Phase 3.
  [key: string]: unknown;
}
