/**
 * Helper functions for input processing and validation
 */

/**
 * Check if a value is effectively zero (within tolerance)
 * @param {number} value - Value to check
 * @param {number} tolerance - Tolerance threshold (default: 0.001)
 * @returns {boolean} True if value is effectively zero
 */
export function isZero(value, tolerance = 0.001) {
  return Math.abs(value) < tolerance;
}

/**
 * Check if a head pose is at zero position
 * @param {Object} headPose - Head pose object with x, y, z, pitch, yaw, roll
 * @param {number} tolerance - Tolerance threshold (default: 0.001)
 * @returns {boolean} True if all values are effectively zero
 */
export function isHeadPoseZero(headPose, tolerance = 0.001) {
  if (!headPose) return true;
  
  return (
    isZero(headPose.x, tolerance) &&
    isZero(headPose.y, tolerance) &&
    isZero(headPose.z, tolerance) &&
    isZero(headPose.pitch, tolerance) &&
    isZero(headPose.yaw, tolerance) &&
    isZero(headPose.roll, tolerance)
  );
}

/**
 * Check if antennas are at zero position
 * @param {Array<number>} antennas - Array of two antenna values [left, right]
 * @param {number} tolerance - Tolerance threshold (default: 0.001)
 * @returns {boolean} True if both antennas are effectively zero
 */
export function areAntennasZero(antennas, tolerance = 0.001) {
  if (!antennas || antennas.length !== 2) return true;
  
  return (
    isZero(antennas[0], tolerance) &&
    isZero(antennas[1], tolerance)
  );
}

/**
 * Clamp a value within a range
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Check if any input value is above threshold (active)
 * @param {Object} inputs - Input object with various input values
 * @param {number} threshold - Threshold to check against (default: 0.02)
 * @returns {boolean} True if any input is active
 */
export function hasActiveInput(inputs, threshold = 0.02) {
  return (
    Math.abs(inputs.lookHorizontal || 0) > threshold ||
    Math.abs(inputs.lookVertical || 0) > threshold ||
    Math.abs(inputs.moveForward || 0) > threshold ||
    Math.abs(inputs.moveRight || 0) > threshold ||
    Math.abs(inputs.moveUp || 0) > threshold ||
    Math.abs(inputs.roll || 0) > threshold ||
    Math.abs(inputs.bodyYaw || 0) > threshold ||
    Math.abs(inputs.antennaLeft || 0) > threshold ||
    Math.abs(inputs.antennaRight || 0) > threshold
  );
}

/**
 * Create a zero head pose object
 * @returns {Object} Head pose with all values at zero
 */
export function createZeroHeadPose() {
  return {
    x: 0,
    y: 0,
    z: 0,
    pitch: 0,
    yaw: 0,
    roll: 0,
  };
}

/**
 * Create zero antennas array
 * @returns {Array<number>} Array with two zeros [0, 0]
 */
export function createZeroAntennas() {
  return [0, 0];
}

