import React, { useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Box, IconButton, Modal } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { getAppWindow } from '../utils/windowUtils';

export interface FullscreenOverlayProps {
  open: boolean;
  onClose: () => void;
  darkMode?: boolean;
  zIndex?: number;
  showCloseButton?: boolean;
  backdropBlur?: number;
  backdropOpacity?: number;
  centered?: boolean;
  centeredX?: boolean;
  centeredY?: boolean;
  onBackdropClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  hidden?: boolean;
  keepMounted?: boolean;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  /** Optional debug label used when tracing overlay lifecycle; unused at runtime. */
  debugName?: string;
  children?: React.ReactNode;
}

export default function FullscreenOverlay({
  open,
  onClose,
  darkMode = false,
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
  scrollRef,
  children,
}: FullscreenOverlayProps): React.ReactElement {
  const appWindow = getAppWindow();

  const hasAnimatedRef = useRef(false);

  useEffect(() => {
    if (open && !hidden && !hasAnimatedRef.current) {
      hasAnimatedRef.current = true;
    }
  }, [open, hidden]);

  const shouldAnimate = open && !hidden && !hasAnimatedRef.current;
  const defaultBackdropOpacity =
    backdropOpacity !== undefined ? backdropOpacity : darkMode ? 0.92 : 0.95;

  const isCenteredX = centeredX !== undefined ? centeredX : centered;
  const isCenteredY = centeredY !== undefined ? centeredY : centered;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (onBackdropClick) {
      onBackdropClick(e);
    } else {
      onClose();
    }
  };

  const overlayBgColor = darkMode
    ? `rgba(18, 18, 18, ${defaultBackdropOpacity})`
    : `rgba(255, 255, 255, ${defaultBackdropOpacity})`;

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
    <>
      <Modal
        open={open}
        onClose={handleBackdropClick as unknown as () => void}
        keepMounted={keepMounted}
        hideBackdrop
        sx={{
          zIndex,
          ...(hidden && {
            visibility: 'hidden',
            pointerEvents: 'none',
          }),
        }}
      >
        <Box
          ref={scrollRef}
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
          {/* Drag strip - allows window dragging from the top 33px of the overlay.
              When AppTopBar is present (z-index 10000000), it handles drag and this
              strip is never reached. When AppTopBar is absent (showTopBar: false views),
              this strip provides drag. The close button portal (z-index 10000001) always
              sits above this strip's stacking context (z-index of this modal), so close
              button clicks are never blocked. */}
          <Box
            onMouseDown={async (e: React.MouseEvent<HTMLDivElement>) => {
              e.preventDefault();
              e.stopPropagation();
              try {
                await appWindow.startDragging();
              } catch {
                // ignore drag start failures
              }
            }}
            sx={{
              position: 'absolute',
              top: 0,
              left: 65,
              right: 0,
              height: 33,
              cursor: 'move',
              userSelect: 'none',
              WebkitAppRegion: 'drag',
              zIndex: 1,
            }}
          />

          {/* Content wrapper */}
          <Box
            onClick={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()}
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

      {/* Close button - portal at z-index 10000001, above AppTopBar (10000000).
          This is required because AppTopBar sits at z-index 10000000 to remain
          draggable at all times. Any interactive element within the top 33px of
          a fullscreen overlay must be rendered above it via a portal. */}
      {showCloseButton &&
        open &&
        !hidden &&
        createPortal(
          <IconButton
            onClick={onClose}
            sx={{
              position: 'fixed',
              top: 20,
              right: 16,
              color: '#FF9500',
              bgcolor: darkMode ? 'rgba(255, 255, 255, 0.08)' : '#ffffff',
              border: '1px solid #FF9500',
              opacity: 0.7,
              zIndex: 10000001,
              WebkitAppRegion: 'no-drag',
              '&:hover': {
                opacity: 1,
                bgcolor: darkMode ? 'rgba(255, 255, 255, 0.12)' : '#ffffff',
              },
            }}
          >
            <CloseIcon sx={{ fontSize: 20 }} />
          </IconButton>,
          document.body
        )}
    </>
  );
}
