import React, { useMemo, useState, useEffect } from 'react';
import { Box, Typography, Button, CircularProgress, LinearProgress } from '@mui/material';
import SystemUpdateIcon from '@mui/icons-material/SystemUpdate';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getVersion } from '@tauri-apps/api/app';
import reachyBusteSvg from '../../assets/reachy-buste.svg';
import reachyUpdateBoxSvg from '../../assets/reachy-update-box.svg';
import useAppStore from '../../store/useAppStore';

// 🤖 Startup messages (fixed title)
const START_MESSAGES = [
  { 
    text: 'Press the button to ', 
    bold: 'bring Reachy to life',
    suffix: '' 
  },
  { 
    text: 'Give ', 
    bold: 'life', 
    suffix: ' to your robot' 
  },
  { 
    text: 'Time to ', 
    bold: 'wake up', 
    suffix: ' Reachy' 
  },
  { 
    text: 'Press to ', 
    bold: 'activate', 
    suffix: ' the robot' 
  },
];

/**
 * View displayed when robot is connected but daemon is not started yet
 */
export default function ReadyToStartView({ 
  startDaemon, 
  isStarting, 
  usbPortName,
  updateAvailable,
  isChecking,
  isDownloading,
  downloadProgress,
  updateError,
  onInstallUpdate,
  onDismissUpdate,
  onCheckUpdates,
}) {
  const appWindow = window.mockGetCurrentWindow ? window.mockGetCurrentWindow() : getCurrentWindow();
  const { darkMode } = useAppStore();
  const [isButtonLoading, setIsButtonLoading] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [currentVersion, setCurrentVersion] = useState('');

  useEffect(() => {
    getVersion().then(setCurrentVersion).catch(() => {
      // Fallback si l'API n'est pas disponible
      setCurrentVersion('0.1.0');
    });
  }, []);
  
  // Choose a random message (memoized - never changes)
  const randomMessage = useMemo(() => {
    return START_MESSAGES[Math.floor(Math.random() * START_MESSAGES.length)];
  }, []);

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
  
  const handleStartClick = () => {
    // Don't allow starting if checking for updates or if update is available
    if (isChecking || updateAvailable) {
      return;
    }
    
    setIsButtonLoading(true);
    // Let React render the spinner before starting the daemon
    setTimeout(() => {
      startDaemon();
    }, 0); // 100ms for React to have time to render
  };

  return (
    <Box
      sx={{
        width: '100vw',
        height: '100vh',
        background: darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)',
        backdropFilter: 'blur(40px)',
        WebkitBackdropFilter: 'blur(40px)',
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
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          cursor: 'move',
          userSelect: 'none',
          position: 'relative',
        }}
      >
        <Box sx={{ width: 12, height: 12 }} />
        <Box sx={{ height: 20 }} /> {/* Space for drag */}
        {/* Version number - always visible when available */}
        <Typography
          sx={{
            position: 'absolute',
            top: '50%',
            right: 12,
            transform: 'translateY(-50%)',
            fontSize: 10,
            color: darkMode ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)',
            fontWeight: 500,
            letterSpacing: '0.02em',
            pointerEvents: 'none',
            fontFamily: 'SF Mono, Monaco, Menlo, monospace',
          }}
        >
          {currentVersion ? `v${currentVersion}` : 'v0.1.0'}
        </Typography>
        <Box sx={{ width: 20, height: 20 }} />
      </Box>

      {/* Start daemon view */}
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
          {isChecking ? (
            // Checking for updates - show loading state
            <>
              <Box sx={{ mb: 4 }}>
                <img
                  src={reachyBusteSvg}
                  alt="Reachy"
                  style={{
                    width: '220px',
                    height: '220px',
                    mb: 0,
                    opacity: 0.5,
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
                Checking for updates...
              </Typography>

              <Box sx={{ width: '100%', maxWidth: 300, mt: 3 }}>
                <LinearProgress
                  variant="indeterminate"
                  color="primary"
                  sx={{
                    height: 6,
                    borderRadius: 3,
                    bgcolor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
                  }}
                />
              </Box>
            </>
          ) : updateAvailable ? (
            // Update view
            <>
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

              {/* Progress bar */}
              {(isDownloading || isChecking) && (
                <Box sx={{ width: '100%', maxWidth: 300, mb: 3 }}>
                  <LinearProgress
                    variant={isDownloading ? 'determinate' : 'indeterminate'}
                    value={isDownloading ? downloadProgress : undefined}
                    color="primary"
                    sx={{
                      height: 6,
                      borderRadius: 3,
                      bgcolor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
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
              {updateError && (
                <Box
                  sx={{
                    mb: 3,
                    maxWidth: 360,
                    textAlign: 'center',
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: 13,
                      color: '#ef4444',
                      fontWeight: 500,
                      mb: 1,
                    }}
                  >
                    {updateError}
                  </Typography>
                </Box>
              )}

              {/* Install/Retry button */}
              <Button
                onClick={async () => {
                  if (updateError) {
                    // Retry: check for updates again
                    setIsRetrying(true);
                    const update = await onCheckUpdates();
                    setIsRetrying(false);
                    // If update is available after retry, install it
                    if (update) {
                      onInstallUpdate();
                    }
                  } else {
                    onInstallUpdate();
                  }
                }}
                disabled={isDownloading || isChecking || isRetrying}
                variant="contained"
                color="primary"
                startIcon={(isDownloading || isChecking || isRetrying) ? (
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
                    opacity: !(updateError || isDownloading) ? 1 : 0,
                  },
                  '&:hover': {
                    bgcolor: !(updateError || isDownloading) ? (darkMode ? '#f5f5f5' : '#1a1a1a') : (darkMode ? '#fff' : '#000'),
                    transform: !(updateError || isDownloading) ? 'translateY(-1px)' : 'none',
                    boxShadow: !(updateError || isDownloading) 
                      ? '0 4px 12px rgba(0, 0, 0, 0.15), 0 2px 4px rgba(0, 0, 0, 0.08), inset 0 -1px 1px rgba(255, 255, 255, 0.2)'
                      : '0 2px 8px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.06), inset 0 -1px 1px rgba(255, 255, 255, 0.15)',
                  },
                  '&:active': {
                    transform: !(updateError || isDownloading) ? 'translateY(0px)' : 'none',
                    boxShadow: '0 1px 4px rgba(0, 0, 0, 0.12)',
                  },
                  '&:disabled': {
                    bgcolor: darkMode ? '#f5f5f5' : '#1a1a1a',
                    color: darkMode ? 'rgba(0, 0, 0, 0.5)' : 'rgba(255, 255, 255, 0.7)',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                  },
                }}
              >
                    {isDownloading ? 'Installing...' : (isChecking || isRetrying) ? 'Checking...' : updateError ? 'Retry' : 'Install Update'}
              </Button>
            </>
          ) : (
            // Normal start view
            <>
              <Box sx={{ mb: 4 }}>
                <img 
                  src={reachyBusteSvg} 
                  alt="Reachy Buste" 
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
                Ready to Start
              </Typography>
              
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
                {randomMessage.text}
                <Box component="span" sx={{ fontWeight: 700, color: darkMode ? '#f5f5f5' : '#333' }}>
                  {randomMessage.bold}
                </Box>
                {randomMessage.suffix}
              </Typography>

                  <Button
                    onClick={handleStartClick}
                    disabled={isButtonLoading || isStarting || isChecking}
                    variant="contained"
                    color="primary"
                startIcon={(isButtonLoading || isStarting) ? (
                  <CircularProgress size={14} thickness={3} sx={{ color: 'rgba(255, 255, 255, 0.8)' }} />
                ) : null}
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
                    opacity: !(isButtonLoading || isStarting) ? 1 : 0,
                  },
                  '&:hover': {
                    bgcolor: !(isButtonLoading || isStarting) ? (darkMode ? '#f5f5f5' : '#1a1a1a') : (darkMode ? '#fff' : '#000'),
                    transform: !(isButtonLoading || isStarting) ? 'translateY(-1px)' : 'none',
                    boxShadow: !(isButtonLoading || isStarting) 
                      ? '0 4px 12px rgba(0, 0, 0, 0.15), 0 2px 4px rgba(0, 0, 0, 0.08), inset 0 -1px 1px rgba(255, 255, 255, 0.2)'
                      : '0 2px 8px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.06), inset 0 -1px 1px rgba(255, 255, 255, 0.15)',
                  },
                  '&:active': {
                    transform: !(isButtonLoading || isStarting) ? 'translateY(0px)' : 'none',
                    boxShadow: '0 1px 4px rgba(0, 0, 0, 0.12)',
                  },
                  '&:disabled': {
                    bgcolor: darkMode ? '#f5f5f5' : '#1a1a1a',
                    color: darkMode ? 'rgba(0, 0, 0, 0.5)' : 'rgba(255, 255, 255, 0.7)',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                  },
                }}
              >
                {(isButtonLoading || isStarting) ? 'Starting...' : 'Start'}
              </Button>
            </>
          )}
        </Box>

            {/* Bottom text - absolute positioning */}
            {!isChecking && !updateAvailable && (
          <Box 
            sx={{ 
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              pb: 3, 
              textAlign: 'center',
            }}
          >
            <Typography
              sx={{
                fontSize: 11,
                color: darkMode ? '#666' : '#bbb',
              }}
            >
              Reachy connected via USB
            </Typography>
            {usbPortName && (
              <Typography
                sx={{
                  fontSize: 10,
                  color: darkMode ? '#888' : '#666',
                  fontFamily: 'SF Mono, Monaco, Menlo, monospace',
                  mt: 0.5,
                }}
              >
                {usbPortName}
              </Typography>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
}

