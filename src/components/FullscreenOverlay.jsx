import React from 'react';
import { createPortal } from 'react-dom';
import { Box, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

/**
 * Generic Fullscreen Overlay Component
 * Reusable overlay for modals, settings, install progress, etc.
 * 
 * Features:
 * - Portal rendering (above everything)
 * - Backdrop blur with customizable opacity
 * - Fade-in animation
 * - Optional close button
 * - Click outside to close
 * - Configurable z-index
 * - Dark mode support
 * 
 * @param {boolean} open - Whether overlay is visible
 * @param {function} onClose - Callback when overlay should close
 * @param {boolean} darkMode - Dark mode theme
 * @param {number} zIndex - z-index value (default: 9999)
 * @param {boolean} showCloseButton - Show close button top-right (default: false - modals handle their own close button)
 * @param {boolean} usePortal - Render in portal (default: true)
 * @param {number} backdropBlur - Backdrop blur intensity in px (default: 20)
 * @param {number} backdropOpacity - Backdrop opacity (0-1, default: 0.92 for dark, 0.95 for light)
 * @param {boolean} centered - Center content vertically/horizontally (default: true)
 * @param {boolean} centeredX - Center content horizontally (default: follows centered)
 * @param {boolean} centeredY - Center content vertically (default: follows centered)
 * @param {function} onBackdropClick - Custom backdrop click handler (default: calls onClose)
 * @param {ReactNode} children - Content to display
 */
export default function FullscreenOverlay({
  open,
  onClose,
  darkMode,
  zIndex = 9999,
  showCloseButton = false,
  usePortal = true,
  backdropBlur = 20,
  backdropOpacity,
  centered = true,
  centeredX,
  centeredY,
  onBackdropClick,
  children,
}) {
  if (!open) return null;

  // Default backdrop opacity based on darkMode if not provided
  const defaultBackdropOpacity = backdropOpacity !== undefined 
    ? backdropOpacity 
    : (darkMode ? 0.92 : 0.95);

  // Determine centering: use explicit props if provided, otherwise use centered
  const isCenteredX = centeredX !== undefined ? centeredX : centered;
  const isCenteredY = centeredY !== undefined ? centeredY : centered;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      if (onBackdropClick) {
        onBackdropClick(e);
      } else {
        onClose();
      }
    }
  };

  // Use MUI default background colors to match the app background
  // Dark mode: #121212 (MUI default), Light mode: #ffffff (MUI default)
  // Convert hex to rgba with opacity
  const overlayBgColor = darkMode 
    ? `rgba(18, 18, 18, ${defaultBackdropOpacity})` // #121212 with opacity
    : `rgba(255, 255, 255, ${defaultBackdropOpacity})`; // #ffffff with opacity

  const overlayContent = (
    <Box
      onClick={handleBackdropClick}
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        bgcolor: overlayBgColor,
        backdropFilter: `blur(${backdropBlur}px)`,
        WebkitBackdropFilter: `blur(${backdropBlur}px)`,
        display: 'flex',
        alignItems: isCenteredY ? 'center' : 'flex-start',
        justifyContent: isCenteredX ? 'center' : 'flex-start',
        zIndex,
        animation: 'fadeIn 0.3s ease',
        '@keyframes fadeIn': {
          from: { opacity: 0 },
          to: { opacity: 1 },
        },
        overflow: 'auto',
      }}
    >
      {/* Content wrapper - prevents click propagation */}
      <Box
        onClick={(e) => e.stopPropagation()}
        sx={{
          width: '100%',
          height: isCenteredY ? 'auto' : '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: isCenteredX ? 'center' : 'stretch',
          justifyContent: isCenteredY ? 'center' : 'flex-start',
        }}
      >
        {children}
      </Box>
    </Box>
  );

  // Render in portal if requested (default: true)
  if (usePortal) {
    return createPortal(overlayContent, document.body);
  }

  return overlayContent;
}

