import { useEffect, useState, useRef } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { shouldFilterLog } from '../../utils/logging/logFilters';
import { LOG_LIMITS } from '../../utils/logging/constants';

const MAX_STARTUP_LOGS = LOG_LIMITS.STARTUP;

type LogLevel = 'info' | 'warn' | 'error';

export interface StartupLogEntry {
  message: string;
  level: LogLevel;
  timestamp: number;
}

export interface UseDaemonStartupLogsResult {
  logs: StartupLogEntry[];
  lastMessage: string;
}

/**
 * Hook to listen to sidecar logs during daemon startup.
 * Pure display hook - collects stdout/stderr lines for the LogConsole UI.
 *
 * Error detection is NOT this hook's responsibility. Daemon errors are
 * detected via structured signals:
 * - Process termination: Tauri "daemon-status-changed" event (Crashed)
 * - Daemon-level errors: polling /api/daemon/status (state === "error")
 * - Hardware errors: specific patterns in hardwareErrors.js
 */
export function useDaemonStartupLogs(isStarting: boolean): UseDaemonStartupLogsResult {
  const [startupLogs, setStartupLogs] = useState<StartupLogEntry[]>([]);
  const [lastMessage, setLastMessage] = useState<string>('');

  // Use ref to accumulate logs during startup
  const logsRef = useRef<StartupLogEntry[]>([]);

  // Track listeners
  const unlistenStdoutRef = useRef<UnlistenFn | null>(null);
  const unlistenStderrRef = useRef<UnlistenFn | null>(null);

  useEffect(() => {
    if (!isStarting) {
      // Clean up listeners when not starting
      if (unlistenStdoutRef.current) {
        unlistenStdoutRef.current();
        unlistenStdoutRef.current = null;
      }
      if (unlistenStderrRef.current) {
        unlistenStderrRef.current();
        unlistenStderrRef.current = null;
      }
      return;
    }

    // Clear logs when starting new daemon
    logsRef.current = [];
    setStartupLogs([]);

    let isMounted = true;

    const addLog = (cleanLine: string, level: LogLevel): void => {
      const newLog: StartupLogEntry = {
        message: cleanLine,
        level,
        timestamp: Date.now(),
      };
      logsRef.current = [...logsRef.current, newLog].slice(-MAX_STARTUP_LOGS);
      setStartupLogs([...logsRef.current]);
      setLastMessage(cleanLine);
    };

    const extractLine = (payload: unknown): string => {
      if (typeof payload === 'string') return payload;
      if (
        payload != null &&
        typeof (payload as { toString?: () => string }).toString === 'function'
      ) {
        return (payload as { toString: () => string }).toString();
      }
      return '';
    };

    const setupListeners = async (): Promise<void> => {
      try {
        // Listen to stdout (info messages)
        const unlistenStdout = await listen<unknown>('sidecar-stdout', event => {
          if (!isMounted) return;

          const logLine = extractLine(event.payload);
          const cleanLine = logLine.replace(/^Sidecar stdout:\s*/, '').trim();

          if (!cleanLine || shouldFilterLog(cleanLine)) {
            return;
          }

          addLog(cleanLine, 'info');
        });

        if (isMounted) {
          unlistenStdoutRef.current = unlistenStdout;
        } else {
          unlistenStdout();
          return;
        }

        // Listen to stderr (daemon logs go to stderr via Python logging)
        const unlistenStderr = await listen<unknown>('sidecar-stderr', event => {
          if (!isMounted) return;

          const logLine = extractLine(event.payload);
          const cleanLine = logLine.replace(/^Sidecar stderr:\s*/, '').trim();

          if (!cleanLine || shouldFilterLog(cleanLine)) {
            return;
          }

          addLog(cleanLine, 'info');
        });

        if (isMounted) {
          unlistenStderrRef.current = unlistenStderr;
        } else {
          unlistenStderr();
        }
      } catch {
        // Listener setup can fail outside of a Tauri environment
        // (e.g. browser-only tests). Nothing actionable from here.
      }
    };

    setupListeners();

    return () => {
      isMounted = false;
      if (unlistenStdoutRef.current) {
        unlistenStdoutRef.current();
        unlistenStdoutRef.current = null;
      }
      if (unlistenStderrRef.current) {
        unlistenStderrRef.current();
        unlistenStderrRef.current = null;
      }
    };
  }, [isStarting]);

  return {
    logs: startupLogs,
    lastMessage,
  };
}
