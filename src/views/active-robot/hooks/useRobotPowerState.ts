import { useState, useEffect, useRef } from 'react';
import { useActiveRobotContext } from '../context';
import type { Antennas } from '../../../types/robot';

export interface RobotPowerState {
  isOn: boolean | null;
  isMoving: boolean;
}

interface LastPositions {
  body_yaw: number | null;
  antennas: Antennas | null;
}

/**
 * Hook to extract robot power state from centralized robotStateFull
 * Uses API fields: control_mode, body_yaw, antennas_position
 *
 * Consumes robotStateFull from context (streamed via WebSocket at 20Hz)
 * Does NOT handle crash detection (that's useDaemonHealthCheck's job)
 */
export function useRobotPowerState(isActive: boolean): RobotPowerState {
  const { robotState: contextRobotState, api } = useActiveRobotContext();
  const { robotStateFull } = contextRobotState;
  const DAEMON_CONFIG = api.config as {
    MOVEMENT: { MOVEMENT_DETECTION_TIMEOUT: number };
  };
  const [powerState, setPowerState] = useState<RobotPowerState>({
    isOn: null,
    isMoving: false,
  });

  const lastPositionsRef = useRef<LastPositions | null>(null);
  const movementTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isActive || !robotStateFull || !robotStateFull.data) {
      setPowerState({ isOn: null, isMoving: false });
      return;
    }

    const data = robotStateFull.data;

    const motorsOn = data.control_mode === 'enabled';

    let isMoving = false;

    if (data.body_yaw !== undefined && data.antennas_position) {
      const currentPositions: LastPositions = {
        body_yaw: data.body_yaw,
        antennas: data.antennas_position,
      };

      if (lastPositionsRef.current) {
        const yawDiff = Math.abs(
          (currentPositions.body_yaw as number) - (lastPositionsRef.current.body_yaw as number)
        );
        const antennaDiff =
          currentPositions.antennas && lastPositionsRef.current.antennas
            ? Math.abs(currentPositions.antennas[0] - lastPositionsRef.current.antennas[0]) +
              Math.abs(currentPositions.antennas[1] - lastPositionsRef.current.antennas[1])
            : 0;

        if (yawDiff > 0.01 || antennaDiff > 0.01) {
          isMoving = true;

          if (movementTimeoutRef.current) {
            clearTimeout(movementTimeoutRef.current);
          }
          movementTimeoutRef.current = setTimeout(() => {
            setPowerState(prev => ({ ...prev, isMoving: false }));
          }, DAEMON_CONFIG.MOVEMENT.MOVEMENT_DETECTION_TIMEOUT);
        }
      }

      lastPositionsRef.current = currentPositions;
    }

    setPowerState(prev => {
      const newState: RobotPowerState = { isOn: motorsOn, isMoving: isMoving };
      if (prev.isOn === newState.isOn && prev.isMoving === newState.isMoving) {
        return prev;
      }
      return newState;
    });

    return () => {
      if (movementTimeoutRef.current) {
        clearTimeout(movementTimeoutRef.current);
      }
    };
  }, [isActive, robotStateFull]);

  return powerState;
}
