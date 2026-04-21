import { useEffect, useRef, useState } from 'react';
import { useController } from '../context/ControllerContext';
import { INPUT_THRESHOLDS, TIMING } from '@utils/inputConstants';
import { clampHeadPose, isPoseWithinTolerance } from '@utils/inputHelpers';
import { mapRobotToAPI } from '@utils/inputMappings';
import type { HeadPose, SmoothedValues } from '@utils/targetSmoothing';

interface UseControllerSmoothingArgs {
  sendCommand: (headPose: HeadPose, antennas: [number, number] | number[], bodyYaw: number) => void;
}

interface UseControllerSmoothingReturn {
  smoothedValues: SmoothedValues;
}

export function useControllerSmoothing({
  sendCommand,
}: UseControllerSmoothingArgs): UseControllerSmoothingReturn {
  const { smoother, isDragging, isActive } = useController();

  const rafRef = useRef<number | null>(null);
  const lastUIUpdateRef = useRef<number>(0);

  // Refs keep the RAF loop stable regardless of sendCommand / isDragging updates.
  const sendCommandRef = useRef(sendCommand);
  const isDraggingRef = useRef(isDragging);
  const smootherRef = useRef(smoother);

  useEffect(() => {
    sendCommandRef.current = sendCommand;
  }, [sendCommand]);
  useEffect(() => {
    isDraggingRef.current = isDragging;
  }, [isDragging]);
  useEffect(() => {
    smootherRef.current = smoother;
  }, [smoother]);

  const [smoothedValues, setSmoothedValues] = useState<SmoothedValues>({
    headPose: { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0 },
    bodyYaw: 0,
    antennas: [0, 0],
  });

  useEffect(() => {
    if (!isActive) return;

    const smoothingLoop = (): void => {
      const currentSmoother = smootherRef.current;
      const currentSmoothed = currentSmoother.update();
      const targetValues = currentSmoother.getTargetValues();

      const hasReachedTarget = isPoseWithinTolerance(
        currentSmoothed,
        targetValues,
        INPUT_THRESHOLDS.AT_TARGET
      );

      if (isDraggingRef.current || !hasReachedTarget) {
        sendCommandRef.current(
          transformHeadPoseForAPI(currentSmoothed.headPose),
          currentSmoothed.antennas,
          currentSmoothed.bodyYaw
        );
      }

      const now = performance.now();
      if (now - lastUIUpdateRef.current >= TIMING.UI_UPDATE_INTERVAL) {
        lastUIUpdateRef.current = now;
        setSmoothedValues({
          headPose: { ...currentSmoothed.headPose },
          bodyYaw: currentSmoothed.bodyYaw,
          antennas: [...currentSmoothed.antennas] as [number, number],
        });
      }

      rafRef.current = requestAnimationFrame(smoothingLoop);
    };

    rafRef.current = requestAnimationFrame(smoothingLoop);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isActive]);

  return { smoothedValues };
}

/**
 * Translate the ghost pose (UI-space, extended ranges) into the API-space
 * pose the daemon expects, then clamp to the physical ranges.
 */
function transformHeadPoseForAPI(headPose: HeadPose): HeadPose {
  return clampHeadPose(
    {
      x: mapRobotToAPI(headPose.x, 'positionX'),
      y: mapRobotToAPI(headPose.y, 'positionY'),
      z: headPose.z,
      pitch: mapRobotToAPI(headPose.pitch, 'pitch'),
      yaw: mapRobotToAPI(headPose.yaw, 'yaw'),
      roll: mapRobotToAPI(headPose.roll, 'roll'),
    },
    { extended: false }
  );
}
