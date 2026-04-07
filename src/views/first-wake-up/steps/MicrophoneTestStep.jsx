import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Typography, Button, LinearProgress } from '@mui/material';
import StepLayout from '../components/StepLayout';
import TroubleshootLayout from '../components/TroubleshootLayout';
import {
  troubleshootLinkSx,
  textSecondary as getTextSecondary,
  SUCCESS,
  ACCENT_GRADIENT,
} from '../theme';
import { useWebRTCStreamContext } from '../../../contexts/WebRTCStreamContext';
import useAudioAnalyser from '../../../hooks/media/useAudioAnalyser';
import FrequencyBars from '../components/FrequencyBars';
import useAppStore from '../../../store/useAppStore';
import sleepingReachy from '../../../assets/sleeping-reachy.svg';

const DETECTION_THRESHOLD = 0.45;
const DETECTION_DURATION_REQUIRED = 4;
const DETECTION_GRACE_PERIOD = 1;

function getMicTips(connectionMode) {
  const tips = [];
  if (connectionMode === 'usb') {
    tips.push('Check the PC audio input settings and select "Reachy Mini Audio"');
  }
  if (connectionMode === 'wifi') {
    tips.push('Make sure you are on the same network as the robot');
  }
  tips.push(
    'If running on Linux, you may need to configure audio permissions',
    'Update and reboot the robot',
    'If the issue persists, check the FAQ',
    'Still having issues? Write a message in the support channel on Discord'
  );
  return tips;
}

export default function MicrophoneTestStep({ darkMode, onNext }) {
  const { connectionMode } = useAppStore();
  const [showTroubleshoot, setShowTroubleshoot] = useState(false);

  const { audioTrack, isConnected } = useWebRTCStreamContext();

  const { level, isActive: isAnalyserActive } = useAudioAnalyser(audioTrack, {
    smoothingTimeConstant: 0.3,
    updateInterval: 40,
  });

  const [progress, setProgress] = useState(0);
  const [complete, setComplete] = useState(false);
  const textSecondary = getTextSecondary(darkMode);

  const accumulatedRef = useRef(0);
  const lastTickRef = useRef(null);

  const detected = level > DETECTION_THRESHOLD;

  useEffect(() => {
    if (complete) return;

    const now = Date.now() / 1000;

    if (detected) {
      if (lastTickRef.current != null) {
        accumulatedRef.current += now - lastTickRef.current;
      }
      lastTickRef.current = now;

      const p = Math.min(accumulatedRef.current / DETECTION_DURATION_REQUIRED, 1);
      setProgress(p);

      if (accumulatedRef.current >= DETECTION_DURATION_REQUIRED) {
        setComplete(true);
        setProgress(1);
        setTimeout(onNext, 800);
      }
    } else {
      if (lastTickRef.current != null) {
        const gap = now - lastTickRef.current;
        if (gap > DETECTION_GRACE_PERIOD) {
          accumulatedRef.current = 0;
          lastTickRef.current = null;
          setProgress(0);
        }
      }
    }
  }, [level, detected, complete, onNext]);

  const handleShowTroubleshoot = useCallback(() => setShowTroubleshoot(true), []);
  const handleBackToTest = useCallback(() => setShowTroubleshoot(false), []);

  if (showTroubleshoot) {
    return (
      <TroubleshootLayout
        darkMode={darkMode}
        title="Microphone problem"
        tips={getMicTips(connectionMode)}
        connectionMode={connectionMode}
        onBack={handleBackToTest}
      />
    );
  }

  return (
    <StepLayout
      darkMode={darkMode}
      illustration={sleepingReachy}
      title="Microphone Check"
      subtitle="Rub Reachy Mini's head gently or speak near it to test the microphone."
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
        <Box sx={{ width: '100%', maxWidth: 320 }}>
          <FrequencyBars level={level} isActive={isAnalyserActive} height={56} />
        </Box>

        <Typography sx={{ fontSize: 12, color: textSecondary, textAlign: 'center' }}>
          {!isConnected
            ? 'Connecting to microphone...'
            : complete
              ? ''
              : detected
                ? "Keep going! Don't stop..."
                : progress > 0
                  ? "Keep rubbing! Don't stop now..."
                  : 'Listening... make some noise near the robot'}
        </Typography>

        <Box sx={{ width: '100%', maxWidth: 320 }}>
          <LinearProgress
            variant="determinate"
            value={progress * 100}
            sx={{
              height: 6,
              borderRadius: 3,
              bgcolor: darkMode ? 'rgba(255,255,255,0.06)' : '#e2e8f0',
              '& .MuiLinearProgress-bar': {
                borderRadius: 3,
                background: complete ? SUCCESS : ACCENT_GRADIENT,
              },
            }}
          />
        </Box>

        {complete && (
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: SUCCESS }}>
            Microphone works! Moving on...
          </Typography>
        )}

        {!complete && (
          <Button onClick={handleShowTroubleshoot} sx={troubleshootLinkSx(darkMode)}>
            Sound doesn't work
          </Button>
        )}
      </Box>
    </StepLayout>
  );
}
