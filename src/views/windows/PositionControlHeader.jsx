import React from 'react';
import { Box, Typography, IconButton, Tooltip, Chip } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SportsEsportsIcon from '@mui/icons-material/SportsEsports';
import JoystickIcon from '@assets/joystick.svg';
import { useGamepadConnected, useActiveDevice } from '../../utils/InputManager';
import { useWindowFocus } from '../../hooks/system/useWindowFocus';

/**
 * Position Control Header Component
 * Displays title, info tooltip, gamepad indicator, and reset button
 */
export default function PositionControlHeader({ 
  darkMode = false,
  isActive = false,
  isBusy = false,
  isAtInitialPosition = true,
  onReset,
}) {
  // Check if gamepad is connected and which device is active
  const isGamepadConnected = useGamepadConnected();
  const activeDevice = useActiveDevice();
  const hasWindowFocus = useWindowFocus();

  return (
    <Box 
      sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        gap: 1,
        mb: 1.5,
        px: 0,
        pt: 0,
        flexWrap: 'wrap',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Box
        component="img"
        src={JoystickIcon}
        alt="Joystick"
        sx={{
          width: 36,
          height: 36,
          mr: 0.5,
        }}
      />
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
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {/* Input device indicator - only show if gamepad is connected */}
        {isGamepadConnected && (
          <Tooltip 
            title={
              <Box sx={{ p: 1.5 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 700, mb: 1.5, color: '#fff' }}>
                  🎮 Gamepad Controls
                  {activeDevice === 'gamepad' && hasWindowFocus && (
                    <Typography component="span" sx={{ fontSize: 10, ml: 1, color: '#FF9500' }}>
                      (Active)
                    </Typography>
                  )}
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Box>
                    <Typography sx={{ fontSize: 11, fontWeight: 600, mb: 0.5, color: '#FF9500' }}>
                      Head Position
                    </Typography>
                    <Typography sx={{ fontSize: 10, color: '#e0e0e0', lineHeight: 1.6, mb: 0.5 }}>
                      • <strong>Left Stick</strong>: Position X/Y (forward/backward, left/right)
                    </Typography>
                    <Typography sx={{ fontSize: 10, color: '#e0e0e0', lineHeight: 1.6, mb: 0.5 }}>
                      • <strong>Right Stick</strong>: Pitch/Yaw (up/down, left/right)
                    </Typography>
                    <Typography sx={{ fontSize: 10, color: '#e0e0e0', lineHeight: 1.6, mb: 0.5 }}>
                      • <strong>D-Pad ↑/↓</strong>: Position Z (height)
                    </Typography>
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: 11, fontWeight: 600, mb: 0.5, color: '#FF9500' }}>
                      Body & Antennas
                    </Typography>
                    <Typography sx={{ fontSize: 10, color: '#e0e0e0', lineHeight: 1.6, mb: 0.5 }}>
                      • <strong>D-Pad ←/→</strong>: Body rotation (Body Yaw)
                    </Typography>
                    <Typography sx={{ fontSize: 10, color: '#e0e0e0', lineHeight: 1.6, mb: 0.5 }}>
                      • <strong>L/R Triggers</strong>: Left/Right antennas
                    </Typography>
                  </Box>
                </Box>
              </Box>
            }
            componentsProps={{
              tooltip: {
                sx: {
                  maxWidth: 380,
                  bgcolor: 'rgba(26, 26, 26, 0.98)',
                  border: '1px solid rgba(255, 149, 0, 0.3)',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
                }
              },
              arrow: {
                sx: {
                  color: 'rgba(26, 26, 26, 0.98)',
                }
              }
            }}
          >
            <Chip
              icon={<SportsEsportsIcon />}
              label=""
              size="small"
              color={activeDevice === 'gamepad' && hasWindowFocus ? 'primary' : 'default'}
              sx={{
                height: 20,
                width: 20,
                minWidth: 20,
                opacity: hasWindowFocus ? 1 : 0.4, // Gray out when window loses focus
                bgcolor: darkMode 
                  ? (activeDevice === 'gamepad' && hasWindowFocus
                      ? 'rgba(255, 149, 0, 0.2)' 
                      : 'rgba(255, 255, 255, 0.05)')
                  : (activeDevice === 'gamepad' && hasWindowFocus
                      ? 'rgba(255, 149, 0, 0.15)'
                      : 'rgba(0, 0, 0, 0.05)'),
                border: `1px solid ${darkMode 
                  ? (activeDevice === 'gamepad' && hasWindowFocus
                      ? 'rgba(255, 149, 0, 0.3)' 
                      : 'rgba(255, 255, 255, 0.1)')
                  : (activeDevice === 'gamepad' && hasWindowFocus
                      ? 'rgba(255, 149, 0, 0.3)'
                      : 'rgba(0, 0, 0, 0.1)')}`,
                '& .MuiChip-icon': {
                  fontSize: '0.9rem',
                  color: darkMode 
                    ? (activeDevice === 'gamepad' && hasWindowFocus
                        ? '#FF9500' 
                        : 'rgba(255, 255, 255, 0.6)')
                    : (activeDevice === 'gamepad' && hasWindowFocus
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
        )}
        {!isAtInitialPosition && (
          <Tooltip title="Reset all position controls" arrow>
            <IconButton 
              size="small" 
              onClick={onReset}
              disabled={!isActive || isBusy}
              sx={{ 
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
  );
}

