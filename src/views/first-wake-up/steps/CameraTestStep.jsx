import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Typography, Button, keyframes } from '@mui/material';
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

function getCameraTips(connectionMode) {
  const tips = ['Make sure nothing is covering the camera lens'];
  if (connectionMode === 'wifi') {
    tips.push('Make sure you are on the same network as the robot');
  }
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

function StaticNoise({ width = 360, height = 270 }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const imageData = ctx.createImageData(w, h);
    const data = imageData.data;

    function draw() {
      for (let i = 0; i < data.length; i += 4) {
        const v = Math.random() * 255;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = 40;
      }
      ctx.putImageData(imageData, 0, 0);
      rafRef.current = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        borderRadius: '12px',
      }}
    />
  );
}

export default function CameraTestStep({ darkMode, onNext }) {
  const { connectionMode } = useAppStore();
  const { stream, isConnected } = useWebRTCStreamContext();

  const videoRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [showTroubleshoot, setShowTroubleshoot] = useState(false);
  const textSecondary = getTextSecondary(darkMode);

  const videoCallbackRef = useCallback(
    node => {
      videoRef.current = node;
      if (node && stream) {
        node.srcObject = stream;
        node.play().catch(() => {});
      }
    },
    [stream]
  );

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
        onBack={handleBackToTest}
      />
    );
  }

  return (
    <StepLayout
      darkMode={darkMode}
      illustration={null}
      title="Let Me See!"
      subtitle={
        <>
          Almost done! Let's check if my <b>camera</b> is working. You should see a <b>live feed</b>{' '}
          from my point of view below.
        </>
      }
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
            position: 'relative',
            width: '100%',
            maxWidth: 360,
            aspectRatio: '4/3',
            borderRadius: '12px',
            overflow: 'hidden',
            bgcolor: darkMode ? '#111' : '#1a1a1a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {!ready && <StaticNoise />}

          {!ready && (
            <Typography
              sx={{
                position: 'relative',
                zIndex: 1,
                color: 'rgba(255,255,255,0.7)',
                fontSize: 13,
                fontWeight: 500,
                textAlign: 'center',
                px: 2,
              }}
            >
              {error ? 'No signal' : 'Connecting...'}
            </Typography>
          )}

          <Box
            component="video"
            ref={videoCallbackRef}
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
