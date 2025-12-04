import { useEffect, useState, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import useAppStore from '../../store/useAppStore';

/**
 * Hook to listen to sidecar logs during daemon startup
 * Provides real-time feedback to the user about what's happening
 * 
 * @param {boolean} isStarting - Whether daemon is currently starting
 * @returns {object} { logs, hasError, lastMessage }
 */
export function useDaemonStartupLogs(isStarting) {
  const { addFrontendLog } = useAppStore();
  const [startupLogs, setStartupLogs] = useState([]);
  const [hasError, setHasError] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const unlistenStdoutRef = useRef(null);
  const unlistenStderrRef = useRef(null);
  const logsRef = useRef([]); // Keep ref for stable access in listeners

  useEffect(() => {
    // Clear logs when starting a new daemon
    if (isStarting) {
      setStartupLogs([]);
      setHasError(false);
      setLastMessage(null);
      logsRef.current = [];
    }
  }, [isStarting]);

  useEffect(() => {
    // ✅ Keep listeners active even when not starting if there's a hardware error
    // This ensures logs continue to be captured during error state
    const currentState = useAppStore.getState();
    const shouldKeepListening = isStarting || currentState.hardwareError;
    
    if (!shouldKeepListening) {
      // Cleanup listeners when not starting and no error
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

    const setupListeners = async () => {
      try {
        // Listen to stdout (info messages)
        unlistenStdoutRef.current = await listen('sidecar-stdout', (event) => {
          const logLine = typeof event.payload === 'string' 
            ? event.payload 
            : event.payload?.toString() || '';
          
          // Clean up prefix if present
          const cleanLine = logLine.replace(/^Sidecar stdout:\s*/, '').trim();
          
          // Filter out noise (HTTP logs, WebSocket, etc.)
          if (!cleanLine || 
              cleanLine.includes('GET /api/') || 
              cleanLine.includes('INFO:     127.0.0.1') ||
              cleanLine.includes('WebSocket') ||
              cleanLine.includes('connection open') ||
              cleanLine.includes('connection closed')) {
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
          
          // Also add to frontend logs for consistency
          addFrontendLog(`[Daemon] ${cleanLine}`);
        });

        // Listen to stderr (errors and warnings)
        unlistenStderrRef.current = await listen('sidecar-stderr', (event) => {
          const logLine = typeof event.payload === 'string' 
            ? event.payload 
            : event.payload?.toString() || '';
          
          // Clean up prefix if present
          const cleanLine = logLine.replace(/^Sidecar stderr:\s*/, '').trim();
          
          // Filter out noise
          if (!cleanLine || 
              cleanLine.includes('GET /api/') || 
              cleanLine.includes('INFO:     127.0.0.1')) {
            return;
          }

          // Check if it's an error (not just a warning)
          const isError = cleanLine.toLowerCase().includes('error') || 
                         cleanLine.toLowerCase().includes('failed') ||
                         cleanLine.toLowerCase().includes('exception') ||
                         cleanLine.toLowerCase().includes('traceback');

          const newLog = {
            message: cleanLine,
            level: isError ? 'error' : 'warning',
            timestamp: Date.now(),
          };
          
          logsRef.current = [...logsRef.current, newLog].slice(-50);
          setStartupLogs([...logsRef.current]);
          setLastMessage(cleanLine);
          
          if (isError) {
            setHasError(true);
          }
          
          // Also add to frontend logs
          addFrontendLog(`[Daemon] ${cleanLine}`, isError ? 'error' : 'warning');
        });
      } catch (error) {
        console.error('Failed to setup startup log listeners:', error);
      }
    };

    setupListeners();

    return () => {
      if (unlistenStdoutRef.current) {
        unlistenStdoutRef.current();
        unlistenStdoutRef.current = null;
      }
      if (unlistenStderrRef.current) {
        unlistenStderrRef.current();
        unlistenStderrRef.current = null;
      }
    };
  }, [isStarting, addFrontendLog]);

  return {
    logs: startupLogs,
    hasError,
    lastMessage,
  };
}

