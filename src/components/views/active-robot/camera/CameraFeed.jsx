import React, { useRef, useEffect } from 'react';

/**
 * CameraFeed Component - Displays camera feed
 * For now, displays a placeholder
 */
export default function CameraFeed({ width = 240, height = 180, isLarge = false }) {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    
    // Get actual canvas dimensions
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    
    // Generate animated noise (simulates video feed)
    const imageData = ctx.createImageData(canvasWidth, canvasHeight);

    // Function to generate random noise (simulates video feed)
    const drawNoise = () => {
      const data = imageData.data;
      
      for (let i = 0; i < data.length; i += 4) {
        // Generate random gray value
        const gray = Math.random() * 255;
        data[i] = gray;     // R
        data[i + 1] = gray; // G
        data[i + 2] = gray; // B
        data[i + 3] = 255;  // A (full opacity)
      }
      
      ctx.putImageData(imageData, 0, 0);
      
      // Continue animation
      animationRef.current = requestAnimationFrame(drawNoise);
    };

    // Start animation
    drawNoise();

    // Cleanup animation on unmount
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [width, height, isLarge]);

  // Canvas dimensions in pixels (for drawing)
  const canvasWidth = typeof width === 'number' ? width : 640;
  const canvasHeight = typeof height === 'number' ? height : 480;

  return (
    <div 
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        borderRadius: isLarge ? '16px' : '8px',
        overflow: 'hidden',
        border: isLarge ? 'none' : '1px solid rgba(0, 0, 0, 0.02)',
        background: '#000',
        transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={canvasHeight}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
        }}
      />

      {/* Note: Swap button is now handled by ViewportSwapper */}
    </div>
  );
}

