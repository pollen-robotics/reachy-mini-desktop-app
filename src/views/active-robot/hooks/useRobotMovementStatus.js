import { useEffect } from 'react';
import { useActiveRobotContext } from '../context';
import { useActiveMoves } from '../controller/hooks';

/**
 * Hook to monitor active robot movements and update store status
 * Sets robotStatus to 'busy' with busyReason 'moving' when movements are active
 * 
 * Uses ActiveRobotContext for decoupling from global stores
 */
export function useRobotMovementStatus(isActive) {
  const { robotState, actions } = useActiveRobotContext();
  const { activeMoves } = useActiveMoves(isActive);
  const { transitionTo } = actions;
  const { robotStatus, busyReason } = robotState;

  useEffect(() => {
    if (!isActive) {
      // Reset to ready if we were busy due to movement
      if (robotStatus === 'busy' && busyReason === 'moving') {
        transitionTo.ready();
      }
      return;
    }

    // Don't interfere with sleeping state - wake/sleep toggle manages its own transitions
    if (robotStatus === 'sleeping') {
      return;
    }

    const hasActiveMoves = activeMoves.length > 0;

    if (hasActiveMoves) {
      // Set to busy with 'moving' reason if not already set
      if (robotStatus !== 'busy' || busyReason !== 'moving') {
        transitionTo.busy('moving');
      }
    } else {
      // Clear busy status if we were busy due to movement
      if (robotStatus === 'busy' && busyReason === 'moving') {
        transitionTo.ready();
      }
    }
  }, [isActive, activeMoves.length, robotStatus, busyReason, transitionTo]);
}

