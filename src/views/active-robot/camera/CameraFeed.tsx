import React, { useRef, useEffect } from 'react';
import { Box, Typography, CircularProgress, Button } from '@mui/material';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { STATUS, whiteAlpha, blackAlpha } from '@styles/tokens';
import { DURATION, RADIUS, TYPO, transition, useAppPalette } from '@styles';
import { useWebRTCStreamContext, StreamState } from '../../../contexts/WebRTCStreamContext';

export interface CameraFeedProps {
  isLarge?: boolean;
  width?: number | string;
  height?: number | string;
}

/**
 * CameraFeed Component - Displays camera stream when available
 * Uses shared WebRTC connection from context (avoids duplicate connections)
 */
export default function CameraFeed({ isLarge = false }: CameraFeedProps): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const palette = useAppPalette();

  // Get shared WebRTC stream from context
  const {
    state,
    stream,
    isConnected,
    isConnecting,
    isWebRTCAvailable,
    checkFailed,
    isRobotAwake,
    error,
    connect,
    openExternalViewer,
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

  // Theme-aware placeholder palette. Background and border are fully opaque
  // so the placeholder doesn't bleed through the parent viewport panel.
  // TODO(style-migration): opaque placeholder bg/border tints don't map to palette.surface* (alpha-based).
  const placeholderBg = palette.isDark ? '#1a1a1a' : '#e8e8e8';
  const placeholderBorder = palette.isDark ? '#2a2a2a' : '#d8d8d8';
  const iconColorMuted = palette.isDark ? whiteAlpha(0.3) : blackAlpha(0.3);
  const textColorMuted = palette.isDark ? whiteAlpha(0.4) : blackAlpha(0.4);
  const hoverBg = palette.isDark ? whiteAlpha(0.05) : blackAlpha(0.04);
  // Neutral, theme-aware spinner color - matches the rest of the app
  // (Viewer3D LoadingSpinner, LogConsole Simple/Dev transition, etc.)
  const spinnerColor = palette.isDark ? whiteAlpha(0.45) : blackAlpha(0.35);
  const errorIconColor = `${STATUS.error}99`;
  const errorTextColor = `${STATUS.error}b3`;
  const canOpenExternalViewer = error === 'WebRTC is not supported by this desktop WebView';
  const unavailableLabel =
    !isLarge && canOpenExternalViewer ? 'Open in browser' : 'Stream not available';

  // Common placeholder box style
  const placeholderStyle = {
    position: 'relative',
    width: '100%',
    height: '100%',
    borderRadius: isLarge ? RADIUS.xxl : RADIUS.xl,
    overflow: 'hidden',
    border: isLarge ? 'none' : `1px solid ${placeholderBorder}`,
    bgcolor: placeholderBg,
  } as const;

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
              color: iconColorMuted,
            }}
          />
          <Typography
            sx={{
              fontSize: isLarge ? TYPO.sm : TYPO.micro,
              color: textColorMuted,
              fontFamily: 'SF Mono, Monaco, Menlo, monospace',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            {unavailableLabel}
          </Typography>
          {error && isLarge && (
            <Typography
              sx={{
                maxWidth: '85%',
                fontSize: isLarge ? TYPO.xs : '9px',
                color: textColorMuted,
                fontFamily: 'SF Mono, Monaco, Menlo, monospace',
                textAlign: 'center',
                wordBreak: 'break-word',
              }}
            >
              {error}
            </Typography>
          )}
          {canOpenExternalViewer && (
            <Button
              size="small"
              variant="outlined"
              startIcon={isLarge ? <OpenInNewIcon /> : undefined}
              onClick={openExternalViewer}
              sx={{
                mt: isLarge ? 1 : 0.25,
                minWidth: 0,
                px: isLarge ? 1.5 : 0.75,
                py: isLarge ? 0.375 : 0.25,
                color: textColorMuted,
                borderColor: iconColorMuted,
                fontSize: isLarge ? TYPO.xs : '9px',
                fontFamily: 'SF Mono, Monaco, Menlo, monospace',
                textTransform: 'uppercase',
                '&:hover': {
                  borderColor: textColorMuted,
                  bgcolor: hoverBg,
                },
              }}
            >
              {isLarge ? 'Open in browser' : 'Open'}
            </Button>
          )}
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
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <CircularProgress size={isLarge ? 32 : 20} thickness={3} sx={{ color: spinnerColor }} />
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
              color: iconColorMuted,
            }}
          />
          <Typography
            sx={{
              fontSize: isLarge ? TYPO.sm : TYPO.micro,
              color: textColorMuted,
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
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <CircularProgress size={isLarge ? 32 : 20} thickness={3} sx={{ color: spinnerColor }} />
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
            transition: transition('background', DURATION.base),
            '&:hover': {
              bgcolor: hoverBg,
            },
          }}
          onClick={connect}
        >
          <VideocamOffIcon
            sx={{
              fontSize: isLarge ? 48 : 28,
              color: state === StreamState.ERROR ? errorIconColor : iconColorMuted,
            }}
          />
          <Typography
            sx={{
              fontSize: isLarge ? TYPO.sm : TYPO.micro,
              color: state === StreamState.ERROR ? errorTextColor : textColorMuted,
              fontFamily: 'SF Mono, Monaco, Menlo, monospace',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            {state === StreamState.ERROR ? 'Connection failed' : 'Click to connect'}
          </Typography>
          {state === StreamState.ERROR && error && (
            <Typography
              sx={{
                maxWidth: '85%',
                fontSize: isLarge ? TYPO.xs : '9px',
                color: errorTextColor,
                fontFamily: 'SF Mono, Monaco, Menlo, monospace',
                textAlign: 'center',
                wordBreak: 'break-word',
                textTransform: 'none',
              }}
            >
              {error}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}
