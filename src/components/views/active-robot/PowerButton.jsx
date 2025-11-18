import React from 'react';
import { IconButton, CircularProgress } from '@mui/material';
import PowerSettingsNewOutlinedIcon from '@mui/icons-material/PowerSettingsNewOutlined';

/**
 * Power Button Component - Top left corner power control
 */
export default function PowerButton({ 
  onStopDaemon, 
  isReady, 
  isStopping, 
  darkMode 
}) {
  return (
    <IconButton
      onClick={onStopDaemon}
      disabled={!isReady}
      sx={{
        position: 'absolute',
        top: 12,
        left: 12,
        bgcolor: darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        color: '#FF9500',
        width: 36,
        height: 36,
        border: darkMode ? '1px solid rgba(255, 149, 0, 0.5)' : '1px solid rgba(255, 149, 0, 0.4)',
        backdropFilter: 'blur(10px)',
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        opacity: isReady ? 1 : 0.4,
        boxShadow: darkMode 
          ? '0 2px 8px rgba(255, 149, 0, 0.2)' 
          : '0 2px 8px rgba(255, 149, 0, 0.15)',
        // z-index hierarchy: 20 = important UI controls (above standard 10)
        zIndex: 20,
        '&:hover': {
          bgcolor: darkMode ? 'rgba(255, 149, 0, 0.12)' : 'rgba(255, 149, 0, 0.08)',
          transform: isReady ? 'scale(1.08)' : 'none',
          borderColor: darkMode ? 'rgba(255, 149, 0, 0.7)' : 'rgba(255, 149, 0, 0.6)',
          boxShadow: darkMode 
            ? '0 4px 12px rgba(255, 149, 0, 0.3)' 
            : '0 4px 12px rgba(255, 149, 0, 0.25)',
        },
        '&:active': {
          transform: isReady ? 'scale(0.95)' : 'none',
        },
        '&:disabled': {
          bgcolor: darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.6)',
          color: darkMode ? '#666' : '#999',
          borderColor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
        },
      }}
      title={isStopping ? 'Stopping...' : !isReady ? 'Robot is busy...' : 'Power Off'}
    >
      {isStopping ? (
        <CircularProgress size={16} thickness={4} sx={{ color: darkMode ? '#666' : '#999' }} />
      ) : (
        <PowerSettingsNewOutlinedIcon sx={{ fontSize: 18 }} />
      )}
    </IconButton>
  );
}

