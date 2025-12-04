import { useCallback } from 'react';
import { buildApiUrl, fetchWithTimeout, DAEMON_CONFIG } from '../../../../config/daemon';
import useAppStore from '../../../../store/useAppStore';

/**
 * Hook to monitor and manage active robot moves
 * ✅ Now reads from centralized store (no polling - handled by useRobotState)
 * Provides stop functions for active moves
 */
export function useActiveMoves(isActive) {
  // ✅ Read from centralized store (polled by useRobotState)
  const activeMoves = useAppStore(state => state.activeMoves || []);
  const setActiveMoves = useAppStore(state => state.setActiveMoves);

  // Stop a specific move by UUID
  const stopMove = useCallback(async (moveUuid) => {
    if (!isActive || !moveUuid) return;

    try {
      await fetchWithTimeout(
        buildApiUrl('/api/move/stop'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uuid: moveUuid }),
        },
        DAEMON_CONFIG.TIMEOUTS.COMMAND,
        { label: 'Stop move', silent: false }
      );

      // Refresh active moves after stopping (will be updated by next poll from useRobotState)
      // No need to manually fetch - useRobotState will update the store
    } catch (error) {
      console.error('❌ Failed to stop move:', error);
    }
  }, [isActive]);

  // Stop all active moves
  const stopAllMoves = useCallback(async () => {
    if (!isActive || activeMoves.length === 0) return;

    await Promise.all(
      activeMoves.map(move => stopMove(move.uuid))
    );
  }, [isActive, activeMoves, stopMove]);

  return {
    activeMoves,
    isLoading: false, // No loading state needed (synchronous read from store)
    stopMove,
    stopAllMoves,
    refreshActiveMoves: () => {}, // No-op (handled by useRobotState)
  };
}

