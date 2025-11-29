/**
 * Unified target smoothing system
 * 
 * This module provides a centralized smoothing system that applies to ALL input sources
 * (mouse, gamepad, keyboard). The pattern is:
 * 1. Input sources set "target" values (where we want to go)
 * 2. Smoothing system interpolates current values towards targets
 * 3. Smoothed values are sent to the robot
 * 
 * This ensures consistent, fluid movement regardless of input source.
 */

import { smoothValue, getDeltaTime } from './inputSmoothing';

/**
 * Smoothing factors for different pose components
 * Lower values = slower response (ghost takes longer to be caught up)
 * Higher values = faster response (ghost is caught up quickly)
 */
const SMOOTHING_FACTORS = {
  POSITION: 0.02,     // Position (X, Y, Z) - very slow, ghost takes much longer to catch up (divided by 2)
  ROTATION: 0.02,     // Rotation (pitch, yaw, roll) - very slow, ghost takes much longer to catch up (divided by 2)
  BODY_YAW: 0.0375,   // Body yaw - very slow for precision (divided by 2)
  ANTENNA: 0.03,      // Antennas - very slow, ghost takes much longer to catch up (divided by 2)
};

/**
 * Target smoothing manager
 * Manages target values and smooths them towards current values
 */
export class TargetSmoothingManager {
  constructor() {
    // Current smoothed values (what's actually sent to robot)
    this.currentValues = {
      headPose: { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0 },
      bodyYaw: 0,
      antennas: [0, 0],
    };
    
    // Target values (where we want to go)
    this.targetValues = {
      headPose: { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0 },
      bodyYaw: 0,
      antennas: [0, 0],
    };
    
    this.lastFrameTime = performance.now();
  }

  /**
   * Set target values (called by any input source: mouse, gamepad, keyboard)
   * @param {Object} targets - Target values to smooth towards
   */
  setTargets(targets) {
    if (targets.headPose) {
      this.targetValues.headPose = { ...this.targetValues.headPose, ...targets.headPose };
    }
    if (targets.bodyYaw !== undefined) {
      this.targetValues.bodyYaw = targets.bodyYaw;
    }
    if (targets.antennas) {
      this.targetValues.antennas = [...targets.antennas];
    }
  }

  /**
   * Update smoothed values towards targets
   * Should be called every frame (via requestAnimationFrame)
   * @returns {Object} Current smoothed values
   */
  update() {
    const { deltaTime } = getDeltaTime(this.lastFrameTime);
    this.lastFrameTime = performance.now();

    // Smooth head pose
    this.currentValues.headPose = {
      x: smoothValue(this.currentValues.headPose.x, this.targetValues.headPose.x, SMOOTHING_FACTORS.POSITION),
      y: smoothValue(this.currentValues.headPose.y, this.targetValues.headPose.y, SMOOTHING_FACTORS.POSITION),
      z: smoothValue(this.currentValues.headPose.z, this.targetValues.headPose.z, SMOOTHING_FACTORS.POSITION),
      pitch: smoothValue(this.currentValues.headPose.pitch, this.targetValues.headPose.pitch, SMOOTHING_FACTORS.ROTATION),
      yaw: smoothValue(this.currentValues.headPose.yaw, this.targetValues.headPose.yaw, SMOOTHING_FACTORS.ROTATION),
      roll: smoothValue(this.currentValues.headPose.roll, this.targetValues.headPose.roll, SMOOTHING_FACTORS.ROTATION),
    };

    // Smooth body yaw
    this.currentValues.bodyYaw = smoothValue(
      this.currentValues.bodyYaw,
      this.targetValues.bodyYaw,
      SMOOTHING_FACTORS.BODY_YAW
    );

    // Smooth antennas
    this.currentValues.antennas = [
      smoothValue(this.currentValues.antennas[0], this.targetValues.antennas[0], SMOOTHING_FACTORS.ANTENNA),
      smoothValue(this.currentValues.antennas[1], this.targetValues.antennas[1], SMOOTHING_FACTORS.ANTENNA),
    ];

    return { ...this.currentValues };
  }

  /**
   * Get current smoothed values
   * @returns {Object} Current smoothed values
   */
  getCurrentValues() {
    return { ...this.currentValues };
  }

  /**
   * Get target values (for ghost visualization)
   * @returns {Object} Target values
   */
  getTargetValues() {
    return {
      headPose: { ...this.targetValues.headPose },
      bodyYaw: this.targetValues.bodyYaw,
      antennas: [...this.targetValues.antennas],
    };
  }

  /**
   * Reset to zero (for initialization or reset)
   */
  reset() {
    this.currentValues = {
      headPose: { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0 },
      bodyYaw: 0,
      antennas: [0, 0],
    };
    this.targetValues = {
      headPose: { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0 },
      bodyYaw: 0,
      antennas: [0, 0],
    };
  }

  /**
   * Sync with external values (e.g., from robot state)
   * Useful when robot state changes externally
   */
  sync(values) {
    if (values.headPose) {
      this.currentValues.headPose = { ...values.headPose };
      this.targetValues.headPose = { ...values.headPose };
    }
    if (values.bodyYaw !== undefined) {
      this.currentValues.bodyYaw = values.bodyYaw;
      this.targetValues.bodyYaw = values.bodyYaw;
    }
    if (values.antennas) {
      this.currentValues.antennas = [...values.antennas];
      this.targetValues.antennas = [...values.antennas];
    }
  }
}

