/**
 * Hook for first wake-up wizard API communication.
 * All robot control goes through the daemon (localhost:8000).
 *
 * Motor control pattern (matches useWakeSleep):
 * 1. POST /api/motors/set_mode/enabled|disabled
 * 2. Verify with GET /api/motors/status
 * 3. POST /api/move/play/{name} for built-in moves
 * 4. POST /api/move/play/recorded-move-dataset/{dataset}/{move} for emotions/dances
 *
 * Note: Sleep position validation reads robotStateFull from the Zustand store
 * (fed by the 20Hz WebSocket in useRobotStateWebSocket) directly in SleepPositionStep.
 */
import { useCallback } from 'react';
import { fetchWithTimeout, buildApiUrl, DAEMON_CONFIG } from '../../config/daemon';

export function useFirstWakeUpApi() {
  const setFirstWakeUpCompleted = useCallback(async () => {
    try {
      await fetchWithTimeout(
        buildApiUrl('/api/first-wake-up/set?is_completed=true'),
        { method: 'POST' },
        DAEMON_CONFIG.TIMEOUTS.COMMAND,
        { label: 'Mark first wake-up completed' }
      );
    } catch (err) {
      console.error('[FirstWakeUp] Failed to mark completed:', err);
    }
  }, []);

  const enableMotors = useCallback(async () => {
    const response = await fetchWithTimeout(
      buildApiUrl('/api/motors/set_mode/enabled'),
      { method: 'POST' },
      DAEMON_CONFIG.TIMEOUTS.COMMAND,
      { label: 'Enable motors' }
    );
    if (!response.ok) {
      throw new Error(`Failed to enable motors (${response.status})`);
    }

    const statusResponse = await fetchWithTimeout(
      buildApiUrl('/api/motors/status'),
      { method: 'GET' },
      DAEMON_CONFIG.TIMEOUTS.COMMAND,
      { label: 'Check motor status' }
    );
    return await statusResponse.json();
  }, []);

  const playMove = useCallback(async moveName => {
    const response = await fetchWithTimeout(
      buildApiUrl(`/api/move/play/${moveName}`),
      { method: 'POST' },
      DAEMON_CONFIG.TIMEOUTS.COMMAND,
      { label: `Play ${moveName}` }
    );
    if (!response.ok) {
      throw new Error(`Failed to play ${moveName} (${response.status})`);
    }
    return await response.json();
  }, []);

  const playRecordedMove = useCallback(async (dataset, move) => {
    const response = await fetchWithTimeout(
      buildApiUrl(`/api/move/play/recorded-move-dataset/${dataset}/${move}`),
      { method: 'POST' },
      DAEMON_CONFIG.TIMEOUTS.COMMAND,
      { label: `Play ${move}` }
    );
    if (!response.ok) {
      throw new Error(`Failed to play ${move} (${response.status})`);
    }
    return await response.json();
  }, []);

  const getVolume = useCallback(async () => {
    try {
      const res = await fetchWithTimeout(
        buildApiUrl(DAEMON_CONFIG.ENDPOINTS.VOLUME_CURRENT),
        {},
        DAEMON_CONFIG.TIMEOUTS.COMMAND,
        { silent: true }
      );
      if (!res.ok) return 50;
      const data = await res.json();
      return data.volume ?? 50;
    } catch {
      return 50;
    }
  }, []);

  const setVolume = useCallback(async volume => {
    try {
      await fetchWithTimeout(
        buildApiUrl(DAEMON_CONFIG.ENDPOINTS.VOLUME_SET),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ volume: Math.round(volume) }),
        },
        DAEMON_CONFIG.TIMEOUTS.COMMAND,
        { silent: true }
      );
    } catch {
      // Ignore
    }
  }, []);

  const playTestSound = useCallback(async () => {
    try {
      await fetchWithTimeout(
        buildApiUrl('/api/volume/test-sound'),
        { method: 'POST' },
        DAEMON_CONFIG.TIMEOUTS.COMMAND,
        { label: 'Play test sound' }
      );
    } catch (err) {
      console.error('[FirstWakeUp] test sound failed:', err);
    }
  }, []);

  return {
    setFirstWakeUpCompleted,
    enableMotors,
    playMove,
    playRecordedMove,
    getVolume,
    setVolume,
    playTestSound,
  };
}
