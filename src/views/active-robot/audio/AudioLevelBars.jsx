import React, { useEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';

/**
 * Robot Vital Signs Audio Visualizer - Frame-rate independent, smooth animation
 * Responsive dimensions based on container size
 */
export default function AudioLevelBars({ isActive, color = '#FF9500', barCount = 8 }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const waveformRef = useRef([]);
  const isMountedRef = useRef(true);
  const maxHistoryLength = 60;
  const lastUpdateTimeRef = useRef(0);
  const updateInterval = 50; // Update every 50ms (20 Hz)
  const instanceSeedRef = useRef(Math.random() * 1000000 + Date.now());
  const variationParamsRef = useRef(null);
  const seedRef = useRef(null);
  const fastRandomRef = useRef(null);
  const ctxRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 191, height: 28 });

  // Update dimensions from container
  useEffect(() => {
    const updateDimensions = () => {
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
    
  // ✅ Initialiser les paramètres de variation et le random seed
  useEffect(() => {
    if (!seedRef.current) {
      seedRef.current = instanceSeedRef.current;
    }
    
    if (!fastRandomRef.current) {
      fastRandomRef.current = () => {
        seedRef.current = (seedRef.current * 9301 + 49297) % 233280;
        return seedRef.current / 233280;
      };
    }
    
    const fastRandom = fastRandomRef.current;
    
    if (!variationParamsRef.current) {
      variationParamsRef.current = {
        amplitude: fastRandom() * 0.3 + 0.2, // 20-50% variation
        speed: fastRandom() * 0.5 + 0.3, // Speed multiplier
        baseLevel: fastRandom() * 0.2 + 0.3, // Base level 30-50%
      };
    }

    // Initialize waveform history with varied initial values
    if (waveformRef.current.length === 0) {
      const { amplitude: variationAmplitude, speed: variationSpeed, baseLevel } = variationParamsRef.current;
      waveformRef.current = Array(maxHistoryLength).fill(0).map((_, i) => {
        const wavePhase = (i / maxHistoryLength) * Math.PI * 2 * variationSpeed;
        return baseLevel + Math.sin(wavePhase) * variationAmplitude * fastRandom();
      });
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

    const draw = (currentTime) => {
      if (!isMountedRef.current || dimensions.width === 0) return;
      
      ctx.clearRect(0, 0, dimensions.width, dimensions.height);

      if (isActive) {
        // ✅ Frame-rate independent: Update based on elapsed time, not frames
        const elapsed = currentTime - lastUpdateTimeRef.current;
        
        if (elapsed >= updateInterval) {
          // ✅ Get variation parameters from ref
          const { amplitude: variationAmplitude, speed: variationSpeed, baseLevel } = variationParamsRef.current;
          const fastRandom = fastRandomRef.current; // ✅ Get fastRandom from ref
          
          // ✅ Generate more unpredictable amplitude values with variation
          const random1 = fastRandom();
          const random2 = fastRandom();
          const random3 = fastRandom();
          
          // Mix multiple random sources for more unpredictability
          const baseValue = (random1 * 0.4 + random2 * 0.3 + random3 * 0.3);
          
          // Add some frequency-like variation (simulate different audio frequencies)
          const timePhase = currentTime * 0.001 * variationSpeed;
          const frequencyVariation = Math.sin(timePhase) * 0.15 + Math.cos(timePhase * 1.7) * 0.1;
          
          // Combine base level, random variation, and frequency modulation
          const newValue = Math.max(0.1, Math.min(0.95, 
            baseLevel + 
            baseValue * variationAmplitude + 
            frequencyVariation * fastRandom()
          ));
          
          // Add to history (shift array)
          waveformRef.current.push(newValue);
          if (waveformRef.current.length > maxHistoryLength) {
            waveformRef.current.shift();
          }
          
          lastUpdateTimeRef.current = currentTime;
        }

        // Draw waveform line
        const padding = 0;
        const usableWidth = dimensions.width - padding * 2;
        const usableHeight = dimensions.height - padding * 2;
        const waveformLength = waveformRef.current.length;
        
        if (waveformLength > 0 && usableWidth > 0 && usableHeight > 0) {
          const stepX = usableWidth / (waveformLength - 1);
          const heightMultiplier = usableHeight * 0.8;
          const heightOffset = usableHeight * 0.1;
          
          // ✅ Set context properties once
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high'; // ✅ High quality rendering
          
          // ✅ Draw waveform path and collect Y positions for gradient
          const waveformPath = new Path2D();
          const yPositions = [];
          for (let index = 0; index < waveformLength; index++) {
            const value = waveformRef.current[index];
            const x = padding + index * stepX;
            const y = padding + usableHeight - (value * heightMultiplier) - heightOffset;
            yPositions.push(y);
            
            if (index === 0) {
              waveformPath.moveTo(x, y);
            } else {
              waveformPath.lineTo(x, y);
            }
          }
          ctx.stroke(waveformPath);
          
          // ✅ Add gradient fill below the waveform line
          // Use average Y position of waveform to start gradient (more visible)
          const avgY = yPositions.reduce((sum, y) => sum + y, 0) / yPositions.length;
          const gradientStartY = avgY; // Start gradient from average line level
          const gradientEndY = padding + usableHeight; // End at bottom
          
          // Create vertical gradient from waveform line to bottom
          const gradient = ctx.createLinearGradient(0, gradientStartY, 0, gradientEndY);
          
          // Extract RGB from color (handle rgba format)
          const colorMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
          if (colorMatch) {
            const r = colorMatch[1];
            const g = colorMatch[2];
            const b = colorMatch[3];
            // Gradient starts light at the line level, fades to transparent at bottom
            gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.12)`); // Light at line (15% opacity)
            gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 0.08)`); // Medium fade
            gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.06)`); // Transparent at bottom
          } else {
            // Fallback for hex colors - convert to rgba
            const hex = color.replace('#', '');
            const r = parseInt(hex.substring(0, 2), 16);
            const g = parseInt(hex.substring(2, 4), 16);
            const b = parseInt(hex.substring(4, 6), 16);
            gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.12)`); // Light at line (15% opacity)
            gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 0.08)`); // Medium fade
            gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.06)`); // Transparent at bottom
          }
          
          // Draw filled path below waveform
          const fillPath = new Path2D(waveformPath);
          fillPath.lineTo(padding + usableWidth, padding + usableHeight);
          fillPath.lineTo(padding, padding + usableHeight);
          fillPath.closePath();
          ctx.fillStyle = gradient;
          ctx.fill(fillPath);
          
          // ✅ Draw current level indicator (small dot at end)
          const currentValue = waveformRef.current[waveformLength - 1];
          const currentX = padding + usableWidth;
          const currentY = padding + usableHeight - (currentValue * heightMultiplier) - heightOffset;
          
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(currentX, currentY, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // Reset waveform when inactive
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
  }, [isActive, color, dimensions]);

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

