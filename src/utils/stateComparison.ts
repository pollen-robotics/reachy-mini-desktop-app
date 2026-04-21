/**
 * Fast comparison functions for Zustand state updates.
 *
 * These functions are optimized to replace JSON.stringify for frequent comparisons.
 * They provide much better performance for state synchronization.
 */

import type { RobotStateFull } from '@/types/robot';

interface FrontendLogEntry {
  timestamp: string;
  message: string;
  source: string;
}

/**
 * Compare two numeric arrays (Float64Array or regular arrays) by value.
 */
function arraysEqual(
  a: ArrayLike<number> | null | undefined,
  b: ArrayLike<number> | null | undefined
): boolean {
  if (a === b) return true;
  if (!a || !b) return a === b;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Compare `robotStateFull` objects efficiently.
 * Ignores metadata fields (lastUpdate, dataVersion, timestamp) that change on every
 * WebSocket message; only compares actual robot data by value.
 */
export function compareRobotStateFull(
  prev: RobotStateFull | null | undefined,
  next: RobotStateFull | null | undefined
): boolean {
  if (prev === next) return true;
  if (!prev || !next) return prev === next;

  if (prev.error !== next.error) return false;

  if (!prev.data && !next.data) return true;
  if (!prev.data || !next.data) return false;

  const a = prev.data;
  const b = next.data;

  if (a.control_mode !== b.control_mode) return false;
  if (a.body_yaw !== b.body_yaw) return false;

  if (!arraysEqual(a.head_pose, b.head_pose)) return false;
  if (!arraysEqual(a.head_joints, b.head_joints)) return false;
  if (!arraysEqual(a.antennas_position, b.antennas_position)) return false;
  if (!arraysEqual(a.passive_joints, b.passive_joints)) return false;

  const prevDoa = a.doa;
  const nextDoa = b.doa;
  if (prevDoa !== nextDoa) {
    if (!prevDoa || !nextDoa) return false;
    if (prevDoa.angle !== nextDoa.angle) return false;
    if (prevDoa.speech_detected !== nextDoa.speech_detected) return false;
  }

  return true;
}

/**
 * Compare arrays of strings (e.g. activeMoves).
 */
export function compareStringArray(
  prev: ReadonlyArray<string> | null | undefined,
  next: ReadonlyArray<string> | null | undefined
): boolean {
  if (prev === next) return true;
  if (!prev || !next) return prev === next;
  if (prev.length !== next.length) return false;

  for (let i = 0; i < prev.length; i++) {
    if (prev[i] !== next[i]) return false;
  }
  return true;
}

/**
 * Compare frontendLogs arrays.
 * Optimization: only compare the last entry (logs are append-only).
 */
export function compareFrontendLogs(
  prev: ReadonlyArray<FrontendLogEntry> | null | undefined,
  next: ReadonlyArray<FrontendLogEntry> | null | undefined
): boolean {
  if (prev === next) return true;
  if (!prev || !next) return prev === next;
  if (prev.length !== next.length) return false;

  if (prev.length > 0 && next.length > 0) {
    const lastPrev = prev[prev.length - 1];
    const lastNext = next[next.length - 1];
    if (
      lastPrev.timestamp !== lastNext.timestamp ||
      lastPrev.message !== lastNext.message ||
      lastPrev.source !== lastNext.source
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Deep equality comparison for objects.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, idx) => deepEqual(val, b[idx]));
  }

  if (Array.isArray(a) || Array.isArray(b)) return false;

  const keysA = Object.keys(a as Record<string, unknown>);
  const keysB = Object.keys(b as Record<string, unknown>);
  if (keysA.length !== keysB.length) return false;

  return keysA.every(key =>
    deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
  );
}

/**
 * Compare state values and extract changed keys.
 * Uses fast comparison functions instead of JSON.stringify.
 */
export function extractChangedUpdates<S extends Record<string, unknown>>(
  prevState: S | null | undefined,
  newState: S | null | undefined,
  relevantKeys: ReadonlyArray<keyof S>
): Partial<S> {
  const changedUpdates: Partial<S> = {};

  if (!prevState || !newState) {
    return changedUpdates;
  }

  relevantKeys.forEach(key => {
    const prevValue = prevState[key];
    const newValue = newState[key];

    if (prevValue === newValue) return;

    if (key === 'robotStateFull') {
      if (
        !compareRobotStateFull(
          prevValue as RobotStateFull | null,
          newValue as RobotStateFull | null
        )
      ) {
        changedUpdates[key] = newValue;
      }
    } else if (key === 'activeMoves') {
      if (!compareStringArray(prevValue as string[] | null, newValue as string[] | null)) {
        changedUpdates[key] = newValue;
      }
    } else if (key === 'frontendLogs') {
      if (
        !compareFrontendLogs(
          prevValue as FrontendLogEntry[] | null,
          newValue as FrontendLogEntry[] | null
        )
      ) {
        changedUpdates[key] = newValue;
      }
    } else if (
      typeof prevValue === 'object' &&
      typeof newValue === 'object' &&
      prevValue !== null &&
      newValue !== null
    ) {
      if (!deepEqual(prevValue, newValue)) {
        changedUpdates[key] = newValue;
      }
    } else {
      if (prevValue !== newValue) {
        changedUpdates[key] = newValue;
      }
    }
  });

  return changedUpdates;
}
