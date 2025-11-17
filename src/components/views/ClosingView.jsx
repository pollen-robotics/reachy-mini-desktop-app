import React, { useMemo } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import { getCurrentWindow } from '@tauri-apps/api/window';
import useAppStore from '../../store/useAppStore';

// 💤 Random messages for closing
const CLOSING_MESSAGES = [
  'Reachy is going to sleep...',
  'Powering down...',
  'Taking a break...',
  'Resting mode activated...',
  'Reachy is getting some rest...',
  'Entering sleep mode...',
  'Time for a nap...',
  'Shutting down gracefully...',
  'Reachy is signing off...',
  'See you soon...',
];

/**
 * View displayed during daemon shutdown
 * Displays a random message from a list
 */
export default function ClosingView() {
  const appWindow = window.mockGetCurrentWindow ? window.mockGetCurrentWindow() : getCurrentWindow();
  const { darkMode } = useAppStore();
  
  // Choose a random message (memoized to not change during display)
  const randomMessage = useMemo(() => {
    return CLOSING_MESSAGES[Math.floor(Math.random() * CLOSING_MESSAGES.length)];
  }, []);

  return (
    <Box
      sx={{
        width: '100vw',
        height: '100vh',
        background: darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)',
        backdropFilter: 'blur(40px)',
        WebkitBackdropFilter: 'blur(40px)',
        overflow: 'hidden',
      }}
    >
      {/* Titlebar */}
      <Box
        onMouseDown={async (e) => {
          e.preventDefault();
          try {
            await appWindow.startDragging();
          } catch (err) {
            console.error('Drag error:', err);
          }
        }}
        sx={{
          height: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          cursor: 'move',
          userSelect: 'none',
        }}
      >
        <Box sx={{ width: 12, height: 12 }} />
        <Box sx={{ height: 20 }} /> {/* Space for drag */}
        <Box sx={{ width: 20, height: 20 }} />
      </Box>

      {/* Closing view */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: 'calc(100% - 44px)',
          gap: 2,
        }}
      >
        <CircularProgress 
          size={32} 
          thickness={4} 
          sx={{ color: darkMode ? '#666' : '#999' }} 
        />
        <Typography
          sx={{
            fontSize: 13,
            fontWeight: 500,
            color: darkMode ? '#aaa' : '#666',
          }}
        >
          {randomMessage}
        </Typography>
      </Box>
    </Box>
  );
}

