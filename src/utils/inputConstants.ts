/**
 * Constants for robot position control ranges.
 * All values in meters for positions, radians for rotations.
 */

export interface Range {
  min: number;
  max: number;
}

export const ROBOT_POSITION_RANGES = {
  POSITION: { min: -0.05, max: 0.05 },
  PITCH: { min: -0.8, max: 0.8 },
  YAW: { min: -1.2, max: 1.2 },
  ROLL: { min: -0.5, max: 0.5 },
  ANTENNA: { min: (-160 * Math.PI) / 180, max: (160 * Math.PI) / 180 },
  BODY_YAW: { min: (-160 * Math.PI) / 180, max: (160 * Math.PI) / 180 },
} as const satisfies Record<string, Range>;

/**
 * Sensitivity settings for input controls.
 */
export const INPUT_SENSITIVITY = {
  POSITION: 0.003,
  POSITION_Z: 0.001,
  ROTATION: 0.015,
  ANTENNA: 0.2,
} as const;

/**
 * Thresholds for input detection.
 */
export const INPUT_THRESHOLDS = {
  ACTIVE_INPUT: 0.005,
  ZERO_TOLERANCE: 0.01,
  SYNC_TOLERANCE: 0.01,
  INITIAL_POSITION: 0.0001,
  AT_TARGET: 0.01,
  MAJOR_CHANGE: 0.1,
} as const;

/**
 * Timing constants (in milliseconds).
 */
export const TIMING = {
  MOUSE_DRAG_COOLDOWN: 300,
  GAMEPAD_RELEASE_SYNC_DELAY: 1000,
  DRAG_END_SYNC_DELAY: 2000,
  NOTIFICATION_THROTTLE: 33,
  SEND_THROTTLE: 50,
  UI_UPDATE_INTERVAL: 1000 / 15,
  BUTTON_PULSE: 50,
  GAMEPAD_CONNECTION_POLL: 500,
  SYNC_INTERACTION_GRACE: 30000,
  WS_RECONNECT_DELAY: 1000,
} as const;

/**
 * WebSocket retry policy.
 */
export const WS_RETRY = {
  MAX_ATTEMPTS: 5,
} as const;

/**
 * Progressive increment parameters for held D-pad buttons (Z position, body yaw).
 */
export const PROGRESSIVE_INCREMENT = {
  INITIAL_MAGNITUDE: 0.2,
  FRAME_STEP: 0.002,
  MAX_MAGNITUDE: 1.0,
} as const;

/**
 * Extended ranges for joystick visualization (allows going beyond physical limits for finer control).
 */
export const EXTENDED_ROBOT_RANGES = {
  POSITION: { min: -0.15, max: 0.15 },
  PITCH: { min: -2.4, max: 2.4 },
  YAW: { min: -3.6, max: 3.6 },
} as const satisfies Record<string, Range>;

/**
 * Input smoothing factors for intermediate smoothing layer.
 * Applied before TargetSmoothingManager for additional fluidity.
 */
export const INPUT_SMOOTHING_FACTORS = {
  POSITION: 0.2,
  POSITION_Z: 0.25,
  ROTATION: 0.15,
  BODY_YAW: 0.3,
  ANTENNA: 0.2,
} as const;

/**
 * Sensitivity factors for mapping inputs to robot ranges.
 */
export const INPUT_MAPPING_FACTORS = {
  POSITION: 1.0,
  ROTATION: 1.0,
  BODY_YAW: 0.3,
} as const;
