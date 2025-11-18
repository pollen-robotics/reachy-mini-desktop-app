import React, { useState, useEffect } from 'react';
import { Box, Typography } from '@mui/material';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getVersion } from '@tauri-apps/api/app';
import useAppStore from '../../store/useAppStore';

/**
 * Common TopBar component for all views
 * Displays app version and handles window dragging
 */
export default function AppTopBar() {
  const { darkMode } = useAppStore();
  const [currentVersion, setCurrentVersion] = useState('');
  const appWindow = window.mockGetCurrentWindow ? window.mockGetCurrentWindow() : getCurrentWindow();

  useEffect(() => {
    getVersion().then(setCurrentVersion).catch(() => {
      setCurrentVersion(null);
    });
  }, []);

  return (
    <>
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
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: 44,
          cursor: 'move',
          userSelect: 'none',
          WebkitAppRegion: 'drag',
          bgcolor: 'transparent',
          zIndex: 10000,
        }}
      />
      {/* Version number - always visible when available */}
      <Typography
        sx={{
          position: 'fixed',
          top: 10,
          right: 12,
          fontSize: 9,
          color: darkMode ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.35)',
          fontWeight: 500,
          letterSpacing: '0.02em',
          pointerEvents: 'none',
          fontFamily: 'SF Mono, Monaco, Menlo, monospace',
          lineHeight: 1.2,
          zIndex: 10001,
        }}
      >
{currentVersion ? `v${currentVersion}` : 'unknown version'}
      </Typography>
    </>
  );
}

