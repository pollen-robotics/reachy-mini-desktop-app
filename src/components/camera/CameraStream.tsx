/**
 * CameraStream Component
 * Displays the WebRTC video stream from Reachy WiFi camera
 */

import { useRef, useEffect, useState } from 'react';
import { Box, Typography, IconButton, CircularProgress } from '@mui/material';
import VideocamIcon from '@mui/icons-material/Videocam';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import CloseIcon from '@mui/icons-material/Close';
import RefreshIcon from '@mui/icons-material/Refresh';
import useWebRTCStream, { StreamState } from '../../hooks/media/useWebRTCStream';
import FullscreenOverlayUntyped from '../FullscreenOverlay';
import type React from 'react';

// TODO(ts): FullscreenOverlay lives outside this agent's migration scope; cast locally
// to a React.FC shape that matches the runtime call signature we use.
const FullscreenOverlay = FullscreenOverlayUntyped as unknown as React.FC<{
  open: boolean;
  onClose: () => void;
  children?: React.ReactNode;
  darkMode?: boolean;
  zIndex?: number;
  centeredX?: boolean;
  centeredY?: boolean;
}>;

export interface CameraStreamProps {
  robotHost: string | null | undefined;
  darkMode?: boolean;
  autoConnect?: boolean;
  onClose?: () => void;
}

/**
 * Camera stream display component
 */
export default function CameraStream({
  robotHost,
  darkMode = true,
  autoConnect = false,
  onClose,
}: CameraStreamProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showControls, setShowControls] = useState<boolean>(true);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { state, stream, error, connect, disconnect, isConnected, isConnecting } = useWebRTCStream(
    robotHost,
    autoConnect
  );

  // Attach stream to video element
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream as MediaStream;
      videoRef.current.play().catch((e: unknown) => {
        console.warn('[Camera] Autoplay failed:', e);
      });
    }
  }, [stream]);

  // Auto-hide controls
  useEffect(() => {
    if (isConnected && showControls) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [isConnected, showControls]);

  const handleMouseMove = () => {
    setShowControls(true);
  };

  const handleClose = () => {
    disconnect();
    if (onClose) onClose();
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  // Colors based on theme
  const bgColor = darkMode ? 'rgba(0, 0, 0, 0.95)' : 'rgba(255, 255, 255, 0.95)';
  const textColor = darkMode ? '#fff' : '#333';
  const mutedColor = darkMode ? '#888' : '#666';

  const videoContent = (
    <Box
      onMouseMove={handleMouseMove}
      onClick={() => setShowControls(true)}
      sx={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: '#000',
        borderRadius: isFullscreen ? 0 : '12px',
        overflow: 'hidden',
      }}
    >
      {/* Video element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={false}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          display: isConnected ? 'block' : 'none',
        }}
      />

      {/* Loading state */}
      {isConnecting && (
        <Box
          sx={{
            position: 'absolute',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <CircularProgress size={40} sx={{ color: '#FF9500' }} />
          <Typography sx={{ color: '#fff', fontSize: 14 }}>Connecting to camera...</Typography>
        </Box>
      )}

      {/* Disconnected state */}
      {state === StreamState.DISCONNECTED && !isConnecting && (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <VideocamOffIcon sx={{ fontSize: 48, color: mutedColor }} />
          <Typography sx={{ color: mutedColor, fontSize: 14 }}>Camera disconnected</Typography>
          <IconButton
            onClick={connect}
            sx={{
              color: '#FF9500',
              border: '1px solid #FF9500',
              '&:hover': { bgcolor: 'rgba(255, 149, 0, 0.1)' },
            }}
          >
            <RefreshIcon />
          </IconButton>
        </Box>
      )}

      {/* Error state */}
      {state === StreamState.ERROR && (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            p: 3,
          }}
        >
          <VideocamOffIcon sx={{ fontSize: 48, color: '#ef4444' }} />
          <Typography sx={{ color: '#ef4444', fontSize: 14, textAlign: 'center' }}>
            {error || 'Connection failed'}
          </Typography>
          <IconButton
            onClick={connect}
            sx={{
              color: '#FF9500',
              border: '1px solid #FF9500',
              '&:hover': { bgcolor: 'rgba(255, 149, 0, 0.1)' },
            }}
          >
            <RefreshIcon />
          </IconButton>
        </Box>
      )}

      {/* Controls overlay */}
      {showControls && (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            p: 2,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)',
            transition: 'opacity 0.3s',
          }}
        >
          {/* Status badge */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                bgcolor: isConnected ? '#22c55e' : isConnecting ? '#f59e0b' : '#ef4444',
                animation: isConnecting ? 'pulse 1.5s infinite' : 'none',
                '@keyframes pulse': {
                  '0%, 100%': { opacity: 1 },
                  '50%': { opacity: 0.5 },
                },
              }}
            />
            <Typography sx={{ color: '#fff', fontSize: 12, fontWeight: 500 }}>
              {isConnected ? 'Live' : isConnecting ? 'Connecting...' : 'Offline'}
            </Typography>
          </Box>

          {/* Action buttons */}
          <Box sx={{ display: 'flex', gap: 1 }}>
            <IconButton
              onClick={toggleFullscreen}
              size="small"
              sx={{
                color: '#fff',
                bgcolor: 'rgba(255,255,255,0.1)',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' },
              }}
            >
              {isFullscreen ? (
                <FullscreenExitIcon sx={{ fontSize: 20 }} />
              ) : (
                <FullscreenIcon sx={{ fontSize: 20 }} />
              )}
            </IconButton>
            <IconButton
              onClick={handleClose}
              size="small"
              sx={{
                color: '#fff',
                bgcolor: 'rgba(255,255,255,0.1)',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' },
              }}
            >
              <CloseIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Box>
        </Box>
      )}
    </Box>
  );

  // Fullscreen mode
  if (isFullscreen) {
    return (
      <FullscreenOverlay
        open={true}
        onClose={() => setIsFullscreen(false)}
        darkMode={darkMode}
        zIndex={10005}
        centeredX={true}
        centeredY={true}
      >
        <Box sx={{ width: '100vw', height: '100vh' }}>{videoContent}</Box>
      </FullscreenOverlay>
    );
  }

  return videoContent;
}

export interface CameraButtonProps {
  onClick: () => void;
  isActive?: boolean;
  darkMode?: boolean;
  disabled?: boolean;
}

/**
 * Camera button to toggle stream visibility
 */
export function CameraButton({
  onClick,
  isActive = false,
  darkMode = true,
  disabled = false,
}: CameraButtonProps) {
  return (
    <IconButton
      onClick={onClick}
      disabled={disabled}
      size="small"
      sx={{
        width: 32,
        height: 32,
        transition: 'all 0.2s ease',
        color: isActive ? '#fff' : 'primary.main',
        bgcolor: isActive ? 'primary.main' : 'transparent',
        border: '1px solid',
        borderColor: 'primary.main',
        '&:hover': {
          borderColor: 'primary.dark',
          bgcolor: isActive ? 'primary.dark' : 'rgba(255, 149, 0, 0.08)',
        },
        '&:disabled': {
          borderColor: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
          color: darkMode ? '#555' : '#bbb',
        },
      }}
    >
      {isActive ? (
        <VideocamIcon sx={{ fontSize: 20 }} />
      ) : (
        <VideocamOffIcon sx={{ fontSize: 20 }} />
      )}
    </IconButton>
  );
}
