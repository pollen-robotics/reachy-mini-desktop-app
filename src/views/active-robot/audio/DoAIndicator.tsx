import React from 'react';
import { Box, Typography } from '@mui/material';
import { doaToCssRotation } from '../../../hooks/audio/useDoA';

export interface DoAIndicatorProps {
  angle: number | null;
  isTalking: boolean;
  isAvailable: boolean;
  darkMode?: boolean;
}

/**
 * Direction of Arrival (DoA) Indicator
 *
 * Compact pill showing a directional arrow and "DoA" label.
 * Smooth transitions between idle (ghost) and active (green) states —
 * no conditional renders, no layout shifts.
 */
function DoAIndicator({
  angle,
  isTalking,
  isAvailable,
  darkMode,
}: DoAIndicatorProps): React.ReactElement | null {
  if (!isAvailable) {
    return null;
  }

  const rotation = doaToCssRotation(angle);

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        px: 0.625,
        py: 0.25,
        borderRadius: '6px',
        bgcolor: isTalking
          ? darkMode
            ? 'rgba(76, 175, 80, 0.15)'
            : 'rgba(76, 175, 80, 0.1)'
          : darkMode
            ? 'rgba(255, 255, 255, 0.04)'
            : 'rgba(0, 0, 0, 0.03)',
        border: `1px solid ${
          isTalking
            ? darkMode
              ? 'rgba(76, 175, 80, 0.3)'
              : 'rgba(76, 175, 80, 0.2)'
            : 'transparent'
        }`,
        transition: 'background-color 0.35s ease, border-color 0.35s ease, opacity 0.35s ease',
        opacity: isTalking ? 1 : 0.5,
      }}
    >
      {/* Directional arrow — always rendered, animated via opacity + rotation */}
      <Box
        component="svg"
        viewBox="0 0 10 10"
        sx={{
          width: 9,
          height: 9,
          flexShrink: 0,
          transform: `rotate(${rotation}deg)`,
          transition: 'transform 0.2s ease-out, opacity 0.35s ease',
          opacity: isTalking ? 1 : 0.4,
        }}
      >
        <path
          d="M5 1.5 L5 8.5 M5 1.5 L2.5 4 M5 1.5 L7.5 4"
          fill="none"
          stroke={isTalking ? '#4CAF50' : darkMode ? '#888' : '#999'}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transition: 'stroke 0.35s ease' }}
        />
      </Box>

      {/* Fixed-width container to prevent layout shift when text changes */}
      <Box sx={{ width: 36, overflow: 'hidden', position: 'relative', height: 9 }}>
        <Typography
          sx={{
            fontSize: 8,
            fontWeight: 600,
            color: isTalking
              ? '#4CAF50'
              : darkMode
                ? 'rgba(255, 255, 255, 0.3)'
                : 'rgba(0, 0, 0, 0.25)',
            textTransform: 'uppercase',
            letterSpacing: '0.4px',
            lineHeight: 1,
            transition: 'color 0.35s ease',
            userSelect: 'none',
            whiteSpace: 'nowrap',
            position: 'absolute',
            top: 0,
            left: 0,
          }}
        >
          {isTalking ? 'Talking' : 'Listening'}
        </Typography>
      </Box>
    </Box>
  );
}

export default React.memo(DoAIndicator);
