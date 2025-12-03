import React, { useRef, useState, useEffect } from 'react';
import { Box, Typography, IconButton, Tooltip, Chip } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
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
          <Tooltip 
            title={
              <Box sx={{ p: 1 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 700, mb: 1, color: darkMode ? '#fff' : '#333' }}>
                  API Documentation
                </Typography>
                <Typography sx={{ fontSize: 11, mb: 1, color: darkMode ? '#f0f0f0' : '#666', lineHeight: 1.6 }}>
                  <strong>Endpoint:</strong> POST /api/move/set_target
                </Typography>
                <Typography sx={{ fontSize: 11, mb: 1, color: darkMode ? '#f0f0f0' : '#666', lineHeight: 1.6 }}>
                  <strong>Request Body:</strong>
                </Typography>
                <Box component="pre" sx={{ 
                  fontSize: 10, 
                  mb: 1, 
                  color: darkMode ? '#e0e0e0' : '#333', 
                  fontFamily: 'monospace', 
                  whiteSpace: 'pre-wrap', 
                  bgcolor: darkMode ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)', 
                  p: 1, 
                  borderRadius: 1 
                }}>
{`{
  "target_head_pose": {
    "x": float,    // Position X (m), range: -0.05 to 0.05
    "y": float,    // Position Y (m), range: -0.05 to 0.05
    "z": float,    // Position Z/Height (m), range: -0.05 to 0.05
    "pitch": float, // Rotation pitch (rad), range: -0.8 to 0.8
    "yaw": float,   // Rotation yaw (rad), range: -1.2 to 1.2
    "roll": float   // Rotation roll (rad), range: -0.5 to 0.5
  },
  "target_antennas": [float, float], // [left, right] (rad), range: -π to π
  "target_body_yaw": float           // Body rotation (rad), range: -160° to 160°
}`}
                </Box>
                <Typography sx={{ fontSize: 11, mb: 0.5, color: darkMode ? '#f0f0f0' : '#666', lineHeight: 1.6 }}>
                  <strong>Controls:</strong>
                </Typography>
                <Typography sx={{ fontSize: 10, mb: 1, color: darkMode ? '#e0e0e0' : '#666', lineHeight: 1.6 }}>
                  • Drag joysticks/sliders for continuous movement<br/>
                  • Release to send final position<br/>
                  • All movements use set_target (no interpolation)<br/>
                  • Controls disabled when movements are active
                </Typography>
              </Box>
            }
            arrow 
            placement="right"
            componentsProps={{
              tooltip: {
                sx: {
                  maxWidth: 420,
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
            <InfoOutlinedIcon sx={{ fontSize: 14, color: darkMode ? '#666' : '#999', opacity: 0.6, cursor: 'help' }} />
          </Tooltip>
          {/* Input device indicator - always show, indicates gamepad support */}
            <Tooltip 
            title={
              isGamepadConnected
                ? (activeDevice === 'gamepad' && hasWindowFocus
                ? 'Gamepad active' 
                    : 'Gamepad connected')
                : 'Gamepad support available'
            }
            >
              <Chip
                icon={<SportsEsportsIcon />}
                label=""
                size="small"
              color={isGamepadConnected && activeDevice === 'gamepad' && hasWindowFocus ? 'primary' : 'default'}
                sx={{
                  height: 20,
                  width: 20,
                  minWidth: 20,
                opacity: isGamepadConnected && hasWindowFocus ? 1 : 0.4, // Gray out when not connected or window loses focus
                  bgcolor: darkMode 
                  ? (isGamepadConnected && activeDevice === 'gamepad' && hasWindowFocus
                        ? 'rgba(255, 149, 0, 0.2)' 
                        : 'rgba(255, 255, 255, 0.05)')
                  : (isGamepadConnected && activeDevice === 'gamepad' && hasWindowFocus
                        ? 'rgba(255, 149, 0, 0.15)'
                        : 'rgba(0, 0, 0, 0.05)'),
                  border: `1px solid ${darkMode 
                  ? (isGamepadConnected && activeDevice === 'gamepad' && hasWindowFocus
                        ? 'rgba(255, 149, 0, 0.3)' 
                        : 'rgba(255, 255, 255, 0.1)')
                  : (isGamepadConnected && activeDevice === 'gamepad' && hasWindowFocus
                        ? 'rgba(255, 149, 0, 0.3)'
                        : 'rgba(0, 0, 0, 0.1)')}`,
                  '& .MuiChip-icon': {
                    fontSize: '0.9rem',
                    color: darkMode 
                    ? (isGamepadConnected && activeDevice === 'gamepad' && hasWindowFocus
                          ? '#FF9500' 
                          : 'rgba(255, 255, 255, 0.6)')
                    : (isGamepadConnected && activeDevice === 'gamepad' && hasWindowFocus
                          ? '#FF9500'
                          : 'rgba(0, 0, 0, 0.6)'),
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
      <Box sx={{ px: 3, pt: 1, pb: 3 }}>
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

