import React, { useState, useEffect, useRef } from 'react';
import { Box, IconButton } from '@mui/material';

/**
 * Dice button component with animated SVG dice
 * Randomly hides faces during shake animation
 */
export default function WheelDiceButton({ 
  onRandomSpin, 
  isSpinning, 
  isActive, 
  isBusy, 
  isReady, 
  darkMode, 
  activeTab,
  isDiceShaking 
}) {
  const [visibleFaces, setVisibleFaces] = useState([true, true, true, true, true, true]);
  const animationIntervalRef = useRef(null);

  // Animate face visibility during shake
  useEffect(() => {
    if (isDiceShaking) {
      // Update visible faces randomly every 150ms during shake (slower to see the numbers)
      animationIntervalRef.current = setInterval(() => {
        setVisibleFaces(() => {
          // Randomly show/hide each face (60% chance to be visible)
          return Array.from({ length: 6 }, () => Math.random() > 0.4);
        });
      }, 150);

      return () => {
        if (animationIntervalRef.current) {
          clearInterval(animationIntervalRef.current);
        }
      };
    } else {
      // Reset all faces to visible when not shaking
      setVisibleFaces([true, true, true, true, true, true]);
      if (animationIntervalRef.current) {
        clearInterval(animationIntervalRef.current);
      }
    }
  }, [isDiceShaking]);

  // Dice SVG with 6 faces (dots pattern for a classic dice)
  const DiceSVG = () => {
    const size = 28;
    const dotRadius = 1.5; // Taille moyenne des points
    const center = size / 2;
    const offset = 4; // Plus proche du centre (moins près des bords)
    
    // Positions for dots on a 6-face dice (arranged in a grid)
    const dotPositions = [
      // Face 1: top-left
      { cx: center - offset, cy: center - offset },
      // Face 2: top-right
      { cx: center + offset, cy: center - offset },
      // Face 3: center-left
      { cx: center - offset, cy: center },
      // Face 4: center-right
      { cx: center + offset, cy: center },
      // Face 5: bottom-left
      { cx: center - offset, cy: center + offset },
      // Face 6: bottom-right
      { cx: center + offset, cy: center + offset },
    ];

    const color = isSpinning || !isActive || isBusy || !isReady
      ? (darkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)')
      : '#FF9500';

    return (
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ pointerEvents: 'none' }} // Don't block clicks on button
      >
        {/* Dice square background */}
        <rect
          x="4"
          y="4"
          width={size - 8}
          height={size - 8}
          rx="3"
          fill="none"
          stroke={color}
          strokeWidth="1.5"
        />
        {/* Dots (faces) */}
        {dotPositions.map((pos, index) => (
          <circle
            key={index}
            cx={pos.cx}
            cy={pos.cy}
            r={dotRadius}
            fill={color}
            opacity={visibleFaces[index] ? 1 : 0}
            style={{
              transition: 'opacity 0.2s ease',
            }}
          />
        ))}
      </svg>
    );
  };

  return (
    <Box>
      {/* Container for shake animation - separates positioning from animation */}
      <Box
        sx={{
          animation: isDiceShaking ? 'shake 0.5s ease-in-out' : 'none',
          pointerEvents: 'auto', // Ensure clicks work through animation container
          '@keyframes shake': {
            '0%, 100%': { transform: 'translateX(0) rotate(0deg)' },
            '10%, 30%, 50%, 70%, 90%': { transform: 'translateX(-4px) rotate(-5deg)' },
            '20%, 40%, 60%, 80%': { transform: 'translateX(4px) rotate(5deg)' },
          },
        }}
      >
        <IconButton
          onClick={(e) => {
            e.stopPropagation(); // Prevent event bubbling
            e.preventDefault();
            if (!isSpinning && isActive && !isBusy && isReady) {
              onRandomSpin();
            }
          }}
          disabled={isSpinning || !isActive || isBusy || !isReady}
          aria-label="Random spin"
          aria-describedby="dice-button-description"
          sx={{
            color: '#FF9500',
            width: 52,
            height: 52,
            padding: 0,
            border: '1.5px solid #FF9500',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10, // Ensure button is above everything
            position: 'relative', // Needed for z-index to work
            '&:hover': {
              color: '#FF9500',
              bgcolor: 'rgba(255, 149, 0, 0.1)',
              borderColor: '#FF9500',
            },
            '&.Mui-disabled': {
              borderColor: darkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)',
            },
            transition: 'all 0.2s ease',
          }}
        >
          <DiceSVG />
        </IconButton>
      </Box>
      <span 
        id="dice-button-description" 
        style={{ 
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: 0,
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0
        }}
      >
        Spin the wheel randomly to select a random {activeTab === 'emotions' ? 'emotion' : 'dance'}
      </span>
    </Box>
  );
}

