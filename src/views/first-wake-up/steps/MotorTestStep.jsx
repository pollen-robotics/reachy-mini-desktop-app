import React, { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Button, CircularProgress } from '@mui/material';
import StepLayout from '../components/StepLayout';

export default function MotorTestStep({ darkMode, api, onNext, onBack }) {
  const [playing, setPlaying] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const textSecondary = darkMode ? '#888' : '#64748b';

  // Auto-play on mount
  useEffect(() => {
    let cancelled = false;

    const autoPlay = async () => {
      setPlaying(true);
      try {
        await api.enableMotors();
        await new Promise(r => setTimeout(r, 300));
        const result = await api.playMove('wake_up');

        if (result?.uuid && !cancelled) {
          // Wait for movement to complete (estimate ~5s)
          await new Promise(r => setTimeout(r, 5000));
        }
      } catch (err) {
        console.error('[MotorTest] Movement failed:', err);
      } finally {
        if (!cancelled) {
          setPlaying(false);
          setHasPlayed(true);
        }
      }
    };

    autoPlay();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const handleReplay = useCallback(async () => {
    setPlaying(true);
    try {
      await api.gotoSleep();
      await new Promise(r => setTimeout(r, 500));
      await api.enableMotors();
      await new Promise(r => setTimeout(r, 300));
      await api.playMove('wake_up');
      await new Promise(r => setTimeout(r, 5000));
    } catch (err) {
      console.error('[MotorTest] Replay failed:', err);
    } finally {
      setPlaying(false);
    }
  }, [api]);

  return (
    <StepLayout
      darkMode={darkMode}
      icon="🤸"
      title="Stretch Time!"
      subtitle="Watch the robot perform a movement to verify the motors are working."
      stepNumber={3}
      onBack={onBack}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        {playing && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 3 }}>
            <CircularProgress size={24} sx={{ color: '#FF9500' }} />
            <Typography
              sx={{ fontSize: 14, fontWeight: 500, color: darkMode ? '#ccc' : '#475569' }}
            >
              Robot is moving...
            </Typography>
          </Box>
        )}

        {!playing && hasPlayed && (
          <Typography
            sx={{
              fontSize: 13,
              color: textSecondary,
              textAlign: 'center',
              mb: 1,
            }}
          >
            Did the robot move correctly?
          </Typography>
        )}

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
          {hasPlayed && !playing && (
            <>
              <Button
                onClick={handleReplay}
                sx={{
                  fontSize: 12,
                  color: '#FF9500',
                  textTransform: 'none',
                  fontWeight: 500,
                  '&:hover': { textDecoration: 'underline' },
                }}
              >
                Replay Movement
              </Button>

              <Button
                variant="contained"
                onClick={onNext}
                disableElevation
                sx={{
                  px: 3,
                  py: 1,
                  borderRadius: '8px',
                  fontSize: 13,
                  fontWeight: 600,
                  textTransform: 'none',
                  background: 'linear-gradient(135deg, #FF9500, #FFB333)',
                  '&:hover': {
                    background: 'linear-gradient(135deg, #FFB333, #FFCC66)',
                  },
                }}
              >
                Robot did the same ✓
              </Button>
            </>
          )}
        </Box>

        {hasPlayed && !playing && (
          <Button
            onClick={onNext}
            sx={{
              fontSize: 12,
              color: textSecondary,
              textTransform: 'none',
              textDecoration: 'underline',
              '&:hover': { color: '#FF9500' },
            }}
          >
            Robot didn't move correctly - skip
          </Button>
        )}
      </Box>
    </StepLayout>
  );
}
