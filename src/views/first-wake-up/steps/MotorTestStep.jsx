import React, { useState, useCallback } from 'react';
import { Box, Typography, Button, LinearProgress } from '@mui/material';
import StepLayout from '../components/StepLayout';
import TroubleshootLayout from '../components/TroubleshootLayout';
import {
  primaryButtonSx,
  successButtonSx,
  troubleshootLinkSx,
  textSecondary as getTextSecondary,
  ACCENT_GRADIENT,
} from '../theme';
import useAppStore from '../../../store/useAppStore';
import reachyBuste from '../../../assets/reachy-buste.svg';

function getMotorTips(connectionMode) {
  const tips = ['Check if the antennas are correctly plugged in (not inverted)'];
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

const MOVE_DURATION = 2500;
const PROGRESS_INTERVAL = 50;

export default function MotorTestStep({ darkMode, api, onNext, onRobotWoken }) {
  const { connectionMode } = useAppStore();
  const [playing, setPlaying] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showTroubleshoot, setShowTroubleshoot] = useState(false);
  const textSecondary = getTextSecondary(darkMode);

  const handlePlay = useCallback(async () => {
    setPlaying(true);
    setProgress(0);

    const start = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - start;
      setProgress(Math.min(elapsed / MOVE_DURATION, 1));
      if (elapsed >= MOVE_DURATION) clearInterval(timer);
    }, PROGRESS_INTERVAL);

    try {
      await api.enableMotors();
      await new Promise(r => setTimeout(r, 300));
      await api.playMove('wake_up');
      if (onRobotWoken) onRobotWoken();
      await new Promise(r => setTimeout(r, MOVE_DURATION));
    } catch (err) {
      console.error('[MotorTest] Movement failed:', err);
    } finally {
      clearInterval(timer);
      setProgress(1);
      setPlaying(false);
      setHasPlayed(true);
    }
  }, [api, onRobotWoken]);

  const handleShowTroubleshoot = useCallback(() => setShowTroubleshoot(true), []);
  const handleBackToTest = useCallback(() => setShowTroubleshoot(false), []);

  if (showTroubleshoot) {
    return (
      <TroubleshootLayout
        darkMode={darkMode}
        title="Motors problem"
        tips={getMotorTips(connectionMode)}
        connectionMode={connectionMode}
        onBack={handleBackToTest}
      />
    );
  }

  return (
    <StepLayout
      darkMode={darkMode}
      illustration={reachyBuste}
      title="Stretch Time!"
      subtitle="We'll play a quick movement to check the motors."
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
        {!playing && !hasPlayed && (
          <Button variant="outlined" onClick={handlePlay} sx={primaryButtonSx}>
            Start movement
          </Button>
        )}

        {playing && (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 1.5,
              width: '100%',
              maxWidth: 280,
            }}
          >
            <Typography sx={{ fontSize: 12, color: textSecondary }}>Robot is moving...</Typography>
            <LinearProgress
              variant="determinate"
              value={progress * 100}
              sx={{
                width: '100%',
                height: 4,
                borderRadius: 2,
                bgcolor: darkMode ? 'rgba(255,255,255,0.06)' : '#e2e8f0',
                '& .MuiLinearProgress-bar': {
                  borderRadius: 2,
                  background: ACCENT_GRADIENT,
                },
              }}
            />
          </Box>
        )}

        {!playing && hasPlayed && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
            <Typography sx={{ fontSize: 13, color: textSecondary, textAlign: 'center' }}>
              Did the robot move correctly?
            </Typography>

            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <Button variant="outlined" onClick={onNext} sx={successButtonSx}>
                Yes ✓
              </Button>
              <Button
                variant="outlined"
                onClick={handlePlay}
                sx={{ ...primaryButtonSx, px: 3, py: 1 }}
              >
                Retry
              </Button>
            </Box>

            <Button onClick={handleShowTroubleshoot} sx={troubleshootLinkSx(darkMode)}>
              Something went wrong
            </Button>
          </Box>
        )}
      </Box>
    </StepLayout>
  );
}
