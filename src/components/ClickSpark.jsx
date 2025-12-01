import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

/**
 * ClickSpark Component
 * Creates spark particles on click anywhere in the wrapped content
 * Based on reactbits.dev ClickSpark component
 */
export default function ClickSpark({
  children,
  sparkColor = '#FF9500',
  sparkCount = 12,
  sparkSize = 8,
  sparkRadius = 15,
  duration = 500,
  easing = 'ease-out',
}) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleClick = (e) => {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Create spark particles
      for (let i = 0; i < sparkCount; i++) {
        const spark = document.createElement('div');
        spark.style.position = 'absolute';
        spark.style.width = `${sparkSize}px`;
        spark.style.height = `${sparkSize}px`;
        spark.style.borderRadius = '50%';
        spark.style.backgroundColor = sparkColor;
        spark.style.pointerEvents = 'none';
        spark.style.left = `${x}px`;
        spark.style.top = `${y}px`;
        spark.style.transform = 'translate(-50%, -50%)';
        spark.style.zIndex = '9999';
        
        container.appendChild(spark);

        // Random angle for particle direction
        const angle = (Math.PI * 2 * i) / sparkCount;
        const distance = sparkRadius + Math.random() * sparkRadius;
        const endX = x + Math.cos(angle) * distance;
        const endY = y + Math.sin(angle) * distance;

        // Animate particle
        const opacity = gsap.to(spark, {
          opacity: 0,
          duration: duration / 1000,
          ease: easing,
        });

        const position = gsap.to(spark, {
          x: endX - x,
          y: endY - y,
          duration: duration / 1000,
          ease: easing,
        });

        // Clean up after animation
        setTimeout(() => {
          if (spark.parentNode) {
            spark.parentNode.removeChild(spark);
          }
        }, duration);
      }
    };

    container.addEventListener('click', handleClick);

    return () => {
      container.removeEventListener('click', handleClick);
    };
  }, [sparkColor, sparkCount, sparkSize, sparkRadius, duration, easing]);

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
      {children}
    </div>
  );
}

