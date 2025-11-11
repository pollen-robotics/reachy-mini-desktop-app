import React from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import { getCurrentWindow } from '@tauri-apps/api/window';
import useAppStore from '../../store/useAppStore';

/**
 * Vue de transition entre StartingView et ActiveRobotView
 * Affichée pendant le resize de la fenêtre
 */
export default function TransitionView() {
  const appWindow = window.mockGetCurrentWindow ? window.mockGetCurrentWindow() : getCurrentWindow();
  const { darkMode } = useAppStore();

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
        <Box sx={{ height: 20 }} /> {/* Espace pour le drag */}
        <Box sx={{ width: 20, height: 20 }} />
      </Box>

      {/* Spinner centré */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 'calc(100% - 44px)',
        }}
      >
        <CircularProgress 
          size={32} 
          thickness={3} 
          sx={{ color: darkMode ? '#666' : '#999' }} 
        />
      </Box>
    </Box>
  );
}

