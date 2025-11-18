import React from 'react';
import { Box } from '@mui/material';

/**
 * Handwritten Arrows Component
 * Displays 3 animated handwritten arrows pointing towards the center icon
 * Each arrow has a slight offset based on its position and a subtle shake animation
 * that mimics redrawing (2-3 times in a loop)
 */
export default function HandwrittenArrows({ color = '#FF9500', size = 80 }) {
  const centerX = size / 2;
  const centerY = size / 2;
  const arrowLength = 18;
  const offset = 8; // Offset from center based on arrow origin (increased for more spread)
  const iconRadius = 12; // Radius around icon where arrows should stop (to keep arrowheads visible)
  
  return (
    <Box
      component="svg"
      sx={{
        position: 'absolute',
        width: size,
        height: size,
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        zIndex: 0,
        overflow: 'visible',
      }}
      viewBox={`0 0 ${size} ${size}`}
    >
      {/* Top arrow - points to center with slight right offset, stops before icon */}
      <path
        d={`M ${centerX} 8 Q ${centerX - 2} ${arrowLength + 2}, ${centerX + offset} ${centerY - iconRadius - 2} Q ${centerX + offset - 1} ${centerY - iconRadius}, ${centerX + offset} ${centerY - iconRadius} M ${centerX + offset - 2.5} ${centerY - iconRadius - 2} L ${centerX + offset} ${centerY - iconRadius} L ${centerX + offset + 2.5} ${centerY - iconRadius - 2}`}
        stroke={color}
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ 
          filter: 'drop-shadow(0 1px 2px rgba(255, 149, 0, 0.3))',
        }}
      >
        <animateTransform
          attributeName="transform"
          type="translate"
          values="0,0; 0.4,-0.2; -0.3,0.3; 0.2,-0.1; -0.1,0.2; 0,0"
          dur="2.5s"
          repeatCount="indefinite"
        />
      </path>
      
      {/* Left arrow - points to center with slight upward offset, stops before icon */}
      <path
        d={`M 8 ${centerY} Q ${arrowLength + 2} ${centerY - 2}, ${centerX - iconRadius - 2} ${centerY - offset} Q ${centerX - iconRadius} ${centerY - offset - 1}, ${centerX - iconRadius} ${centerY - offset} M ${centerX - iconRadius - 2.5} ${centerY - offset - 2.5} L ${centerX - iconRadius} ${centerY - offset} L ${centerX - iconRadius - 2.5} ${centerY - offset + 2.5}`}
        stroke={color}
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ 
          filter: 'drop-shadow(0 1px 2px rgba(255, 149, 0, 0.3))',
        }}
      >
        <animateTransform
          attributeName="transform"
          type="translate"
          values="0,0; -0.2,0.4; 0.3,-0.3; -0.1,0.2; 0.2,-0.1; 0,0"
          dur="2.7s"
          repeatCount="indefinite"
        />
      </path>
      
      {/* Right arrow - points to center with slight downward offset, stops before icon */}
      <path
        d={`M ${size - 8} ${centerY} Q ${size - arrowLength - 2} ${centerY + 2}, ${centerX + iconRadius + 2} ${centerY + offset} Q ${centerX + iconRadius} ${centerY + offset + 1}, ${centerX + iconRadius} ${centerY + offset} M ${centerX + iconRadius + 2.5} ${centerY + offset - 2.5} L ${centerX + iconRadius} ${centerY + offset} L ${centerX + iconRadius + 2.5} ${centerY + offset + 2.5}`}
        stroke={color}
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ 
          filter: 'drop-shadow(0 1px 2px rgba(255, 149, 0, 0.3))',
        }}
      >
        <animateTransform
          attributeName="transform"
          type="translate"
          values="0,0; 0.2,-0.4; -0.3,0.3; 0.1,-0.2; -0.2,0.1; 0,0"
          dur="2.9s"
          repeatCount="indefinite"
        />
      </path>
    </Box>
  );
}

