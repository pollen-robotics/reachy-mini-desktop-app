import React, { useRef, useEffect } from 'react';
import { Box, IconButton, Modal } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

/**
 * Generic Fullscreen Overlay Component
 * Uses MUI Modal for proper stacking management
 * 
 * Features:
 * - MUI Modal for native stacking management
 * - Backdrop blur with customizable opacity
 * - Fade-in animation only on first open (no re-animation on stack changes)
 * - Optional close button
 * - Click outside to close
 * - Configurable z-index
 * - Dark mode support
 * 
 * @param {boolean} open - Whether overlay is visible
 * @param {function} onClose - Callback when overlay should close
 * @param {boolean} darkMode - Dark mode theme
 * @param {number} zIndex - z-index value (default: 9999)
 * @param {boolean} showCloseButton - Show close button top-right (default: false)
 * @param {number} backdropBlur - Backdrop blur intensity in px (default: 20)
 * @param {number} backdropOpacity - Backdrop opacity (0-1, default: 0.92 for dark, 0.95 for light)
 * @param {boolean} centered - Center content vertically/horizontally (default: true)
 * @param {boolean} centeredX - Center content horizontally (default: follows centered)
 * @param {boolean} centeredY - Center content vertically (default: follows centered)
 * @param {function} onBackdropClick - Custom backdrop click handler (default: calls onClose)
 * @param {boolean} hidden - If true, overlay stays mounted but invisible (for modal stacking)
 * @param {boolean} keepMounted - Keep content mounted when closed (default: false)
 * @param {ReactNode} children - Content to display
 */
export default function FullscreenOverlay({
  open,
  onClose,
  darkMode,
  zIndex = 9999,
  showCloseButton = false,
  backdropBlur = 20,
  backdropOpacity,
  centered = true,
  centeredX,
  centeredY,
  onBackdropClick,
  hidden = false,
  keepMounted = false,
  children,
}) {
  // Track if we've already animated this modal (don't re-animate when coming back from hidden)
  const hasAnimatedRef = useRef(false);
  
  // Mark as animated on first visible render
  useEffect(() => {
    if (open && !hidden && !hasAnimatedRef.current) {
      hasAnimatedRef.current = true;
    }
  }, [open, hidden]);
  
  // Only animate on first open, not when coming back from hidden state
  const shouldAnimate = open && !hidden && !hasAnimatedRef.current;
  // Default backdrop opacity based on darkMode if not provided
  const defaultBackdropOpacity = backdropOpacity !== undefined 
    ? backdropOpacity 
    : (darkMode ? 0.92 : 0.95);

  // Determine centering: use explicit props if provided, otherwise use centered
  const isCenteredX = centeredX !== undefined ? centeredX : centered;
  const isCenteredY = centeredY !== undefined ? centeredY : centered;

  const handleBackdropClick = (e) => {
      if (onBackdropClick) {
        onBackdropClick(e);
      } else {
        onClose();
    }
  };

  // Use MUI default background colors to match the app background
  const overlayBgColor = darkMode 
    ? `rgba(18, 18, 18, ${defaultBackdropOpacity})`
    : `rgba(255, 255, 255, ${defaultBackdropOpacity})`;

  // Custom scrollbar styles
  const scrollbarStyles = {
    '&::-webkit-scrollbar': {
      width: 8,
    },
    '&::-webkit-scrollbar-track': {
      background: 'transparent',
    },
    '&::-webkit-scrollbar-thumb': {
      background: darkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
      borderRadius: 4,
      '&:hover': {
        background: darkMode ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.25)',
      },
    },
  };

  return (
    <Modal
      open={open}
      onClose={handleBackdropClick}
      keepMounted={keepMounted}
      hideBackdrop // We render our own backdrop for blur support
      sx={{
        zIndex,
        // Hidden state: keep mounted but invisible (for modal stacking)
        ...(hidden && {
          visibility: 'hidden',
          pointerEvents: 'none',
        }),
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          outline: 'none',
          bgcolor: overlayBgColor,
          backdropFilter: `blur(${backdropBlur}px)`,
          WebkitBackdropFilter: `blur(${backdropBlur}px)`,
          display: 'flex',
          alignItems: isCenteredY ? 'center' : 'flex-start',
          justifyContent: isCenteredX ? 'center' : 'flex-start',
          overflow: 'auto',
          // Only animate on first open, not when returning from hidden
          ...(shouldAnimate && {
            animation: 'overlayFadeIn 0.3s ease forwards',
            '@keyframes overlayFadeIn': {
              from: { opacity: 0 },
              to: { opacity: 1 },
            },
          }),
          ...scrollbarStyles,
        }}
      >
        {/* Close button - top right (orange style) */}
        {showCloseButton && (
          <IconButton
            onClick={onClose}
            sx={{
              position: 'absolute',
              top: 16,
              right: 16,
              color: '#FF9500',
              bgcolor: darkMode ? 'rgba(255, 255, 255, 0.08)' : '#ffffff',
              border: '1px solid #FF9500',
              opacity: 0.7,
              '&:hover': {
                opacity: 1,
                bgcolor: darkMode ? 'rgba(255, 255, 255, 0.12)' : '#ffffff',
              },
              zIndex: 1,
            }}
          >
            <CloseIcon sx={{ fontSize: 20 }} />
          </IconButton>
        )}

        {/* Content wrapper */}
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
    </Modal>
  );
}

