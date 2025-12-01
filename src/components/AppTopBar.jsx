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
          zIndex: 99999,
        }}
      />
      {/* Simulation mode indicator */}
      {simMode && (
        <Box
          sx={{
            position: 'fixed',
            top: 10,
            left: '50%',
            transform: 'translateX(-50%)',
            px: 1,
            py: 0.5,
            bgcolor: darkMode ? 'rgba(255, 149, 0, 0.2)' : 'rgba(255, 149, 0, 0.15)',
            border: `1px solid ${darkMode ? 'rgba(255, 149, 0, 0.4)' : 'rgba(255, 149, 0, 0.3)'}`,
            borderRadius: 1,
            pointerEvents: 'none',
            zIndex: 99999,
          }}
        >
          <Typography
            sx={{
              fontSize: 8,
              color: darkMode ? 'rgba(255, 149, 0, 0.9)' : 'rgba(255, 149, 0, 0.8)',
              fontWeight: 600,
              letterSpacing: '0.05em',
              fontFamily: 'SF Mono, Monaco, Menlo, monospace',
              lineHeight: 1.2,
            }}
          >
            🎭 SIM
          </Typography>
        </Box>
      )}
      {/* Version number - only visible in main window */}
      {isMainWindow && (
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
          zIndex: 99999,
        }}
      >
{currentVersion ? `v${currentVersion}` : 'unknown version'}
      </Typography>
      )}
    </>
  );
}

