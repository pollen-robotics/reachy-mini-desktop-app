import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Box, Typography, Button, LinearProgress } from '@mui/material';
import StepLayout from '../components/StepLayout';
import TroubleshootLayout from '../components/TroubleshootLayout';
import {
  primaryButtonSx,
  dangerButtonSx,
  textSecondary as getTextSecondary,
  ACCENT,
  ACCENT_GRADIENT,
} from '../theme';
import useAppStore from '../../../store/useAppStore';
import reachyMicrophone from '../../../assets/reachy-microphone.svg';

function getMotorTips(connectionMode) {
  const tips = ['Check if the antennas are correctly plugged in (not inverted)'];
  if (connectionMode === 'wifi') {
    tips.push('Make sure you are on the same network as the robot');
  }
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

  const intervalRef = useRef(null);
  const delayRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearInterval(intervalRef.current);
      clearTimeout(delayRef.current);
    };
  }, []);

  const handlePlay = useCallback(async () => {
    setPlaying(true);
    setProgress(0);

    const start = Date.now();
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      setProgress(Math.min(elapsed / MOVE_DURATION, 1));
      if (elapsed >= MOVE_DURATION) clearInterval(intervalRef.current);
    }, PROGRESS_INTERVAL);

    try {
      await api.enableMotors();
      await new Promise(r => {
        delayRef.current = setTimeout(r, 300);
      });
      await api.playMove('wake_up');
      if (onRobotWoken) onRobotWoken();
      await new Promise(r => {
        delayRef.current = setTimeout(r, MOVE_DURATION);
      });
    } catch (err) {
      console.error('[MotorTest] Movement failed:', err);
    } finally {
      clearInterval(intervalRef.current);
      if (mountedRef.current) {
        setProgress(1);
        setPlaying(false);
        setHasPlayed(true);
      }
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
        onBack={handleBackToTest}
      />
    );
  }

  return (
    <StepLayout
      darkMode={darkMode}
      illustration={reachyMicrophone}
      title="Let Me Stretch!"
      subtitle={
        <>
          Time to wake up! I'll do a little stretch to make sure all my <b>motors</b> are working
          properly. <b>Stand back</b> and watch me move!
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
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
              <Button
                variant="outlined"
                onClick={handleShowTroubleshoot}
                sx={{ ...dangerButtonSx }}
              >
                Something went wrong
              </Button>
              <Button variant="outlined" onClick={onNext} sx={{ ...primaryButtonSx, px: 3, py: 1 }}>
                Looks good ✓
              </Button>
            </Box>

            <Button
              onClick={handlePlay}
              sx={{
                fontSize: 12,
                color: ACCENT,
                textTransform: 'none',
                fontWeight: 500,
                textDecoration: 'underline',
                '&:hover': { opacity: 0.8 },
              }}
            >
              Retry movement
            </Button>
          </Box>
        )}
      </Box>
    </StepLayout>
  );
}
