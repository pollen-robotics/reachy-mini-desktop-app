import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Typography, Button, CircularProgress, keyframes } from '@mui/material';
import StepLayout from '../components/StepLayout';
import TroubleshootLayout from '../components/TroubleshootLayout';
import {
  primaryButtonSx,
  troubleshootLinkSx,
  textSecondary as getTextSecondary,
  ACCENT,
} from '../theme';
import { useWebRTCStreamContext } from '../../../contexts/WebRTCStreamContext';
import useAppStore from '../../../store/useAppStore';
import reachyMicrophone from '../../../assets/reachy-microphone.svg';

function getCameraTips(connectionMode) {
  const tips = ['Make sure nothing is covering the camera lens'];
  if (connectionMode === 'wifi') {
    tips.push('Make sure you are on the same network as the robot');
  }
  tips.push(
    'Update and reboot the robot',
    'If the issue persists, check the FAQ',
    'Still having issues? Write a message in the support channel on Discord'
  );
  return tips;
}

const eyeOpen = keyframes`
  0%   { clip-path: ellipse(100% 0% at 50% 50%); }
  100% { clip-path: ellipse(100% 50% at 50% 50%); }
`;

const eyeBlink = keyframes`
  0%, 100% { clip-path: ellipse(100% 50% at 50% 50%); }
  50%       { clip-path: ellipse(100% 5% at 50% 50%); }
`;

export default function CameraTestStep({ darkMode, onNext }) {
  const { connectionMode } = useAppStore();
  const { stream, isConnected } = useWebRTCStreamContext();

  const videoRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [showTroubleshoot, setShowTroubleshoot] = useState(false);
  const textSecondary = getTextSecondary(darkMode);

  useEffect(() => {
    if (!videoRef.current || !stream) return;
    videoRef.current.srcObject = stream;
    videoRef.current.play().catch(() => {});
  }, [stream]);

  useEffect(() => {
    if (isConnected && stream) {
      const tracks = stream.getVideoTracks();
      if (tracks.length > 0) {
        setReady(true);
        setError(false);
        return;
      }
    }
    if (!isConnected && !stream) return;
    const timeout = setTimeout(() => {
      if (!ready) setError(true);
    }, 12000);
    return () => clearTimeout(timeout);
  }, [isConnected, stream, ready]);

  const handleShowTroubleshoot = useCallback(() => setShowTroubleshoot(true), []);
  const handleBackToTest = useCallback(() => setShowTroubleshoot(false), []);

  if (showTroubleshoot) {
    return (
      <TroubleshootLayout
        darkMode={darkMode}
        title="Camera problem"
        tips={getCameraTips(connectionMode)}
        connectionMode={connectionMode}
        onBack={handleBackToTest}
      />
    );
  }

  return (
    <StepLayout
      darkMode={darkMode}
      illustration={reachyMicrophone}
      title="Let's Look Around!"
      subtitle="Check if you can see the camera feed below."
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
          width: '100%',
        }}
      >
        <Box
          sx={{
            width: '100%',
            maxWidth: 360,
            aspectRatio: '4/3',
            borderRadius: '12px',
            overflow: 'hidden',
            bgcolor: darkMode ? '#1a1a1a' : '#f0f0f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid',
            borderColor: darkMode ? 'rgba(255,255,255,0.08)' : '#e2e8f0',
          }}
        >
          {!ready && !error && <CircularProgress size={32} sx={{ color: ACCENT }} />}
          {error && (
            <Typography sx={{ color: '#888', fontSize: 13 }}>Camera feed not available</Typography>
          )}
          <Box
            component="video"
            ref={videoRef}
            autoPlay
            playsInline
            muted
            sx={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: ready ? 'block' : 'none',
              animation: ready
                ? `${eyeOpen} 1s ease-out forwards, ${eyeBlink} 0.25s ease-in-out 1.2s, ${eyeBlink} 0.25s ease-in-out 1.5s, ${eyeBlink} 0.3s ease-in-out 2.3s`
                : 'none',
              animationFillMode: 'forwards',
              clipPath: 'ellipse(100% 0% at 50% 50%)',
            }}
          />
        </Box>

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Button onClick={handleShowTroubleshoot} sx={troubleshootLinkSx(darkMode)}>
            Camera doesn't work
          </Button>

          <Button
            variant="outlined"
            onClick={onNext}
            disabled={!ready}
            sx={{ ...primaryButtonSx, px: 3, py: 1 }}
          >
            Camera works ✓
          </Button>
        </Box>
      </Box>
    </StepLayout>
  );
}
