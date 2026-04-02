import React, { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Button, Slider } from '@mui/material';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import StepLayout from '../components/StepLayout';

export default function SpeakerTestStep({ darkMode, api, onNext, onBack }) {
  const [volume, setVolume] = useState(50);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const textSecondary = darkMode ? '#888' : '#64748b';

  // Fetch initial volume
  useEffect(() => {
    api.getVolume().then(v => setVolume(Math.round(v * 100)));
  }, [api]);

  // Auto-play sound on mount
  useEffect(() => {
    let cancelled = false;
    const autoPlay = async () => {
      setIsPlaying(true);
      try {
        await api.playTestSound();
        await new Promise(r => setTimeout(r, 3000));
      } finally {
        if (!cancelled) {
          setIsPlaying(false);
          setHasPlayed(true);
        }
      }
    };
    autoPlay();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const handleVolumeChange = useCallback(
    (_, value) => {
      setVolume(value);
      api.setVolume(value / 100);
    },
    [api]
  );

  const handleReplay = useCallback(async () => {
    setIsPlaying(true);
    try {
      await api.playTestSound();
      await new Promise(r => setTimeout(r, 3000));
    } finally {
      setIsPlaying(false);
    }
  }, [api]);

  return (
    <StepLayout
      darkMode={darkMode}
      icon="🔊"
      title="Can You Hear Me?"
      subtitle="Listen to the robot's sound and adjust the volume."
      stepNumber={4}
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
        {/* Volume slider */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            width: '100%',
            maxWidth: 320,
            px: 2,
            py: 1.5,
            bgcolor: darkMode ? 'rgba(255,255,255,0.03)' : '#f8fafc',
            borderRadius: '10px',
            border: '1px solid',
            borderColor: darkMode ? 'rgba(255,255,255,0.06)' : '#e2e8f0',
          }}
        >
          <VolumeUpIcon sx={{ color: textSecondary, fontSize: 20 }} />
          <Slider
            value={volume}
            onChange={handleVolumeChange}
            min={0}
            max={100}
            sx={{
              color: '#FF9500',
              height: 4,
              '& .MuiSlider-thumb': {
                width: 16,
                height: 16,
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              },
            }}
          />
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: textSecondary, minWidth: 36 }}>
            {volume}%
          </Typography>
        </Box>

        {isPlaying && (
          <Typography sx={{ fontSize: 13, color: textSecondary }}>Playing sound...</Typography>
        )}

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
          {hasPlayed && !isPlaying && (
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
                Replay Sound
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
                I hear the sound ✓
              </Button>
            </>
          )}
        </Box>

        {hasPlayed && !isPlaying && (
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
            No sound - skip
          </Button>
        )}
      </Box>
    </StepLayout>
  );
}
