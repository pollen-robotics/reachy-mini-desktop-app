import React, { type ReactNode } from 'react';
import { Button, type ButtonProps } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';

/**
 * `PulseButton` - Reusable button with orange halo pulse animation.
 *
 * Used across the app for primary CTAs:
 * - "Start" button (FindingRobotView)
 * - "Discover Apps" button
 * - "Controller" / "Expressions" buttons
 * - "Wake Up" button
 * - Permissions request button
 */

export type PulseButtonSize = 'small' | 'medium' | 'large';

export interface PulseButtonProps extends Omit<ButtonProps, 'size'> {
  children: ReactNode;
  pulse?: boolean;
  darkMode?: boolean;
  size?: PulseButtonSize;
}

const sizeStyles: Record<PulseButtonSize, Record<string, number | string>> = {
  small: { px: 2, py: 0.75, fontSize: 12, borderRadius: '8px' },
  medium: { px: 3, py: 1.25, fontSize: 14, borderRadius: '12px' },
  large: { px: 4, py: 1.5, fontSize: 16, borderRadius: '14px' },
};

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
  sx,
  ...props
}: PulseButtonProps): React.ReactElement {
  const currentSize = sizeStyles[size] ?? sizeStyles.medium;

  const sxArray: SxProps<Theme> = [
    {
      ...currentSize,
      border: '1px solid #FF9500',
      color: '#FF9500',
      bgcolor: 'transparent',
      fontWeight: 600,
      textTransform: 'none',
      transition: 'all 0.2s ease',
      animation: disabled || !pulse ? 'none' : 'pulseHalo 3s ease-in-out infinite',
      '@keyframes pulseHalo': {
        '0%, 100%': {
          boxShadow: darkMode ? '0 0 0 0 rgba(255, 149, 0, 0.4)' : '0 0 0 0 rgba(255, 149, 0, 0.3)',
        },
        '50%': {
          boxShadow: darkMode ? '0 0 0 8px rgba(255, 149, 0, 0)' : '0 0 0 8px rgba(255, 149, 0, 0)',
        },
      },
      '&:hover': {
        bgcolor: 'rgba(255, 149, 0, 0.1)',
        border: '1px solid #FF9500',
        boxShadow: darkMode
          ? '0 6px 16px rgba(255, 149, 0, 0.2)'
          : '0 6px 16px rgba(255, 149, 0, 0.15)',
        animation: 'none',
      },
      '&:disabled': {
        border: `1px solid ${darkMode ? 'rgba(255, 149, 0, 0.3)' : 'rgba(255, 149, 0, 0.4)'}`,
        color: darkMode ? 'rgba(255, 149, 0, 0.3)' : 'rgba(255, 149, 0, 0.4)',
        animation: 'none',
      },
    },
    ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
  ];

  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      startIcon={startIcon}
      endIcon={endIcon}
      fullWidth={fullWidth}
      sx={sxArray}
      {...props}
    >
      {children}
    </Button>
  );
}
