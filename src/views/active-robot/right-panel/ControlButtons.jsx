import React from 'react';
import { Box, Button, Typography, Chip } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import RocketIcon from '@assets/rocket.svg';
import JoystickIcon from '@assets/joystick.svg';
import { openQuickActionsWindow, openPositionControlWindow } from '../../../utils/windowManager';
import useAppStore from '../../../store/useAppStore';

/**
 * Control Buttons Component
 * Replaces Expressions and Position Control sections with grouped buttons
 * Each button opens the corresponding component in a new Tauri window
 */
export default function ControlButtons({ 
  darkMode = false,
  isActive = false,
}) {
  const openWindows = useAppStore(state => state.openWindows);
  const isQuickActionsOpen = openWindows.includes('quick-actions');
  const isPositionControlOpen = openWindows.includes('position-control');

  const buttonStyle = {
    flex: 1,
    aspectRatio: '1 / 1', // Make buttons square
    py: 1.5,
    px: 2,
    borderRadius: '12px',
    textTransform: 'none',
    fontWeight: 600,
    fontSize: 13,
    letterSpacing: '-0.2px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0.5,
    transition: 'all 0.2s ease',
    border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`,
    bgcolor: darkMode ? '#1a1a1a' : '#ffffff',
    color: darkMode ? '#f5f5f5' : '#333',
    '&:hover': {
      bgcolor: darkMode ? 'rgba(255, 149, 0, 0.15)' : 'rgba(255, 149, 0, 0.1)',
      border: `1px solid ${darkMode ? 'rgba(255, 149, 0, 0.3)' : 'rgba(255, 149, 0, 0.3)'}`,
      transform: 'translateY(-2px)',
      boxShadow: darkMode 
        ? '0 4px 12px rgba(255, 149, 0, 0.2)' 
        : '0 4px 12px rgba(255, 149, 0, 0.15)',
    },
    '&:active': {
      transform: 'translateY(0)',
    },
    '&:disabled': {
      opacity: 0.4,
      cursor: 'not-allowed',
      border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'}`,
      bgcolor: darkMode ? 'rgba(26, 26, 26, 0.5)' : 'rgba(255, 255, 255, 0.5)',
    },
  };

  const activeButtonStyle = {
    ...buttonStyle,
    bgcolor: darkMode ? 'rgba(255, 149, 0, 0.2)' : 'rgba(255, 149, 0, 0.1)',
    border: `1px solid ${darkMode ? 'rgba(255, 149, 0, 0.4)' : 'rgba(255, 149, 0, 0.4)'}`,
    boxShadow: darkMode 
      ? '0 2px 8px rgba(255, 149, 0, 0.3)' 
      : '0 2px 8px rgba(255, 149, 0, 0.2)',
  };

  const iconStyle = {
    width: 72,
    height: 72,
    mb: 0.5,
  };

  return (
    <Box
      sx={{
        px: 3,
        pt: 2,
        pb: 3,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      {/* Title Section */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          mb: 1,
        }}
      >
        <Typography
          sx={{
            fontSize: 20,
            fontWeight: 700,
            color: darkMode ? '#f5f5f5' : '#333',
            letterSpacing: '-0.3px',
          }}
        >
          Controls
        </Typography>
      </Box>

      {/* Buttons Row */}
      <Box
        sx={{
          display: 'flex',
          gap: 3,
          width: '100%',
        }}
      >
        {/* Expressions Button */}
        <Button
          onClick={openQuickActionsWindow}
          disabled={!isActive}
          sx={{
            ...(isQuickActionsOpen ? activeButtonStyle : buttonStyle),
            position: 'relative',
            '&:hover .close-icon': {
              opacity: 1,
            },
          }}
        >
          {isQuickActionsOpen && (
            <>
              <CloseIcon 
                className="close-icon"
                sx={{ 
                  position: 'absolute',
                  top: 4,
                  left: 4,
                  fontSize: 16, 
                  color: '#FF9500',
                  opacity: 0,
                  transition: 'opacity 0.2s ease',
                }} 
              />
              <Chip
                label="Close"
                size="small"
                sx={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  height: 18,
                  fontSize: 9,
                  fontWeight: 600,
                  bgcolor: '#FF9500',
                  color: '#fff',
                  '& .MuiChip-label': {
                    px: 0.75,
                    py: 0,
                  },
                }}
              />
            </>
          )}
          <Box
            component="img"
            src={RocketIcon}
            alt="Rocket"
            sx={iconStyle}
          />
          <Typography
            sx={{
              fontSize: 13,
              fontWeight: 700,
              color: '#FF9500',
              letterSpacing: '-0.3px',
            }}
          >
                    Expressions
          </Typography>
          <Typography
            sx={{
              fontSize: 10,
              color: darkMode ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)',
              fontWeight: 400,
              mt: -0.25,
            }}
          >
            Express emotions
          </Typography>
        </Button>

        {/* Position Control Button */}
        <Button
          onClick={openPositionControlWindow}
          disabled={!isActive}
          sx={{
            ...(isPositionControlOpen ? activeButtonStyle : buttonStyle),
            position: 'relative',
            '&:hover .close-icon': {
              opacity: 1,
            },
          }}
        >
          {isPositionControlOpen && (
            <>
              <CloseIcon 
                className="close-icon"
                sx={{ 
                  position: 'absolute',
                  top: 4,
                  left: 4,
                  fontSize: 16, 
                  color: '#FF9500',
                  opacity: 0,
                  transition: 'opacity 0.2s ease',
                }} 
              />
              <Chip
                label="Close"
                size="small"
                sx={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  height: 18,
                  fontSize: 9,
                  fontWeight: 600,
                  bgcolor: '#FF9500',
                  color: '#fff',
                  '& .MuiChip-label': {
                    px: 0.75,
                    py: 0,
                  },
                }}
              />
            </>
          )}
          <Box
            component="img"
            src={JoystickIcon}
            alt="Joystick"
            sx={iconStyle}
          />
          <Typography
            sx={{
              fontSize: 13,
              fontWeight: 700,
              color: '#FF9500',
              letterSpacing: '-0.3px',
            }}
          >
            Controller
          </Typography>
          <Typography
            sx={{
              fontSize: 10,
              color: darkMode ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)',
              fontWeight: 400,
              mt: -0.25,
            }}
          >
            Control movement
          </Typography>
        </Button>
      </Box>
    </Box>
  );
}

