import React, { useState } from 'react';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';

/**
 * Quick Actions iPod-style Component
 * Apple-inspired circular wheel design with central display
 */
export default function QuickActionsDonut({
  actions = [],
  onActionClick = null,
  isReady = false,
  isActive = false,
  isBusy = false,
  darkMode = false,
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  if (!actions || actions.length === 0) return null;

  const handleActionClick = (action, index) => {
    if (!isActive || isBusy || !isReady) return;
    setSelectedIndex(index);
    if (onActionClick) {
      onActionClick(action);
    }
  };

  const handleWheelClick = () => {
    if (currentAction && isActive && !isBusy && isReady) {
      handleActionClick(currentAction, selectedIndex);
    }
  };

  const handleNext = () => {
    if (!isActive || isBusy || !isReady) return;
    setSelectedIndex((prev) => (prev + 1) % actions.length);
  };

  const handlePrevious = () => {
    if (!isActive || isBusy || !isReady) return;
    setSelectedIndex((prev) => (prev - 1 + actions.length) % actions.length);
  };

  const currentAction = actions[selectedIndex];
  const angleStep = (2 * Math.PI) / actions.length;
  const radius = 55; // Distance from center to action indicators
  const centerX = 90;
  const centerY = 90;

  return (
    <Box
      sx={{
        position: 'relative',
        width: 180,
        height: 180,
        mx: 'auto',
        mb: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Outer Wheel Ring - iPod style */}
      <Box
        sx={{
          position: 'absolute',
          width: 180,
          height: 180,
          borderRadius: '50%',
          background: darkMode
            ? 'linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.03) 100%)'
            : 'linear-gradient(135deg, rgba(0, 0, 0, 0.06) 0%, rgba(0, 0, 0, 0.02) 100%)',
          border: darkMode
            ? '1px solid rgba(255, 255, 255, 0.12)'
            : '1px solid rgba(0, 0, 0, 0.1)',
          boxShadow: darkMode
            ? 'inset 0 2px 8px rgba(0, 0, 0, 0.3), 0 2px 12px rgba(0, 0, 0, 0.2)'
            : 'inset 0 2px 8px rgba(0, 0, 0, 0.1), 0 2px 12px rgba(0, 0, 0, 0.08)',
        }}
      />

      {/* Middle Ring */}
      <Box
        sx={{
          position: 'absolute',
          width: 140,
          height: 140,
          borderRadius: '50%',
          background: darkMode
            ? 'linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%)'
            : 'linear-gradient(135deg, rgba(0, 0, 0, 0.04) 0%, rgba(0, 0, 0, 0.01) 100%)',
          border: darkMode
            ? '1px solid rgba(255, 255, 255, 0.08)'
            : '1px solid rgba(0, 0, 0, 0.08)',
        }}
      />

      {/* Central Display - iPod LCD style */}
      <Box
        onClick={handleWheelClick}
        sx={{
          position: 'relative',
          width: 100,
          height: 100,
          borderRadius: '50%',
          background: darkMode
            ? 'linear-gradient(135deg, rgba(0, 0, 0, 0.4) 0%, rgba(0, 0, 0, 0.2) 100%)'
            : 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(250, 250, 250, 0.98) 100%)',
          border: darkMode
            ? '2px solid rgba(255, 255, 255, 0.15)'
            : '2px solid rgba(0, 0, 0, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: isActive && !isBusy && isReady ? 'pointer' : 'not-allowed',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          opacity: isActive && !isBusy && isReady ? 1 : 0.5,
          boxShadow: darkMode
            ? 'inset 0 2px 6px rgba(0, 0, 0, 0.4), 0 4px 12px rgba(0, 0, 0, 0.3)'
            : 'inset 0 2px 6px rgba(0, 0, 0, 0.1), 0 4px 12px rgba(0, 0, 0, 0.1)',
          '&:active': {
            transform: isActive && !isBusy && isReady ? 'scale(0.96)' : 'scale(1)',
            boxShadow: darkMode
              ? 'inset 0 3px 8px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.2)'
              : 'inset 0 3px 8px rgba(0, 0, 0, 0.15), 0 2px 8px rgba(0, 0, 0, 0.08)',
          },
        }}
      >
        {/* Emoji Display */}
        <Typography
          sx={{
            fontSize: 32,
            lineHeight: 1,
            mb: 0.5,
            filter: isActive && !isBusy && isReady ? 'none' : 'grayscale(100%)',
            transition: 'filter 0.2s ease',
          }}
        >
          {currentAction?.emoji || '⚡'}
        </Typography>

        {/* Label */}
        <Typography
          sx={{
            fontSize: 9,
            fontWeight: 600,
            color: darkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            textAlign: 'center',
            fontFamily: 'SF Pro Display, -apple-system, BlinkMacSystemFont, sans-serif',
          }}
        >
          {currentAction?.label || 'Action'}
        </Typography>
      </Box>

      {/* Action Indicators Around Wheel - Subtle dots */}
      {actions.map((action, index) => {
        const angle = index * angleStep - Math.PI / 2; // Start from top
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);
        const isSelected = index === selectedIndex;

        return (
          <Tooltip key={action.name} title={action.label} placement="top" arrow>
            <Box
              onClick={() => handleActionClick(action, index)}
              sx={{
                position: 'absolute',
                left: `${x - 8}px`,
                top: `${y - 8}px`,
                width: 16,
                height: 16,
                borderRadius: '50%',
                bgcolor: isSelected
                  ? (darkMode ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.8)')
                  : (darkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.15)'),
                cursor: isActive && !isBusy && isReady ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                opacity: isActive && !isBusy && isReady ? 1 : 0.3,
                transform: isSelected ? 'scale(1.3)' : 'scale(1)',
                // z-index hierarchy: 1 = base, 10 = selected UI control
                zIndex: isSelected ? 10 : 1,
                border: isSelected
                  ? `2px solid ${darkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.2)'}`
                  : 'none',
                '&:hover': {
                  bgcolor: isSelected
                    ? (darkMode ? 'rgba(255, 255, 255, 1)' : 'rgba(0, 0, 0, 0.9)')
                    : (darkMode ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.25)'),
                  transform: isSelected ? 'scale(1.4)' : 'scale(1.2)',
                },
              }}
            />
          </Tooltip>
        );
      })}

      {/* Navigation Buttons - Top/Bottom for Next/Previous */}
      <IconButton
        onClick={handlePrevious}
        disabled={!isActive || isBusy || !isReady}
        sx={{
          position: 'absolute',
          top: 8,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 24,
          height: 24,
          borderRadius: '50%',
          bgcolor: darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
          border: darkMode ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)',
          color: darkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)',
          opacity: isActive && !isBusy && isReady ? 1 : 0.3,
          transition: 'all 0.2s ease',
          '&:hover': {
            bgcolor: darkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
            transform: 'translateX(-50%) scale(1.1)',
          },
          '&:disabled': {
            opacity: 0.2,
          },
        }}
      >
        <Typography sx={{ fontSize: 12, lineHeight: 1 }}>▲</Typography>
      </IconButton>

      <IconButton
        onClick={handleNext}
        disabled={!isActive || isBusy || !isReady}
        sx={{
          position: 'absolute',
          bottom: 8,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 24,
          height: 24,
          borderRadius: '50%',
          bgcolor: darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
          border: darkMode ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)',
          color: darkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)',
          opacity: isActive && !isBusy && isReady ? 1 : 0.3,
          transition: 'all 0.2s ease',
          '&:hover': {
            bgcolor: darkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
            transform: 'translateX(-50%) scale(1.1)',
          },
          '&:disabled': {
            opacity: 0.2,
          },
        }}
      >
        <Typography sx={{ fontSize: 12, lineHeight: 1 }}>▼</Typography>
      </IconButton>
    </Box>
  );
}
