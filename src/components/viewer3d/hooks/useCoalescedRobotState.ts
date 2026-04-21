import { useEffect, useMemo, useRef } from 'react';
import { arraysEqual } from '../../../utils/arraysEqual';
import type { RobotWebSocketState } from './useRobotWebSocket';

export interface CoalescedRobotState {
  headPose: number[] | null;
  headJoints: number[] | null;
  yawBody: number | null;
  antennas: number[];
  passiveJoints: number[] | { array?: number[] } | null;
}

type PassiveJointsValue = CoalescedRobotState['passiveJoints'];

/**
 * Merges explicit props (user-provided poses) with websocket-driven robot state
 * and keeps stable references as long as the values are equal within tolerance.
 *
 * This replaces 5 copy/pasted `useMemo` blocks that all implemented the same
 * "diff via arraysEqual then swap ref" pattern. Using a single useEffect
 * instead of mutating refs from `useMemo` also avoids an anti-pattern: React
 * does not guarantee `useMemo` runs exactly once per render.
 */
export function useCoalescedRobotState(params: {
  enabled: boolean;
  robotState: RobotWebSocketState;
  antennas: number[] | null;
  headPose: number[] | null;
  headJoints: number[] | null;
  yawBody: number | null;
}): CoalescedRobotState {
  const { enabled, robotState, antennas, headPose, headJoints, yawBody } = params;

  const stableRef = useRef<CoalescedRobotState>({
    headPose: null,
    headJoints: null,
    yawBody: null,
    antennas: [0, 0],
    passiveJoints: null,
  });

  useEffect(() => {
    if (!enabled) {
      stableRef.current = {
        headPose: null,
        headJoints: null,
        yawBody: null,
        antennas: [0, 0],
        passiveJoints: null,
      };
    }
  }, [enabled]);

  return useMemo<CoalescedRobotState>(() => {
    const prev = stableRef.current;

    const rawAntennas =
      antennas !== null ? antennas : enabled ? robotState.antennas || [0, 0] : [0, 0];
    const nextAntennas = arraysEqual(rawAntennas, prev.antennas) ? prev.antennas : rawAntennas;

    const rawHeadPose = headPose !== null ? headPose : enabled ? robotState.headPose : null;
    const nextHeadPose = !rawHeadPose
      ? null
      : arraysEqual(rawHeadPose, prev.headPose)
        ? prev.headPose
        : rawHeadPose;

    const rawHeadJoints = headJoints !== null ? headJoints : enabled ? robotState.headJoints : null;
    const nextHeadJoints = !rawHeadJoints
      ? null
      : arraysEqual(rawHeadJoints, prev.headJoints)
        ? prev.headJoints
        : rawHeadJoints;

    const rawYawBody = yawBody !== null ? yawBody : enabled ? robotState.yawBody : null;
    const nextYawBody =
      rawYawBody === null || rawYawBody === undefined
        ? (prev.yawBody ?? null)
        : Math.abs(rawYawBody - (prev.yawBody ?? 0)) > 0.005
          ? rawYawBody
          : (prev.yawBody ?? rawYawBody);

    const rawPassive = enabled ? (robotState.passiveJoints as PassiveJointsValue) : null;
    const prevPassiveArr = Array.isArray(prev.passiveJoints)
      ? prev.passiveJoints
      : prev.passiveJoints?.array;
    const nextPassiveArr = Array.isArray(rawPassive) ? rawPassive : rawPassive?.array;
    const nextPassive = !rawPassive
      ? null
      : arraysEqual(nextPassiveArr, prevPassiveArr)
        ? prev.passiveJoints
        : rawPassive;

    const unchanged =
      nextAntennas === prev.antennas &&
      nextHeadPose === prev.headPose &&
      nextHeadJoints === prev.headJoints &&
      nextYawBody === prev.yawBody &&
      nextPassive === prev.passiveJoints;

    if (unchanged) return prev;

    const next: CoalescedRobotState = {
      antennas: nextAntennas,
      headPose: nextHeadPose,
      headJoints: nextHeadJoints,
      yawBody: nextYawBody,
      passiveJoints: nextPassive,
    };
    stableRef.current = next;
    return next;
  }, [
    enabled,
    robotState.antennas,
    robotState.headPose,
    robotState.headJoints,
    robotState.yawBody,
    robotState.passiveJoints,
    antennas,
    headPose,
    headJoints,
    yawBody,
  ]);
}
