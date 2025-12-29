import React from 'react';
import { Box, Typography, Chip } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CloseIcon from '@mui/icons-material/Close';
import ExpressionIcon from '@assets/expression.svg';
import JoystickIcon from '@assets/joystick.svg';
import PulseButton from '@components/PulseButton';
import { useActiveRobotContext } from '../context';

/**
 * Control Cards Component
 * Displays Expressions and Controller as cards with open/close buttons
 * Similar design to Applications cards
 * 
 * Uses ActiveRobotContext for decoupling from global stores
 */
export default function ControlButtons({ 
  darkMode = false,
  isBusy = false,
}) {
  const { robotState, actions } = useActiveRobotContext();
  const { rightPanelView, currentApp, robotStatus } = robotState;
  const { setRightPanelView } = actions;
  const isExpressionsOpen = rightPanelView === 'expressions';
  const isControllerOpen = rightPanelView === 'controller';
  
  // Check if any app is currently running or starting (based on currentApp state)
  const isAnyAppActive = currentApp && currentApp.state && 
    (currentApp.state === 'running' || currentApp.state === 'starting');
  
  // Disable buttons when robot is sleeping, when an app is running, or when busy
  // Only enabled when robotStatus === 'ready' and not busy
  const isDisabled = robotStatus !== 'ready' || isAnyAppActive || isBusy;
  
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
    opacity: isDisabled ? 0.5 : 1,
    flex: 1,
    position: 'relative',
  };

  // Close button has different style (no pulse, neutral colors)
  const closeButtonOverrides = {
    border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.2)'}`,
    color: darkMode ? '#f5f5f5' : '#333',
    '&:hover': {
      bgcolor: darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
      border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.2)'}`,
    },
  };

  return (
    <Box
      sx={{
        px: 3,
        pt: 4,
        pb: 2.5,
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
          <PulseButton
            onClick={handleExpressionsClick}
            disabled={isDisabled}
            pulse={!isExpressionsOpen}
            darkMode={darkMode}
            size="small"
            startIcon={isExpressionsOpen ? <CloseIcon sx={{ fontSize: 14 }} /> : <OpenInNewIcon sx={{ fontSize: 14 }} />}
            sx={isExpressionsOpen ? closeButtonOverrides : {}}
          >
            {isExpressionsOpen ? 'Close' : 'Open'}
          </PulseButton>
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
          <PulseButton
            onClick={handleControllerClick}
            disabled={isDisabled}
            pulse={!isControllerOpen}
            darkMode={darkMode}
            size="small"
            startIcon={isControllerOpen ? <CloseIcon sx={{ fontSize: 14 }} /> : <OpenInNewIcon sx={{ fontSize: 14 }} />}
            sx={isControllerOpen ? closeButtonOverrides : {}}
          >
            {isControllerOpen ? 'Close' : 'Open'}
          </PulseButton>
        </Box>
      </Box>
    </Box>
  );
}

