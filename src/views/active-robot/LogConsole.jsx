import React, { useEffect, useRef, useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import useAppStore from '../../store/useAppStore';
import { DAEMON_CONFIG } from '../../config/daemon';

// ✅ Constant empty arrays to avoid creating new arrays on each render
const EMPTY_ARRAY = [];

/**
 * Helper function to format timestamp
 */
const formatTimestamp = (timestamp) => {
  if (typeof timestamp === 'string') {
    // Already formatted string (HH:mm:ss)
    return timestamp;
  }
  if (typeof timestamp === 'number') {
    // Unix timestamp (milliseconds)
    return new Date(timestamp).toLocaleTimeString('en-GB', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  }
  // Fallback: generate current time
  return new Date().toLocaleTimeString('en-GB', { 
    hour: '2-digit', 
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
};

/**
 * Helper function to normalize a log entry
 * IMPORTANT: Preserves timestamp if already formatted to avoid creating new objects on each render
 */
const normalizeLog = (log) => {
  // If already normalized (has source and message and timestamp is already a string)
  if (log && typeof log === 'object' && log.message && log.source) {
    // If timestamp is already a formatted string, preserve it to avoid creating new objects
    if (typeof log.timestamp === 'string') {
      return log; // Return as-is to preserve identity
    }
    // Only format if timestamp is a number or missing
    return {
      ...log,
      timestamp: log.timestamp ? formatTimestamp(log.timestamp) : formatTimestamp(Date.now()),
      level: log.level || 'info',
    };
  }
  
  // If it's an object with message and level (like startupLogs)
  if (log && typeof log === 'object' && log.message) {
    // Preserve timestamp if it's already formatted
    const timestamp = typeof log.timestamp === 'string' 
      ? log.timestamp 
      : (log.timestamp ? formatTimestamp(log.timestamp) : formatTimestamp(Date.now()));
    
    return {
      message: log.message,
      source: log.source || 'daemon',
      timestamp,
      level: log.level || 'info',
      appName: log.appName,
    };
  }
  
  // If it's a string
  if (typeof log === 'string') {
    return {
      message: log,
      source: 'daemon',
      timestamp: formatTimestamp(Date.now()),
      level: 'info',
    };
  }
  
  // Fallback
  return {
    message: String(log),
    source: 'daemon',
    timestamp: formatTimestamp(Date.now()),
    level: 'info',
  };
};

function LogConsole({ 
  logs, 
  darkMode = false,
  includeStoreLogs = true, // Include frontendLogs and appLogs from store
  sx = {}, // Additional sx styles
  maxHeight = null, // Override max height (string like '60px' or number)
  height = null, // Override height (string like '60px' or number, or 'auto')
  showTimestamp = true, // Show timestamp column
  compact = false, // Compact mode (smaller font, less spacing)
}) {
  const scrollRef = useRef(null);
  // ✅ Use specific selectors to avoid unnecessary re-renders
  // ✅ CRITICAL: Use constant EMPTY_ARRAY instead of [] to avoid creating new arrays on each render
  // This prevents infinite loops when includeStoreLogs is false
  const frontendLogs = useAppStore(state => includeStoreLogs ? state.frontendLogs : EMPTY_ARRAY);
  const appLogs = useAppStore(state => includeStoreLogs ? state.appLogs : EMPTY_ARRAY);
  const isFirstLoadRef = useRef(true);
  const shouldAutoScrollRef = useRef(true); // ✅ Track if we should auto-scroll (starts as true)
  const lastScrollTopRef = useRef(0); // ✅ Track last scroll position to detect scroll direction
  
  // ✅ OPTIMIZED: Memoize normalizedLogs to avoid recreation on every render
  // ✅ Centralized log system: daemon + frontend + app logs
  // ✅ Sort by timestamp (all logs have timestamp now)
  const normalizedLogs = useMemo(() => {
    // ✅ Filter out repetitive daemon lifecycle logs (they appear every second when logs are fetched)
    const repetitiveDaemonLogs = [
      '🧹 Cleaning up existing daemons...',
      '🧹 Cleaning up existing daemons (simulation mode)...',
      '✓ Daemon started via embedded sidecar',
      '✓ Daemon started in simulation mode (MuJoCo) via embedded sidecar',
      '✓ Daemon stopped',
    ];
    
    const filteredLogs = logs.filter(log => {
      // Extract message correctly from string or object
      const message = typeof log === 'string' 
        ? log 
        : (log && typeof log === 'object' && log.message) 
          ? log.message 
          : String(log);
      return !repetitiveDaemonLogs.some(pattern => message.includes(pattern));
    });
    
    const allLogs = [
      ...filteredLogs.map(normalizeLog),
      ...frontendLogs.map(log => ({ ...log, level: log.level || 'info' })),
      ...appLogs,
    ];
    
    // ✅ Deduplication: For daemon logs, use message only (timestamp changes on each fetch)
    // For other logs, use full key (message + timestamp + source)
    const seen = new Set();
    const uniqueLogs = allLogs.filter(log => {
      // For daemon logs, deduplicate by message only (timestamp is generated at render time)
      // For other logs, use full key including timestamp
      const key = log.source === 'daemon' 
        ? `daemon|${log.message}`
        : `${log.timestamp}|${log.source}|${log.message}|${log.appName || ''}`;
      
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
    
    // Sort by timestamp (most recent at bottom)
    // Since timestamps are strings in HH:mm:ss format, we can sort them directly
    const sortedLogs = uniqueLogs.sort((a, b) => {
      if (a.timestamp < b.timestamp) return -1;
      if (a.timestamp > b.timestamp) return 1;
      return 0;
    });
    
    // ✅ Performance: Limit displayed logs to avoid UI lag (only if includeStoreLogs is true)
    return includeStoreLogs 
      ? sortedLogs.slice(-DAEMON_CONFIG.LOGS.MAX_DISPLAY)
      : sortedLogs;
  }, [logs, frontendLogs, appLogs, includeStoreLogs]); // ✅ Use full arrays as dependencies to detect all changes

  // ✅ Check if user is at bottom (within 5px threshold)
  const isAtBottom = () => {
    if (!scrollRef.current) return true;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    return scrollHeight - scrollTop - clientHeight < 5;
  };

  // ✅ Handle scroll events to detect manual scrolling
  const handleScroll = React.useCallback(() => {
    if (!scrollRef.current) return;
    
    const { scrollTop } = scrollRef.current;
    const wasAtBottom = isAtBottom();
    
    // ✅ If user scrolled manually and is NOT at bottom, disable auto-scroll
    if (!wasAtBottom) {
      shouldAutoScrollRef.current = false;
    } else {
      // ✅ User is at bottom, re-enable auto-scroll
      shouldAutoScrollRef.current = true;
    }
    
    lastScrollTopRef.current = scrollTop;
  }, []);

  // ✅ Auto-scroll to bottom when new logs arrive (only if auto-scroll is enabled)
  useEffect(() => {
    if (scrollRef.current && shouldAutoScrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: isFirstLoadRef.current ? 'auto' : 'smooth' // No animation on first load
      });
      
      // After first load, use smooth
      if (isFirstLoadRef.current) {
        isFirstLoadRef.current = false;
      }
    }
  }, [normalizedLogs.length]);

  const fontSize = compact ? 9 : 10;
  const defaultHeight = compact ? 60 : 80;
  
  // Determine height and maxHeight based on props
  // - If height is 'auto': no fixed height, use maxHeight if provided
  // - If height is provided (string/number): use it as fixed height
  // - Otherwise: use maxHeight if provided, or defaultHeight
  const heightStyle = {};
  const maxHeightStyle = {};
  
  if (height === 'auto') {
    // Auto height: only set maxHeight if provided
    if (maxHeight) {
      maxHeightStyle.maxHeight = maxHeight;
    }
  } else if (height !== null) {
    // Fixed height provided
    heightStyle.height = height;
    if (maxHeight) {
      maxHeightStyle.maxHeight = maxHeight;
    }
  } else {
    // No height prop: use maxHeight if provided, otherwise defaultHeight
    if (maxHeight) {
      heightStyle.height = maxHeight;
    } else {
      heightStyle.height = defaultHeight;
    }
  }
  
  return (
    <Box
      ref={scrollRef}
      onScroll={handleScroll}
      className="log-console"
      sx={{
        width: '100%',
        ...heightStyle,
        ...maxHeightStyle,
        borderRadius: compact ? '6px' : '12px',
        bgcolor: darkMode ? '#1a1a1a' : '#ffffff', // Darker background for better contrast
        border: darkMode ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid rgba(0, 0, 0, 0.15)', // More visible border
        overflowY: 'auto',
        overflowX: 'hidden',
        pl: compact ? 1 : 2,
        pr: compact ? 0.5 : 1,
        py: compact ? 0.5 : 0.5,
        fontFamily: 'SF Mono, Monaco, Menlo, monospace',
        fontSize: fontSize,
        // ✅ No transition on bgcolor/border to avoid animation when changing dark mode
        transition: 'box-shadow 0.3s ease',
        '&::-webkit-scrollbar': {
          width: compact ? '4px' : '4px',
        },
        '&::-webkit-scrollbar-track': {
          background: 'transparent',
        },
        '&::-webkit-scrollbar-thumb': {
          background: 'transparent',
          borderRadius: '2px',
        },
        '&:hover::-webkit-scrollbar-thumb': {
          background: darkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
        },
        ...sx, // Merge additional styles
      }}
    >
      {normalizedLogs.length === 0 ? (
          <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            minHeight: defaultHeight,
          }}
        >
          <Typography sx={{ fontSize: fontSize, color: darkMode ? '#666' : '#999', fontFamily: 'inherit', textAlign: 'center' }}>
            No logs
          </Typography>
        </Box>
      ) : (
        normalizedLogs.map((log, index) => {
          const isDaemon = log.source === 'daemon';
          const isFrontend = log.source === 'frontend';
          const isApp = log.source === 'app';
          const message = log.message;
          const logLevel = log.level || 'info';
          
          // Detect log type for color (based on keywords and level)
          const isSuccess = message.includes('SUCCESS') || message.includes('✓');
          const isError = logLevel === 'error' || message.includes('FAILED') || message.includes('ERROR') || message.includes('❌') || message.includes('[ERROR]');
          const isWarning = logLevel === 'warning' || message.includes('WARNING') || message.includes('[WARNING]');
          const isCommand = message.includes('→') || message.includes('▶️') || message.includes('📥');
          
          // Use timestamp from log (created when log was added, not at render time)
          const timestamp = log.timestamp;
          
          // Format app log message with app name prefix
          const displayMessage = isApp && log.appName 
            ? `[${log.appName}] ${message}`
            : message;
          
          return (
            <Box
              key={index}
              sx={{
                display: 'flex',
                justifyContent: showTimestamp ? 'space-between' : 'flex-start',
                alignItems: 'flex-start',
                mb: compact ? 0.2 : 0.3,
                gap: 1,
              }}
            >
              <Typography
                sx={{
                  fontSize: fontSize,
                  color: darkMode ? 
                    (isError ? '#ff5555' : 
                     isWarning ? '#fbbf24' :
                     isSuccess ? '#55ff55' : 
                     isCommand ? '#ff9500' : 
                     isFrontend ? '#5db3ff' :  // Brighter blue for frontend
                     isApp ? '#a78bfa' :       // Purple for app logs
                     '#f0f0f0') :               // Very light gray for daemon (high contrast)
                    (isError ? '#cc0000' : 
                     isWarning ? '#d97706' :
                     isSuccess ? '#00aa00' : 
                     isCommand ? '#ff6600' : 
                     isFrontend ? '#0055cc' :  // Darker blue for frontend
                     isApp ? '#7c3aed' :       // Purple for app logs
                     '#1a1a1a'),               // Very dark gray for daemon (high contrast)
                  fontFamily: 'inherit',
                  lineHeight: compact ? 1.4 : 1.6,
                  fontWeight: isFrontend ? 500 : 400, // Frontend in bold
                  opacity: 1, // Full opacity for all logs
                  flex: 1,
                }}
              >
                {displayMessage}
              </Typography>
              {showTimestamp && (
                <Typography
                  sx={{
                    fontSize: fontSize - 1,
                    color: darkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)',
                    fontFamily: 'inherit',
                    lineHeight: compact ? 1.4 : 1.6,
                    fontWeight: 400,
                    opacity: 0.8,
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {timestamp}
                </Typography>
              )}
            </Box>
          );
        })
      )}
    </Box>
  );
}

// ✅ OPTIMIZED: Memoize component to avoid re-renders when props haven't changed
export default React.memo(LogConsole);

