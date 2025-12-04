import React, { useRef, useState, useEffect } from 'react';
import { Box, Typography, IconButton, Tooltip, Chip } from '@mui/material';
import SportsEsportsIcon from '@mui/icons-material/SportsEsports';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';
import Controller from '../../controller';
import { useGamepadConnected, useActiveDevice } from '../../../../utils/InputManager';
import { useWindowFocus } from '../../../windows/hooks';
import useAppStore from '../../../../store/useAppStore';

/**
 * Controller Section - Displays controller component in right panel
 */
export default function ControllerSection({ 
  isActive = false,
  isBusy = false,
  darkMode = false,
}) {
  const controllerResetRef = useRef(null);
  const [isAtInitialPosition, setIsAtInitialPosition] = useState(true);
  const rightPanelView = useAppStore(state => state.rightPanelView);
  const setRightPanelView = useAppStore(state => state.setRightPanelView);
  const prevRightPanelViewRef = useRef(rightPanelView);
  
  // Check if gamepad is connected and which device is active
  const isGamepadConnected = useGamepadConnected();
  const activeDevice = useActiveDevice();
  const hasWindowFocus = useWindowFocus();

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
                ? (
                  <Box sx={{ p: 1 }}>
                    <Typography sx={{ fontSize: 12, fontWeight: 700, mb: 1.5, color: darkMode ? '#fff' : '#333' }}>
                      Bindings Gamepad
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      <Typography sx={{ fontSize: 11, color: darkMode ? '#f0f0f0' : '#666', lineHeight: 1.6 }}>
                        <strong>Left stick :</strong> Position X/Y
                      </Typography>
                      <Typography sx={{ fontSize: 11, color: darkMode ? '#f0f0f0' : '#666', lineHeight: 1.6 }}>
                        <strong>Right stick :</strong> Pitch/Yaw
                      </Typography>
                      <Typography sx={{ fontSize: 11, color: darkMode ? '#f0f0f0' : '#666', lineHeight: 1.6 }}>
                        <strong>D-pad ↑/↓ :</strong> Position Z
                      </Typography>
                      <Typography sx={{ fontSize: 11, color: darkMode ? '#f0f0f0' : '#666', lineHeight: 1.6 }}>
                        <strong>D-pad ←/→ :</strong> Body Yaw
                      </Typography>
                      <Typography sx={{ fontSize: 11, color: darkMode ? '#f0f0f0' : '#666', lineHeight: 1.6 }}>
                        <strong>L1/R1 :</strong> Left/Right antennas
                      </Typography>
                      <Typography sx={{ fontSize: 11, color: darkMode ? '#f0f0f0' : '#666', lineHeight: 1.6 }}>
                        <strong>A :</strong> Interact
                      </Typography>
                      <Typography sx={{ fontSize: 11, color: darkMode ? '#f0f0f0' : '#666', lineHeight: 1.6 }}>
                        <strong>B :</strong> Return to initial position
                      </Typography>
                      <Typography sx={{ fontSize: 11, color: darkMode ? '#f0f0f0' : '#666', lineHeight: 1.6 }}>
                        <strong>X :</strong> Next position
                      </Typography>
                      <Typography sx={{ fontSize: 11, color: darkMode ? '#f0f0f0' : '#666', lineHeight: 1.6 }}>
                        <strong>Y :</strong> Toggle mode
                      </Typography>
                    </Box>
                  </Box>
                )
                : (
                  <Box sx={{ p: 1 }}>
                    <Typography sx={{ fontSize: 11, color: darkMode ? '#f0f0f0' : '#666', lineHeight: 1.6 }}>
                      Connect a gamepad to control the robot
                    </Typography>
                  </Box>
                )
            }
            arrow 
            placement="right"
            componentsProps={{
              tooltip: {
                sx: {
                  maxWidth: 280,
                  bgcolor: darkMode ? 'rgba(26, 26, 26, 0.98)' : 'rgba(255, 255, 255, 0.98)',
                  border: `1px solid ${darkMode ? 'rgba(255, 149, 0, 0.3)' : 'rgba(255, 149, 0, 0.4)'}`,
                  boxShadow: darkMode ? '0 8px 24px rgba(0, 0, 0, 0.5)' : '0 8px 24px rgba(0, 0, 0, 0.15)',
                }
              },
              arrow: {
                sx: {
                  color: darkMode ? 'rgba(26, 26, 26, 0.98)' : 'rgba(255, 255, 255, 0.98)',
                }
              }
            }}
          >
            <Chip
              icon={<SportsEsportsIcon />}
              label=""
              size="small"
              variant="outlined"
              color={isGamepadConnected && activeDevice === 'gamepad' && hasWindowFocus ? 'primary' : 'default'}
              sx={{
                height: 24,
                width: 24,
                minWidth: 24,
                opacity: isGamepadConnected && hasWindowFocus ? 1 : 0.6,
                borderColor: darkMode 
                  ? (isGamepadConnected && activeDevice === 'gamepad' && hasWindowFocus
                        ? 'rgba(255, 149, 0, 0.5)' 
                        : 'rgba(255, 255, 255, 0.2)')
                  : (isGamepadConnected && activeDevice === 'gamepad' && hasWindowFocus
                        ? 'rgba(255, 149, 0, 0.5)'
                        : 'rgba(0, 0, 0, 0.2)'),
                '& .MuiChip-icon': {
                  fontSize: '0.9rem',
                  color: darkMode 
                    ? (isGamepadConnected && activeDevice === 'gamepad' && hasWindowFocus
                          ? '#FF9500' 
                          : 'rgba(255, 255, 255, 0.7)')
                    : (isGamepadConnected && activeDevice === 'gamepad' && hasWindowFocus
                          ? '#FF9500'
                          : 'rgba(0, 0, 0, 0.7)'),
                  margin: 0,
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
                disabled={!isActive || isBusy}
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
      <Box sx={{ pt: 3, pr: 3, pb: 3, pl: 3 }}>
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

