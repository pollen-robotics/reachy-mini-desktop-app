import React, { useRef, useEffect } from 'react';

/**
 * Composant AudioVisualizer - Affiche un égaliseur audio épuré
 * Pour l'instant, simule des données FFT avec du bruit aléatoire
 */
export default function AudioVisualizer({ barCount = 6, color = 'rgba(150, 150, 150, 0.8)', showBackground = true, isLarge = false }) {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const barsRef = useRef([]);
  
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
    
    // Initialize bars with random values
    if (barsRef.current.length === 0) {
      barsRef.current = Array(barCount).fill(0).map(() => Math.random() * 0.3);
    }

    // Function to simulate FFT with noise
    const updateBars = () => {
      const bars = barsRef.current;
      
      for (let i = 0; i < bars.length; i++) {
        // FFT simulation: low frequencies (beginning) have more energy
        const frequencyBias = Math.exp(-i / (barCount * 0.3));
        
        // Add noise with inertia for smooth movement
        const targetValue = Math.random() * frequencyBias * 0.8 + 0.1;
        bars[i] = bars[i] * 0.85 + targetValue * 0.15; // Smoothing
      }
    };

    // Render function
    const draw = () => {
      const bars = barsRef.current;
      
      // Clear canvas
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);

      const padding = 2;
      const barWidth = (canvasWidth - padding * 2) / barCount;
      const barGap = 2.5; // Gap between bars
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

      // Update and continue animation
      updateBars();
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

