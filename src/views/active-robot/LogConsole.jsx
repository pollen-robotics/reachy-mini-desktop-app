import React, { useEffect, useRef, useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import useAppStore from '../../store/useAppStore';
import { DAEMON_CONFIG } from '../../config/daemon';

function LogConsole({ logs, darkMode = false }) {
  const scrollRef = useRef(null);
  // ✅ Use specific selectors to avoid unnecessary re-renders
  const frontendLogs = useAppStore(state => state.frontendLogs);
  const appLogs = useAppStore(state => state.appLogs);
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
      const message = typeof log === 'string' ? log : log.toString();
      return !repetitiveDaemonLogs.some(pattern => message.includes(pattern));
    });
    
    const allLogs = [
      ...filteredLogs.map(log => ({ 
        message: log, 
        source: 'daemon',
        timestamp: new Date().toLocaleTimeString('en-GB', { 
          hour: '2-digit', 
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        }),
        level: 'info',
      })),
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
    
    // ✅ Performance: Limit displayed logs to avoid UI lag
    return sortedLogs.slice(-DAEMON_CONFIG.LOGS.MAX_DISPLAY);
  }, [logs, frontendLogs, appLogs]); // ✅ Use full arrays as dependencies to detect all changes

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

  return (
    <Box
      ref={scrollRef}
      onScroll={handleScroll}
      sx={{
        width: '100%',
        height: 80, // ✅ Reduced by 20px (was 100)
        borderRadius: '12px',
        bgcolor: darkMode ? '#1a1a1a' : '#ffffff', // Darker background for better contrast
        border: darkMode ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid rgba(0, 0, 0, 0.15)', // More visible border
        overflowY: 'auto',
        overflowX: 'hidden',
        pl: 2,
        pr: 1,
        py: .5,
        fontFamily: 'SF Mono, Monaco, Menlo, monospace',
        fontSize: 10,
        // ✅ No transition on bgcolor/border to avoid animation when changing dark mode
        transition: 'box-shadow 0.3s ease',
        '&::-webkit-scrollbar': {
          width: '4px',
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
            minHeight: 80,
          }}
        >
          <Typography sx={{ fontSize: 10, color: darkMode ? '#666' : '#999', fontFamily: 'inherit', textAlign: 'center' }}>
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
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                mb: 0.3,
                gap: 1,
              }}
            >
              <Typography
                sx={{
                  fontSize: 10,
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
                  lineHeight: 1.6,
                  fontWeight: isFrontend ? 500 : 400, // Frontend in bold
                  opacity: 1, // Full opacity for all logs
                  flex: 1,
                }}
              >
                {displayMessage}
              </Typography>
              <Typography
                sx={{
                  fontSize: 9,
                  color: darkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)',
                  fontFamily: 'inherit',
                  lineHeight: 1.6,
                  fontWeight: 400,
                  opacity: 0.8,
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                {timestamp}
            </Typography>
            </Box>
          );
        })
      )}
    </Box>
  );
}

// ✅ OPTIMIZED: Memoize component to avoid re-renders when props haven't changed
export default React.memo(LogConsole);

