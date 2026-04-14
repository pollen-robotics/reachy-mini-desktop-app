import { useEffect, useState, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { shouldFilterLog } from '../../utils/logging/logFilters';

/**
 * Hook to listen to sidecar logs during daemon startup.
 * Pure display hook - collects stdout/stderr lines for the LogConsole UI.
 *
 * Error detection is NOT this hook's responsibility. Daemon errors are
 * detected via structured signals:
 * - Process termination: Tauri "daemon-status-changed" event (Crashed)
 * - Daemon-level errors: polling /api/daemon/status (state === "error")
 * - Hardware errors: specific patterns in hardwareErrors.js
 *
 * @param {boolean} isStarting - Whether daemon is currently starting
 * @returns {object} { logs, lastMessage }
 */
export function useDaemonStartupLogs(isStarting) {
  const [startupLogs, setStartupLogs] = useState([]);
  const [lastMessage, setLastMessage] = useState('');

  // Use ref to accumulate logs during startup
  const logsRef = useRef([]);

  // Track listeners
  const unlistenStdoutRef = useRef(null);
  const unlistenStderrRef = useRef(null);

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

    const addLog = (cleanLine, level) => {
      const newLog = {
        message: cleanLine,
        level,
        timestamp: Date.now(),
      };
      logsRef.current = [...logsRef.current, newLog].slice(-50);
      setStartupLogs([...logsRef.current]);
      setLastMessage(cleanLine);
    };

    const setupListeners = async () => {
      try {
        // Listen to stdout (info messages)
        const unlistenStdout = await listen('sidecar-stdout', event => {
          if (!isMounted) return;

          const logLine =
            typeof event.payload === 'string' ? event.payload : event.payload?.toString() || '';

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
        const unlistenStderr = await listen('sidecar-stderr', event => {
          if (!isMounted) return;

          const logLine =
            typeof event.payload === 'string' ? event.payload : event.payload?.toString() || '';

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
      } catch {}
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
