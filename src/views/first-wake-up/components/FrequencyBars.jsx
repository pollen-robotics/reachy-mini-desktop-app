import React, { useRef, useEffect, useState } from 'react';
import { Box } from '@mui/material';

const BAR_COUNT = 12;
const BAR_GAP = 5;
const MIN_BAR_HEIGHT = 4;

/**
 * Audio level bars visualizer.
 * Uses a single overall audio level (0-1), applies center envelope
 * and per-bar randomness for an organic look (matching the original Wake Me Up style).
 */
export default function FrequencyBars({ level = 0, isActive, height = 64 }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const smoothedRef = useRef(new Float32Array(BAR_COUNT));
  const [width, setWidth] = useState(300);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect?.width;
      if (w > 0) setWidth(w);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      const barWidth = (width - (BAR_COUNT - 1) * BAR_GAP) / BAR_COUNT;
      const smoothing = 0.25;
      const baseLevel = isActive ? Math.min(level, 1) : 0;

      for (let i = 0; i < BAR_COUNT; i++) {
        const position = i / (BAR_COUNT - 1);
        const centerDistance = Math.abs(position - 0.5) * 2;
        const envelope = 1 - centerDistance * centerDistance;

        const randomness = Math.random() * 0.4 + 0.8;
        const target = baseLevel * envelope * randomness;

        smoothedRef.current[i] += (target - smoothedRef.current[i]) * smoothing;
        const val = smoothedRef.current[i];

        const barH = Math.max(MIN_BAR_HEIGHT, val * (height - 8));
        const x = i * (barWidth + BAR_GAP);
        const y = (height - barH) / 2;

        const alpha = 0.35 + val * 0.65;
        ctx.fillStyle = `rgba(255, 149, 0, ${alpha})`;

        const radius = Math.min(barWidth / 2, barH / 2, 5);
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barH, radius);
        ctx.fill();
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    animationRef.current = requestAnimationFrame(draw);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [width, height, level, isActive]);

  return (
    <Box ref={containerRef} sx={{ width: '100%', height, position: 'relative', flexShrink: 0 }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
    </Box>
  );
}
