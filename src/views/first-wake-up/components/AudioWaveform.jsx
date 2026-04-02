import React, { useRef, useEffect, useMemo } from 'react';
import { Box } from '@mui/material';

const BAR_COUNT = 40;
const MAX_HEIGHT = 80;
const MIN_HEIGHT = 4;

/**
 * Real-time audio waveform visualization.
 * Renders a series of bars whose heights respond to the audio level.
 */
export default function AudioWaveform({ audioLevel = 0, darkMode, height = 100 }) {
  const barsRef = useRef([]);

  useEffect(() => {
    const baseLevel = Math.min(audioLevel / 100, 1);

    barsRef.current.forEach((bar, index) => {
      if (!bar) return;
      const position = index / BAR_COUNT;
      const centerDistance = Math.abs(position - 0.5) * 2;
      const envelope = 1 - centerDistance * centerDistance;
      const randomness = Math.random() * 0.4 + 0.8;
      const h = MIN_HEIGHT + (MAX_HEIGHT - MIN_HEIGHT) * baseLevel * envelope * randomness;
      bar.style.height = `${h}px`;
    });
  }, [audioLevel]);

  const bars = useMemo(
    () =>
      Array.from({ length: BAR_COUNT }, (_, i) => (
        <Box
          key={i}
          ref={el => {
            barsRef.current[i] = el;
          }}
          sx={{
            flex: 1,
            maxWidth: 6,
            minHeight: `${MIN_HEIGHT}px`,
            borderRadius: '3px',
            backgroundColor: '#FF9500',
            transition: 'height 0.08s ease',
          }}
        />
      )),
    []
  );

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '2px',
        height,
        width: '100%',
        px: 2,
        py: 2,
        bgcolor: darkMode ? 'rgba(255,255,255,0.03)' : '#f8fafc',
        borderRadius: '10px',
        border: '1px solid',
        borderColor: darkMode ? 'rgba(255,255,255,0.06)' : '#e2e8f0',
      }}
    >
      {bars}
    </Box>
  );
}
