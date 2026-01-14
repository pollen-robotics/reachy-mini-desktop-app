import React, { useMemo, memo, useRef } from 'react';
import { Box, Typography, Slider } from '@mui/material';
import { telemetry } from '../../../../utils/telemetry';

/**
 * Simple Slider Control - Enhanced with more information
 * @param {boolean} centered - If true, displays title and subtitle on two separate centered lines
 * @param {boolean} showRollVisualization - If true, shows a curved visualization for roll (left to right, curved upward)
 * @param {number} smoothedValue - Optional smoothed/ghost value to display as a visual indicator
 *
 * ⚡ PERF: Wrapped in React.memo to prevent unnecessary re-renders
 */
const SimpleSlider = memo(function SimpleSlider({
  label,
  value,
  onChange,
  min = -1,
  max = 1,
  unit = 'rad',
  darkMode,
  disabled = false,
  centered = false,
  showRollVisualization = false,
  smoothedValue,
}) {
  // 📊 Telemetry - Track slider usage once per session
  const hasTrackedUsageRef = useRef(false);

  const displayValue =
    typeof value === 'number'
      ? value.toFixed(unit === 'deg' ? 1 : 3)
      : unit === 'deg'
        ? '0.0'
        : '0.000';

  // Calculate curve visualization for roll
  const rollVisualization = useMemo(() => {
    if (!showRollVisualization) return null;

    const width = 36;
    const height = 20;
    const border = 5;
    const strokeWidth = border;
    const innerStrokeWidth = border / 1.1;

    // Padding for rounded caps (strokeLinecap="round") to prevent clipping
    const padding = strokeWidth / 2 + 1;

    // Normalize value from [min, max] to [0, 1]
    const normalized = (value - min) / (max - min);

    // Fixed curve (bulged upward, more arched)
    // Inverted: start from right, end at left (like yaw reverse)
    // Coordinates adjusted for padding in viewBox
    const startX = width - padding;
    const startY = height - padding;
    const endX = padding;
    const endY = height - padding;
    const controlX = width / 2;
    const controlY = padding + (height - padding * 2) * 0.2; // More arched (20% from top of visible area)

    // Calculate approximate curve length for dash array
    // Using a simple approximation for quadratic bezier curve length
    const dx = endX - startX;
    const dy = endY - startY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const controlDist =
      Math.sqrt((controlX - startX) ** 2 + (controlY - startY) ** 2) +
      Math.sqrt((endX - controlX) ** 2 + (endY - controlY) ** 2);
    const approximateLength = (dist + controlDist) / 2;

    // Calculate dash offset for progress (inverted like yaw: 0 = empty, length = fully filled)
    const strokeDashoffset = approximateLength * normalized;

    return {
      width,
      height,
      padding,
      strokeWidth,
      innerStrokeWidth,
      startX,
      startY,
      endX,
      endY,
      controlX,
      controlY,
      approximateLength,
      strokeDashoffset,
      normalized,
    };
  }, [value, min, max, showRollVisualization]);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 0.5,
        p: 0.75,
        borderRadius: '0px',
        bgcolor: 'transparent',
        border: 'none',
        width: '100%',
        opacity: disabled ? 0.5 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
      }}
    >
      {centered ? (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 0.25,
            mb: 0.5,
          }}
        >
          <Typography
            sx={{
              fontSize: 10,
              fontWeight: 700,
              color: darkMode ? '#f5f5f5' : '#333',
              letterSpacing: '-0.2px',
            }}
          >
            {label}
          </Typography>
          <Typography
            sx={{
              fontSize: 9,
              fontFamily: 'monospace',
              fontWeight: 500,
              color: darkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)',
              letterSpacing: '0.02em',
            }}
          >
            {displayValue}
            {unit === 'deg' ? '°' : ` ${unit}`}
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <Typography
            sx={{
              fontSize: 10,
              fontWeight: 700,
              color: darkMode ? '#f5f5f5' : '#333',
              letterSpacing: '-0.2px',
            }}
          >
            {label}
          </Typography>
          <Typography
            sx={{
              fontSize: 9,
              fontFamily: 'monospace',
              fontWeight: 500,
              color: darkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)',
              letterSpacing: '0.02em',
            }}
          >
            {displayValue}
            {unit === 'deg' ? '°' : ` ${unit}`}
          </Typography>
        </Box>
      )}

      {/* Container with roll visualization and horizontal slider */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 1.5,
          width: '100%',
          minHeight: showRollVisualization ? 20 : 'auto',
        }}
      >
        {showRollVisualization && rollVisualization && (
          <Box
            sx={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              height: rollVisualization.height,
            }}
          >
            <svg
              viewBox={`-${rollVisualization.padding} -${rollVisualization.padding} ${rollVisualization.width + rollVisualization.padding * 2} ${rollVisualization.height + rollVisualization.padding * 2}`}
              style={{
                width: rollVisualization.width,
                height: rollVisualization.height,
                pointerEvents: 'none',
              }}
            >
              <defs>
                <filter
                  id={`dropshadow-roll-${label}`}
                  filterUnits="userSpaceOnUse"
                  colorInterpolationFilters="sRGB"
                >
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

              {/* Background curve (shadow) - always visible */}
              <path
                d={`M ${rollVisualization.startX} ${rollVisualization.startY} Q ${rollVisualization.controlX} ${rollVisualization.controlY} ${rollVisualization.endX} ${rollVisualization.endY}`}
                fill="none"
                stroke={darkMode ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)'}
                strokeWidth={rollVisualization.strokeWidth}
                strokeLinecap="round"
                style={{
                  filter: `url(#dropshadow-roll-${label})`,
                }}
              />

              {/* Background curve (main) - always visible */}
              <path
                d={`M ${rollVisualization.startX} ${rollVisualization.startY} Q ${rollVisualization.controlX} ${rollVisualization.controlY} ${rollVisualization.endX} ${rollVisualization.endY}`}
                fill="none"
                stroke={darkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)'}
                strokeWidth={rollVisualization.strokeWidth}
                strokeLinecap="round"
              />

              {/* Border arc - always visible, slightly larger (like CircularSlider) */}
              <path
                d={`M ${rollVisualization.startX} ${rollVisualization.startY - rollVisualization.strokeWidth / 2 - 0.5} Q ${rollVisualization.controlX} ${rollVisualization.controlY - rollVisualization.strokeWidth / 2 - 0.5} ${rollVisualization.endX} ${rollVisualization.endY - rollVisualization.strokeWidth / 2 - 0.5}`}
                fill="none"
                stroke={darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'}
                strokeWidth={1}
                strokeLinecap="round"
              />

              {/* Active progress curve (filled portion) */}
              <path
                d={`M ${rollVisualization.startX} ${rollVisualization.startY} Q ${rollVisualization.controlX} ${rollVisualization.controlY} ${rollVisualization.endX} ${rollVisualization.endY}`}
                fill="none"
                stroke={darkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)'}
                strokeWidth={rollVisualization.innerStrokeWidth}
                strokeLinecap="round"
                strokeDasharray={rollVisualization.approximateLength}
                strokeDashoffset={rollVisualization.strokeDashoffset}
              />
            </svg>
          </Box>
        )}

        {/* Horizontal slider with ghost indicator */}
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}
        >
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
            value={value}
            onChange={(e, newValue) => {
              // 📊 Telemetry - Track slider usage (once per session)
              if (!hasTrackedUsageRef.current) {
                telemetry.controllerUsed({ control: 'slider' });
                hasTrackedUsageRef.current = true;
              }
              onChange(newValue, true);
            }}
            onChangeCommitted={(e, newValue) => onChange(newValue, false)}
            min={min}
            max={max}
            step={0.01}
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
              },
              '& .MuiSlider-track': {
                height: 3,
              },
              '& .MuiSlider-rail': {
                height: 3,
                opacity: darkMode ? 0.2 : 0.3,
              },
            }}
          />
        </Box>
      </Box>
    </Box>
  );
});

export default SimpleSlider;
