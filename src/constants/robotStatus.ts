/**
 * Robot Status Constants
 *
 * Single source of truth for robot state machine states.
 * Use these constants instead of magic strings throughout the app.
 */
import type { BusyReason, RobotStatus } from '../types/robot';

export const ROBOT_STATUS = {
  DISCONNECTED: 'disconnected',
  READY_TO_START: 'ready-to-start',
  STARTING: 'starting',
  SLEEPING: 'sleeping',
  READY: 'ready',
  BUSY: 'busy',
  STOPPING: 'stopping',
  CRASHED: 'crashed',
} as const satisfies Record<string, RobotStatus>;

/**
 * Busy reasons - why the robot is in BUSY state
 */
export const BUSY_REASON = {
  MOVING: 'moving',
  COMMAND: 'command',
  APP_RUNNING: 'app-running',
  INSTALLING: 'installing',
} as const satisfies Record<string, BusyReason>;

// ============================================================================
// TRANSITION MAP - Exhaustive set of valid state transitions
// ============================================================================

export const VALID_TRANSITIONS: Record<RobotStatus, RobotStatus[]> = {
  [ROBOT_STATUS.DISCONNECTED]: [ROBOT_STATUS.READY_TO_START, ROBOT_STATUS.STARTING],
  [ROBOT_STATUS.READY_TO_START]: [ROBOT_STATUS.STARTING, ROBOT_STATUS.DISCONNECTED],
  [ROBOT_STATUS.STARTING]: [
    ROBOT_STATUS.SLEEPING,
    ROBOT_STATUS.READY,
    ROBOT_STATUS.CRASHED,
    ROBOT_STATUS.DISCONNECTED,
    ROBOT_STATUS.STOPPING,
  ],
  [ROBOT_STATUS.SLEEPING]: [
    ROBOT_STATUS.READY,
    ROBOT_STATUS.BUSY,
    ROBOT_STATUS.STOPPING,
    ROBOT_STATUS.CRASHED,
    ROBOT_STATUS.DISCONNECTED,
  ],
  [ROBOT_STATUS.READY]: [
    ROBOT_STATUS.BUSY,
    ROBOT_STATUS.SLEEPING,
    ROBOT_STATUS.STOPPING,
    ROBOT_STATUS.CRASHED,
    ROBOT_STATUS.DISCONNECTED,
  ],
  [ROBOT_STATUS.BUSY]: [
    ROBOT_STATUS.READY,
    ROBOT_STATUS.SLEEPING,
    ROBOT_STATUS.STOPPING,
    ROBOT_STATUS.CRASHED,
    ROBOT_STATUS.DISCONNECTED,
  ],
  [ROBOT_STATUS.STOPPING]: [ROBOT_STATUS.DISCONNECTED],
  [ROBOT_STATUS.CRASHED]: [ROBOT_STATUS.DISCONNECTED, ROBOT_STATUS.STARTING],
};

/**
 * Check whether transitioning from `from` to `to` is allowed.
 * Same-state transitions are always allowed (no-op).
 */
export function validateTransition(from: RobotStatus, to: RobotStatus): boolean {
  if (from === to) return true;
  const allowed = VALID_TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

export interface DerivedRobotState {
  isActive: boolean;
  isStarting: boolean;
  isStopping: boolean;
  isDaemonCrashed: boolean;
}

/**
 * Derive the boolean flags that robotSlice keeps in sync with robotStatus.
 * This is the single place where status -> booleans mapping lives.
 */
export function buildDerivedState(status: RobotStatus): DerivedRobotState {
  const active =
    status === ROBOT_STATUS.SLEEPING ||
    status === ROBOT_STATUS.READY ||
    status === ROBOT_STATUS.BUSY;
  return {
    isActive: active,
    isStarting: status === ROBOT_STATUS.STARTING,
    isStopping: status === ROBOT_STATUS.STOPPING,
    isDaemonCrashed: status === ROBOT_STATUS.CRASHED,
  };
}
