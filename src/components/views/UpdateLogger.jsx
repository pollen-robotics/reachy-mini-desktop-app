import React from 'react';
import {
  Box,
  Typography,
  IconButton,
  LinearProgress,
  Button,
  CircularProgress,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SystemUpdateIcon from '@mui/icons-material/SystemUpdate';
import { getCurrentWindow } from '@tauri-apps/api/window';
import reachyUpdateBoxSvg from '../../assets/reachy-update-box.svg';
import useAppStore from '../../store/useAppStore';
import FullscreenOverlay from '../FullscreenOverlay';

/**
 * Simple update view similar to ReadyToStartView
 * Shows Reachy head illustration, centered title and description
 */
function UpdateLogger({ 
  updateAvailable, 
  isChecking, 
  isDownloading, 
  downloadProgress, 
  error,
  onInstall,
  onDismiss,
  onCheck,
  isOpen: controlledIsOpen,
  onToggle,
}) {
  const appWindow = window.mockGetCurrentWindow ? window.mockGetCurrentWindow() : getCurrentWindow();
  const { darkMode } = useAppStore();
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : false;
  const setIsOpen = onToggle || (() => {});

  const formatDate = (dateString) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  if (!isOpen) return null;

  const handleClose = () => {
    setIsOpen(false);
    onDismiss?.();
  };

  return (
    <FullscreenOverlay
      open={isOpen}
      onClose={handleClose}
      darkMode={darkMode}
      zIndex={10000} // Most critical system overlay (UpdateLogger)
      backdropBlur={40}
      backdropOpacity={darkMode ? 0.95 : 0.85}
      centered={false} // Custom layout with titlebar
      showCloseButton={false} // Custom close button in titlebar
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          overflow: 'hidden',
        }}
      >
        {/* Titlebar */}
        <Box
          onMouseDown={async (e) => {
            e.preventDefault();
            try {
              await appWindow.startDragging();
            } catch (err) {
              console.error('Drag error:', err);
            }
          }}
          sx={{
            height: 44,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'flex-end',
            px: 2,
            pt: 2,
            cursor: 'move',
            userSelect: 'none',
          }}
        >
          <IconButton
            size="medium"
            onClick={handleClose}
            sx={{
              color: darkMode ? '#888' : '#666',
              '&:hover': {
                bgcolor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
              },
            }}
          >
            <CloseIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Box>

        {/* Content */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            height: 'calc(100% - 44px)',
            px: 4,
            position: 'relative',
          }}
        >
          {/* Centered content */}
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
            }}
          >
            <Box sx={{ mb: 4 }}>
              <img 
                src={reachyUpdateBoxSvg} 
                alt="Reachy Update" 
                style={{ 
                  width: '220px', 
                  height: '220px',
                  mb: 0
                }} 
              />
            </Box>
            
            <Typography
              sx={{
                fontSize: 24,
                fontWeight: 600,
                color: darkMode ? '#f5f5f5' : '#333',
                mb: 1,
                mt: 0,
                textAlign: 'center',
              }}
            >
              Update Available
            </Typography>
            
            {updateAvailable && (
              <Typography
                sx={{
                  fontSize: 14,
                  color: darkMode ? '#aaa' : '#666',
                  textAlign: 'center',
                  maxWidth: 360,
                  lineHeight: 1.6,
                  mb: 3,
                }}
              >
                Version {updateAvailable.version} • {formatDate(updateAvailable.date)}
              </Typography>
            )}

            {/* Progress bar */}
            {(isDownloading || isChecking) && (
              <Box sx={{ width: '100%', maxWidth: 300, mb: 3 }}>
                <LinearProgress
                  variant={isDownloading ? 'determinate' : 'indeterminate'}
                  value={isDownloading ? downloadProgress : undefined}
                  sx={{
                    height: 6,
                    borderRadius: 3,
                    bgcolor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
                    '& .MuiLinearProgress-bar': {
                      bgcolor: darkMode ? '#3b82f6' : '#2563eb',
                    },
                  }}
                />
                {isDownloading && (
                  <Typography
                    sx={{
                      fontSize: 12,
                      color: darkMode ? '#888' : '#666',
                      textAlign: 'center',
                      mt: 1,
                    }}
                  >
                    Downloading... {downloadProgress}%
                  </Typography>
                )}
              </Box>
            )}

            {/* Error message */}
            {error && (
              <Typography
                sx={{
                  fontSize: 13,
                  color: '#ef4444',
                  textAlign: 'center',
                  mb: 3,
                  maxWidth: 360,
                }}
              >
                {error}
              </Typography>
            )}

            {/* Install button */}
            {updateAvailable && !isDownloading && (
              <Button
                onClick={onInstall}
                disabled={!!error}
                variant="contained"
                color="primary"
                startIcon={isChecking ? (
                  <CircularProgress size={14} thickness={3} sx={{ color: 'rgba(255, 255, 255, 0.8)' }} />
                ) : (
                  <SystemUpdateIcon />
                )}
                sx={{
                  px: 3.5,
                  py: 1.25,
                  minHeight: 42,
                  fontSize: 14,
                  fontWeight: 600,
                  textTransform: 'none',
                  borderRadius: '20px',
                  bgcolor: darkMode ? '#fff' : '#000',
                  color: darkMode ? '#000' : '#fff',
                  position: 'relative',
                  overflow: 'hidden',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.06), inset 0 -1px 1px rgba(255, 255, 255, 0.15)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                  letterSpacing: '-0.01em',
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'radial-gradient(circle at 50% 0%, rgba(255, 149, 0, 0.15), transparent 70%)',
                    opacity: 0,
                    transition: 'opacity 0.3s ease',
                  },
                  '&:hover::before': {
                    opacity: !error ? 1 : 0,
                  },
                  '&:hover': {
                    bgcolor: !error ? (darkMode ? '#f5f5f5' : '#1a1a1a') : (darkMode ? '#fff' : '#000'),
                    transform: !error ? 'translateY(-1px)' : 'none',
                    boxShadow: !error 
                      ? '0 4px 12px rgba(0, 0, 0, 0.15), 0 2px 4px rgba(0, 0, 0, 0.08), inset 0 -1px 1px rgba(255, 255, 255, 0.2)'
                      : '0 2px 8px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.06), inset 0 -1px 1px rgba(255, 255, 255, 0.15)',
                  },
                  '&:active': {
                    transform: !error ? 'translateY(0px)' : 'none',
                    boxShadow: '0 1px 4px rgba(0, 0, 0, 0.12)',
                  },
                  '&:disabled': {
                    bgcolor: darkMode ? '#f5f5f5' : '#1a1a1a',
                    color: darkMode ? 'rgba(0, 0, 0, 0.5)' : 'rgba(255, 255, 255, 0.7)',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                  },
                }}
              >
                {isChecking ? 'Checking...' : 'Install Update'}
              </Button>
            )}
          </Box>
        </Box>
      </Box>
    </FullscreenOverlay>
  );
}

export default UpdateLogger;
