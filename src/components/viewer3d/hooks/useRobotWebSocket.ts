import { useRef, useMemo, useEffect } from 'react';
import useAppStore from '../../../store/useAppStore';
import { arraysEqual } from '../../../utils/arraysEqual';
import { useKinematicsWasm } from '../../../utils/kinematics-wasm/useKinematicsWasm';
import type {
  Antennas,
  HeadJoints,
  HeadPoseMatrix,
  PassiveJoints,
  RobotStateData,
} from '../../../types/robot';

/**
 * 🚀 REFACTORED: Now reads from centralized store instead of separate WebSocket
 *
 * Previously this hook maintained its own WebSocket connection to the daemon.
 * Now it reads from robotStateFull which is populated by useRobotStateWebSocket.
 *
 * 🦀 WASM: Still calculates passive joints locally when daemon doesn't provide them.
 * The daemon with AnalyticalKinematics (USB mode) doesn't have passive joints.
 *
 * Benefits:
 * - Single WebSocket connection (vs 2 before: HTTP + viewer WS)
 * - No duplicate network requests
 * - Single source of truth in Zustand store
 * - Same interface for Viewer3D (backward compatible)
 */
export interface RobotWebSocketState {
  headPose: HeadPoseMatrix | null;
  headJoints: HeadJoints | null;
  yawBody: number;
  antennas: Antennas;
  passiveJoints: PassiveJoints | null;
  dataVersion: number;
}

export function useRobotWebSocket(isActive: boolean): RobotWebSocketState {
  // Read robot state from centralized store
  const robotStateData = useAppStore(
    state => state.robotStateFull?.data as RobotStateData | null | undefined
  );

  // 🦀 WASM kinematics for calculating passive joints locally (fallback)
  // TODO(ts): useKinematicsWasm is still a plain JS module, widen the shape here.
  const wasm = useKinematicsWasm() as unknown as {
    isReady: boolean;
    calculatePassiveJoints: (
      headJoints: HeadJoints,
      headPose: HeadPoseMatrix
    ) => number[] | null | undefined;
  };
  const { isReady: wasmReady, calculatePassiveJoints } = wasm;
  const wasmReadyRef = useRef(false);

  // Keep ref in sync with wasmReady state
  useEffect(() => {
    wasmReadyRef.current = wasmReady;
  }, [wasmReady]);

  // Refs for stable value comparison
  const prevStateRef = useRef<RobotWebSocketState>({
    headPose: null,
    headJoints: null,
    yawBody: 0,
    antennas: [0, 0],
    passiveJoints: null,
    dataVersion: 0,
  });

  // 🔄 Reset refs when inactive (robot switch cleanup)
  useEffect(() => {
    if (!isActive || !robotStateData) {
      prevStateRef.current = {
        headPose: null,
        headJoints: null,
        yawBody: 0,
        antennas: [0, 0],
        passiveJoints: null,
        dataVersion: 0,
      };
    }
  }, [isActive, robotStateData]);

  // Build robot state, using refs to maintain stable references
  const robotState = useMemo<RobotWebSocketState>(() => {
    // If inactive, return default state
    if (!isActive || !robotStateData) {
      return {
        headPose: null,
        headJoints: null,
        yawBody: 0,
        antennas: [0, 0],
        passiveJoints: null,
        dataVersion: 0,
      };
    }

    const prev = prevStateRef.current;
    let hasChanges = false;

    // Extract head_pose (4x4 matrix, 16 values)
    let headPose = prev.headPose;
    if (robotStateData.head_pose) {
      // TODO(ts): daemon sometimes wraps head_pose in { m: number[] } but types only expose number[]
      const rawHeadPose = robotStateData.head_pose as unknown as number[] | { m?: number[] };
      const newHeadPose = Array.isArray(rawHeadPose) ? rawHeadPose : rawHeadPose?.m;

      if (newHeadPose?.length === 16 && !arraysEqual(newHeadPose, prev.headPose)) {
        headPose = newHeadPose;
        hasChanges = true;
      }
    }

    // Extract head_joints (7 values)
    let headJoints = prev.headJoints;
    let yawBody = prev.yawBody;
    if (robotStateData.head_joints?.length === 7) {
      if (!arraysEqual(robotStateData.head_joints, prev.headJoints)) {
        headJoints = robotStateData.head_joints;
        hasChanges = true;
      }

      const newYawBody = robotStateData.head_joints[0];
      if (Math.abs(newYawBody - prev.yawBody) > 0.005) {
        yawBody = newYawBody;
        hasChanges = true;
      }
    }

    // Extract antennas
    let antennas = prev.antennas;
    if (
      robotStateData.antennas_position &&
      !arraysEqual(robotStateData.antennas_position, prev.antennas)
    ) {
      antennas = robotStateData.antennas_position;
      hasChanges = true;
    }

    // 🦀 Passive joints: ALWAYS calculated via WASM (daemon never sends them)
    let passiveJoints = prev.passiveJoints;

    if (wasmReadyRef.current && headJoints && headPose) {
      const calculatedPassiveJoints = calculatePassiveJoints(headJoints, headPose);
      if (calculatedPassiveJoints?.length === 21) {
        if (!arraysEqual(calculatedPassiveJoints, prev.passiveJoints)) {
          passiveJoints = calculatedPassiveJoints;
          hasChanges = true;
        }
      }
    }

    // Use dataVersion from store or increment
    const dataVersion = robotStateData.dataVersion ?? prev.dataVersion;
    if (dataVersion !== prev.dataVersion) {
      hasChanges = true;
    }

    // Only create new object if something changed
    if (!hasChanges) {
      return prev;
    }

    const newState: RobotWebSocketState = {
      headPose,
      headJoints,
      yawBody,
      antennas,
      passiveJoints,
      dataVersion,
    };

    prevStateRef.current = newState;
    return newState;
  }, [isActive, robotStateData, calculatePassiveJoints]);

  return robotState;
}
