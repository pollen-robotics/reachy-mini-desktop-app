import { useEffect } from 'react';
import useAppStore from '@store/useAppStore';
import { useActiveMoves } from '../controller/hooks';

/**
 * Hook to monitor active robot movements and update store status
 * Sets robotStatus to 'busy' with busyReason 'moving' when movements are active
 */
export function useRobotMovementStatus(isActive) {
  const { activeMoves } = useActiveMoves(isActive);
  const transitionTo = useAppStore(state => state.transitionTo);
  const robotStatus = useAppStore(state => state.robotStatus);
  const busyReason = useAppStore(state => state.busyReason);

  useEffect(() => {
    if (!isActive) {
      // Reset to ready if we were busy due to movement
      if (robotStatus === 'busy' && busyReason === 'moving') {
        transitionTo.ready();
      }
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

