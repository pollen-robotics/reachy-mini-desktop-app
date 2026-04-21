/**
 * Unified target smoothing system.
 *
 * Centralized smoothing applied to ALL input sources (mouse, gamepad, keyboard):
 * 1. Input sources set "target" values (where we want to go).
 * 2. Smoothing system interpolates current values towards targets.
 * 3. Smoothed values are sent to the robot.
 *
 * Ensures consistent, fluid movement regardless of the input source.
 */

import { smoothValue, getDeltaTime } from './inputSmoothing';

/**
 * Smoothing factors for different pose components.
 * - Lower values = slower response (ghost takes longer to be caught up)
 * - Higher values = faster response (ghost is caught up quickly)
 */
const SMOOTHING_FACTORS = {
  POSITION: 0.02,
  ROTATION: 0.02,
  BODY_YAW: 0.0375,
  ANTENNA: 0.03,
} as const;

export interface HeadPose {
  x: number;
  y: number;
  z: number;
  pitch: number;
  yaw: number;
  roll: number;
}

export interface SmoothedValues {
  headPose: HeadPose;
  bodyYaw: number;
  antennas: [number, number];
}

export interface PartialTargets {
  headPose?: Partial<HeadPose>;
  bodyYaw?: number;
  antennas?: ArrayLike<number>;
}

const createZeroPose = (): HeadPose => ({ x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0 });
const createZeroAntennas = (): [number, number] => [0, 0];

/**
 * Target smoothing manager. Manages target values and smooths current values
 * towards them frame by frame.
 */
export class TargetSmoothingManager {
  currentValues: SmoothedValues;
  targetValues: SmoothedValues;
  lastFrameTime: number;

  constructor() {
    this.currentValues = {
      headPose: createZeroPose(),
      bodyYaw: 0,
      antennas: createZeroAntennas(),
    };
    this.targetValues = {
      headPose: createZeroPose(),
      bodyYaw: 0,
      antennas: createZeroAntennas(),
    };
    this.lastFrameTime = performance.now();
  }

  setTargets(targets: PartialTargets): void {
    if (targets.headPose) {
      this.targetValues.headPose = { ...this.targetValues.headPose, ...targets.headPose };
    }
    if (targets.bodyYaw !== undefined) {
      this.targetValues.bodyYaw = targets.bodyYaw;
    }
    if (targets.antennas) {
      this.targetValues.antennas = [targets.antennas[0] ?? 0, targets.antennas[1] ?? 0];
    }
  }

  /**
   * Update smoothed values towards targets. Should be called every frame
   * (typically via `requestAnimationFrame`).
   */
  update(): SmoothedValues {
    // Reads delta to keep loop time bookkeeping in sync, even if not used here.
    void getDeltaTime(this.lastFrameTime);
    this.lastFrameTime = performance.now();

    this.currentValues.headPose = {
      x: smoothValue(
        this.currentValues.headPose.x,
        this.targetValues.headPose.x,
        SMOOTHING_FACTORS.POSITION
      ),
      y: smoothValue(
        this.currentValues.headPose.y,
        this.targetValues.headPose.y,
        SMOOTHING_FACTORS.POSITION
      ),
      z: smoothValue(
        this.currentValues.headPose.z,
        this.targetValues.headPose.z,
        SMOOTHING_FACTORS.POSITION
      ),
      pitch: smoothValue(
        this.currentValues.headPose.pitch,
        this.targetValues.headPose.pitch,
        SMOOTHING_FACTORS.ROTATION
      ),
      yaw: smoothValue(
        this.currentValues.headPose.yaw,
        this.targetValues.headPose.yaw,
        SMOOTHING_FACTORS.ROTATION
      ),
      roll: smoothValue(
        this.currentValues.headPose.roll,
        this.targetValues.headPose.roll,
        SMOOTHING_FACTORS.ROTATION
      ),
    };

    this.currentValues.bodyYaw = smoothValue(
      this.currentValues.bodyYaw,
      this.targetValues.bodyYaw,
      SMOOTHING_FACTORS.BODY_YAW
    );

    this.currentValues.antennas = [
      smoothValue(
        this.currentValues.antennas[0],
        this.targetValues.antennas[0],
        SMOOTHING_FACTORS.ANTENNA
      ),
      smoothValue(
        this.currentValues.antennas[1],
        this.targetValues.antennas[1],
        SMOOTHING_FACTORS.ANTENNA
      ),
    ];

    return {
      headPose: { ...this.currentValues.headPose },
      bodyYaw: this.currentValues.bodyYaw,
      antennas: [...this.currentValues.antennas],
    };
  }

  getCurrentValues(): SmoothedValues {
    return {
      headPose: { ...this.currentValues.headPose },
      bodyYaw: this.currentValues.bodyYaw,
      antennas: [...this.currentValues.antennas],
    };
  }

  /** Get target values (used for ghost visualization). */
  getTargetValues(): SmoothedValues {
    return {
      headPose: { ...this.targetValues.headPose },
      bodyYaw: this.targetValues.bodyYaw,
      antennas: [...this.targetValues.antennas],
    };
  }

  reset(): void {
    this.currentValues = {
      headPose: createZeroPose(),
      bodyYaw: 0,
      antennas: createZeroAntennas(),
    };
    this.targetValues = {
      headPose: createZeroPose(),
      bodyYaw: 0,
      antennas: createZeroAntennas(),
    };
  }

  /**
   * Sync with external values (e.g. from robot state) when robot state changes
   * externally.
   */
  sync(values: PartialTargets): void {
    if (values.headPose) {
      const headPose = { ...this.currentValues.headPose, ...values.headPose };
      this.currentValues.headPose = { ...headPose };
      this.targetValues.headPose = { ...headPose };
    }
    if (values.bodyYaw !== undefined) {
      this.currentValues.bodyYaw = values.bodyYaw;
      this.targetValues.bodyYaw = values.bodyYaw;
    }
    if (values.antennas) {
      const antennas: [number, number] = [values.antennas[0] ?? 0, values.antennas[1] ?? 0];
      this.currentValues.antennas = [...antennas];
      this.targetValues.antennas = [...antennas];
    }
  }
}
