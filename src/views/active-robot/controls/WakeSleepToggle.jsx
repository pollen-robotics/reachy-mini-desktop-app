import React from 'react';
import { Box, Switch, CircularProgress, Tooltip } from '@mui/material';
import BedtimeOutlinedIcon from '@mui/icons-material/BedtimeOutlined';
import WbSunnyOutlinedIcon from '@mui/icons-material/WbSunnyOutlined';
import { useWakeSleep } from '../hooks/useWakeSleep';

/**
 * Wake/Sleep Toggle Component
 * 
 * Pure UI component that displays the wake/sleep toggle.
 * All logic is handled by the useWakeSleep hook.
 */
export default function WakeSleepToggle({ darkMode }) {
  const { isSleeping, isAwake, isTransitioning, canToggle, toggle } = useWakeSleep();
  
  const isDisabled = !canToggle;
  
  return (
    <Tooltip 
      title={isSleeping ? "Wake up robot" : "Put robot to sleep"} 
      arrow 
      placement="bottom"
    >
      <Box
        sx={{
          position: 'absolute',
          top: 12,
          left: 56, // Right of power button (36px + 12px margin + 8px gap)
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          height: 36, // Same height as power button
          bgcolor: darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(255, 255, 255, 0.95)',
          border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)'}`,
          borderRadius: '18px',
          px: 1.25,
          backdropFilter: 'blur(10px)',
          zIndex: 20,
          opacity: isDisabled ? 0.5 : 1,
          transition: 'opacity 0.2s ease',
          boxShadow: darkMode 
            ? '0 2px 8px rgba(0, 0, 0, 0.3)' 
            : '0 2px 8px rgba(0, 0, 0, 0.08)',
        }}
      >
        {/* Icon - Primary color with rotation animation */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 16,
            height: 16,
            transform: isSleeping ? 'rotate(0deg)' : 'rotate(90deg)',
            transition: 'transform 0.4s ease-in-out',
          }}
        >
          {isSleeping ? (
            <BedtimeOutlinedIcon 
              sx={{ 
                fontSize: 16, 
                color: isTransitioning ? '#FF9500' : (darkMode ? 'rgba(255, 149, 0, 0.6)' : 'rgba(255, 149, 0, 0.7)'),
              }} 
            />
          ) : (
            <WbSunnyOutlinedIcon 
              sx={{ 
                fontSize: 16, 
                color: '#FF9500',
                transform: 'rotate(-90deg)', // Counter-rotate to appear upright
              }} 
            />
          )}
        </Box>
        
        {/* Toggle Switch - Outlined Primary style */}
        <Switch
          checked={isAwake}
          onChange={toggle}
          disabled={isDisabled}
          size="small"
          sx={{
            width: 36,
            height: 20,
            padding: 0,
            '& .MuiSwitch-switchBase': {
              padding: 0,
              margin: '2px',
              transitionDuration: '300ms',
              // Thumb style - always primary outlined
              '& .MuiSwitch-thumb': {
                backgroundColor: 'transparent',
                border: '2px solid rgba(255, 149, 0, 0.5)',
                boxShadow: 'none',
              },
              '&.Mui-checked': {
                transform: 'translateX(16px)',
                // Thumb style when checked (awake) - brighter primary
                '& .MuiSwitch-thumb': {
                  backgroundColor: 'transparent',
                  border: '2px solid #FF9500',
                  boxShadow: '0 0 6px rgba(255, 149, 0, 0.4)',
                },
                '& + .MuiSwitch-track': {
                  backgroundColor: 'rgba(255, 149, 0, 0.15)',
                  opacity: 1,
                  border: '1.5px solid #FF9500',
                },
              },
              '&.Mui-disabled': {
                '& .MuiSwitch-thumb': {
                  backgroundColor: 'transparent',
                  border: '2px solid rgba(255, 149, 0, 0.25)',
                },
                '& + .MuiSwitch-track': {
                  opacity: 0.4,
                },
              },
            },
            '& .MuiSwitch-thumb': {
              boxSizing: 'border-box',
              width: 16,
              height: 16,
              transition: 'all 300ms',
            },
            '& .MuiSwitch-track': {
              borderRadius: 10,
              backgroundColor: 'rgba(255, 149, 0, 0.08)',
              border: '1.5px solid rgba(255, 149, 0, 0.4)',
              opacity: 1,
              transition: 'all 300ms',
            },
          }}
        />
      </Box>
    </Tooltip>
  );
}

