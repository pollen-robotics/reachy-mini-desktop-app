import React, { useEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';

export interface AudioLevelBarsProps {
  isActive: boolean;
  color?: string;
  externalLevel: number | null;
  barCount?: number;
}

interface Dimensions {
  width: number;
  height: number;
}

/**
 * Audio Waveform Visualizer - Real audio only (no simulation)
 * Displays a scrolling waveform from real WebRTC audio data.
 */
export default function AudioLevelBars({
  isActive,
  color = '#FF9500',
  externalLevel,
}: AudioLevelBarsProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const waveformRef = useRef<number[]>([]);
  const isMountedRef = useRef<boolean>(true);
  const lastUpdateTimeRef = useRef<number>(0);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const [dimensions, setDimensions] = useState<Dimensions>({ width: 191, height: 28 });

  const maxHistoryLength = 60;
  const updateInterval = 50; // Update every 50ms (20 Hz)

  // Update dimensions from container
  useEffect(() => {
    const updateDimensions = (): void => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          setDimensions({ width: rect.width, height: rect.height });
        }
      }
    };

    updateDimensions();
    const resizeObserver = new ResizeObserver(updateDimensions);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    return () => resizeObserver.disconnect();
  }, []);

  // Initialize canvas with responsive dimensions
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || dimensions.width === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const scaledWidth = dimensions.width * dpr;
    const scaledHeight = dimensions.height * dpr;

    canvas.width = scaledWidth;
    canvas.height = scaledHeight;
    canvas.style.width = `${dimensions.width}px`;
    canvas.style.height = `${dimensions.height}px`;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (dpr !== 1) {
        ctx.scale(dpr, dpr);
      }
      ctxRef.current = ctx;
    }
  }, [dimensions]);

  // Initialize waveform history
  useEffect(() => {
    if (waveformRef.current.length === 0) {
      waveformRef.current = Array(maxHistoryLength).fill(0);
    }
    lastUpdateTimeRef.current = performance.now();
  }, []);

  // Main drawing function
  useEffect(() => {
    if (dimensions.width === 0 || !ctxRef.current) return;

    isMountedRef.current = true;
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;

    if (!canvas || !ctx) return;

    const draw = (currentTime: number): void => {
      if (!isMountedRef.current || dimensions.width === 0) return;

      ctx.clearRect(0, 0, dimensions.width, dimensions.height);

      if (isActive && externalLevel !== null && typeof externalLevel === 'number') {
        // Frame-rate independent: Update based on elapsed time
        const elapsed = currentTime - lastUpdateTimeRef.current;

        if (elapsed >= updateInterval) {
          // Use real audio level with slight smoothing
          const smoothedLevel = Math.max(0.05, Math.min(0.95, externalLevel));

          // Add to history (shift array)
          waveformRef.current.push(smoothedLevel);
          if (waveformRef.current.length > maxHistoryLength) {
            waveformRef.current.shift();
          }

          lastUpdateTimeRef.current = currentTime;
        }

        // Draw waveform
        const usableWidth = dimensions.width;
        const usableHeight = dimensions.height;
        const waveformLength = waveformRef.current.length;

        if (waveformLength > 0 && usableWidth > 0 && usableHeight > 0) {
          const stepX = usableWidth / (waveformLength - 1);
          const heightMultiplier = usableHeight * 0.8;
          const heightOffset = usableHeight * 0.1;

          // Set context properties
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          // Draw waveform path
          const waveformPath = new Path2D();
          const yPositions: number[] = [];
          for (let index = 0; index < waveformLength; index++) {
            const value = waveformRef.current[index];
            const x = index * stepX;
            const y = usableHeight - value * heightMultiplier - heightOffset;
            yPositions.push(y);

            if (index === 0) {
              waveformPath.moveTo(x, y);
            } else {
              waveformPath.lineTo(x, y);
            }
          }
          ctx.stroke(waveformPath);

          // Add gradient fill below the waveform
          const avgY = yPositions.reduce((sum, y) => sum + y, 0) / yPositions.length;
          const gradient = ctx.createLinearGradient(0, avgY, 0, usableHeight);

          // Extract RGB from color
          const colorMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
          if (colorMatch) {
            const [, r, g, b] = colorMatch;
            gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.12)`);
            gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 0.08)`);
            gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.06)`);
          } else {
            // Fallback for hex colors
            const hex = color.replace('#', '');
            const r = parseInt(hex.substring(0, 2), 16);
            const g = parseInt(hex.substring(2, 4), 16);
            const b = parseInt(hex.substring(4, 6), 16);
            gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.12)`);
            gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 0.08)`);
            gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.06)`);
          }

          // Fill below waveform
          const fillPath = new Path2D(waveformPath);
          fillPath.lineTo(usableWidth, usableHeight);
          fillPath.lineTo(0, usableHeight);
          fillPath.closePath();
          ctx.fillStyle = gradient;
          ctx.fill(fillPath);

          // Draw current level indicator (dot at end)
          const currentValue = waveformRef.current[waveformLength - 1];
          const currentX = usableWidth;
          const currentY = usableHeight - currentValue * heightMultiplier - heightOffset;

          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(currentX, currentY, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // Reset waveform when inactive or no data
        waveformRef.current = Array(maxHistoryLength).fill(0);
        lastUpdateTimeRef.current = performance.now();
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    animationRef.current = requestAnimationFrame(draw);

    return () => {
      isMountedRef.current = false;
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isActive, color, dimensions, externalLevel]);

  return (
    <Box
      ref={containerRef}
      sx={{
        width: '100%',
        height: '28px',
        position: 'relative',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
        }}
      />
    </Box>
  );
}
