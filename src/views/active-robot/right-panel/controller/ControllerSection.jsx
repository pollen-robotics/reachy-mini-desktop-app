import React, { useRef, useState, useEffect } from 'react';
import { Box, Typography, IconButton, Tooltip, Chip } from '@mui/material';
import SportsEsportsOutlinedIcon from '@mui/icons-material/SportsEsportsOutlined';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';
import Controller from '../../controller';
import { useGamepadConnected, useActiveDevice } from '../../../../utils/InputManager';
import { useWindowFocus } from '../../../windows/hooks';
import { useActiveRobotContext } from '../../context';

/**
 * Controller Section - Displays controller component in right panel
 * Uses ActiveRobotContext for decoupling from global stores
 */
export default function ControllerSection({ 
  showToast,
  isBusy = false,
  darkMode = false,
}) {
  const { robotState, actions } = useActiveRobotContext();
  const { rightPanelView, robotStatus, isActive } = robotState;
  const { setRightPanelView } = actions;
  
  // Only enabled when robot is ready (not sleeping, not busy)
  const isReady = robotStatus === 'ready';
  
  const controllerResetRef = useRef(null);
  const [isAtInitialPosition, setIsAtInitialPosition] = useState(true);
  const prevRightPanelViewRef = useRef(rightPanelView);
  
  // Check if gamepad is connected and which device is active
  const isGamepadConnected = useGamepadConnected();
  const activeDevice = useActiveDevice();
  const hasWindowFocus = useWindowFocus();
  const prevGamepadConnectedRef = useRef(isGamepadConnected);
  
  // Debug: log gamepad state
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[ControllerSection] Gamepad state:', {
        isGamepadConnected,
        activeDevice,
        hasWindowFocus,
        shouldBePrimary: isGamepadConnected && activeDevice === 'gamepad',
      });
    }
  }, [isGamepadConnected, activeDevice, hasWindowFocus]);

  // Toast notifications for gamepad connection/disconnection
  useEffect(() => {
    // Skip on initial mount (prevGamepadConnectedRef.current will be the initial value)
    if (prevGamepadConnectedRef.current !== undefined) {
      if (isGamepadConnected && !prevGamepadConnectedRef.current) {
        // Gamepad connected
        if (showToast) {
          showToast('Gamepad connected', 'success');
        }
      } else if (!isGamepadConnected && prevGamepadConnectedRef.current) {
        // Gamepad disconnected
        if (showToast) {
          showToast('Gamepad disconnected', 'warning');
        }
      }
    }
    // Update ref for next comparison
    prevGamepadConnectedRef.current = isGamepadConnected;
  }, [isGamepadConnected, showToast]);

  // Auto-reset when leaving controller section (only on exit, not on entry)
  useEffect(() => {
    const prevView = prevRightPanelViewRef.current;
    const currentView = rightPanelView;
    
    // Only reset if we were in controller and now we're not
    if (prevView === 'controller' && currentView !== 'controller' && controllerResetRef.current) {
      controllerResetRef.current();
    }
    
    // Update ref for next comparison
    prevRightPanelViewRef.current = currentView;
  }, [rightPanelView]);

  // Cleanup: reset on unmount (only if we're actually leaving)
  useEffect(() => {
    return () => {
      // Only reset if we're actually unmounting while in controller view
      if (rightPanelView === 'controller' && controllerResetRef.current) {
        controllerResetRef.current();
      }
    };
  }, [rightPanelView]);

  const handleBack = () => {
    setRightPanelView(null); // Return to applications view
  };

  return (
    <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header with back button and title */}
      <Box
        sx={{
          px: 2,
          pt: 1.5,
          bgcolor: 'transparent',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <IconButton
          onClick={handleBack}
          size="small"
          sx={{
              color: '#FF9500',
            '&:hover': {
                bgcolor: darkMode ? 'rgba(255, 149, 0, 0.1)' : 'rgba(255, 149, 0, 0.05)',
            },
          }}
        >
          <ArrowBackIcon sx={{ fontSize: 20 }} />
        </IconButton>
          <Typography
            sx={{
              fontSize: 20,
              fontWeight: 700,
              color: darkMode ? '#f5f5f5' : '#333',
              letterSpacing: '-0.3px',
            }}
          >
            Controller
          </Typography>
          {/* Input device indicator - always show, indicates gamepad support */}
          <Tooltip 
            title={
              isGamepadConnected
                ? "Left stick: X/Y\nRight stick: Pitch/Yaw\nD-pad ↑↓: Z\nD-pad ←→: Body\nL1/R1: Antennas"
                : "Connect a gamepad to control the robot"
            }
            arrow 
            placement="right"
            componentsProps={{
              tooltip: {
                sx: { whiteSpace: 'pre-line' }
              }
            }}
          >
            <Chip
              icon={<SportsEsportsOutlinedIcon />}
              label=""
              size="medium"
              variant="outlined"
              sx={{
                height: 30,
                width: 30,
                padding: .5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: isGamepadConnected ? 1 : 0.6,
                borderColor: isGamepadConnected
                  ? '#FF9500'
                  : (darkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'),
                '& .MuiChip-icon': {
                  fontSize: '1rem',
                  color: isGamepadConnected
                          ? '#FF9500' 
                    : (darkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.4)'),
                  margin: 0,
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%',
                  height: '100%',
                },
                '& .MuiChip-label': {
                  display: 'none',
                },
              }}
            />
          </Tooltip>
          {/* Reset button - only show when not at initial position */}
          {!isAtInitialPosition && (
            <Tooltip title="Reset all position controls" arrow>
              <IconButton 
                size="small" 
                onClick={() => {
                  if (controllerResetRef.current) {
                    controllerResetRef.current();
                  }
                }}
                disabled={!isReady || isBusy}
                sx={{ 
                  ml: 0.5,
                  color: darkMode ? '#888' : '#999',
                  '&:hover': {
                    color: '#FF9500',
                    bgcolor: darkMode ? 'rgba(255, 149, 0, 0.1)' : 'rgba(255, 149, 0, 0.05)',
                  }
                }}
              >
                <RefreshIcon sx={{ fontSize: 16, color: darkMode ? '#888' : '#999' }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>
      
      {/* Controller component with padding */}
      <Box sx={{ pt: 1, pr: 3, pb: 1.5, pl: 3 }}>
        <Controller
          isActive={isActive}
          darkMode={darkMode}
          onResetReady={(resetFn) => {
            controllerResetRef.current = resetFn;
          }}
          onIsAtInitialPosition={(isAtInitial) => {
            setIsAtInitialPosition(isAtInitial);
          }}
        />
      </Box>
    </Box>
  );
}

