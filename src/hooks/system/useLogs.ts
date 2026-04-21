import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useShallow } from 'zustand/react/shallow';
import useAppStore from '../../store/useAppStore';
import { useLogger } from '../../utils/logging';
import { normalizeLog } from '../../components/LogConsole/utils';
import type { AppState } from '../../types/store';

// Module-level ref to prevent overlapping log fetches across hook instances.
const isFetchingLogsRef = { current: false };

export interface UseLogsResult {
  logs: AppState['logs'];
  fetchLogs: () => Promise<void>;
  logCommand: (message: string, type?: 'info' | 'warning' | 'error') => void;
  logApiAction: (action: string, details?: string, success?: boolean) => void;
}

export const useLogs = (): UseLogsResult => {
  const { logs, setLogs, connectionMode } = useAppStore(
    useShallow((state: AppState) => ({
      logs: state.logs,
      setLogs: state.setLogs,
      connectionMode: state.connectionMode,
    }))
  );
  const logger = useLogger();

  const fetchLogs = useCallback(async (): Promise<void> => {
    // Skip if already fetching (prevents callback accumulation)
    if (isFetchingLogsRef.current) {
      return;
    }

    // In wifi mode the daemon runs on the robot, not on the local Rust
    // sidecar, so `get_logs` would return an empty buffer and wipe the
    // entries streamed by `useDaemonLogStream`. Skip the poll entirely.
    if (connectionMode === 'wifi') {
      return;
    }

    isFetchingLogsRef.current = true;

    try {
      const fetchedLogs = (await invoke('get_logs')) as unknown[];
      // The Rust ring buffer returns `Vec<String>` ("TIMESTAMP|MESSAGE").
      // Normalize here so the store always holds `LogEntry[]` regardless of
      // the source (local sidecar, remote WS, …).
      setLogs(fetchedLogs.map(normalizeLog));
    } catch {
      // Fetch errors are non-fatal; the UI just won't refresh this tick.
    } finally {
      isFetchingLogsRef.current = false;
    }
  }, [setLogs, connectionMode]);

  // Function to add a frontend log.
  // The `type` parameter is accepted for API compatibility but currently ignored
  // (logger.info is used unconditionally, preserving the original JS behaviour).
  const logCommand = useCallback(
    (message: string, _type: 'info' | 'warning' | 'error' = 'info'): void => {
      logger.info(message);
    },
    [logger]
  );

  // Log an API action (request to daemon)
  const logApiAction = useCallback(
    (action: string, details: string = '', success: boolean = true): void => {
      if (success) {
        logger.success(details ? `${action}: ${details}` : action);
      } else {
        logger.error(details ? `${action}: ${details}` : action);
      }
    },
    [logger]
  );

  return {
    logs,
    fetchLogs,
    logCommand,
    logApiAction,
  };
};
