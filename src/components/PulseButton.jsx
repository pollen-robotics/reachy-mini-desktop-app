import React from 'react';
import { Button } from '@mui/material';

/**
 * PulseButton - Reusable button with orange halo pulse animation
 * 
 * Used across the app for primary CTAs:
 * - "Start" button (FindingRobotView)
 * - "Discover Apps" button
 * - "Controller" / "Expressions" buttons
 * - "Wake Up" button
 * - Permissions request button
 * 
 * @param {ReactNode} children - Button text/content
 * @param {function} onClick - Click handler
 * @param {boolean} disabled - Disable button and animation
 * @param {boolean} pulse - Enable/disable pulse animation (default: true)
 * @param {ReactNode} startIcon - Optional icon before text
 * @param {ReactNode} endIcon - Optional icon after text
 * @param {boolean} fullWidth - Full width button
 * @param {boolean} darkMode - Dark mode styling
 * @param {string} size - 'small' | 'medium' | 'large' (default: medium)
 * @param {object} sx - Additional MUI sx styles to merge
 */
export default function PulseButton({
  children,
  onClick,
  disabled = false,
  pulse = true,
  startIcon,
  endIcon,
  fullWidth = false,
  darkMode = false,
  size = 'medium',
  sx = {},
  ...props
}) {
  // Size variants
  const sizeStyles = {
    small: { px: 2, py: 0.75, fontSize: 12, borderRadius: '8px' },
    medium: { px: 3, py: 1.25, fontSize: 14, borderRadius: '12px' },
    large: { px: 4, py: 1.5, fontSize: 16, borderRadius: '14px' },
  };

  const currentSize = sizeStyles[size] || sizeStyles.medium;

  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      startIcon={startIcon}
      endIcon={endIcon}
      fullWidth={fullWidth}
      sx={{
        ...currentSize,
        border: '1px solid #FF9500',
        color: '#FF9500',
        bgcolor: 'transparent',
        fontWeight: 600,
        textTransform: 'none',
        transition: 'all 0.2s ease',
        // Pulse animation
        animation: (disabled || !pulse) ? 'none' : 'pulseHalo 3s ease-in-out infinite',
        '@keyframes pulseHalo': {
          '0%, 100%': {
            boxShadow: darkMode
              ? '0 0 0 0 rgba(255, 149, 0, 0.4)'
              : '0 0 0 0 rgba(255, 149, 0, 0.3)',
          },
          '50%': {
            boxShadow: darkMode
              ? '0 0 0 8px rgba(255, 149, 0, 0)'
              : '0 0 0 8px rgba(255, 149, 0, 0)',
          },
        },
        '&:hover': {
          bgcolor: 'rgba(255, 149, 0, 0.1)',
          border: '1px solid #FF9500',
          boxShadow: darkMode
            ? '0 6px 16px rgba(255, 149, 0, 0.2)'
            : '0 6px 16px rgba(255, 149, 0, 0.15)',
          animation: 'none', // Stop pulse on hover
        },
        '&:disabled': {
          border: `1px solid ${darkMode ? 'rgba(255, 149, 0, 0.3)' : 'rgba(255, 149, 0, 0.4)'}`,
          color: darkMode ? 'rgba(255, 149, 0, 0.3)' : 'rgba(255, 149, 0, 0.4)',
          animation: 'none',
        },
        // Merge custom styles
        ...sx,
      }}
      {...props}
    >
      {children}
    </Button>
  );
}

