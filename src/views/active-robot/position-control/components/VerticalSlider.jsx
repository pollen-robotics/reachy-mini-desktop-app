import React from 'react';
import { Box, Typography, Slider } from '@mui/material';

/**
 * Vertical Slider Control - For height/position Z
 * @param {boolean} centered - If true, displays title and subtitle on two separate centered lines
 * @param {number} smoothedValue - Optional smoothed/ghost value to display as a visual indicator
 */
export default function VerticalSlider({ label, value, onChange, min = -1, max = 1, unit = 'm', darkMode, disabled = false, centered = false, smoothedValue }) {
  const displayValue = typeof value === 'number' ? value.toFixed(unit === 'deg' ? 1 : 3) : (unit === 'deg' ? '0.0' : '0.000');
  
  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column',
      alignItems: 'center',
      gap: 0.5,
      px: 0.75,
      borderRadius: '0px',
      bgcolor: 'transparent',
      border: 'none',
      opacity: disabled ? 0.5 : 1,
      pointerEvents: disabled ? 'none' : 'auto',
    }}>
      {centered ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.25, mb: 0.5 }}>
          <Typography sx={{ fontSize: 10, fontWeight: 700, color: darkMode ? '#f5f5f5' : '#333', letterSpacing: '-0.2px' }}>
            {label}
          </Typography>
          <Typography sx={{ 
            fontSize: 9, 
            fontFamily: 'monospace', 
            fontWeight: 500, 
            color: darkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)',
            letterSpacing: '0.02em',
          }}>
            {displayValue}{unit === 'deg' ? '°' : ` ${unit}`}
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%', mb: 0.5 }}>
          <Typography sx={{ fontSize: 10, fontWeight: 700, color: darkMode ? '#f5f5f5' : '#333', letterSpacing: '-0.2px' }}>
            {label}
          </Typography>
          <Typography sx={{ 
            fontSize: 9, 
            fontFamily: 'monospace', 
            fontWeight: 500, 
            color: darkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)',
            letterSpacing: '0.02em',
          }}>
            {displayValue}{unit === 'deg' ? '°' : ` ${unit}`}
          </Typography>
        </Box>
      )}
      
      <Box sx={{ 
        display: 'flex', 
        flexDirection: 'row', 
        alignItems: 'center', 
        height: 135, // Match joystick SVG height
        width: '100%',
        position: 'relative',
      }}>
        {/* Vertical Slider with ghost indicator */}
        <Box sx={{ 
          flex: 1, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          height: '100%',
          py: 0,
          px: 0.5,
          position: 'relative',
        }}>
          {/* Ghost indicator - shows smoothed target value (same style as Joystick2D ghost) */}
          {smoothedValue !== undefined && smoothedValue !== null && (
            <Box
              sx={{
                position: 'absolute',
                top: `${100 - ((smoothedValue - min) / (max - min)) * 100}%`, // Inverted for vertical (top = max)
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 12, // Same size as MUI slider thumb
                height: 12, // Same size as MUI slider thumb
                borderRadius: '50%',
                bgcolor: 'rgba(255, 149, 0, 0.2)', // Same as Joystick2D ghost fill
                border: '1.5px solid rgba(255, 149, 0, 0.5)', // Same as Joystick2D ghost stroke
                zIndex: 1,
                pointerEvents: 'none',
                transition: 'top 0.05s linear',
              }}
            />
          )}
          <Slider 
            orientation="vertical"
            value={value} 
            onChange={(e, newValue) => onChange(newValue, true)}
            onChangeCommitted={(e, newValue) => onChange(newValue, false)}
            min={min} 
            max={max} 
            step={0.001}
            disabled={disabled}
            sx={{ 
              color: '#FF9500', 
              width: 4,
              height: '100%',
              position: 'relative',
              zIndex: 2,
              '& .MuiSlider-thumb': {
                width: 12,
                height: 12,
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                '&:hover': {
                  boxShadow: '0 2px 8px rgba(255, 149, 0, 0.4)',
                  width: 14,
                  height: 14,
                },
                '&:active': {
                  boxShadow: '0 2px 8px rgba(255, 149, 0, 0.6)',
                },
                '&::before': {
                  boxShadow: 'none',
                }
              },
              '& .MuiSlider-track': {
                width: 4,
                border: 'none',
              },
              '& .MuiSlider-rail': {
                width: 4,
                opacity: darkMode ? 0.2 : 0.3,
              }
            }} 
          />
        </Box>
      </Box>
      
    </Box>
  );
}

