import { useEffect, useRef } from 'react';
import { useController, ControllerMode } from '../context/ControllerContext';
import { useActiveRobotContext } from '../../context';
import { INPUT_THRESHOLDS, TIMING } from '@utils/inputConstants';
import { isPoseWithinTolerance, poseSnapshotDistance } from '@utils/inputHelpers';
import type { HeadPose } from '@utils/targetSmoothing';

interface RobotValues {
  headPose: HeadPose;
  bodyYaw: number;
  antennas: [number, number];
}

// TODO(ts): RobotStateData.head_pose is declared as HeadPoseMatrix (number[]) in
// src/types/robot.ts, but runtime data is actually an object with x/y/z/pitch/yaw/roll.
// Using a local cast here until the upstream type is reconciled.
interface HeadPoseObjectData {
  head_pose?: Partial<HeadPose> & Record<string, number | undefined>;
  body_yaw?: number;
  antennas_position?: [number, number];
}

export function useControllerSync(): void {
  const { state, actions, smoother, isDragging, isActive } = useController();
  const { robotState } = useActiveRobotContext();
  const robotStateFull = robotState.robotStateFull;

  // Non-reactive read-back of the latest controller state from inside the effect.
  const stateRef = useRef(state);
  const isDraggingRef = useRef(isDragging);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    isDraggingRef.current = isDragging;
  }, [isDragging]);

  useEffect(() => {
    if (!isActive || !robotStateFull?.data) return;

    const data = robotStateFull.data as unknown as HeadPoseObjectData;
    if (!data.head_pose) return;

    const robotValues: RobotValues = {
      headPose: {
        x: data.head_pose.x ?? 0,
        y: data.head_pose.y ?? 0,
        z: data.head_pose.z ?? 0,
        pitch: data.head_pose.pitch ?? 0,
        yaw: data.head_pose.yaw ?? 0,
        roll: data.head_pose.roll ?? 0,
      },
      bodyYaw: typeof data.body_yaw === 'number' ? data.body_yaw : 0,
      antennas: (data.antennas_position || [0, 0]) as [number, number],
    };

    const currentState = stateRef.current;

    if (isDraggingRef.current) return;
    if (currentState.mode !== ControllerMode.IDLE) return;

    const timeSinceInteraction = Date.now() - currentState.lastInteractionTime;
    if (timeSinceInteraction < TIMING.SYNC_INTERACTION_GRACE) return;

    const hasMajorChange =
      poseSnapshotDistance(currentState, robotValues) > INPUT_THRESHOLDS.MAJOR_CHANGE;
    if (!hasMajorChange) return;

    const targetValues = smoother.getTargetValues();
    const isCloseToTarget = isPoseWithinTolerance(
      robotValues,
      targetValues,
      INPUT_THRESHOLDS.SYNC_TOLERANCE
    );
    if (isCloseToTarget) return;

    actions.syncFromRobot(robotValues);
    smoother.sync(robotValues);
  }, [isActive, robotStateFull, actions, smoother]);
}
