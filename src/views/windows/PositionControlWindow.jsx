import React, { useEffect, useRef, useState } from 'react';
import { Box, Typography } from '@mui/material';
import RobotPositionControl from '../active-robot/position-control';
import PositionControlHeader from './PositionControlHeader';
import useAppStore from '@store/useAppStore';
import AppTopBar from '@components/AppTopBar';
import { useWindowSync } from '@hooks/system/useWindowSync';
import { getCurrentWindow } from '@tauri-apps/api/window';

/**
 * Standalone Position Control Window
 * Displays the Position Control component in a dedicated window
 */
export default function PositionControlWindow() {
  // Sync with main window state
  useWindowSync();
  
  // Track window close
  useEffect(() => {
    const setupCloseListener = async () => {
      try {
        const window = await getCurrentWindow();
        const unlisten = await window.onCloseRequested(() => {
          // Safely call removeOpenWindow if it exists (may not exist after hot reload)
          const store = useAppStore.getState();
          if (store && typeof store.removeOpenWindow === 'function') {
            store.removeOpenWindow('position-control');
          }
        });
        return unlisten;
      } catch (error) {
        console.error('Failed to setup close listener:', error);
      }
    };
    
    setupCloseListener();
  }, []);
  
  // Refs and state for reset functionality
  const positionControlResetRef = useRef(null);
  const [isAtInitialPosition, setIsAtInitialPosition] = useState(true);
  
  const darkMode = useAppStore(state => state.darkMode);
  const isActive = useAppStore(state => state.isActive);
  const robotStatus = useAppStore(state => state.robotStatus);
  const isCommandRunning = useAppStore(state => state.isCommandRunning);
  const isAppRunning = useAppStore(state => state.isAppRunning);
  const isInstalling = useAppStore(state => state.isInstalling);

  // Compute isReady and isBusy from state
  const isReady = robotStatus === 'ready';
  const isBusy = robotStatus === 'busy' || isCommandRunning || isAppRunning || isInstalling;
  
  // Handle reset button click
  const handleReset = () => {
    if (positionControlResetRef.current) {
      positionControlResetRef.current();
    }
  };

  // Debug log to see state values
  useEffect(() => {
    console.log('🔍 PositionControlWindow state:', {
      isActive,
      robotStatus,
      isReady,
      isBusy,
      isCommandRunning,
      isAppRunning,
      isInstalling,
    });
  }, [isActive, robotStatus, isReady, isBusy, isCommandRunning, isAppRunning, isInstalling]);

  // Show loading state if critical state is not yet synchronized
  const isStateReady = isActive !== undefined && robotStatus !== undefined;

  return (
    <>
      <AppTopBar />
      <Box
        sx={{
          width: '100vw',
          height: '100vh',
          background: darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(250, 250, 252, 0.85)',
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)',
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          pt: 5, // Padding top for top bar
        }}
      >
      <Box
        sx={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          px: 4,
          pb: 2,
          bgcolor: 'transparent',
        }}
      >
        {!isStateReady ? (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Waiting for robot connection...
            </Typography>
          </Box>
        ) : isActive ? (
          <>
            <PositionControlHeader
              darkMode={darkMode}
              isActive={isActive}
              isBusy={isBusy}
              isAtInitialPosition={isAtInitialPosition}
              onReset={handleReset}
            />
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <RobotPositionControl
                isActive={isActive}
                darkMode={darkMode}
                onResetReady={(resetFn) => {
                  positionControlResetRef.current = resetFn;
                }}
                onIsAtInitialPosition={(isAtInitial) => {
                  setIsAtInitialPosition(isAtInitial);
                }}
              />
            </Box>
          </>
        ) : (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Robot is not active. Please start the robot first.
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
    </>
  );
}

