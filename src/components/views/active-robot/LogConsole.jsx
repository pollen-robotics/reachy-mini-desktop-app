import React, { useEffect, useRef, useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import useAppStore from '../../../store/useAppStore';

function LogConsole({ logs, darkMode = false }) {
  const scrollRef = useRef(null);
  const { frontendLogs } = useAppStore();
  const isFirstLoadRef = useRef(true);
  
  // ✅ OPTIMIZED: Memoize normalizedLogs to avoid recreation on every render
  // ✅ Add timestamp at creation time for daemon logs (not at render time)
  const normalizedLogs = useMemo(() => [
    ...logs.map(log => ({ 
      message: log, 
      source: 'daemon',
      timestamp: new Date().toLocaleTimeString('en-GB', { 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }) // Generate timestamp when log is created, not at render time
    })),
    ...frontendLogs
  ], [logs.length, frontendLogs.length]); // Only recompute when length changes

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (scrollRef.current) {
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
        <Typography sx={{ fontSize: 10, color: darkMode ? '#666' : '#999', fontFamily: 'inherit', textAlign: 'center' }}>
          No logs
        </Typography>
      ) : (
        normalizedLogs.map((log, index) => {
          const isDaemon = log.source === 'daemon';
          const isFrontend = log.source === 'frontend';
          const message = log.message;
          
          // Detect log type for color (based on keywords)
          const isSuccess = message.includes('SUCCESS') || message.includes('✓');
          const isError = message.includes('FAILED') || message.includes('ERROR') || message.includes('❌');
          const isCommand = message.includes('→') || message.includes('▶️') || message.includes('📥');
          
          // Use timestamp from log (created when log was added, not at render time)
          const timestamp = log.timestamp;
          
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
                     isSuccess ? '#55ff55' : 
                     isCommand ? '#ff9500' : 
                     isFrontend ? '#5db3ff' :  // Brighter blue for frontend
                     '#f0f0f0') :               // Very light gray for daemon (high contrast)
                    (isError ? '#cc0000' : 
                     isSuccess ? '#00aa00' : 
                     isCommand ? '#ff6600' : 
                     isFrontend ? '#0055cc' :  // Darker blue for frontend
                     '#1a1a1a'),               // Very dark gray for daemon (high contrast)
                  fontFamily: 'inherit',
                  lineHeight: 1.6,
                  fontWeight: isFrontend ? 500 : 400, // Frontend in bold
                  opacity: 1, // Full opacity for all logs
                  flex: 1,
              }}
            >
                {message}
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

