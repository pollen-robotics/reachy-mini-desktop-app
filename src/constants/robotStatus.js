/**
 * Robot Status Constants
 * 
 * Single source of truth for robot state machine states.
 * Use these constants instead of magic strings throughout the app.
 */

export const ROBOT_STATUS = {
  DISCONNECTED: 'disconnected',
  READY_TO_START: 'ready-to-start',
  STARTING: 'starting',
  SLEEPING: 'sleeping',
  READY: 'ready',
  BUSY: 'busy',
  STOPPING: 'stopping',
  CRASHED: 'crashed',
};

/**
 * Busy reasons - why the robot is in BUSY state
 */
export const BUSY_REASON = {
  MOVING: 'moving',
  COMMAND: 'command',
  APP_RUNNING: 'app-running',
  INSTALLING: 'installing',
};

/**
 * Helper to check if robot is in an "active" state (connected and operational)
 */
export const isActiveStatus = (status) => 
  status === ROBOT_STATUS.SLEEPING || 
  status === ROBOT_STATUS.READY || 
  status === ROBOT_STATUS.BUSY;

/**
 * Helper to check if robot can receive commands (awake and not busy)
 */
export const canReceiveCommands = (status) => 
  status === ROBOT_STATUS.READY;

