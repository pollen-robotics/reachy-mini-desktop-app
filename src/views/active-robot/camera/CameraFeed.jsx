import React, { useEffect, useRef, useState } from 'react';
import { Box, Typography } from '@mui/material';
import VideocamOffOutlinedIcon from '@mui/icons-material/VideocamOffOutlined';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';

/**
 * CameraFeed Component - Displays live video stream from the robot's camera
 * Uses MJPEG stream from the daemon's /api/camera/stream endpoint
 */
export default function CameraFeed({ width = 240, height = 180, isLarge = false }) {
  const imgRef = useRef(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const retryTimeoutRef = useRef(null);
  const mountedRef = useRef(true);

  // MJPEG stream URL with cache-busting
  const STREAM_URL = `http://localhost:8000/api/camera/stream?fps=15&quality=70&_t=${retryCount}`;

  useEffect(() => {
    mountedRef.current = true;
    
    return () => {
      mountedRef.current = false;
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  const handleLoad = () => {
    if (mountedRef.current) {
      console.log('[CameraFeed] 🎥 MJPEG stream loaded');
      setIsLoaded(true);
      setHasError(false);
    }
  };

  const handleError = () => {
    if (mountedRef.current) {
      console.log('[CameraFeed] ❌ MJPEG stream error, will retry...');
      setIsLoaded(false);
      setHasError(true);
      
      // Retry after delay by re-mounting the img element with new URL
      retryTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current) {
          setRetryCount(c => c + 1); // New URL to bypass cache
          setHasError(false); // This will re-render the img element
        }
      }, 3000);
    }
  };

  // Show placeholder when not loaded or error
  const showPlaceholder = !isLoaded || hasError;

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        height: '100%',
        borderRadius: isLarge ? '16px' : '12px',
        overflow: 'hidden',
        border: isLarge ? 'none' : '1px solid rgba(0, 0, 0, 0.08)',
        bgcolor: '#000000',
      }}
    >
      {/* MJPEG stream image - only render when not in error state */}
      {!hasError && (
        <img
          ref={imgRef}
          src={STREAM_URL}
          alt="Camera Feed"
          onLoad={handleLoad}
          onError={handleError}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: showPlaceholder ? 'none' : 'block',
          }}
        />
      )}
      
      {/* Placeholder when no video */}
      {showPlaceholder && (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1,
          }}
        >
          {hasError ? (
            <VideocamOffOutlinedIcon
              sx={{
                fontSize: isLarge ? 64 : 32,
                color: 'rgba(255, 255, 255, 0.3)',
              }}
            />
          ) : (
            <VideocamOutlinedIcon
              sx={{
                fontSize: isLarge ? 64 : 32,
                color: 'rgba(255, 255, 255, 0.5)',
                animation: 'pulse 1.5s ease-in-out infinite',
                '@keyframes pulse': {
                  '0%, 100%': { opacity: 0.5 },
                  '50%': { opacity: 1 },
                },
              }}
            />
          )}
          <Typography
            sx={{
              fontSize: isLarge ? 10 : 8,
              color: 'rgba(255, 255, 255, 0.4)',
              fontFamily: 'SF Mono, Monaco, Menlo, monospace',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            {hasError ? 'Camera coming soon' : 'Connecting...'}
          </Typography>
        </Box>
      )}
      
    </Box>
  );
}
