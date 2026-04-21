import { DAEMON_CONFIG } from '../config/daemon';

export interface MovementState {
  headJoints?: ArrayLike<number> | null;
  bodyYaw?: number | null;
  antennas?: ArrayLike<number> | null;
}

export interface MovementChanges {
  headJointsChanged: boolean;
  bodyYawChanged: boolean;
  antennasChanged: boolean;
  anyChanged: boolean;
}

/**
 * Detect if robot movement values have changed.
 * Compares headJoints, bodyYaw, and antennas between two states.
 */
export const detectMovementChanges = (
  current: MovementState,
  previous: MovementState | null | undefined,
  tolerance: number = DAEMON_CONFIG.MOVEMENT.TOLERANCE_SMALL
): MovementChanges => {
  if (!previous) {
    return {
      headJointsChanged: false,
      bodyYawChanged: false,
      antennasChanged: false,
      anyChanged: false,
    };
  }

  const headJointsChanged = Boolean(
    !previous.headJoints ||
    (current.headJoints &&
      previous.headJoints &&
      Array.from(current.headJoints).some(
        (val, i) => Math.abs(val - (previous.headJoints?.[i] ?? 0)) > tolerance
      ))
  );

  const bodyYawChanged =
    current.bodyYaw !== undefined &&
    current.bodyYaw !== null &&
    previous.bodyYaw !== undefined &&
    previous.bodyYaw !== null &&
    Math.abs(current.bodyYaw - previous.bodyYaw) > tolerance;

  const antennasChanged = Boolean(
    !previous.antennas ||
    (current.antennas &&
      previous.antennas &&
      Array.from(current.antennas).some(
        (val, i) => Math.abs(val - (previous.antennas?.[i] ?? 0)) > tolerance
      ))
  );

  return {
    headJointsChanged,
    bodyYawChanged,
    antennasChanged,
    anyChanged: headJointsChanged || bodyYawChanged || antennasChanged,
  };
};
