import React, { useRef, useEffect } from 'react';

/**
 * Composant AudioVisualizer - Affiche un égaliseur audio épuré
 * Pour l'instant, simule des données FFT avec du bruit aléatoire
 */
export default function AudioVisualizer({ barCount = 6, color = 'rgba(150, 150, 150, 0.8)', showBackground = true, isLarge = false }) {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const barsRef = useRef([]);
  const frameCountRef = useRef(0); // ✅ OPTIMIZED: Frame counter to reduce update frequency
  // ✅ Unique random seed per instance for unpredictable patterns
  const instanceSeedRef = useRef(Math.random() * 1000000 + Date.now());
  // ✅ Store bar variations in ref so they persist across renders
  const barVariationsRef = useRef(null);
  // ✅ Store seed in ref so fastRandom persists across renders
  const seedRef = useRef(null);
  const fastRandomRef = useRef(null);
  
  // Canvas always at max size for quality
  const canvasWidth = 100;
  const canvasHeight = 48;
  
  // Display sizes according to mode
  const displayWidth = isLarge ? 60 : 24;
  const displayHeight = isLarge ? 38 : 10;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    
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
    
    // ✅ Add variation parameters for each bar (simulate different frequency bands)
    if (!barVariationsRef.current) {
      barVariationsRef.current = Array(barCount).fill(0).map(() => ({
        amplitude: fastRandom() * 0.4 + 0.2, // 20-60% amplitude variation per bar
        speed: fastRandom() * 0.8 + 0.4, // Speed variation
        phase: fastRandom() * Math.PI * 2, // Random phase offset
      }));
    }
    
    // Initialize bars with varied random values
    if (barsRef.current.length === 0) {
      barsRef.current = Array(barCount).fill(0).map((_, i) => {
        const variation = barVariationsRef.current[i];
        return fastRandom() * variation.amplitude * 0.5;
      });
    }

    // Reset frame counter
    frameCountRef.current = 0;

    // Function to simulate FFT with noise - more unpredictable patterns
    const updateBars = () => {
      const bars = barsRef.current;
      const barVariations = barVariationsRef.current;
      const fastRandom = fastRandomRef.current; // ✅ Get fastRandom from ref
      const time = performance.now() * 0.001; // Time in seconds
      
      for (let i = 0; i < bars.length; i++) {
        const variation = barVariations[i];
        
        // FFT simulation: low frequencies (beginning) have more energy
        const frequencyBias = Math.exp(-i / (barCount * 0.3));
        
        // ✅ Multiple random sources for more unpredictability
        const random1 = fastRandom();
        const random2 = fastRandom();
        const random3 = fastRandom();
        
        // Mix random sources
        const mixedRandom = (random1 * 0.5 + random2 * 0.3 + random3 * 0.2);
        
        // Add time-based variation with different phases per bar
        const timeVariation = Math.sin(time * variation.speed + variation.phase) * 0.15 +
                             Math.cos(time * variation.speed * 1.3 + variation.phase * 0.7) * 0.1;
        
        // Combine frequency bias, random variation, and time-based modulation
        const targetValue = (
          (mixedRandom * variation.amplitude + timeVariation) * frequencyBias * 0.8 + 0.1
        );
        
        // Smoothing with variable rate for more natural movement
        const smoothingRate = 0.82 + fastRandom() * 0.06; // 82-88% smoothing
        bars[i] = bars[i] * smoothingRate + targetValue * (1 - smoothingRate);
      }
    };

    // Render function
    const draw = () => {
      frameCountRef.current++;
      
      // ✅ OPTIMIZED: Update bars less frequently (every 2 frames = ~30 FPS update, still smooth)
      if (frameCountRef.current % 2 === 0) {
        updateBars();
      }
      
      const bars = barsRef.current;
      
      // Clear canvas
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);

      const padding = 2;
      const barWidth = (canvasWidth - padding * 2) / barCount;
      const barGap = 4.5; // Gap between bars
      const barRadius = 1.5; // Radius for rounded corners

      // Draw bars with rounded corners
      for (let i = 0; i < barCount; i++) {
        const barHeight = bars[i] * (canvasHeight - padding * 2) * 0.9;
        const x = padding + i * barWidth + barGap;
        const y = canvasHeight - padding - barHeight;
        const w = barWidth - barGap * 2; // Bar width

        // Bars with specified color and rounded corners (top AND bottom)
        ctx.fillStyle = color;
        
        // Draw rectangle with all rounded corners
        ctx.beginPath();
        // Top left corner
        ctx.moveTo(x + barRadius, y);
        // Top line + top right corner
        ctx.lineTo(x + w - barRadius, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + barRadius);
        // Right line + bottom right corner
        ctx.lineTo(x + w, y + barHeight - barRadius);
        ctx.quadraticCurveTo(x + w, y + barHeight, x + w - barRadius, y + barHeight);
        // Bottom line + bottom left corner
        ctx.lineTo(x + barRadius, y + barHeight);
        ctx.quadraticCurveTo(x, y + barHeight, x, y + barHeight - barRadius);
        // Left line
        ctx.lineTo(x, y + barRadius);
        ctx.quadraticCurveTo(x, y, x + barRadius, y);
        ctx.closePath();
        ctx.fill();
      }

      // Continue animation
      animationRef.current = requestAnimationFrame(draw);
    };

    // Start animation
    draw();

    // Clean up animation on unmount
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [barCount, canvasWidth, canvasHeight, color, showBackground]);

  return (
    <canvas
      ref={canvasRef}
      width={canvasWidth}
      height={canvasHeight}
      style={{
        width: `${displayWidth}px`,
        height: `${displayHeight}px`,
        display: 'block',
        transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    />
  );
}

