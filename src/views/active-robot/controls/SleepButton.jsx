import React from 'react';
import { Box, Tooltip, CircularProgress } from '@mui/material';
import BedtimeOutlinedIcon from '@mui/icons-material/BedtimeOutlined';
import { useWakeSleep } from '../hooks/useWakeSleep';
import { useActiveRobotContext } from '../context';

/**
 * Sleep Button Component
 * 
 * Simple button to put the robot to sleep.
 * Only visible when robot is awake.
 * 
 * Disabled when:
 * - Robot is transitioning
 * - Robot is busy
 * - Controller or Expressions view is active
 */
export default function SleepButton({ darkMode }) {
  const { isTransitioning, canToggle, goToSleep } = useWakeSleep();
  const { robotState } = useActiveRobotContext();
  const { rightPanelView } = robotState;
  
  // Disable when controller or expressions views are active
  const isControllerOrExpressionsActive = rightPanelView === 'controller' || rightPanelView === 'expressions';
  const isDisabled = !canToggle || isControllerOrExpressionsActive || isTransitioning;
  
  // Dynamic tooltip
  const getTooltipTitle = () => {
    if (isControllerOrExpressionsActive) {
      return `Close ${rightPanelView} first`;
    }
    if (isTransitioning) {
      return 'Transitioning...';
    }
    return 'Put robot to sleep';
  };
  
  return (
    <Tooltip title={getTooltipTitle()} arrow placement="bottom">
      <Box
        component="button"
        onClick={isDisabled ? undefined : goToSleep}
        sx={{
          position: 'absolute',
          top: 12,
          left: 56, // Right of power button
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 36,
          height: 36,
          bgcolor: darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(255, 255, 255, 0.95)',
          border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)'}`,
          borderRadius: '50%',
          backdropFilter: 'blur(10px)',
          zIndex: 20,
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          opacity: isDisabled ? 0.4 : 1,
          transition: 'all 0.2s ease',
          boxShadow: darkMode 
            ? '0 2px 8px rgba(0, 0, 0, 0.3)' 
            : '0 2px 8px rgba(0, 0, 0, 0.08)',
          '&:hover': isDisabled ? {} : {
            bgcolor: darkMode ? 'rgba(255, 149, 0, 0.15)' : 'rgba(255, 149, 0, 0.1)',
            borderColor: '#FF9500',
            transform: 'scale(1.05)',
          },
          '&:active': isDisabled ? {} : {
            transform: 'scale(0.95)',
          },
        }}
      >
{isTransitioning ? (
          <CircularProgress 
            size={16} 
            thickness={3}
            sx={{ color: '#FF9500' }} 
          />
        ) : (
        <BedtimeOutlinedIcon 
          sx={{ 
            fontSize: 18, 
            color: isDisabled 
              ? (darkMode ? 'rgba(255, 149, 0, 0.3)' : 'rgba(255, 149, 0, 0.4)')
              : '#FF9500',
          }} 
        />
        )}
      </Box>
    </Tooltip>
  );
}

