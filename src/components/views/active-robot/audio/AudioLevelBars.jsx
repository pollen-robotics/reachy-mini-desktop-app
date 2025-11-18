import React, { useEffect, useRef } from 'react';
import { Box } from '@mui/material';

/**
 * Robot Vital Signs Audio Visualizer - Frame-rate independent, smooth animation
 */
export default function AudioLevelBars({ isActive, color = '#FF9500', barCount = 8 }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const animationRef = useRef(null);
  const waveformRef = useRef([]); // Store waveform history for smooth line
  const isMountedRef = useRef(true);
  const maxHistoryLength = 60; // ✅ More points for smoother waveform
  const lastUpdateTimeRef = useRef(0);
  const updateInterval = 50; // Update every 50ms (20 Hz) - frame-rate independent
  const containerSizeRef = useRef({ width: 0, height: 0 }); // ✅ Cache container size to avoid getBoundingClientRect() every frame
  // ✅ Unique random seed per instance for unpredictable patterns
  const instanceSeedRef = useRef(Math.random() * 1000000 + Date.now());
  // ✅ Store variation parameters in ref so they persist across renders
  const variationParamsRef = useRef(null);
  // ✅ Store seed in ref so fastRandom persists across renders
  const seedRef = useRef(null);
  const fastRandomRef = useRef(null);

  useEffect(() => {
    isMountedRef.current = true;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // ✅ Get actual display size to avoid stretching/blur
    const updateCanvasSize = () => {
      const rect = container.getBoundingClientRect();
      const displayWidth = Math.floor(rect.width);
      const displayHeight = Math.floor(rect.height);
    
    // Set canvas internal resolution (device pixel ratio for crisp rendering)
    const dpr = window.devicePixelRatio || 1;
    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    
    // Set CSS size to display size (prevents stretching)
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;
    
      return { displayWidth, displayHeight, dpr };
    };

    const { displayWidth, displayHeight, dpr } = updateCanvasSize();
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr); // Scale context to match device pixel ratio
    
    // ✅ Recalculate on resize - Function to handle resize
    let currentDpr = dpr;
    const handleResize = () => {
      if (!isMountedRef.current || !canvas || !container) return;
      
      const rect = container.getBoundingClientRect();
      const displayWidth = Math.floor(rect.width);
      const displayHeight = Math.floor(rect.height);
      
      // ✅ Vérifier que les dimensions sont valides avant de mettre à jour
      if (displayWidth <= 0 || displayHeight <= 0) {
        // Dimensions invalides, ne pas mettre à jour (layout pas encore calculé)
        console.warn('⚠️ AudioLevelBars: Invalid dimensions', { displayWidth, displayHeight });
        return;
      }
      
      const dpr = window.devicePixelRatio || 1;
      
      // Only update if size actually changed (avoid unnecessary redraws)
      if (containerSizeRef.current.width === displayWidth && containerSizeRef.current.height === displayHeight) {
        return; // Size hasn't changed
      }
      
      canvas.width = displayWidth * dpr;
      canvas.height = displayHeight * dpr;
      canvas.style.width = `${displayWidth}px`;
      canvas.style.height = `${displayHeight}px`;
      
      // ✅ Cache container size to avoid getBoundingClientRect() in draw loop
      containerSizeRef.current = { width: displayWidth, height: displayHeight };
      
      if (dpr !== currentDpr) {
        // Adjust scale if DPR changed
        ctx.scale(dpr / currentDpr, dpr / currentDpr);
        currentDpr = dpr;
      }
      
      console.log('✅ AudioLevelBars: Resized', { displayWidth, displayHeight, dpr, canvasWidth: canvas.width, canvasHeight: canvas.height });
    };
    
    // ✅ Use ResizeObserver for container size changes
    // Use a small debounce to avoid excessive updates during rapid resizes
    let resizeTimeout = null;
    const resizeObserver = new ResizeObserver(() => {
      // Clear any pending resize
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      // Debounce resize handling
      resizeTimeout = setTimeout(() => {
        handleResize();
      }, 10);
    });
    resizeObserver.observe(container, { box: 'border-box' }); // ✅ Observe border box for accurate sizing
    
    // ✅ Also listen to window resize as fallback (for window-level resizes)
    const handleWindowResize = () => {
      // Small delay to ensure DOM has updated
      setTimeout(() => {
        handleResize();
      }, 0);
    };
    window.addEventListener('resize', handleWindowResize);
    
    // ✅ Initialize cached size
    containerSizeRef.current = { width: displayWidth, height: displayHeight };
    
    // ✅ Force multiple resize checks to handle flexbox layout delays
    // Sometimes flexbox needs multiple layout passes to settle
    const initialResizeTimeout1 = setTimeout(() => {
      handleResize();
    }, 50);
    const initialResizeTimeout2 = setTimeout(() => {
      handleResize();
    }, 150);
    const initialResizeTimeout3 = setTimeout(() => {
      handleResize();
    }, 300);
    
    // ✅ OPTIMIZED: Use seeded random with unique instance seed for unpredictable patterns
    if (!seedRef.current) {
      seedRef.current = instanceSeedRef.current;
    }
    
    // ✅ Create fastRandom function that persists across renders
    if (!fastRandomRef.current) {
      fastRandomRef.current = () => {
        seedRef.current = (seedRef.current * 9301 + 49297) % 233280;
        return seedRef.current / 233280;
      };
    }
    
    const fastRandom = fastRandomRef.current;
    
    // ✅ Add variation parameters for more realistic/unpredictable patterns (store in ref)
    if (!variationParamsRef.current) {
      variationParamsRef.current = {
        amplitude: fastRandom() * 0.3 + 0.2, // 20-50% variation
        speed: fastRandom() * 0.5 + 0.3, // Speed multiplier
        baseLevel: fastRandom() * 0.2 + 0.3, // Base level 30-50%
      };
    }
    
    const { amplitude: variationAmplitude, speed: variationSpeed, baseLevel } = variationParamsRef.current;

    // Initialize waveform history with varied initial values
    if (waveformRef.current.length === 0) {
      waveformRef.current = Array(maxHistoryLength).fill(0).map((_, i) => {
        // Add some initial wave pattern for more natural start
        const wavePhase = (i / maxHistoryLength) * Math.PI * 2 * variationSpeed;
        return baseLevel + Math.sin(wavePhase) * variationAmplitude * fastRandom();
      });
    }
    
    lastUpdateTimeRef.current = performance.now();

    const draw = (currentTime) => {
      if (!isMountedRef.current) return;
      
      // ✅ Use cached container size (updated by ResizeObserver)
      const currentDisplayWidth = containerSizeRef.current.width;
      const currentDisplayHeight = containerSizeRef.current.height;
      
      // Skip if container has no size
      if (currentDisplayWidth === 0 || currentDisplayHeight === 0) {
        animationRef.current = requestAnimationFrame(draw);
        return;
      }
      
      // Clear canvas (using display size, not scaled)
      ctx.clearRect(0, 0, currentDisplayWidth, currentDisplayHeight);

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

        // ✅ Draw crisp waveform line (medical monitoring style)
        // ✅ Pre-calculate constants outside the loop
        const padding = 0; // ✅ No padding - waveform touches edges
        const usableWidth = currentDisplayWidth - padding * 2;
        const usableHeight = currentDisplayHeight - padding * 2;
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
          resizeObserver.disconnect();
          window.removeEventListener('resize', handleWindowResize);
          if (resizeTimeout) {
            clearTimeout(resizeTimeout);
          }
          clearTimeout(initialResizeTimeout1);
          clearTimeout(initialResizeTimeout2);
          clearTimeout(initialResizeTimeout3);
          if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
          }
        };
  }, [isActive, color]);

  return (
    <Box
      ref={containerRef}
      sx={{
        width: '100%',
        height: '100%',
        position: 'relative',
        minWidth: 0, // ✅ Critical for flexbox: allows flex item to shrink below content size
        minHeight: 0, // ✅ Critical for flexbox: allows flex item to shrink below content size
        overflow: 'hidden', // ✅ Prevent overflow issues
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          position: 'absolute', // ✅ Use absolute positioning for better sizing in flex
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          minWidth: 0, // ✅ Ensure canvas can shrink in flexbox
          minHeight: 0, // ✅ Ensure canvas can shrink in flexbox
        }}
      />
    </Box>
  );
}

