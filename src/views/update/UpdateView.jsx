import React, { useEffect, useState, useRef } from 'react';
import { Box, Typography, LinearProgress, CircularProgress } from '@mui/material';
import reachyUpdateBoxSvg from '../../assets/reachy-update-box.svg';
import useAppStore from '../../store/useAppStore';
import { DAEMON_CONFIG } from '../../config/daemon';
import { useInternetHealthcheck } from './hooks';

/**
 * Update view component
 * Displays "Checking for updates..." for at least 2-3 seconds
 * Automatically installs if an update is available
 */
export default function UpdateView({
  isChecking,
  isDownloading,
  downloadProgress,
  updateAvailable,
  updateError,
  onInstallUpdate,
}) {
  const { darkMode } = useAppStore();
  const [minDisplayTimeElapsed, setMinDisplayTimeElapsed] = useState(false);
  const checkStartTimeRef = useRef(Date.now());
  const { isOnline: isInternetOnline, hasChecked: hasInternetChecked } = useInternetHealthcheck({ interval: 5000, timeout: 5000 });

  // ✅ Timer to guarantee minimum display time (uses centralized config)
  // Reset timer when component mounts to ensure "Looking for updates..." is visible for at least 2 seconds
  // This works in both DEV mode (where isChecking stays false) and PRODUCTION (where check may complete quickly)
  useEffect(() => {
    checkStartTimeRef.current = Date.now();
    setMinDisplayTimeElapsed(false);
    
    const timer = setTimeout(() => {
      setMinDisplayTimeElapsed(true);
    }, DAEMON_CONFIG.MIN_DISPLAY_TIMES.UPDATE_CHECK);

    return () => clearTimeout(timer);
  }, []); // ✅ Only reset on mount - ensures consistent 2s display regardless of check speed

  // Automatic installation if update available and minimum time elapsed
  useEffect(() => {
    if (updateAvailable && !isDownloading && !updateError && minDisplayTimeElapsed && onInstallUpdate) {
      // Small delay to let UI update
      const installTimer = setTimeout(() => {
        onInstallUpdate();
      }, 300);
      return () => clearTimeout(installTimer);
    }
  }, [updateAvailable, isDownloading, updateError, minDisplayTimeElapsed, onInstallUpdate]);

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

  // Check if error is network-related
  const isNetworkError = (error) => {
    if (!error) return false;
    
    const errorLower = error.toLowerCase();
    const networkKeywords = [
      'network',
      'connection',
      'internet',
      'timeout',
      'fetch',
      'could not fetch',
      'failed to fetch',
      'unable to check',
      'check your internet',
      'no internet',
      'offline',
    ];
    
    return networkKeywords.some(keyword => errorLower.includes(keyword));
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
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh', // TopBar is fixed, doesn't take space
          px: 4,
        }}
      >
        {/* ✅ Show "Looking for updates..." if checking OR if minimum time not elapsed yet
            This ensures the message is visible for at least 2 seconds, even if check completes quickly */}
        {(isChecking || !minDisplayTimeElapsed) && !updateAvailable && !updateError ? (
          // State: Checking in progress OR minimum display time not elapsed - subtle and centered design
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CircularProgress
              size={28}
              thickness={2.5}
              sx={{
                color: darkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.12)',
                mb: 1.5,
              }}
            />

            <Typography
              sx={{
                fontSize: 12,
                fontWeight: 400,
                color: darkMode ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.35)',
                textAlign: 'center',
                letterSpacing: '0.2px',
              }}
            >
              Looking for updates...
            </Typography>
          </Box>
        ) : updateAvailable ? (
          // State: Update available (automatic installation)
          <>
            <Box sx={{ mb: 4 }}>
              <img
                src={reachyUpdateBoxSvg}
                alt="Reachy Update"
                style={{
                  width: '220px',
                  height: '220px',
                  mb: 0,
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
                    Installing... {downloadProgress}%
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

            {/* Status text */}
            {!isDownloading && !updateError && (
              <Typography
                sx={{
                  fontSize: 13,
                  color: darkMode ? '#888' : '#666',
                  textAlign: 'center',
                  mt: 2,
                }}
              >
                Installing update automatically...
              </Typography>
            )}
          </>
        ) : updateError ? (
          // State: Error - display clear error message, especially for network errors
          <>
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                maxWidth: 360,
                textAlign: 'center',
              }}
            >
              {/* Icon or visual indicator for error */}
              <Box
                sx={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  bgcolor: darkMode ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mb: 2,
                }}
              >
                <Typography
                  sx={{
                    fontSize: 32,
                    color: '#ef4444',
                  }}
                >
                  ⚠️
                </Typography>
              </Box>

              {/* Error title - more specific based on error type */}
              <Typography
                sx={{
                  fontSize: 18,
                  fontWeight: 600,
                  color: darkMode ? '#f5f5f5' : '#333',
                  mb: 1,
                }}
              >
                {updateError.includes('timed out') || updateError.includes('timeout')
                  ? 'Update Check Timed Out'
                  : updateError.includes('Network error') || updateError.includes('DNS error')
                  ? 'Connection Problem'
                  : updateError.includes('Server error')
                  ? 'Server Error'
                  : updateError.includes('Security error') || updateError.includes('certificate')
                  ? 'Security Error'
                  : isNetworkError(updateError)
                  ? 'No Internet Connection'
                  : 'Update Check Failed'}
              </Typography>

              {/* Error message - use the detailed error message directly */}
              <Typography
                sx={{
                  fontSize: 13,
                  color: darkMode ? '#aaa' : '#666',
                  lineHeight: 1.6,
                  mb: 2,
                  maxWidth: 400,
                }}
              >
                {updateError}
              </Typography>

            </Box>
          </>
        ) : null}
      </Box>

      {/* Internet connectivity indicator - discrete pastille at bottom center */}
      {/* Only display after first check is complete */}
      {hasInternetChecked && (
        <Box
          sx={{
            position: 'absolute',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1,
            zIndex: 10,
          }}
        >
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            bgcolor: isInternetOnline 
              ? (darkMode ? 'rgba(34, 197, 94, 0.6)' : 'rgba(34, 197, 94, 0.5)')
              : (darkMode ? 'rgba(239, 68, 68, 0.6)' : 'rgba(239, 68, 68, 0.5)'),
            boxShadow: isInternetOnline
              ? (darkMode ? '0 0 4px rgba(34, 197, 94, 0.3)' : '0 0 3px rgba(34, 197, 94, 0.2)')
              : (darkMode ? '0 0 4px rgba(239, 68, 68, 0.3)' : '0 0 3px rgba(239, 68, 68, 0.2)'),
            transition: 'all 0.3s ease',
            flexShrink: 0,
          }}
        />
        <Typography
          sx={{
            fontSize: 12,
            fontWeight: 400,
            color: darkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)',
            whiteSpace: 'nowrap',
            transition: 'color 0.3s ease',
          }}
        >
          {isInternetOnline ? 'Online' : 'Offline'}
        </Typography>
        </Box>
      )}
    </Box>
  );
}

