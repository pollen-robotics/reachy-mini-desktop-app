import { DAEMON_CONFIG } from '../config/daemon';

/**
 * Detect if robot movement values have changed
 * Compares headJoints, bodyYaw, and antennas between two states
 * 
 * @param {object} current - Current state { headJoints, bodyYaw, antennas }
 * @param {object} previous - Previous state { headJoints, bodyYaw, antennas }
 * @param {number} tolerance - Tolerance for comparison (default: TOLERANCE_SMALL)
 * @returns {object} { headJointsChanged, bodyYawChanged, antennasChanged, anyChanged }
 */
export const detectMovementChanges = (current, previous, tolerance = DAEMON_CONFIG.MOVEMENT.TOLERANCE_SMALL) => {
  if (!previous) {
    return {
      headJointsChanged: false,
      bodyYawChanged: false,
      antennasChanged: false,
      anyChanged: false,
    };
  }

  const headJointsChanged = !previous.headJoints ||
    (current.headJoints && previous.headJoints &&
      current.headJoints.some((val, i) => 
        Math.abs(val - (previous.headJoints[i] || 0)) > tolerance
      ));

  const bodyYawChanged = current.bodyYaw !== undefined && previous.bodyYaw !== undefined &&
    Math.abs(current.bodyYaw - previous.bodyYaw) > tolerance;

  const antennasChanged = !previous.antennas ||
    (current.antennas && previous.antennas &&
      current.antennas.some((val, i) => 
        Math.abs(val - (previous.antennas[i] || 0)) > tolerance
      ));

  return {
    headJointsChanged,
    bodyYawChanged,
    antennasChanged,
    anyChanged: headJointsChanged || bodyYawChanged || antennasChanged,
  };
};

