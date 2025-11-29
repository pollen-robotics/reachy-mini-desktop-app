/**
 * Constants for robot position control ranges
 * All values in meters for positions, radians for rotations
 */
export const ROBOT_POSITION_RANGES = {
  POSITION: { min: -0.05, max: 0.05 }, // X, Y, Z in meters
  PITCH: { min: -0.8, max: 0.8 },     // Pitch in radians
  YAW: { min: -1.2, max: 1.2 },       // Yaw in radians
  ROLL: { min: -0.5, max: 0.5 },      // Roll in radians
  ANTENNA: { min: -160 * Math.PI / 180, max: 160 * Math.PI / 180 }, // Antennas in radians (-160° to 160°)
};

/**
 * Sensitivity settings for input controls
 */
export const INPUT_SENSITIVITY = {
  POSITION: 0.003,        // Position sensitivity (X, Y)
  POSITION_Z: 0.001,     // Z position sensitivity (reduced)
  ROTATION: 0.015,       // Rotation sensitivity (pitch, yaw, roll)
  ANTENNA: 0.2,          // Antenna sensitivity (very high)
};

/**
 * Thresholds for input detection
 */
export const INPUT_THRESHOLDS = {
  ACTIVE_INPUT: 0.005,   // Minimum value to consider input as active (reduced for better responsiveness)
  ZERO_TOLERANCE: 0.01,  // Tolerance for considering values as zero (increased to prevent magnet effect)
  SYNC_TOLERANCE: 0.01,  // Tolerance for syncing from robot state (increased to prevent unwanted snaps)
};

/**
 * Timing constants (in milliseconds)
 */
export const TIMING = {
  MOUSE_DRAG_COOLDOWN: 300,        // Cooldown after mouse drag before accepting gamepad input
  GAMEPAD_RELEASE_SYNC_DELAY: 1000, // Delay before syncing after gamepad release
  DRAG_END_SYNC_DELAY: 2000,       // Delay before syncing after drag end
  NOTIFICATION_THROTTLE: 33,       // Throttle notifications to ~30fps (33ms)
};

/**
 * Extended ranges for joystick visualization (allows going beyond physical limits for finer control)
 */
export const EXTENDED_ROBOT_RANGES = {
  POSITION: { min: -0.15, max: 0.15 }, // X, Y, Z in meters (3x original range)
  PITCH: { min: -2.4, max: 2.4 },     // Pitch in radians (3x original range)
  YAW: { min: -3.6, max: 3.6 },       // Yaw in radians (3x original range)
};

/**
 * Input smoothing factors for intermediate smoothing layer
 * Applied before TargetSmoothingManager for additional fluidity
 * Note: These are used in smoothInputs() before values reach TargetSmoothingManager
 */
export const INPUT_SMOOTHING_FACTORS = {
  POSITION: 0.2,      // Position (X, Y): more responsive
  POSITION_Z: 0.25,   // Z position: slightly smoother
  ROTATION: 0.15,     // Rotation (pitch, yaw, roll): very responsive
  BODY_YAW: 0.3,      // Body yaw: smoother for precision
  ANTENNA: 0.2,       // Antennas: balanced
};

/**
 * Sensitivity factors for mapping inputs to robot ranges
 */
export const INPUT_MAPPING_FACTORS = {
  POSITION: 1.0,      // Full range for position
  ROTATION: 1.0,      // Full range for rotation
  BODY_YAW: 0.3,      // Reduced sensitivity for body yaw (30%)
};

