import React from 'react';
import { Box, Typography, Button, Chip } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CloseIcon from '@mui/icons-material/Close';
import ExpressionIcon from '@assets/expression.svg';
import JoystickIcon from '@assets/joystick.svg';
import useAppStore from '../../../store/useAppStore';

/**
 * Control Cards Component
 * Displays Expressions and Controller as cards with open/close buttons
 * Similar design to Applications cards
 */
export default function ControlButtons({ 
  darkMode = false,
  isActive = false,
}) {
  const rightPanelView = useAppStore(state => state.rightPanelView);
  const setRightPanelView = useAppStore(state => state.setRightPanelView);
  const isExpressionsOpen = rightPanelView === 'expressions';
  const isControllerOpen = rightPanelView === 'controller';
  
  const handleExpressionsClick = () => {
    if (isExpressionsOpen) {
      setRightPanelView(null); // Close: return to applications
    } else {
      setRightPanelView('expressions'); // Open expressions in right panel
    }
  };
  
  const handleControllerClick = () => {
    if (isControllerOpen) {
      setRightPanelView(null); // Close: return to applications
    } else {
      setRightPanelView('controller'); // Open controller in right panel
    }
  };

  const cardStyle = {
    borderRadius: '14px',
    bgcolor: darkMode ? 'rgba(255, 255, 255, 0.02)' : 'white',
    border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'}`,
    p: 2.1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 1.5,
    transition: 'all 0.2s ease',
    opacity: !isActive ? 0.5 : 1,
    flex: 1,
    position: 'relative',
  };

  const buttonStyle = {
    textTransform: 'none',
    fontWeight: 600,
    fontSize: 12,
    borderRadius: '8px',
    px: 2,
    py: 0.75,
    minWidth: 'auto',
    transition: 'all 0.2s ease',
  };

  const openButtonStyle = {
    ...buttonStyle,
    border: '1px solid #FF9500',
    color: '#FF9500',
    bgcolor: 'transparent',
    position: 'relative',
    overflow: 'visible',
    // Pulse animation - same as Discover Apps button
    animation: 'controlPulse 3s ease-in-out infinite',
    '@keyframes controlPulse': {
      '0%, 100%': {
        boxShadow: darkMode
          ? '0 0 0 0 rgba(255, 149, 0, 0.4)'
          : '0 0 0 0 rgba(255, 149, 0, 0.3)',
      },
      '50%': {
        boxShadow: darkMode
          ? '0 0 0 8px rgba(255, 149, 0, 0)'
          : '0 0 0 8px rgba(255, 149, 0, 0)',
      },
    },
    '&:hover': {
      bgcolor: 'rgba(255, 149, 0, 0.1)',
      border: '1px solid #FF9500',
      transform: 'translateY(-2px)',
      boxShadow: darkMode
        ? '0 6px 16px rgba(255, 149, 0, 0.2)'
        : '0 6px 16px rgba(255, 149, 0, 0.15)',
      animation: 'none', // Stop pulse on hover
    },
    '&:active': {
      transform: 'translateY(0)',
      boxShadow: darkMode
        ? '0 2px 8px rgba(255, 149, 0, 0.2)'
        : '0 2px 8px rgba(255, 149, 0, 0.15)',
    },
    '&:disabled': {
      border: `1px solid ${darkMode ? 'rgba(255, 149, 0, 0.3)' : 'rgba(255, 149, 0, 0.4)'}`,
      color: darkMode ? 'rgba(255, 149, 0, 0.3)' : 'rgba(255, 149, 0, 0.4)',
      animation: 'none',
    },
  };

  const closeButtonStyle = {
    ...buttonStyle,
    border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.2)'}`,
    color: darkMode ? '#f5f5f5' : '#333',
    bgcolor: 'transparent',
    transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
    '&:hover': {
      bgcolor: darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
      transform: 'translateY(-2px)',
    },
    '&:active': {
      transform: 'translateY(0)',
    },
  };

  return (
    <Box
      sx={{
        px: 3,
        pt: 4,
        pb: 3,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
      }}
    >
      {/* Title Section */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
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
          Quick Actions
        </Typography>
      </Box>

      {/* Cards Row */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'row',
          gap: 1.5,
          width: '100%',
        }}
      >
        {/* Expressions Card */}
        <Box sx={cardStyle}>
          {isExpressionsOpen && (
            <Chip
              label="Open"
              size="small"
              sx={{
                position: 'absolute',
                top: 8,
                right: 8,
                height: 18,
                fontSize: 9,
                fontWeight: 600,
                bgcolor: 'rgba(34, 197, 94, 0.15)',
                color: '#22c55e',
                '& .MuiChip-label': {
                  px: 0.75,
                  py: 0,
                },
              }}
            />
          )}
          <Box
            component="img"
            src={ExpressionIcon}
            alt="Expressions"
            sx={{
              width: 64,
              height: 64,
              mb: 0.5,
            }}
          />
          <Typography
            sx={{
              fontSize: 15,
              fontWeight: 600,
              color: darkMode ? '#f5f5f5' : '#333',
              letterSpacing: '-0.2px',
              textAlign: 'center',
            }}
          >
            Expressions
          </Typography>
          <Button
            onClick={handleExpressionsClick}
            disabled={!isActive}
            variant="outlined"
            startIcon={isExpressionsOpen ? <CloseIcon sx={{ fontSize: 14 }} /> : <OpenInNewIcon sx={{ fontSize: 14 }} />}
            sx={{
              ...(isExpressionsOpen ? closeButtonStyle : openButtonStyle),
              width: 'auto',
            }}
          >
            {isExpressionsOpen ? 'Close' : 'Open'}
          </Button>
        </Box>

        {/* Controller Card */}
        <Box sx={cardStyle}>
          {isControllerOpen && (
            <Chip
              label="Open"
              size="small"
              sx={{
                position: 'absolute',
                top: 8,
                right: 8,
                height: 18,
                fontSize: 9,
                fontWeight: 600,
                bgcolor: 'rgba(34, 197, 94, 0.15)',
                color: '#22c55e',
                '& .MuiChip-label': {
                  px: 0.75,
                  py: 0,
                },
              }}
            />
          )}
          <Box
            component="img"
            src={JoystickIcon}
            alt="Controller"
            sx={{
              width: 64,
              height: 64,
              mb: 0.5,
            }}
          />
          <Typography
            sx={{
              fontSize: 15,
              fontWeight: 600,
              color: darkMode ? '#f5f5f5' : '#333',
              letterSpacing: '-0.2px',
              textAlign: 'center',
            }}
          >
            Controller
          </Typography>
          <Button
            onClick={handleControllerClick}
            disabled={!isActive}
            variant="outlined"
            startIcon={isControllerOpen ? <CloseIcon sx={{ fontSize: 14 }} /> : <OpenInNewIcon sx={{ fontSize: 14 }} />}
            sx={{
              ...(isControllerOpen ? closeButtonStyle : openButtonStyle),
              width: 'auto',
            }}
          >
            {isControllerOpen ? 'Close' : 'Open'}
          </Button>
        </Box>
      </Box>
    </Box>
  );
}

