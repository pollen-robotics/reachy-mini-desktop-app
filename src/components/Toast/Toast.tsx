import React from 'react';
import { Box, Snackbar } from '@mui/material';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

export type ToastSeverity = 'success' | 'error' | 'warning' | 'info';

export interface ToastState {
  open: boolean;
  message: React.ReactNode;
  severity: ToastSeverity;
}

export interface ToastProps {
  toast: ToastState;
  toastProgress: number;
  onClose: () => void;
  darkMode?: boolean;
  zIndex?: number;
}

interface ToastColors {
  background: string;
  border: string;
  text: string;
  progress: string;
}

/**
 * Premium Toast notification component.
 *
 * Features:
 * - Bottom-center positioning
 * - Glassmorphism design (backdrop blur + shadows)
 * - Progress bar animation
 * - Auto-dismiss after 3.5s
 * - Click to dismiss
 * - Dark/light mode support
 * - Success/Error/Info/Warning variants
 */
export default function Toast({
  toast,
  toastProgress,
  onClose,
  darkMode = false,
  zIndex = 100001,
}: ToastProps): React.ReactElement {
  const getIcon = (): React.ReactElement | null => {
    switch (toast.severity) {
      case 'success':
        return <CheckCircleOutlinedIcon sx={{ fontSize: 20, flexShrink: 0, color: 'inherit' }} />;
      case 'error':
        return <ErrorOutlineIcon sx={{ fontSize: 20, flexShrink: 0, color: 'inherit' }} />;
      case 'warning':
        return <WarningAmberIcon sx={{ fontSize: 20, flexShrink: 0, color: 'inherit' }} />;
      case 'info':
        return <InfoOutlinedIcon sx={{ fontSize: 20, flexShrink: 0, color: 'inherit' }} />;
      default:
        return null;
    }
  };

  const getColors = (): ToastColors => {
    switch (toast.severity) {
      case 'success':
        return {
          background: darkMode ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.1)',
          border: darkMode ? 'rgba(34, 197, 94, 0.4)' : 'rgba(34, 197, 94, 0.3)',
          text: darkMode ? '#86efac' : '#16a34a',
          progress: darkMode ? 'rgba(34, 197, 94, 0.8)' : 'rgba(34, 197, 94, 0.7)',
        };
      case 'error':
        return {
          background: darkMode ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)',
          border: darkMode ? 'rgba(239, 68, 68, 0.4)' : 'rgba(239, 68, 68, 0.3)',
          text: darkMode ? '#fca5a5' : '#dc2626',
          progress: darkMode ? 'rgba(239, 68, 68, 0.8)' : 'rgba(239, 68, 68, 0.7)',
        };
      case 'warning':
        return {
          background: darkMode ? 'rgba(251, 191, 36, 0.15)' : 'rgba(251, 191, 36, 0.1)',
          border: darkMode ? 'rgba(251, 191, 36, 0.4)' : 'rgba(251, 191, 36, 0.3)',
          text: darkMode ? '#fde047' : '#ca8a04',
          progress: darkMode ? 'rgba(251, 191, 36, 0.8)' : 'rgba(251, 191, 36, 0.7)',
        };
      case 'info':
        return {
          background: darkMode ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)',
          border: darkMode ? 'rgba(59, 130, 246, 0.4)' : 'rgba(59, 130, 246, 0.3)',
          text: darkMode ? '#93c5fd' : '#2563eb',
          progress: darkMode ? 'rgba(59, 130, 246, 0.8)' : 'rgba(59, 130, 246, 0.7)',
        };
      default:
        return {
          background: darkMode ? 'rgba(156, 163, 175, 0.15)' : 'rgba(156, 163, 175, 0.1)',
          border: darkMode ? 'rgba(156, 163, 175, 0.4)' : 'rgba(156, 163, 175, 0.3)',
          text: darkMode ? '#d1d5db' : '#6b7280',
          progress: darkMode ? 'rgba(156, 163, 175, 0.8)' : 'rgba(156, 163, 175, 0.7)',
        };
    }
  };

  const colors = getColors();

  return (
    <Snackbar
      open={toast.open}
      autoHideDuration={3500}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      sx={{
        bottom: '24px !important',
        left: '50% !important',
        right: 'auto !important',
        transform: 'translateX(-50%) !important',
        display: 'flex !important',
        justifyContent: 'center !important',
        alignItems: 'center !important',
        width: '100%',
        zIndex,
        '& > *': {
          margin: '0 auto !important',
        },
      }}
    >
      <Box
        onClick={onClose}
        sx={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: '12px',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: darkMode
            ? '0 8px 32px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3)'
            : '0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08)',
          zIndex,
          cursor: 'pointer',
        }}
      >
        <Box
          sx={{
            position: 'relative',
            borderRadius: '12px',
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: '-0.01em',
            background: colors.background,
            border: `1px solid ${colors.border}`,
            color: colors.text,
            minWidth: 240,
            maxWidth: 400,
            px: 3,
            py: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1.5,
            overflow: 'hidden',
          }}
        >
          <Box
            sx={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              height: '2px',
              width: `${toastProgress}%`,
              background: colors.progress,
              transition: 'width 0.02s linear',
              borderRadius: '0 0 12px 12px',
            }}
          />

          {getIcon()}

          <Box sx={{ flex: 1, textAlign: 'center' }}>{toast.message}</Box>
        </Box>
      </Box>
    </Snackbar>
  );
}
