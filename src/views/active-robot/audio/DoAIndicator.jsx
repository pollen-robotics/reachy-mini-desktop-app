import React from 'react';
import { Box, Typography } from '@mui/material';
import { doaToCssRotation } from '../../../hooks/audio/useDoA';

/**
 * Direction of Arrival (DoA) Indicator - Minimal tag with arrow
 * 
 * Shows a compact tag with direction arrow inside.
 * Ghost state when inactive, green when talking.
 */
function DoAIndicator({ angle, isTalking, isAvailable, darkMode }) {
  if (!isAvailable) {
    return null;
  }

  const rotation = doaToCssRotation(angle);
  const isActive = isTalking;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.375,
        px: 0.5,
        py: 0.25,
        borderRadius: '4px',
        bgcolor: isActive
          ? (darkMode ? 'rgba(76, 175, 80, 0.2)' : 'rgba(76, 175, 80, 0.12)')
          : (darkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)'),
        transition: 'all 0.2s ease',
        opacity: isActive ? 1 : 0.6,
      }}
    >
      {/* Direction Arrow - only when talking */}
      {isActive && (
        <Box
          component="span"
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 10,
            height: 10,
            transform: `rotate(${rotation}deg)`,
            transition: 'transform 0.15s ease-out',
            fontSize: 9,
            fontWeight: 700,
            lineHeight: 1,
            color: '#4CAF50',
          }}
        >
          ↑
        </Box>
      )}
      
      <Typography
        sx={{
          fontSize: 8,
          fontWeight: 600,
          color: isActive 
            ? '#4CAF50' 
            : (darkMode ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.3)'),
          textTransform: 'uppercase',
          letterSpacing: '0.3px',
          lineHeight: 1,
          transition: 'color 0.2s ease',
        }}
      >
        {isActive ? 'Talking' : 'Listening'}
      </Typography>
    </Box>
  );
}

export default React.memo(DoAIndicator);

