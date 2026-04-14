import React, { useRef, useEffect } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
import { useWebRTCStreamContext, StreamState } from '../../../contexts/WebRTCStreamContext';

/**
 * CameraFeed Component - Displays camera stream when available
 * Uses shared WebRTC connection from context (avoids duplicate connections)
 */
export default function CameraFeed({ isLarge = false }) {
  const videoRef = useRef(null);

  // Get shared WebRTC stream from context
  const {
    state,
    stream,
    isConnected,
    isConnecting,
    isWebRTCAvailable,
    checkFailed,
    isRobotAwake,
    connect,
  } = useWebRTCStreamContext();

  // Attach/detach stream to video element
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (stream) {
      video.srcObject = stream;
      video.play().catch(e => {
        console.warn('[CameraFeed] Autoplay failed:', e);
      });
    } else {
      video.srcObject = null;
    }

    return () => {
      video.srcObject = null;
    };
  }, [stream]);

  // Re-trigger play() when the video becomes visible after connection
  useEffect(() => {
    const video = videoRef.current;
    if (video && isConnected && video.srcObject && video.paused) {
      video.play().catch(e => {
        console.warn('[CameraFeed] Resume play failed:', e);
      });
    }
  }, [isConnected]);

  // Common placeholder box style
  const placeholderStyle = {
    position: 'relative',
    width: '100%',
    height: '100%',
    borderRadius: isLarge ? '16px' : '12px',
    overflow: 'hidden',
    border: isLarge ? 'none' : '1px solid rgba(0, 0, 0, 0.08)',
    bgcolor: '#000000',
  };

  // WebRTC not available (e.g. simulation without WebRTC support)
  if (isWebRTCAvailable === false) {
    return (
      <Box sx={placeholderStyle}>
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
          <VideocamOffIcon
            sx={{
              fontSize: isLarge ? 64 : 32,
              color: 'rgba(255, 255, 255, 0.3)',
            }}
          />
          <Typography
            sx={{
              fontSize: isLarge ? 12 : 9,
              color: 'rgba(255, 255, 255, 0.4)',
              fontFamily: 'SF Mono, Monaco, Menlo, monospace',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Stream not available
          </Typography>
        </Box>
      </Box>
    );
  }

  // Still checking if WebRTC is available
  if (isWebRTCAvailable === null && !checkFailed) {
    return (
      <Box sx={placeholderStyle}>
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
            gap: 1.5,
          }}
        >
          <CircularProgress size={isLarge ? 32 : 20} sx={{ color: '#FF9500' }} />
          <Typography
            sx={{
              fontSize: isLarge ? 12 : 9,
              color: 'rgba(255, 255, 255, 0.5)',
              fontFamily: 'SF Mono, Monaco, Menlo, monospace',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Checking stream...
          </Typography>
        </Box>
      </Box>
    );
  }

  // WebRTC available but robot not awake - show "wake up" hint
  if (!isRobotAwake) {
    return (
      <Box sx={placeholderStyle}>
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
          <VideocamOutlinedIcon
            sx={{
              fontSize: isLarge ? 48 : 28,
              color: 'rgba(255, 255, 255, 0.3)',
            }}
          />
          <Typography
            sx={{
              fontSize: isLarge ? 12 : 9,
              color: 'rgba(255, 255, 255, 0.4)',
              fontFamily: 'SF Mono, Monaco, Menlo, monospace',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              textAlign: 'center',
              px: 2,
            }}
          >
            Wake up robot to stream
          </Typography>
        </Box>
      </Box>
    );
  }

  // WebRTC available, robot awake - show WebRTC stream
  return (
    <Box sx={placeholderStyle}>
      {/* Video element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          visibility: isConnected ? 'visible' : 'hidden',
        }}
      />

      {/* Connecting state */}
      {isConnecting && (
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
            gap: 1.5,
          }}
        >
          <CircularProgress size={isLarge ? 32 : 20} sx={{ color: '#FF9500' }} />
          <Typography
            sx={{
              fontSize: isLarge ? 12 : 9,
              color: 'rgba(255, 255, 255, 0.5)',
              fontFamily: 'SF Mono, Monaco, Menlo, monospace',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Connecting...
          </Typography>
        </Box>
      )}

      {/* Disconnected / Error state */}
      {(state === StreamState.DISCONNECTED || state === StreamState.ERROR) && !isConnecting && (
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
            cursor: 'pointer',
            transition: 'background 0.2s',
            '&:hover': {
              bgcolor: 'rgba(255, 255, 255, 0.05)',
            },
          }}
          onClick={connect}
        >
          <VideocamOffIcon
            sx={{
              fontSize: isLarge ? 48 : 28,
              color:
                state === StreamState.ERROR ? 'rgba(239, 68, 68, 0.6)' : 'rgba(255, 255, 255, 0.3)',
            }}
          />
          <Typography
            sx={{
              fontSize: isLarge ? 12 : 9,
              color:
                state === StreamState.ERROR ? 'rgba(239, 68, 68, 0.7)' : 'rgba(255, 255, 255, 0.4)',
              fontFamily: 'SF Mono, Monaco, Menlo, monospace',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            {state === StreamState.ERROR ? 'Connection failed' : 'Click to connect'}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
