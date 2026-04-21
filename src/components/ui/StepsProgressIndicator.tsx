/**
 * StepsProgressIndicator - Generic steps indicator with integrated progress bar
 *
 * Progress bar runs behind the steps. Steps have a border matching
 * the background to create a "floating" effect.
 */

import React from 'react';
import { Box, Typography, keyframes } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';

export interface StepsProgressStep {
  id: string;
  label: string;
}

export interface StepsProgressIndicatorProps {
  steps?: StepsProgressStep[];
  currentStep?: number;
  progress?: number;
  darkMode?: boolean;
}

// Pulse animation for current step
const pulse = keyframes`
  0%, 100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(0.92);
    opacity: 0.8;
  }
`;

// Checkmark pop animation
const popIn = keyframes`
  0% {
    transform: scale(0);
  }
  60% {
    transform: scale(1.15);
  }
  100% {
    transform: scale(1);
  }
`;

function StepsProgressIndicator({
  steps = [],
  currentStep = 0,
  progress: progressOverride,
  darkMode = false,
}: StepsProgressIndicatorProps) {
  // Calculate progress from currentStep if not provided
  const progress =
    progressOverride ?? (steps.length > 1 ? (currentStep / (steps.length - 1)) * 100 : 0);

  // Colors
  const bgColor = darkMode ? '#1a1a1a' : '#fdfcfa';
  const trackColor = darkMode ? '#2a2a2a' : '#e5e5e5';
  const fillColor = darkMode ? '#22c55e' : '#16a34a'; // Green for completed
  const activeColor = darkMode ? '#a3a3a3' : '#737373'; // Neutral grey for current

  // Fixed dimensions
  const barHeight = 2;
  const stepSize = 34;
  const borderWidth = 2.5;
  const barInset = stepSize / 2;

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        height: stepSize + 20,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      {/* Progress bar container */}
      <Box
        sx={{
          position: 'absolute',
          top: (stepSize - barHeight) / 2,
          left: barInset,
          right: barInset,
          height: barHeight,
        }}
      >
        {/* Track (background) */}
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            bgcolor: trackColor,
            borderRadius: barHeight / 2,
          }}
        />

        {/* Fill (progress) */}
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 0,
            width: `${Math.min(100, Math.max(0, progress))}%`,
            bgcolor: fillColor,
            borderRadius: barHeight / 2,
            transition: 'width 0.4s ease-out',
          }}
        />
      </Box>

      {/* Steps container */}
      <Box
        sx={{
          position: 'relative',
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          px: 0,
        }}
      >
        {steps.map((step, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;

          return (
            <Box
              key={step.id}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 0.5,
              }}
            >
              {/* Step indicator - "floating" above the bar */}
              <Box
                sx={{
                  width: stepSize,
                  height: stepSize,
                  borderRadius: '50%',
                  bgcolor: bgColor,
                  border: `${borderWidth}px solid ${bgColor}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  zIndex: 1,
                }}
              >
                {/* Inner circle */}
                <Box
                  sx={{
                    width: stepSize - borderWidth * 2,
                    height: stepSize - borderWidth * 2,
                    borderRadius: '50%',
                    bgcolor: bgColor,
                    border: `2px solid ${isCompleted ? fillColor : isCurrent ? activeColor : trackColor}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.3s ease',
                    animation: isCurrent ? `${pulse} 2s ease-in-out infinite` : 'none',
                  }}
                >
                  {isCompleted ? (
                    <CheckIcon
                      sx={{
                        fontSize: 12,
                        color: fillColor,
                        animation: `${popIn} 0.35s ease-out`,
                      }}
                    />
                  ) : isCurrent ? (
                    <Box
                      sx={{
                        width: 5,
                        height: 5,
                        borderRadius: '50%',
                        bgcolor: activeColor,
                      }}
                    />
                  ) : null}
                </Box>
              </Box>

              {/* Label */}
              <Typography
                sx={{
                  fontSize: 10,
                  fontWeight: isCurrent ? 600 : isCompleted ? 500 : 400,
                  color: isCompleted
                    ? fillColor
                    : isCurrent
                      ? activeColor
                      : darkMode
                        ? '#525252'
                        : '#a3a3a3',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  transition: 'all 0.3s ease',
                  userSelect: 'none',
                }}
              >
                {step.label}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

export default React.memo(StepsProgressIndicator);
