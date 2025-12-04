/**
 * Global reset smoothing system
 * Handles smooth reset animation that continues even after component unmounts
 */

import { TargetSmoothingManager } from './targetSmoothing';
import { buildApiUrl, fetchWithTimeout, DAEMON_CONFIG } from '@config/daemon';
import { ROBOT_POSITION_RANGES } from '@utils/inputConstants';
import { clamp } from '@utils/inputHelpers';
import { mapRobotToAPI } from '@utils/inputMappings';

// Global refs that persist across component mounts/unmounts
let globalSmoothingManager = null;
let globalResetRafRef = null;
let globalSendCommandRef = null;
let globalIsActiveRef = { current: false };

/**
 * Initialize global reset smoothing system
 * Should be called when controller is mounted
 */
export function initGlobalResetSmoothing(sendCommandFn, isActive) {
  if (!globalSmoothingManager) {
    globalSmoothingManager = new TargetSmoothingManager();
  }
  globalSendCommandRef = sendCommandFn;
  globalIsActiveRef.current = isActive;
}

/**
 * Update global state (called when isActive changes)
 */
export function updateGlobalResetSmoothing(isActive) {
  globalIsActiveRef.current = isActive;
  if (!isActive && globalResetRafRef) {
    // Stop reset loop if robot becomes inactive
    cancelAnimationFrame(globalResetRafRef);
    globalResetRafRef = null;
  }
}

/**
 * Start smooth reset animation
 * This will continue even if component unmounts
 */
export function startSmoothReset(currentValues) {
  if (!globalSmoothingManager || !globalSendCommandRef) {
    console.warn('Global reset smoothing not initialized');
    return;
  }

  // Sync current values to smoothing manager
  if (currentValues) {
    globalSmoothingManager.sync(currentValues);
  }

  // Set targets to zero
  const zeroTargets = {
    headPose: { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0 },
    bodyYaw: 0,
    antennas: [0, 0],
  };
  globalSmoothingManager.setTargets(zeroTargets);

  // Stop any existing reset loop
  if (globalResetRafRef) {
    cancelAnimationFrame(globalResetRafRef);
  }

  // Start reset animation loop
  const resetLoop = () => {
    if (!globalIsActiveRef.current) {
      globalResetRafRef = null;
      return;
    }

    // Update smoothed values towards targets
    const currentSmoothed = globalSmoothingManager.update();
    const targetValues = globalSmoothingManager.getTargetValues();

    // Check if we've reached zero
    const headPoseDiff = Math.abs(currentSmoothed.headPose.x - targetValues.headPose.x) +
                        Math.abs(currentSmoothed.headPose.y - targetValues.headPose.y) +
                        Math.abs(currentSmoothed.headPose.z - targetValues.headPose.z) +
                        Math.abs(currentSmoothed.headPose.pitch - targetValues.headPose.pitch) +
                        Math.abs(currentSmoothed.headPose.yaw - targetValues.headPose.yaw) +
                        Math.abs(currentSmoothed.headPose.roll - targetValues.headPose.roll);
    const bodyYawDiff = Math.abs(currentSmoothed.bodyYaw - targetValues.bodyYaw);
    const antennasDiff = Math.abs(currentSmoothed.antennas[0] - targetValues.antennas[0]) +
                        Math.abs(currentSmoothed.antennas[1] - targetValues.antennas[1]);

    const TOLERANCE = 0.01;
    const hasReachedTarget = headPoseDiff < TOLERANCE && bodyYawDiff < TOLERANCE && antennasDiff < TOLERANCE;

    // Send smoothed values to robot
    if (!hasReachedTarget && globalSendCommandRef) {
      // Clamp to actual robot limits before sending
      const apiClampedHeadPose = {
        x: clamp(
          mapRobotToAPI(currentSmoothed.headPose.x, 'positionX'),
          ROBOT_POSITION_RANGES.POSITION.min,
          ROBOT_POSITION_RANGES.POSITION.max
        ),
        y: clamp(
          mapRobotToAPI(currentSmoothed.headPose.y, 'positionY'),
          ROBOT_POSITION_RANGES.POSITION.min,
          ROBOT_POSITION_RANGES.POSITION.max
        ),
        z: clamp(currentSmoothed.headPose.z, ROBOT_POSITION_RANGES.POSITION.min, ROBOT_POSITION_RANGES.POSITION.max),
        pitch: clamp(
          mapRobotToAPI(currentSmoothed.headPose.pitch, 'pitch'),
          ROBOT_POSITION_RANGES.PITCH.min,
          ROBOT_POSITION_RANGES.PITCH.max
        ),
        yaw: clamp(
          mapRobotToAPI(currentSmoothed.headPose.yaw, 'yaw'),
          ROBOT_POSITION_RANGES.YAW.min,
          ROBOT_POSITION_RANGES.YAW.max
        ),
        roll: clamp(
          mapRobotToAPI(currentSmoothed.headPose.roll, 'roll'),
          ROBOT_POSITION_RANGES.ROLL.min,
          ROBOT_POSITION_RANGES.ROLL.max
        ),
      };

      globalSendCommandRef(
        apiClampedHeadPose,
        currentSmoothed.antennas,
        currentSmoothed.bodyYaw
      );
    }

    // Continue loop if not reached target
    if (!hasReachedTarget) {
      globalResetRafRef = requestAnimationFrame(resetLoop);
    } else {
      // Reset complete
      globalResetRafRef = null;
    }
  };

  globalResetRafRef = requestAnimationFrame(resetLoop);
}

/**
 * Stop smooth reset animation
 */
export function stopSmoothReset() {
  if (globalResetRafRef) {
    cancelAnimationFrame(globalResetRafRef);
    globalResetRafRef = null;
  }
}

/**
 * Get current smoothed values (for sync)
 */
export function getCurrentSmoothedValues() {
  if (!globalSmoothingManager) {
    return null;
  }
  return globalSmoothingManager.getCurrentValues();
}

