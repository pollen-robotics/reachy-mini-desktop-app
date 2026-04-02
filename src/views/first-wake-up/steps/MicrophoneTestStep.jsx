import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Typography, Button, LinearProgress } from '@mui/material';
import StepLayout from '../components/StepLayout';
import AudioWaveform from '../components/AudioWaveform';

const TOUCH_THRESHOLD = 10;
const TOUCH_DURATION_REQUIRED = 1.5;
const TOUCH_GRACE_PERIOD = 0.4;

export default function MicrophoneTestStep({ darkMode, api, onNext, onBack }) {
  const [audioLevel, setAudioLevel] = useState(0);
  const [touchProgress, setTouchProgress] = useState(0);
  const [touchDetected, setTouchDetected] = useState(false);
  const textSecondary = darkMode ? '#888' : '#64748b';

  const accumulatedRef = useRef(0);
  const lastAboveRef = useRef(null);

  const handleAudioLevel = useCallback(
    level => {
      const scaledLevel = level * 100;
      setAudioLevel(scaledLevel);

      if (touchDetected) return;

      const now = Date.now() / 1000;

      if (scaledLevel > TOUCH_THRESHOLD) {
        if (lastAboveRef.current != null) {
          accumulatedRef.current += now - lastAboveRef.current;
        }
        lastAboveRef.current = now;

        const progress = Math.min(accumulatedRef.current / TOUCH_DURATION_REQUIRED, 1);
        setTouchProgress(progress);

        if (accumulatedRef.current >= TOUCH_DURATION_REQUIRED) {
          setTouchDetected(true);
          setTouchProgress(1);
          api.stopAudioPolling();
          setTimeout(onNext, 800);
        }
      } else {
        if (lastAboveRef.current != null) {
          const breakDuration = now - lastAboveRef.current;
          if (breakDuration > TOUCH_GRACE_PERIOD) {
            accumulatedRef.current = 0;
            lastAboveRef.current = null;
            setTouchProgress(0);
          }
        }
      }
    },
    [touchDetected, api, onNext]
  );

  useEffect(() => {
    api.startAudioPolling(handleAudioLevel);
    return () => api.stopAudioPolling();
  }, [api, handleAudioLevel]);

  const handleSkip = useCallback(() => {
    api.stopAudioPolling();
    onNext();
  }, [api, onNext]);

  return (
    <StepLayout
      darkMode={darkMode}
      icon="🎤"
      title="Time to Wake Up!"
      subtitle="Rub Reachy Mini's head gently to wake it up. The microphone will detect the touch."
      stepNumber={2}
      onBack={onBack}
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
        <AudioWaveform audioLevel={audioLevel} darkMode={darkMode} />

        {/* Touch progress bar */}
        <Box sx={{ width: '100%', maxWidth: 320 }}>
          <LinearProgress
            variant="determinate"
            value={touchProgress * 100}
            sx={{
              height: 6,
              borderRadius: 3,
              bgcolor: darkMode ? 'rgba(255,255,255,0.06)' : '#e2e8f0',
              '& .MuiLinearProgress-bar': {
                borderRadius: 3,
                background: touchDetected ? '#22c55e' : 'linear-gradient(90deg, #FFC107, #FF9500)',
              },
            }}
          />
        </Box>

        {touchDetected && (
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#22c55e' }}>
            Touch detected! Moving on...
          </Typography>
        )}

        {!touchDetected && (
          <Button
            onClick={handleSkip}
            sx={{
              fontSize: 12,
              color: textSecondary,
              textTransform: 'none',
              textDecoration: 'underline',
              '&:hover': { color: '#FF9500' },
            }}
          >
            Sound doesn't work - skip
          </Button>
        )}
      </Box>
    </StepLayout>
  );
}
