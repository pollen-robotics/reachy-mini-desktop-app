import React, { useMemo, memo, useRef } from 'react';
import { Box, Typography, Slider } from '@mui/material';
import { telemetry } from '../../../../utils/telemetry';

interface SimpleSliderProps {
  label: string;
  value: number;
  onChange: (value: number, isDragging: boolean) => void;
  min?: number;
  max?: number;
  unit?: string;
  darkMode: boolean;
  disabled?: boolean;
  centered?: boolean;
  showRollVisualization?: boolean;
  smoothedValue?: number | null;
}

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
}: SimpleSliderProps): React.ReactElement {
  const hasTrackedUsageRef = useRef<boolean>(false);

  const displayValue =
    typeof value === 'number'
      ? value.toFixed(unit === 'deg' ? 1 : 3)
      : unit === 'deg'
        ? '0.0'
        : '0.000';

  const rollVisualization = useMemo(() => {
    if (!showRollVisualization) return null;

    const width = 36;
    const height = 20;
    const border = 5;
    const strokeWidth = border;
    const innerStrokeWidth = border / 1.1;

    const padding = strokeWidth / 2 + 1;

    const normalized = (value - min) / (max - min);

    const startX = width - padding;
    const startY = height - padding;
    const endX = padding;
    const endY = height - padding;
    const controlX = width / 2;
    const controlY = padding + (height - padding * 2) * 0.2;

    const dx = endX - startX;
    const dy = endY - startY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const controlDist =
      Math.sqrt((controlX - startX) ** 2 + (controlY - startY) ** 2) +
      Math.sqrt((endX - controlX) ** 2 + (endY - controlY) ** 2);
    const approximateLength = (dist + controlDist) / 2;

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

              <path
                d={`M ${rollVisualization.startX} ${rollVisualization.startY} Q ${rollVisualization.controlX} ${rollVisualization.controlY} ${rollVisualization.endX} ${rollVisualization.endY}`}
                fill="none"
                stroke={darkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)'}
                strokeWidth={rollVisualization.strokeWidth}
                strokeLinecap="round"
              />

              <path
                d={`M ${rollVisualization.startX} ${rollVisualization.startY - rollVisualization.strokeWidth / 2 - 0.5} Q ${rollVisualization.controlX} ${rollVisualization.controlY - rollVisualization.strokeWidth / 2 - 0.5} ${rollVisualization.endX} ${rollVisualization.endY - rollVisualization.strokeWidth / 2 - 0.5}`}
                fill="none"
                stroke={darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'}
                strokeWidth={1}
                strokeLinecap="round"
              />

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

        <Box
          sx={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}
        >
          {smoothedValue !== undefined && smoothedValue !== null && (
            <Box
              sx={{
                position: 'absolute',
                left: `${((smoothedValue - min) / (max - min)) * 100}%`,
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: 12,
                height: 12,
                borderRadius: '50%',
                bgcolor: 'rgba(255, 149, 0, 0.2)',
                border: '1.5px solid rgba(255, 149, 0, 0.5)',
                zIndex: 1,
                pointerEvents: 'none',
                transition: 'left 0.05s linear',
              }}
            />
          )}
          <Slider
            value={value}
            onChange={(_e, newValue) => {
              if (!hasTrackedUsageRef.current) {
                telemetry.controllerUsed({ control: 'slider' });
                hasTrackedUsageRef.current = true;
              }
              onChange(newValue as number, true);
            }}
            onChangeCommitted={(_e, newValue) => onChange(newValue as number, false)}
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
