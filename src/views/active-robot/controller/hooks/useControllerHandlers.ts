import { useCallback, useRef } from 'react';
import { useController } from '../context/ControllerContext';
import type { ControllerState } from '../context/ControllerContext';
import { clampAntennas, clampBodyYaw, clampHeadPose } from '@utils/inputHelpers';
import type { HeadPose, SmoothedValues } from '@utils/targetSmoothing';

interface UseControllerHandlersArgs {
  sendCommand: (headPose: HeadPose, antennas: [number, number] | number[], bodyYaw: number) => void;
}

interface DragSnapshot extends Partial<ControllerState> {
  antennas?: [number, number];
}

interface UseControllerHandlersReturn {
  localValues: {
    headPose: HeadPose;
    bodyYaw: number;
    antennas: [number, number];
  };
  getSmoothedValues: () => SmoothedValues;
  handleChange: (updates: Partial<HeadPose>, continuous?: boolean) => void;
  handleBodyYawChange: (value: number, continuous?: boolean) => void;
  handleAntennasChange: (antenna: 'left' | 'right', value: number, continuous?: boolean) => void;
  handleDragEnd: () => void;
  resetAllValues: () => void;
}

export function useControllerHandlers({
  sendCommand,
}: UseControllerHandlersArgs): UseControllerHandlersReturn {
  const { state, actions, smoother, isActive } = useController();

  const dragStartRef = useRef<DragSnapshot | null>(null);

  /**
   * Shared drag lifecycle. On `continuous` changes, ensures a mouse drag is
   * started once; otherwise, ends the interaction and schedules a final send
   * with the smoothed values.
   */
  const applyDragLifecycle = useCallback(
    (continuous: boolean, openSnapshot: () => DragSnapshot): void => {
      if (continuous) {
        if (!dragStartRef.current) {
          dragStartRef.current = openSnapshot();
          actions.startMouseDrag();
        }
        return;
      }

      dragStartRef.current = null;
      actions.endInteraction();

      requestAnimationFrame(() => {
        const smoothed = smoother.getCurrentValues();
        sendCommand(smoothed.headPose, smoothed.antennas, smoothed.bodyYaw);
      });
    },
    [actions, smoother, sendCommand]
  );

  const handleHeadPoseChange = useCallback(
    (updates: Partial<HeadPose>, continuous: boolean = false): void => {
      if (!isActive) return;

      const clampedHeadPose = clampHeadPose({ ...state.headPose, ...updates });

      actions.updateHeadPose(clampedHeadPose);
      smoother.setTargets({ headPose: clampedHeadPose });

      applyDragLifecycle(continuous, () => ({
        headPose: { ...state.headPose },
        bodyYaw: state.bodyYaw,
      }));
    },
    [state.headPose, state.bodyYaw, actions, smoother, applyDragLifecycle, isActive]
  );

  const handleBodyYawChange = useCallback(
    (value: number, continuous: boolean = false): void => {
      if (!isActive) return;

      const clampedValue = clampBodyYaw(value);

      actions.updateBodyYaw(clampedValue);
      smoother.setTargets({ bodyYaw: clampedValue });

      applyDragLifecycle(continuous, () => ({ bodyYaw: state.bodyYaw }));
    },
    [state.bodyYaw, actions, smoother, applyDragLifecycle, isActive]
  );

  const handleAntennasChange = useCallback(
    (antenna: 'left' | 'right', value: number, continuous: boolean = false): void => {
      if (!isActive) return;

      const currentAntennas: [number, number] = state.antennas || [0, 0];
      const clampedAntennas = clampAntennas(
        antenna === 'left' ? [value, currentAntennas[1]] : [currentAntennas[0], value]
      );

      actions.updateAntennas(clampedAntennas);
      smoother.setTargets({ antennas: clampedAntennas });

      applyDragLifecycle(continuous, () => ({
        antennas: [...currentAntennas] as [number, number],
      }));
    },
    [state.antennas, actions, smoother, applyDragLifecycle, isActive]
  );

  const handleDragEnd = useCallback((): void => {
    dragStartRef.current = null;
    actions.endInteraction();
  }, [actions]);

  const resetAllValues = useCallback((): void => {
    actions.startReset();
    smoother.setTargets({
      headPose: { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0 },
      bodyYaw: 0,
      antennas: [0, 0],
    });
  }, [actions, smoother]);

  return {
    localValues: {
      headPose: state.headPose,
      bodyYaw: state.bodyYaw,
      antennas: state.antennas,
    },
    getSmoothedValues: () => smoother.getCurrentValues(),
    handleChange: handleHeadPoseChange,
    handleBodyYawChange,
    handleAntennasChange,
    handleDragEnd,
    resetAllValues,
  };
}
