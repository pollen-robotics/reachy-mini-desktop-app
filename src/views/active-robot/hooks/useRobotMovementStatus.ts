import { useEffect } from 'react';
import { useActiveRobotContext } from '../context';
import { ROBOT_STATUS } from '../../../constants/robotStatus';

/**
 * Hook to monitor active robot movements and update store status
 * Sets robotStatus to 'busy' with busyReason 'moving' when movements are active
 *
 * Uses ActiveRobotContext for decoupling from global stores
 * Now reads activeMoves directly from robotState (populated by useActiveMoves WebSocket hook)
 */
export function useRobotMovementStatus(isActive: boolean): void {
  const { robotState, actions } = useActiveRobotContext();
  const { transitionTo } = actions;
  const { robotStatus, busyReason, activeMoves } = robotState;

  useEffect(() => {
    const moves = Array.isArray(activeMoves) ? activeMoves : [];

    if (!isActive) {
      if (robotStatus === ROBOT_STATUS.BUSY && busyReason === 'moving') {
        transitionTo.ready();
      }
      return;
    }

    if (robotStatus === ROBOT_STATUS.SLEEPING) {
      return;
    }

    const hasActiveMoves = moves.length > 0;

    if (hasActiveMoves) {
      if (robotStatus !== ROBOT_STATUS.BUSY || busyReason !== 'moving') {
        transitionTo.busy('moving');
      }
    } else {
      if (robotStatus === ROBOT_STATUS.BUSY && busyReason === 'moving') {
        transitionTo.ready();
      }
    }
  }, [isActive, activeMoves, robotStatus, busyReason, transitionTo]);
}
