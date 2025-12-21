import { useEffect, useRef } from 'react';
import { listen } from '@utils/tauriCompat';
import useAppStore from '../../store/useAppStore';

/**
 * Hook to capture daemon stdout/stderr and store in centralized log system
 * This provides complete daemon output for diagnostic reports
 * 
 * Captures all Python daemon output for debugging and diagnostics.
 * Filters out only the most verbose/useless logs to keep storage manageable.
 */
export function useDaemonOutputLogs() {
  const { addDaemonOutputLog } = useAppStore();
  const unlistenStdoutRef = useRef(null);
  const unlistenStderrRef = useRef(null);
  
  // Helper: Check if a log line should be filtered out (too verbose)
  const shouldFilterOut = (logLine) => {
    if (!logLine || logLine.trim() === '') return true;
    
    const line = typeof logLine === 'string' ? logLine : logLine.toString();
    const lineLower = line.toLowerCase();
    
    // Filter out only the MOST verbose system messages
    // Keep most logs for diagnostic purposes
    const verbosePatterns = [
      // WebSocket heartbeat spam (very frequent, not useful)
      /WebSocket.*\/api\/state\/ws.*connection (open|closed)/i,
      // Repetitive health check logs (only if very frequent)
      /GET \/api\/daemon\/health.*200 OK/i,
    ];
    
    return verbosePatterns.some(pattern => pattern.test(line));
  };
  
  // Listen to daemon stdout/stderr events
  useEffect(() => {
    const setupListeners = async () => {
      try {
        // Listen to stdout
        unlistenStdoutRef.current = await listen('sidecar-stdout', (event) => {
          const logLine = typeof event.payload === 'string' 
            ? event.payload 
            : event.payload?.toString() || '';
          
          // Extract actual log (remove "Sidecar stdout: " prefix if present)
          const cleanLine = logLine.replace(/^Sidecar stdout:\s*/, '').trim();
          
          // Skip filtered logs
          if (shouldFilterOut(cleanLine)) {
            return;
          }
          
          // Add to centralized log system
          addDaemonOutputLog(cleanLine, 'stdout');
        });
        
        // Listen to stderr (errors and warnings)
        unlistenStderrRef.current = await listen('sidecar-stderr', (event) => {
          const logLine = typeof event.payload === 'string' 
            ? event.payload 
            : event.payload?.toString() || '';
          
          // Extract actual log (remove "Sidecar stderr: " prefix if present)
          const cleanLine = logLine.replace(/^Sidecar stderr:\s*/, '').trim();
          
          // Don't filter stderr - always important for diagnostics
          if (!cleanLine) {
            return;
          }
          
          // Add to centralized log system
          addDaemonOutputLog(cleanLine, 'stderr');
        });
        
        console.log('[useDaemonOutputLogs] Daemon output capture initialized');
      } catch (error) {
        console.error('[useDaemonOutputLogs] Failed to setup listeners:', error);
      }
    };
    
    setupListeners();
    
    // Cleanup on unmount
    return () => {
      if (unlistenStdoutRef.current) {
        unlistenStdoutRef.current();
      }
      if (unlistenStderrRef.current) {
        unlistenStderrRef.current();
      }
    };
  }, [addDaemonOutputLog]);
}

