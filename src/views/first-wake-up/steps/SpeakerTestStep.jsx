import React, { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Button, Slider } from '@mui/material';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import StepLayout from '../components/StepLayout';
import TroubleshootLayout from '../components/TroubleshootLayout';
import {
  primaryButtonSx,
  dangerButtonSx,
  textSecondary as getTextSecondary,
  ACCENT,
} from '../theme';
import useAppStore from '../../../store/useAppStore';
import reachyMicrophone from '../../../assets/reachy-microphone.svg';

function getSpeakerTips(connectionMode) {
  const tips = ['Check if the volume is high enough (under 50% the sound is barely audible)'];
  if (connectionMode === 'usb') {
    tips.push('Check the PC audio output settings and select "Reachy Mini Audio"');
  }
  if (connectionMode === 'wifi') {
    tips.push('Make sure you are on the same network as the robot');
  }
  return tips;
}

function VolumeSlider({ volume, onChange, onChangeCommitted, darkMode }) {
  const textSecondary = getTextSecondary(darkMode);

  return (
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
        onChange={onChange}
        onChangeCommitted={onChangeCommitted}
        min={0}
        max={100}
        sx={{
          color: ACCENT,
          height: 4,
          '& .MuiSlider-thumb': { width: 16, height: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.2)' },
        }}
      />
      <Typography sx={{ fontSize: 13, fontWeight: 600, color: textSecondary, minWidth: 36 }}>
        {volume}%
      </Typography>
    </Box>
  );
}

export default function SpeakerTestStep({ darkMode, api, onNext }) {
  const { connectionMode } = useAppStore();
  const [volume, setVolume] = useState(50);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [showTroubleshoot, setShowTroubleshoot] = useState(false);
  const textSecondary = getTextSecondary(darkMode);

  useEffect(() => {
    api.getVolume().then(v => setVolume(Math.round(v)));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleVolumeChange = useCallback((_, value) => {
    setVolume(value);
  }, []);

  const handleVolumeCommit = useCallback(
    (_, value) => {
      api.setVolume(value);
    },
    [api]
  );

  const handlePlay = useCallback(async () => {
    setIsPlaying(true);
    try {
      await api.playTestSound();
    } catch {
      // Error already logged in API hook
    } finally {
      setIsPlaying(false);
      setHasPlayed(true);
    }
  }, [api]);

  const handleShowTroubleshoot = useCallback(() => setShowTroubleshoot(true), []);
  const handleBackToTest = useCallback(() => setShowTroubleshoot(false), []);

  if (showTroubleshoot) {
    return (
      <TroubleshootLayout
        darkMode={darkMode}
        title="Speaker problem"
        tips={getSpeakerTips(connectionMode)}
        onBack={handleBackToTest}
      />
    );
  }

  return (
    <StepLayout
      darkMode={darkMode}
      illustration={reachyMicrophone}
      title="Can You Hear Me?"
      subtitle={
        <>
          I'd love to chat with you! <b>Adjust my volume</b> and <b>play a test sound</b> to make
          sure you can hear me loud and clear.
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
        <VolumeSlider
          volume={volume}
          onChange={handleVolumeChange}
          onChangeCommitted={handleVolumeCommit}
          darkMode={darkMode}
        />

        {isPlaying && (
          <Typography sx={{ fontSize: 13, color: textSecondary }}>Playing sound...</Typography>
        )}

        {!isPlaying && !hasPlayed && (
          <Button variant="outlined" onClick={handlePlay} sx={{ ...primaryButtonSx, px: 3, py: 1 }}>
            Play Sound
          </Button>
        )}

        {!isPlaying && hasPlayed && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
              <Button
                variant="outlined"
                onClick={handleShowTroubleshoot}
                sx={{ ...dangerButtonSx }}
              >
                I don't hear it
              </Button>
              <Button variant="outlined" onClick={onNext} sx={{ ...primaryButtonSx, px: 3, py: 1 }}>
                I hear the sound ✓
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
              Replay sound
            </Button>
          </Box>
        )}
      </Box>
    </StepLayout>
  );
}
