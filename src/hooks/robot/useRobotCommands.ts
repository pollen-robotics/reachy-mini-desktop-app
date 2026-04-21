import { useCallback } from 'react';
import useAppStore from '../../store/useAppStore';
import { DAEMON_CONFIG, fetchWithTimeout, buildApiUrl } from '../../config/daemon';

export interface UseRobotCommandsResult {
  sendCommand: (
    endpoint: string,
    label: string,
    lockDuration?: number,
    silent?: boolean
  ) => Promise<void>;
  playRecordedMove: (dataset: string, move: string) => Promise<void>;
  isCommandRunning: boolean;
}

export const useRobotCommands = (): UseRobotCommandsResult => {
  const { isActive, isCommandRunning } = useAppStore();

  const sendCommand = useCallback(
    async (
      endpoint: string,
      label: string,
      lockDuration: number = DAEMON_CONFIG.MOVEMENT.COMMAND_LOCK_DURATION,
      silent: boolean = false
    ): Promise<void> => {
      if (!isActive) {
        return;
      }

      // ✅ Check global lock (quick action OR app running).
      // Calculate isBusy directly from state (functions are not synced in secondary windows).
      const state = useAppStore.getState();
      const isBusy =
        state.robotStatus === 'busy' ||
        state.isCommandRunning ||
        state.isAppRunning ||
        state.isInstalling;

      if (isBusy) {
        return;
      }

      // Use getState() to access setIsCommandRunning (works in all windows).
      const store = useAppStore.getState();
      if (store.setIsCommandRunning && typeof store.setIsCommandRunning === 'function') {
        store.setIsCommandRunning(true);
      } else {
        // Fallback: use setState directly.
        useAppStore.setState({ isCommandRunning: true });
      }

      // Fire and forget with automatic logging via fetchWithTimeout.
      // Note: fetchWithTimeout automatically logs success/error via logSuccess/logError;
      // `label` is used in the automatic log unless `silent` is true.
      fetchWithTimeout(buildApiUrl(endpoint), { method: 'POST' }, DAEMON_CONFIG.TIMEOUTS.COMMAND, {
        label,
        silent,
      })
        .catch(() => {
          // Failures already surface through fetchWithTimeout's own logging.
        })
        .finally(() => {
          // Unlock commands after lock duration.
          setTimeout(() => {
            const latest = useAppStore.getState();
            if (latest.setIsCommandRunning && typeof latest.setIsCommandRunning === 'function') {
              latest.setIsCommandRunning(false);
            } else {
              useAppStore.setState({ isCommandRunning: false });
            }
          }, lockDuration);
        });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isActive, isCommandRunning]
  );

  const playRecordedMove = useCallback(
    async (dataset: string, move: string): Promise<void> => {
      if (!isActive) return;
      // Choreographies and emotions are longer, lock for 5 seconds.
      // silent: true avoids logging the technical name (e.g. "fear1");
      // the emoji log is already done in ExpressionsSection.jsx.
      await sendCommand(
        `/api/move/play/recorded-move-dataset/${dataset}/${move}`,
        move,
        DAEMON_CONFIG.MOVEMENT.RECORDED_MOVE_LOCK_DURATION,
        true
      );
    },
    [isActive, sendCommand]
  );

  return {
    sendCommand,
    playRecordedMove,
    isCommandRunning,
  };
};
