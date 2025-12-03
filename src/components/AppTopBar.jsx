import React, { useState, useEffect } from 'react';
import { Box, Typography } from '@mui/material';
import { getAppWindow } from '../utils/windowUtils';
import { getVersion } from '@tauri-apps/api/app';
import { getCurrentWindow } from '@tauri-apps/api/window';
import useAppStore from '../store/useAppStore';
import { isSimulationMode } from '../utils/simulationMode';

/**
 * Common TopBar component for all views
 * Displays app version and handles window dragging
 */
export default function AppTopBar() {
  const { darkMode } = useAppStore();
  const [currentVersion, setCurrentVersion] = useState('');
  const [isMainWindow, setIsMainWindow] = useState(true);
  const appWindow = getAppWindow();
  const simMode = isSimulationMode();

  useEffect(() => {
    getVersion().then(setCurrentVersion).catch(() => {
      setCurrentVersion(null);
    });
    
    // Check if we're in the main window
    const checkWindow = async () => {
      try {
        const window = await getCurrentWindow();
        setIsMainWindow(window.label === 'main');
      } catch (error) {
        // If we can't determine, assume main window (fallback)
        setIsMainWindow(true);
      }
    };
    
    checkWindow();
  }, []);

  return (
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
        position: 'absolute',
          top: 0,
          left: 65,
          right: 0,
          height: 33,
          cursor: 'move',
          userSelect: 'none',
          WebkitAppRegion: 'drag',
          bgcolor: 'transparent',
            zIndex: 99999,
          }}
        >
      {/* Version number à droite - only visible in main window */}
      {isMainWindow && (
      <Typography
        sx={{
          position: 'absolute',
          top: 10,
          right: 12,
          fontSize: 9,
          color: darkMode ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.35)',
          fontWeight: 500,
          letterSpacing: '0.02em',
          pointerEvents: 'none',
          fontFamily: 'SF Mono, Monaco, Menlo, monospace',
          lineHeight: 1.2,
          zIndex: 99999,
        }}
      >
{currentVersion ? `v${currentVersion}` : 'unknown version'}
      </Typography>
      )}
    </Box>
  );
}

