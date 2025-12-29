import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Box, Typography } from '@mui/material';
import { getAppWindow } from '../utils/windowUtils';
import { getVersion } from '@tauri-apps/api/app';
import { getCurrentWindow } from '@tauri-apps/api/window';
import useAppStore from '../store/useAppStore';
import { isSimulationMode } from '../utils/simulationMode';

/**
 * Common TopBar component for all views
 * Displays app version and handles window dragging
 * 
 * Uses a React Portal to render directly in the body, ensuring it stays
 * above MUI Modals (which also use portals) regardless of parent stacking context.
 */
export default function AppTopBar() {
  const { darkMode, connectionMode } = useAppStore();
  const [currentVersion, setCurrentVersion] = useState('');
  const [isMainWindow, setIsMainWindow] = useState(true);
  const appWindow = getAppWindow();
  const simMode = isSimulationMode();
  
  // Hide version in topbar when connected (shown in RobotHeader instead)
  const isConnected = connectionMode !== null;

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

  // Render via portal to escape parent stacking context
  // z-index 10000000 ensures it's above MUI Modals (which use 9999 by default)
  return createPortal(
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
        left: 65,
        right: 0,
        height: 33,
        cursor: 'move',
        userSelect: 'none',
        WebkitAppRegion: 'drag',
        bgcolor: 'transparent',
        zIndex: 10000000, // Above MUI Modals (9999) and FullscreenOverlay (9999)
      }}
    >
      {/* Version number à droite - only visible in main window and when not connected */}
      {isMainWindow && !isConnected && (
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
          }}
        >
          {currentVersion ? `v${currentVersion}` : 'unknown version'}
        </Typography>
      )}
    </Box>,
    document.body
  );
}

