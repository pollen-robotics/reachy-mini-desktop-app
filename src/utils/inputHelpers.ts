/**
 * Helper functions for input processing and validation.
 */

import { EXTENDED_ROBOT_RANGES, ROBOT_POSITION_RANGES } from './inputConstants';

export interface HeadPose {
  x: number;
  y: number;
  z: number;
  pitch: number;
  yaw: number;
  roll: number;
}

export type Antennas = readonly [number, number] | [number, number] | number[];

const BODY_YAW_LIMIT = (160 * Math.PI) / 180;

export interface RawInputs {
  lookHorizontal?: number;
  lookVertical?: number;
  moveForward?: number;
  moveRight?: number;
  moveUp?: number;
  roll?: number;
  bodyYaw?: number;
  antennaLeft?: number;
  antennaRight?: number;
  [key: string]: number | undefined;
}

/**
 * Check if a value is effectively zero (within tolerance).
 */
export function isZero(value: number, tolerance: number = 0.001): boolean {
  return Math.abs(value) < tolerance;
}

/**
 * Check if a head pose is at zero position.
 */
export function isHeadPoseZero(
  headPose: HeadPose | null | undefined,
  tolerance: number = 0.001
): boolean {
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
 * Check if antennas are at zero position.
 */
export function areAntennasZero(
  antennas: Antennas | null | undefined,
  tolerance: number = 0.001
): boolean {
  if (!antennas || antennas.length !== 2) return true;
  return isZero(antennas[0], tolerance) && isZero(antennas[1], tolerance);
}

/**
 * Clamp a value within a range.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Check if any input value is above threshold (active).
 */
export function hasActiveInput(inputs: RawInputs, threshold: number = 0.02): boolean {
  return (
    Math.abs(inputs.lookHorizontal ?? 0) > threshold ||
    Math.abs(inputs.lookVertical ?? 0) > threshold ||
    Math.abs(inputs.moveForward ?? 0) > threshold ||
    Math.abs(inputs.moveRight ?? 0) > threshold ||
    Math.abs(inputs.moveUp ?? 0) > threshold ||
    Math.abs(inputs.roll ?? 0) > threshold ||
    Math.abs(inputs.bodyYaw ?? 0) > threshold ||
    Math.abs(inputs.antennaLeft ?? 0) > threshold ||
    Math.abs(inputs.antennaRight ?? 0) > threshold
  );
}

/**
 * Create a zero head pose object.
 */
export function createZeroHeadPose(): HeadPose {
  return { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0 };
}

/**
 * Create zero antennas array.
 */
export function createZeroAntennas(): [number, number] {
  return [0, 0];
}

export interface ClampHeadPoseOptions {
  /**
   * Use extended UI ranges for x/y/pitch/yaw (for visualization/mapping),
   * or physical ranges only (for API transmission).
   */
  extended?: boolean;
}

/**
 * Clamp a head pose against either the extended ranges (UI) or physical ranges (API).
 * `z` and `roll` always use physical ranges.
 */
export function clampHeadPose(pose: HeadPose, options: ClampHeadPoseOptions = {}): HeadPose {
  const extended = options.extended ?? true;
  const xy = extended ? EXTENDED_ROBOT_RANGES.POSITION : ROBOT_POSITION_RANGES.POSITION;
  const pitch = extended ? EXTENDED_ROBOT_RANGES.PITCH : ROBOT_POSITION_RANGES.PITCH;
  const yaw = extended ? EXTENDED_ROBOT_RANGES.YAW : ROBOT_POSITION_RANGES.YAW;

  return {
    x: clamp(pose.x, xy.min, xy.max),
    y: clamp(pose.y, xy.min, xy.max),
    z: clamp(pose.z, ROBOT_POSITION_RANGES.POSITION.min, ROBOT_POSITION_RANGES.POSITION.max),
    pitch: clamp(pose.pitch, pitch.min, pitch.max),
    yaw: clamp(pose.yaw, yaw.min, yaw.max),
    roll: clamp(pose.roll, ROBOT_POSITION_RANGES.ROLL.min, ROBOT_POSITION_RANGES.ROLL.max),
  };
}

/**
 * Clamp both antennas against the physical range.
 */
export function clampAntennas(antennas: Antennas): [number, number] {
  const a0 = antennas[0] ?? 0;
  const a1 = antennas[1] ?? 0;
  return [
    clamp(a0, ROBOT_POSITION_RANGES.ANTENNA.min, ROBOT_POSITION_RANGES.ANTENNA.max),
    clamp(a1, ROBOT_POSITION_RANGES.ANTENNA.min, ROBOT_POSITION_RANGES.ANTENNA.max),
  ];
}

/**
 * Clamp the body yaw against the physical ±160° range.
 */
export function clampBodyYaw(yaw: number): number {
  const safe = typeof yaw === 'number' && isFinite(yaw) ? yaw : 0;
  return clamp(safe, -BODY_YAW_LIMIT, BODY_YAW_LIMIT);
}

/**
 * L1-distance between two head poses (sum of absolute component diffs).
 */
export function headPoseDistance(a: HeadPose, b: HeadPose): number {
  return (
    Math.abs(a.x - b.x) +
    Math.abs(a.y - b.y) +
    Math.abs(a.z - b.z) +
    Math.abs(a.pitch - b.pitch) +
    Math.abs(a.yaw - b.yaw) +
    Math.abs(a.roll - b.roll)
  );
}

/**
 * L1-distance between two antenna pairs.
 */
export function antennasDistance(a: Antennas, b: Antennas): number {
  return Math.abs((a[0] ?? 0) - (b[0] ?? 0)) + Math.abs((a[1] ?? 0) - (b[1] ?? 0));
}

export interface PoseSnapshot {
  headPose: HeadPose;
  bodyYaw: number;
  antennas: Antennas;
}

/**
 * Aggregate L1-distance between two full pose snapshots.
 */
export function poseSnapshotDistance(a: PoseSnapshot, b: PoseSnapshot): number {
  return (
    headPoseDistance(a.headPose, b.headPose) +
    Math.abs(a.bodyYaw - b.bodyYaw) +
    antennasDistance(a.antennas, b.antennas)
  );
}

/**
 * Check that all per-axis differences between two pose snapshots are strictly below `tolerance`.
 * Stricter than `poseSnapshotDistance(...) < tolerance` because it enforces the bound axis-by-axis.
 */
export function isPoseWithinTolerance(
  a: PoseSnapshot,
  b: PoseSnapshot,
  tolerance: number
): boolean {
  return (
    Math.abs(a.headPose.x - b.headPose.x) < tolerance &&
    Math.abs(a.headPose.y - b.headPose.y) < tolerance &&
    Math.abs(a.headPose.z - b.headPose.z) < tolerance &&
    Math.abs(a.headPose.pitch - b.headPose.pitch) < tolerance &&
    Math.abs(a.headPose.yaw - b.headPose.yaw) < tolerance &&
    Math.abs(a.headPose.roll - b.headPose.roll) < tolerance &&
    Math.abs(a.bodyYaw - b.bodyYaw) < tolerance &&
    Math.abs((a.antennas[0] ?? 0) - (b.antennas[0] ?? 0)) < tolerance &&
    Math.abs((a.antennas[1] ?? 0) - (b.antennas[1] ?? 0)) < tolerance
  );
}
