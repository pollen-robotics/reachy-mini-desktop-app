import { useEffect, useState, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';

/**
 * Hook to listen to sidecar logs during daemon startup
 * Provides real-time feedback to the user about what's happening
 *
 * Filtering is handled by the centralized logFilters utility.
 *
 * @param {boolean} isStarting - Whether daemon is currently starting
 * @returns {object} { logs, hasError, lastMessage }
 */
export function useDaemonStartupLogs(isStarting) {
  const [startupLogs, setStartupLogs] = useState([]);
  const [hasError, setHasError] = useState(false);
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
    setHasError(false);

    let isMounted = true;

    const setupListeners = async () => {
      try {
        // Listen to stdout (info messages)
        const unlistenStdout = await listen('sidecar-stdout', event => {
          if (!isMounted) return;

          const logLine =
            typeof event.payload === 'string' ? event.payload : event.payload?.toString() || '';

          // Clean up prefix if present
          const cleanLine = logLine.replace(/^Sidecar stdout:\s*/, '').trim();

          // Skip empty lines only — filtering is handled at display time by useLogProcessing
          if (!cleanLine) {
            return;
          }

          // Add to logs
          const newLog = {
            message: cleanLine,
            level: 'info',
            timestamp: Date.now(),
          };

          logsRef.current = [...logsRef.current, newLog].slice(-50); // Keep last 50
          setStartupLogs([...logsRef.current]);
          setLastMessage(cleanLine);
        });

        if (isMounted) {
          unlistenStdoutRef.current = unlistenStdout;
        } else {
          unlistenStdout();
          return;
        }

        // Listen to stderr (warnings/errors)
        const unlistenStderr = await listen('sidecar-stderr', event => {
          if (!isMounted) return;

          const logLine =
            typeof event.payload === 'string' ? event.payload : event.payload?.toString() || '';

          // Clean up prefix if present
          const cleanLine = logLine.replace(/^Sidecar stderr:\s*/, '').trim();

          // Skip empty lines only — filtering is handled at display time by useLogProcessing
          if (!cleanLine) {
            return;
          }

          // Check for actual errors (not just stderr noise)
          const isError =
            cleanLine.includes('ERROR') ||
            cleanLine.includes('error:') ||
            cleanLine.includes('Exception') ||
            cleanLine.includes('Traceback');

          if (isError) {
            setHasError(true);
          }

          // Add to logs
          const newLog = {
            message: cleanLine,
            level: isError ? 'error' : 'warning',
            timestamp: Date.now(),
          };

          logsRef.current = [...logsRef.current, newLog].slice(-50);
          setStartupLogs([...logsRef.current]);
          setLastMessage(cleanLine);
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
    hasError,
    lastMessage,
  };
}
