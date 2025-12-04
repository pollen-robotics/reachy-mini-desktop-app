import React, { useMemo } from 'react';
import { Box, Typography, Slider } from '@mui/material';

/**
 * Circular Slider Component - Hybrid version
 * Small circular visualization + horizontal slider for interaction
 * 
 * The circular arc represents 270° of a full circle (3/4 circle)
 * - Normal mode: cut at bottom (135deg rotation)
 * - Inverted mode: cut at top (-45deg rotation)
 */
export default function CircularSlider({ 
  label, 
  value, 
  onChange, 
  min = -Math.PI, 
  max = Math.PI, 
  unit = 'rad',
  darkMode, 
  disabled = false,
  inverted = false, // If true, circle cut at top instead of bottom
  reverse = false, // If true, arc starts from the opposite side (reversed direction)
  alignRight = false, // If true, align content to the right and reverse order
  smoothedValue // Optional smoothed/ghost value to display as a visual indicator
}) {
  // Constants for circular arc calculation
  const ARC_START = 0.01;      // Start of visible arc (1% of circle)
  const ARC_END = 0.74;        // End of visible arc (74% of circle)
  const ARC_SPAN = ARC_END - ARC_START; // 0.73 (73% of circle = 270°)
  const ARC_DEGREES = 270;     // Arc spans 270 degrees (3/4 of circle)
  
  // SVG dimensions
  const radius = 18;
  const border = 5;
  const circleRadius = radius - border / 2;
  const circumference = 2 * Math.PI * circleRadius;
  const strokeWidth = border;
  const innerStrokeWidth = border / 1.1;
  
  // Convert value to internal range [ARC_START, ARC_END] for circular progress
  const convertToInternalRange = (val) => {
    const normalized = (val - min) / (max - min);
    return ARC_START + normalized * ARC_SPAN;
  };
  
  // Memoize calculations to avoid recalculation on every render
  const svgCalculations = useMemo(() => {
    const internalValue = convertToInternalRange(value);
    
    // If reverse, invert the internal value so arc starts from opposite side
    const effectiveInternalValue = reverse 
      ? ARC_END - (internalValue - ARC_START) 
      : internalValue;
    
    const strokeDashoffset = circumference * (1 - effectiveInternalValue);
    const totalStrokeDashoffset = circumference * (1 - ARC_END);
    
    // Calculate rotation: inverted = cut at top, normal = cut at bottom
    const svgRotation = inverted ? -45 : 135;
    
    // Calculate progress angle: map internal value [0.01, 0.74] to [0°, 270°]
    // If reverse, start from the end and go backwards
    const progressAngle = reverse
      ? ARC_DEGREES - ((internalValue - ARC_START) / ARC_SPAN * ARC_DEGREES)
      : (internalValue - ARC_START) / ARC_SPAN * ARC_DEGREES;
    
    // Calculate ghost position if smoothedValue is provided
    let ghostInternalValue = null;
    let ghostProgressAngle = null;
    if (smoothedValue !== undefined && smoothedValue !== null) {
      ghostInternalValue = convertToInternalRange(smoothedValue);
      const effectiveGhostInternalValue = reverse 
        ? ARC_END - (ghostInternalValue - ARC_START) 
        : ghostInternalValue;
      ghostProgressAngle = reverse
        ? ARC_DEGREES - ((ghostInternalValue - ARC_START) / ARC_SPAN * ARC_DEGREES)
        : (ghostInternalValue - ARC_START) / ARC_SPAN * ARC_DEGREES;
    }
    
    return {
      internalValue,
      effectiveInternalValue,
      strokeDashoffset,
      totalStrokeDashoffset,
      svgRotation,
      progressAngle,
      ghostProgressAngle,
    };
  }, [value, min, max, inverted, reverse, circumference, smoothedValue]);
  
  const displayValue = typeof value === 'number' 
    ? value.toFixed(unit === 'deg' ? 1 : 3) 
    : (unit === 'deg' ? '0.0' : '0.000');
  
  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: alignRight ? 'stretch' : 'center', 
      gap: 0.5,
      p: 0.75,
      borderRadius: '0px',
      bgcolor: 'transparent',
      border: 'none',
      opacity: disabled ? 0.5 : 1,
      pointerEvents: disabled ? 'none' : 'auto',
      width: '100%',
      boxSizing: 'border-box',
    }}>
      <Box sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: 1, 
        width: alignRight ? 'auto' : '100%',
        mb: 0.5,
        justifyContent: alignRight ? 'flex-end' : 'flex-start',
        flexDirection: alignRight ? 'row-reverse' : 'row',
        boxSizing: 'border-box',
        ml: alignRight ? 'auto' : 0,
      }}>
        {alignRight ? (
          <>
            <Typography sx={{ 
              fontSize: 9, 
              fontFamily: 'monospace', 
              fontWeight: 500, 
              color: darkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)',
              letterSpacing: '0.02em',
              textAlign: 'right',
            }}>
              {displayValue}{unit === 'deg' ? '°' : ` ${unit}`}
            </Typography>
            <Typography sx={{ 
              fontSize: 10, 
              fontWeight: 700, 
              color: darkMode ? '#f5f5f5' : '#333', 
              letterSpacing: '-0.2px',
              textAlign: 'right',
            }}>
              {label}
            </Typography>
          </>
        ) : (
          <>
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
          </>
        )}
      </Box>
      
      {/* Container with circular display and horizontal slider - single line, compact */}
      <Box sx={{ 
        display: 'flex', 
        flexDirection: alignRight ? 'row-reverse' : 'row', 
        alignItems: 'center', 
        gap: 1.5,
        width: '100%',
      }}>
        {/* Small circular visualization */}
        <Box sx={{ 
          position: 'relative', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <svg
            viewBox={`0 0 ${radius * 2} ${radius * 2}`}
            style={{ 
              transform: `rotate(${svgCalculations.svgRotation}deg)`,
              width: radius * 2,
              height: radius * 2,
              pointerEvents: 'none',
            }}
          >
            <defs>
              <filter id={`dropshadow-${label}`} filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                <feComponentTransfer in="SourceAlpha">
                  <feFuncR type="discrete" tableValues="0.3" />
                  <feFuncG type="discrete" tableValues="0.3" />
                  <feFuncB type="discrete" tableValues="0.3" />
                </feComponentTransfer>
                <feGaussianBlur stdDeviation="1.5" />
                <feOffset dx="1.5" dy="1" result="shadow" />
                <feComposite in="SourceGraphic" in2="shadow" operator="over" />
              </filter>
            </defs>
            
            {/* Background circle (shadow) */}
            <circle
              stroke={darkMode ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)'}
              strokeLinecap="round"
              fill="none"
              strokeWidth={strokeWidth}
              strokeDashoffset={svgCalculations.totalStrokeDashoffset}
              strokeDasharray={circumference}
              style={{
                filter: `url(#dropshadow-${label})`
              }}
              r={circleRadius}
              cx={radius}
              cy={radius}
            />
            
            {/* Background circle (main) with border */}
            <circle
              stroke={darkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)'}
              strokeLinecap="round"
              fill="none"
              strokeWidth={strokeWidth}
              strokeDashoffset={svgCalculations.totalStrokeDashoffset}
              strokeDasharray={circumference}
              r={circleRadius}
              cx={radius}
              cy={radius}
            />
            
            {/* Border arc - follows the visible arc shape */}
            <circle
              stroke={darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'}
              strokeLinecap="round"
              fill="none"
              strokeWidth={1}
              strokeDashoffset={svgCalculations.totalStrokeDashoffset}
              strokeDasharray={circumference}
              r={circleRadius + strokeWidth / 2 + 0.5}
              cx={radius}
              cy={radius}
            />
            
            {/* Active progress circle - gray instead of primary, more contrasted */}
            <circle
              stroke={darkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)'}
              strokeLinecap="round"
              fill="none"
              strokeWidth={innerStrokeWidth}
              strokeDashoffset={svgCalculations.strokeDashoffset}
              strokeDasharray={circumference}
              r={circleRadius}
              cx={radius}
              cy={radius}
            />
          </svg>
        </Box>
        
        {/* Horizontal slider for interaction with ghost indicator */}
        <Box sx={{ 
          flex: 1,
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          position: 'relative',
        }}>
          {/* Ghost indicator - shows smoothed target value (same style as Joystick2D ghost) */}
          {smoothedValue !== undefined && smoothedValue !== null && (
            <Box
              sx={{
                position: 'absolute',
                left: `${((smoothedValue - min) / (max - min)) * 100}%`,
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: 12, // Same size as MUI slider thumb
                height: 12, // Same size as MUI slider thumb
                borderRadius: '50%',
                bgcolor: 'rgba(255, 149, 0, 0.2)', // Same as Joystick2D ghost fill
                border: '1.5px solid rgba(255, 149, 0, 0.5)', // Same as Joystick2D ghost stroke
                zIndex: 1,
                pointerEvents: 'none',
                transition: 'left 0.05s linear',
              }}
            />
          )}
          <Slider 
            orientation="horizontal"
            value={value} 
            onChange={(e, newValue) => onChange(newValue, true)}
            onChangeCommitted={(e, newValue) => onChange(newValue, false)}
            min={min} 
            max={max} 
            step={0.1}
            disabled={disabled}
            sx={{ 
              color: '#FF9500', 
              height: 3,
              position: 'relative',
              zIndex: 2,
              '& .MuiSlider-thumb': {
                width: 12,
                height: 12,
                boxShadow: '0 2px 6px rgba(255, 149, 0, 0.4)',
                '&:hover': {
                  boxShadow: '0 4px 12px rgba(255, 149, 0, 0.6)',
                  width: 14,
                  height: 14,
                },
                '&:active': {
                  boxShadow: '0 4px 12px rgba(255, 149, 0, 0.8)',
                }
              },
              '& .MuiSlider-track': {
                height: 3,
                border: 'none',
              },
              '& .MuiSlider-rail': {
                height: 3,
                opacity: darkMode ? 0.2 : 0.3,
              }
            }} 
          />
        </Box>
      </Box>
    </Box>
  );
}

