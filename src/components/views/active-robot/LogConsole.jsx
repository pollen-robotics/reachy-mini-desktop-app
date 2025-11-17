import React, { useEffect, useRef } from 'react';
import { Box, Typography } from '@mui/material';
import useAppStore from '../../../store/useAppStore';

export default function LogConsole({ logs, darkMode = false }) {
  const scrollRef = useRef(null);
  const { frontendLogs } = useAppStore();
  const isFirstLoadRef = useRef(true);
  
  // Normalize logs: daemon (string) + frontend (object)
  const normalizedLogs = [
    ...logs.map(log => ({ 
      message: log, 
      source: 'daemon',
      timestamp: null // Daemon logs don't have separate timestamp
    })),
    ...frontendLogs
  ];

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
        height: 100,
        borderRadius: '12px',
        bgcolor: darkMode ? '#262626' : '#ffffff',
        border: darkMode ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.12)',
        overflowY: 'auto',
        overflowX: 'hidden',
        px: 2,
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
          
          return (
            <Typography
              key={index}
              sx={{
                fontSize: 10,
                color: darkMode ? 
                  (isError ? '#ff8888' : 
                   isSuccess ? '#88ff88' : 
                   isCommand ? '#ffaa66' : 
                   isFrontend ? '#66ccff' :  // Light blue for frontend
                   '#aaa') :                  // Gray for daemon
                  (isError ? '#cc6666' : 
                   isSuccess ? '#66cc66' : 
                   isCommand ? '#ff8844' : 
                   isFrontend ? '#3399ff' :  // Blue for frontend
                   '#999'),                   // Gray for daemon
                fontFamily: 'inherit',
                lineHeight: 1.6,
                mb: 0.3,
                fontWeight: isFrontend ? 500 : 400, // Frontend in bold
                opacity: isDaemon ? 0.85 : 1, // Daemon slightly more transparent
              }}
            >
              {log.timestamp && `[${log.timestamp}] `}{message}
            </Typography>
          );
        })
      )}
    </Box>
  );
}

