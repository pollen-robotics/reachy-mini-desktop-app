import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import useAppStore from '@store/useAppStore';

/**
 * Hook to listen to app logs from sidecar stdout/stderr and add them to centralized log system
 * Filters logs to only include relevant app logs (not system logs)
 */
export function useAppLogs(currentAppName, isAppRunning) {
  const { addAppLog, clearAppLogs } = useAppStore();
  const unlistenStdoutRef = useRef(null);
  const unlistenStderrRef = useRef(null);
  
  // Helper: Check if a log line should be filtered out (system messages, etc.)
  const shouldFilterOut = (logLine) => {
    if (!logLine) return true;
    
    const line = typeof logLine === 'string' ? logLine : logLine.toString();
    const lineLower = line.toLowerCase();
    
    // Filter out system messages
    const systemPatterns = [
      /^WARNING: All log messages before absl::InitializeLog/i,
      /^INFO:.*127\.0\.0\.1.*GET \/api\//i,  // HTTP logs
      /^Sidecar (stdout|stderr):/i,
      /GET \/api\/state\/full/i,
      /GET \/api\/daemon\//i,
      /GET \/api\/apps\/current-app-status/i,
      /GET \/api\/apps\/.*\/logs/i,  // Our failed log requests
      /GET \/api\/apps\/logs\//i,
      /GET \/api\/apps\/.*\/output/i,
      /GET \/api\/apps\/.*\/stdout/i,
      // ✅ Filter WebSocket logs (very verbose and not useful)
      /WebSocket.*\/api\/state\/ws/i,
      /connection (open|closed)/i,
      /INFO:.*127\.0\.0\.1.*WebSocket/i,
      /INFO:.*127\.0\.0\.1.*"WebSocket/i,
    ];
    
    return systemPatterns.some(pattern => pattern.test(line));
  };
  
  // Helper: Check if a log line is relevant to the current app
  const isAppLog = (logLine) => {
    if (!logLine || !currentAppName) return false;
    
    const line = typeof logLine === 'string' ? logLine : logLine.toString();
    const appNameLower = currentAppName.toLowerCase();
    const lineLower = line.toLowerCase();
    
    // Filter out system logs first
    if (shouldFilterOut(line)) {
      return false;
    }
    
    // ✅ When an app is running, be more permissive:
    // Accept logs that match app patterns OR don't look like system logs
    
    // Check if log contains app name (but not in a path/URL)
    if (lineLower.includes(appNameLower)) {
      // Make sure it's not just in a file path
      const nameIndex = lineLower.indexOf(appNameLower);
      const beforeChar = line[nameIndex - 1];
      const afterChar = line[nameIndex + appNameLower.length];
      const isInPath = beforeChar === '/' || afterChar === '/' || beforeChar === '\\' || afterChar === '\\';
      
      if (!isInPath) {
        return true;
      }
    }
    
    // Check for common app log patterns (e.g., [RadioSet], [RadioDecoder] for reachy_mini_radio)
    // Patterns that typically indicate app-specific logs
    const appPatterns = [
      /^\[.*\]/,  // Logs starting with brackets (common for app modules like [RadioSet])
      /ERROR:reachy_mini\.apps/i,  // App-specific errors
      /INFO:reachy_mini\.apps/i,   // App-specific info
      /WARNING:reachy_mini\.apps/i, // App-specific warnings
    ];
    
    if (appPatterns.some(pattern => pattern.test(line))) {
      return true;
    }
    
    // ✅ More permissive: if it's not a system log and doesn't look like daemon output,
    // accept it when an app is running (apps can output various formats)
    // Exclude obvious daemon/system patterns
    const systemPatterns = [
      /^INFO:.*uvicorn/i,
      /^INFO:.*FastAPI/i,
      /^INFO:.*Application startup/i,
      /^INFO:.*Uvicorn running/i,
      /^INFO:.*Started server process/i,
      /^INFO:.*127\.0\.0\.1.*WebSocket/i,  // WebSocket connections
      /^INFO:.*127\.0\.0\.1.*"WebSocket/i,  // WebSocket connections (with quotes)
      /connection (open|closed)/i,  // WebSocket connection events
      /WebSocket.*\/api\/state\/ws/i,  // WebSocket state connections
    ];
    
    const isSystemPattern = systemPatterns.some(pattern => pattern.test(line));
    if (!isSystemPattern) {
      // If it's not a system pattern and we have an app running, accept it
      // This is more permissive but ensures we catch app logs
      return true;
    }
    
    return false;
  };
  
  // Helper: Determine log level and format
  const formatLogLine = (logLine) => {
    const line = typeof logLine === 'string' ? logLine : logLine.toString();
    const lineLower = line.toLowerCase();
    
    // Check for error patterns (not warnings)
    if (lineLower.includes('error:') || lineLower.includes('exception') || lineLower.includes('traceback')) {
      return { level: 'error', message: line };
    }
    
    // Check for warning patterns
    if (lineLower.includes('warning:')) {
      // Filter out system warnings that aren't interesting
      if (lineLower.includes('old firmware') || 
          lineLower.includes('absl::initializelog') ||
          lineLower.includes('all log messages before')) {
        return null; // Don't show these
      }
      return { level: 'warning', message: line };
    }
    
    // Regular log
    return { level: 'info', message: line };
  };
  
  // Listen to sidecar stdout/stderr events and add to centralized logs
  useEffect(() => {
    if (!currentAppName || !isAppRunning) {
      // Clear logs when app stops
      if (currentAppName) {
        clearAppLogs(currentAppName);
      }
      return;
    }
    
    const setupListeners = async () => {
      try {
        // Listen to stdout
        unlistenStdoutRef.current = await listen('sidecar-stdout', (event) => {
          const logLine = typeof event.payload === 'string' 
            ? event.payload 
            : event.payload?.toString() || '';
          
          // Extract actual log (remove "Sidecar stdout: " prefix if present)
          const cleanLine = logLine.replace(/^Sidecar stdout:\s*/, '').trim();
          
          // Skip empty lines, HTTP logs, and WebSocket logs
          if (!cleanLine || 
              cleanLine.includes('GET /api/') || 
              cleanLine.includes('INFO:     127.0.0.1') ||
              cleanLine.includes('WebSocket') ||
              cleanLine.includes('connection open') ||
              cleanLine.includes('connection closed')) {
            return;
          }
          
          // Check if this log is relevant to the app
          if (isAppLog(cleanLine)) {
            const formatted = formatLogLine(cleanLine);
            if (formatted) {
              // Add to centralized log system
              addAppLog(formatted.message, currentAppName, formatted.level);
            }
          }
        });
        
        // Listen to stderr (errors and warnings)
        unlistenStderrRef.current = await listen('sidecar-stderr', (event) => {
          const logLine = typeof event.payload === 'string' 
            ? event.payload 
            : event.payload?.toString() || '';
          
          // Extract actual log (remove "Sidecar stderr: " prefix if present)
          const cleanLine = logLine.replace(/^Sidecar stderr:\s*/, '').trim();
          
          // Skip empty lines and WebSocket logs
          if (!cleanLine || 
              cleanLine.includes('WebSocket') ||
              cleanLine.includes('connection open') ||
              cleanLine.includes('connection closed')) {
            return;
          }
          
          // Check if this log is relevant to the app
          if (isAppLog(cleanLine)) {
            const formatted = formatLogLine(cleanLine);
            if (formatted) {
              // Add to centralized log system
              addAppLog(formatted.message, currentAppName, formatted.level);
            }
          }
        });
      } catch (error) {
        console.error('Failed to setup sidecar log listeners:', error);
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
  }, [currentAppName, isAppRunning, addAppLog, clearAppLogs]);
}

