import React, { useState, useEffect, useRef } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck';
import FullscreenOverlay from '../../../FullscreenOverlay';

/**
 * Overlay fullscreen pour l'installation d'une app
 * Affiche les détails de l'app, la progression et les logs
 */
export default function InstallOverlay({ appInfo, jobInfo, darkMode, jobType = 'install', resultState = null }) {
  const [elapsedTime, setElapsedTime] = useState(0);
  const logsContainerRef = useRef(null);
  
  // resultState can be: null (in progress), 'success', 'failed'
  // jobType: 'install' or 'remove'

  // Timer to display elapsed time
  useEffect(() => {
    if (!appInfo) return;
    
    const startTime = Date.now();
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [appInfo]);

  if (!appInfo) return null;

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isInstalling = jobType === 'install';
  const progress = (jobInfo?.logs?.length || 0);
  const latestLogs = (jobInfo?.logs && jobInfo.logs.length > 0) ? jobInfo.logs.slice(-5) : []; // Display last 5 logs, chronological (most recent at bottom)
  
  // Determine if showing final result or progress
  const isShowingResult = resultState !== null;

  // Auto-scroll to bottom when new logs arrive (only in progress mode)
  useEffect(() => {
    if (!isShowingResult && logsContainerRef.current && latestLogs.length > 0) {
      // Smooth scroll to bottom
      logsContainerRef.current.scrollTo({
        top: logsContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [jobInfo?.logs?.length, isShowingResult, latestLogs.length]);

  return (
    <FullscreenOverlay
      open={!!appInfo}
      onClose={() => {}} // No close button, overlay closes automatically
      darkMode={darkMode}
      zIndex={10003} // Above DiscoverModal (10002)
      showCloseButton={false} // No manual close, auto-closes on completion
      centeredX={true} // Center horizontally
      centeredY={false} // Don't center vertically
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
          maxWidth: '500px',
          width: '90%',
        }}
      >
        {/* Icon - Changes based on state */}
        {isShowingResult ? (
          // ✅ Result state (success/failure) - MUI icon
          <Box
            sx={{
              width: 120,
              height: 120,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '60px',
              bgcolor: resultState === 'success' 
                ? 'rgba(34, 197, 94, 0.1)' 
                : 'rgba(239, 68, 68, 0.1)',
              border: `3px solid ${resultState === 'success' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            }}
          >
            {resultState === 'success' ? (
              <CheckCircleOutlinedIcon 
                sx={{ 
                  fontSize: 64, 
                  color: '#22c55e',
                }} 
              />
            ) : (
              <ErrorOutlineIcon 
                sx={{ 
                  fontSize: 64, 
                  color: '#ef4444',
                }} 
              />
            )}
          </Box>
        ) : (
          // 🔄 Progress (app icon with pulse)
          <Box
            sx={{
              fontSize: 64,
              width: 100,
              height: 100,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '24px',
              bgcolor: darkMode ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)',
              border: `2px solid ${darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'}`,
              animation: 'pulse 2s ease-in-out infinite',
              '@keyframes pulse': {
                '0%, 100%': { transform: 'scale(1)' },
                '50%': { transform: 'scale(1.05)' },
              },
            }}
          >
            {appInfo.extra?.cardData?.emoji || appInfo.icon || '📦'}
          </Box>
        )}

        {/* Title - Changes based on state */}
        {isShowingResult ? (
          // ✅ Result message
          <Box sx={{ textAlign: 'center' }}>
            <Typography
              sx={{
                fontSize: 24,
                fontWeight: 600,
                color: resultState === 'success' 
                  ? '#22c55e' 
                  : '#ef4444',
                mb: 0.5,
                animation: 'fadeInScale 0.5s ease',
                '@keyframes fadeInScale': {
                  from: { opacity: 0, transform: 'scale(0.9)' },
                  to: { opacity: 1, transform: 'scale(1)' },
                },
              }}
            >
              {resultState === 'success' 
                ? (isInstalling ? 'Installation Complete!' : 'Uninstallation Complete!')
                : (isInstalling ? 'Installation Failed' : 'Uninstallation Failed')
              }
            </Typography>
            <Typography
              sx={{
                fontSize: 16,
                fontWeight: 500,
                color: darkMode ? '#999' : '#666',
              }}
            >
              {appInfo.name}
            </Typography>
          </Box>
        ) : (
          // 🔄 Normal title (progress)
          <Box sx={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 0.25, mb: -0.5 }}>
            <Typography
              sx={{
                fontSize: 10,
                fontWeight: 500,
                color: darkMode ? '#666' : '#aaa',
                letterSpacing: '1px',
                textTransform: 'uppercase',
              }}
            >
              {isInstalling ? 'Installing' : 'Uninstalling'}
            </Typography>
            <Typography
              sx={{
                fontSize: 24,
                fontWeight: 600,
                color: darkMode ? '#f5f5f5' : '#333',
                letterSpacing: '-0.3px',
              }}
            >
              {appInfo.name}
            </Typography>
          </Box>
        )}

        {isShowingResult ? (
          // ✅ Final result display (without details)
          <Typography
            sx={{
              fontSize: 13,
              color: darkMode ? '#888' : '#999',
              textAlign: 'center',
              fontStyle: 'italic',
              animation: 'fadeIn 0.5s ease',
              '@keyframes fadeIn': {
                from: { opacity: 0 },
                to: { opacity: 1 },
              },
            }}
          >
            {resultState === 'success' ? 'Completed successfully' : 'An error occurred'}
          </Typography>
        ) : (
          <>
            {/* Description + Metadata */}
            <Box sx={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography
                sx={{
                  fontSize: 13,
                  color: darkMode ? '#aaa' : '#666',
                  lineHeight: 1.5,
                  maxWidth: '420px',
                }}
              >
                {appInfo.description || 'No description'}
              </Typography>
              
              {/* Author + Downloads (sans stars) */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, justifyContent: 'center', flexWrap: 'wrap' }}>
                {appInfo.author && (
                  <Typography
                    sx={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: darkMode ? '#888' : '#999',
                    }}
                  >
                    by {appInfo.author}
                  </Typography>
                )}
                
                {appInfo.downloads !== undefined && (
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                      px: 1,
                      py: 0.25,
                      borderRadius: '8px',
                      bgcolor: darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: darkMode ? '#888' : '#666',
                      }}
                    >
                      {appInfo.downloads} downloads
                    </Typography>
                  </Box>
                )}
              </Box>
            </Box>

            {/* Elapsed time + Steps - Two tags side by side */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                mt: 1.5,
              }}
            >
              {/* Elapsed time tag */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 2,
                  py: 1,
                  borderRadius: '10px',
                  bgcolor: darkMode ? 'rgba(255, 149, 0, 0.08)' : 'rgba(255, 149, 0, 0.05)',
                  border: `1px solid ${darkMode ? 'rgba(255, 149, 0, 0.2)' : 'rgba(255, 149, 0, 0.15)'}`,
                }}
              >
                <CircularProgress size={14} thickness={5} sx={{ color: '#FF9500' }} />
                <Typography
                  sx={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#FF9500',
                    fontFamily: 'monospace',
                  }}
                >
                  {formatTime(elapsedTime)}
                </Typography>
              </Box>
              
              {/* Tag Steps */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.75,
                  px: 1.5,
                  py: 1,
                  borderRadius: '10px',
                  bgcolor: darkMode ? 'rgba(255, 149, 0, 0.08)' : 'rgba(255, 149, 0, 0.05)',
                  border: `1px solid ${darkMode ? 'rgba(255, 149, 0, 0.2)' : 'rgba(255, 149, 0, 0.15)'}`,
                }}
              >
                <PlaylistAddCheckIcon sx={{ fontSize: 14, color: '#FF9500' }} />
                <Typography
                  sx={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#FF9500',
                    fontFamily: 'monospace',
                  }}
                >
                  step {progress}
                </Typography>
              </Box>
            </Box>

            {/* Recent logs */}
            <Box
              ref={logsContainerRef}
              sx={{
                width: '100%',
                maxWidth: '460px',
                bgcolor: darkMode ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.03)',
                border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'}`,
                borderRadius: '12px',
                p: 2,
                height: '140px', // Hauteur fixe
                display: 'flex',
                flexDirection: 'column',
                justifyContent: latestLogs.length > 0 ? 'flex-start' : 'center',
                overflowY: 'auto',
                '&::-webkit-scrollbar': {
                  width: '5px',
                },
                '&::-webkit-scrollbar-track': {
                  backgroundColor: 'transparent',
                },
                '&::-webkit-scrollbar-thumb': {
                  backgroundColor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
                  borderRadius: '2.5px',
                  '&:hover': {
                    backgroundColor: darkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)',
                  },
                },
              }}
            >
              {latestLogs.length > 0 ? (
                latestLogs.map((log, idx) => (
                  <Box
                    key={idx}
                    sx={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 1,
                      mb: idx < latestLogs.length - 1 ? 1 : 0,
                      animation: 'slideIn 0.3s ease',
                      '@keyframes slideIn': {
                        from: { 
                          opacity: 0, 
                          transform: 'translateY(-5px)' 
                        },
                        to: { 
                          opacity: 1, 
                          transform: 'translateY(0)' 
                        },
                      },
                    }}
                  >
                    <Box
                      sx={{
                        width: 4,
                        height: 4,
                        borderRadius: '50%',
                        bgcolor: '#FF9500',
                        mt: 0.75,
                        flexShrink: 0,
                      }}
                    />
                    <Typography
                      sx={{
                        fontSize: 10,
                        fontFamily: 'monospace',
                        color: darkMode ? '#d1d5db' : '#666',
                        lineHeight: 1.6,
                        wordBreak: 'break-word',
                      }}
                    >
                      {log}
                    </Typography>
                  </Box>
                ))
              ) : (
                <Typography
                  sx={{
                    fontSize: 11,
                    color: darkMode ? '#888' : '#999',
                    textAlign: 'center',
                    fontStyle: 'italic',
                  }}
                >
                  {isInstalling ? 'Preparing installation...' : 'Processing...'}
                </Typography>
              )}
            </Box>

            {/* Instruction - Adapted according to type */}
            {isInstalling && (
              <Typography
                sx={{
                  fontSize: 11,
                  color: darkMode ? '#666' : '#999',
                  fontStyle: 'italic',
                  mt: 1,
                }}
              >
                This may take up to 1 minute...
              </Typography>
            )}
          </>
        )}
      </Box>
    </FullscreenOverlay>
  );
}

