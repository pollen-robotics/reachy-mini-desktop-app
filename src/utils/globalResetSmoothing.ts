/**
 * Global reset smoothing system. Handles smooth reset animation that continues
 * even after the originating component unmounts.
 */

import { TargetSmoothingManager, type HeadPose, type SmoothedValues } from './targetSmoothing';
import { ROBOT_POSITION_RANGES } from './inputConstants';
import { clamp } from './inputHelpers';
import { mapRobotToAPI } from './inputMappings';

/**
 * Function used to send a command to the robot. Kept structural to avoid a
 * tight coupling with the daemon hook contract.
 */
export type SendCommandFn = (
  headPose: HeadPose,
  antennas: [number, number],
  bodyYaw: number
) => void | Promise<void>;

let globalSmoothingManager: TargetSmoothingManager | null = null;
let globalResetRafRef: number | null = null;
let globalSendCommandRef: SendCommandFn | null = null;
const globalIsActiveRef: { current: boolean } = { current: false };

/**
 * Initialize global reset smoothing system. Should be called when the
 * controller is mounted.
 */
export function initGlobalResetSmoothing(sendCommandFn: SendCommandFn, isActive: boolean): void {
  if (!globalSmoothingManager) {
    globalSmoothingManager = new TargetSmoothingManager();
  }
  globalSendCommandRef = sendCommandFn;
  globalIsActiveRef.current = isActive;
}

/** Update global state (called when `isActive` changes). */
export function updateGlobalResetSmoothing(isActive: boolean): void {
  globalIsActiveRef.current = isActive;
  if (!isActive && globalResetRafRef !== null) {
    cancelAnimationFrame(globalResetRafRef);
    globalResetRafRef = null;
  }
}

/**
 * Start smooth reset animation. The animation continues even if the
 * originating component unmounts.
 */
export function startSmoothReset(currentValues?: Partial<SmoothedValues> | null): void {
  if (!globalSmoothingManager || !globalSendCommandRef) {
    console.warn('Global reset smoothing not initialized');
    return;
  }

  if (currentValues) {
    globalSmoothingManager.sync(currentValues);
  }

  const zeroTargets = {
    headPose: { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0 },
    bodyYaw: 0,
    antennas: [0, 0] as [number, number],
  };
  globalSmoothingManager.setTargets(zeroTargets);

  if (globalResetRafRef !== null) {
    cancelAnimationFrame(globalResetRafRef);
  }

  const resetLoop = (): void => {
    if (!globalIsActiveRef.current || !globalSmoothingManager) {
      globalResetRafRef = null;
      return;
    }

    const currentSmoothed = globalSmoothingManager.update();
    const targetValues = globalSmoothingManager.getTargetValues();

    const headPoseDiff =
      Math.abs(currentSmoothed.headPose.x - targetValues.headPose.x) +
      Math.abs(currentSmoothed.headPose.y - targetValues.headPose.y) +
      Math.abs(currentSmoothed.headPose.z - targetValues.headPose.z) +
      Math.abs(currentSmoothed.headPose.pitch - targetValues.headPose.pitch) +
      Math.abs(currentSmoothed.headPose.yaw - targetValues.headPose.yaw) +
      Math.abs(currentSmoothed.headPose.roll - targetValues.headPose.roll);
    const bodyYawDiff = Math.abs(currentSmoothed.bodyYaw - targetValues.bodyYaw);
    const antennasDiff =
      Math.abs(currentSmoothed.antennas[0] - targetValues.antennas[0]) +
      Math.abs(currentSmoothed.antennas[1] - targetValues.antennas[1]);

    const TOLERANCE = 0.01;
    const hasReachedTarget =
      headPoseDiff < TOLERANCE && bodyYawDiff < TOLERANCE && antennasDiff < TOLERANCE;

    if (!hasReachedTarget && globalSendCommandRef) {
      const apiClampedHeadPose: HeadPose = {
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
        z: clamp(
          currentSmoothed.headPose.z,
          ROBOT_POSITION_RANGES.POSITION.min,
          ROBOT_POSITION_RANGES.POSITION.max
        ),
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

      void globalSendCommandRef(
        apiClampedHeadPose,
        currentSmoothed.antennas,
        currentSmoothed.bodyYaw
      );
    }

    if (!hasReachedTarget) {
      globalResetRafRef = requestAnimationFrame(resetLoop);
    } else {
      globalResetRafRef = null;
    }
  };

  globalResetRafRef = requestAnimationFrame(resetLoop);
}

export function stopSmoothReset(): void {
  if (globalResetRafRef !== null) {
    cancelAnimationFrame(globalResetRafRef);
    globalResetRafRef = null;
  }
}

/** Get current smoothed values (for sync). */
export function getCurrentSmoothedValues(): SmoothedValues | null {
  if (!globalSmoothingManager) {
    return null;
  }
  return globalSmoothingManager.getCurrentValues();
}
