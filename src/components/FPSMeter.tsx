import React, { useState, useEffect, useRef } from 'react';
import { Box, Typography } from '@mui/material';
import useAppStore from '../store/useAppStore';

export interface FPSMeterProps {
  darkMode?: boolean;
}

/**
 * Simple FPS Meter component. Displays an FPS counter above the Reachy
 * status tag in the 3D viewer. Should be rendered inside `Viewer3D` with
 * `position: absolute`.
 */
export function FPSMeter({ darkMode = false }: FPSMeterProps): React.ReactElement {
  const [fps, setFps] = useState<number>(0);
  const frameCount = useRef<number>(0);
  const lastTime = useRef<number>(performance.now());
  const animationFrameId = useRef<number | null>(null);

  useEffect(() => {
    const measureFPS = (): void => {
      frameCount.current += 1;
      const currentTime = performance.now();
      const deltaTime = currentTime - lastTime.current;

      if (deltaTime >= 1000) {
        const currentFPS = Math.round((frameCount.current * 1000) / deltaTime);
        setFps(currentFPS);
        frameCount.current = 0;
        lastTime.current = currentTime;
      }

      animationFrameId.current = requestAnimationFrame(measureFPS);
    };

    animationFrameId.current = requestAnimationFrame(measureFPS);

    return () => {
      if (animationFrameId.current !== null) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, []);

  return (
    <Box
      sx={{
        px: 1.25,
        py: 0.75,
        borderRadius: '8px',
        bgcolor: darkMode ? 'rgba(26, 26, 26, 0.85)' : 'rgba(255, 255, 255, 0.85)',
        border: darkMode ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)',
        backdropFilter: 'blur(10px)',
        pointerEvents: 'none',
      }}
    >
      <Typography
        sx={{
          fontSize: 9,
          fontWeight: 500,
          color: darkMode ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.5)',
          fontFamily: 'SF Mono, Monaco, Menlo, monospace',
          letterSpacing: '0.02em',
          lineHeight: 1,
        }}
      >
        {fps} FPS
      </Typography>
    </Box>
  );
}

/** Wrapper that gets `darkMode` from the store, for backward compatibility. */
export default function FPSMeterWrapper(): React.ReactElement {
  const { darkMode } = useAppStore();
  return <FPSMeter darkMode={darkMode} />;
}
