import React from 'react';
import { Box } from '@mui/material';

/**
 * Handwritten Arrows Component
 * Displays 3 animated handwritten arrows pointing towards the center icon
 * Clean, organic style with natural variations
 */
export default function HandwrittenArrows({ color = '#FF9500', size = 80 }) {
  const centerX = size / 2;
  const centerY = size / 2;
  const iconRadius = 20; // Icon is 40px, so radius is 20px
  const outerRadius = size / 2 - 3; // Start from near edge
  
  // Three arrows with natural, varied positions around the circle
  // Using angles that feel organic, not perfectly spaced
  const angles = [
    -Math.PI / 2 + 0.5,  // ~11 o'clock
    Math.PI / 2 - 0.3,   // ~5 o'clock  
    Math.PI + 0.25       // ~8 o'clock
  ];
  
  // Create arrow data with variations
  const arrows = angles.map((angle, index) => {
    // Start position
    const startX = centerX + Math.cos(angle) * outerRadius;
    const startY = centerY + Math.sin(angle) * outerRadius;
    
    // Target point on icon edge (slightly varied for natural feel)
    const targetAngle = angle + (index === 0 ? 0.1 : index === 1 ? -0.05 : 0.08);
    const endX = centerX + Math.cos(targetAngle) * iconRadius;
    const endY = centerY + Math.sin(targetAngle) * iconRadius;
    
    // Curve control point - creates organic curve
    // Positioned between start and end, slightly offset for natural curve
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;
    
    // Direction from end point to center (target direction)
    const dirX = centerX - endX;
    const dirY = centerY - endY;
    const dirLength = Math.sqrt(dirX * dirX + dirY * dirY);
    const dirNormX = dirX / dirLength;
    const dirNormY = dirY / dirLength;
    
    // Perpendicular to center direction (for curve offset)
    const perpX = -dirNormY;
    const perpY = dirNormX;
    const curveOffset = (index === 0 ? 3 : index === 1 ? -2.5 : 2) * (index % 2 === 0 ? 1 : -1);
    const curveX = midX + perpX * curveOffset;
    const curveY = midY + perpY * curveOffset;
    
    // Calculate tangent direction at the end point of the quadratic curve
    // Tangent at end = normalize(end - control)
    const tangentX = endX - curveX;
    const tangentY = endY - curveY;
    const tangentLength = Math.sqrt(tangentX * tangentX + tangentY * tangentY);
    const tangentNormX = tangentX / tangentLength;
    const tangentNormY = tangentY / tangentLength;
    
    // Arrowhead direction: blend between tangent and center direction
    // This compensates for the curve while still pointing towards center
    // Weight: 0.7 towards center, 0.3 towards tangent (adjustable)
    const blendWeight = 0.7; // More weight towards center
    const arrowheadDirX = blendWeight * dirNormX + (1 - blendWeight) * tangentNormX;
    const arrowheadDirY = blendWeight * dirNormY + (1 - blendWeight) * tangentNormY;
    const arrowheadDirLength = Math.sqrt(arrowheadDirX * arrowheadDirX + arrowheadDirY * arrowheadDirY);
    const arrowheadDirNormX = arrowheadDirX / arrowheadDirLength;
    const arrowheadDirNormY = arrowheadDirY / arrowheadDirLength;
    
    // Variable arrowhead sizes for natural variation
    const arrowheadSize = 3.5 + (index * 0.4);
    const arrowheadWidth = 2.2 + (index * 0.2);
    
    return {
      startX,
      startY,
      endX,
      endY,
      curveX,
      curveY,
      arrowheadDirNormX,
      arrowheadDirNormY,
      arrowheadSize,
      arrowheadWidth,
      strokeWidth: 1.8 + (index * 0.1)
    };
  });
  
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
      {arrows.map((arrow, index) => {
        // Calculate arrowhead points - compensated direction (blend of tangent and center)
        // Perpendicular to arrowhead direction (for arrowhead width)
        const perpX = -arrow.arrowheadDirNormY;
        const perpY = arrow.arrowheadDirNormX;
        
        // Arrowhead base point (back from end point along compensated direction)
        const arrowheadBaseX = arrow.endX - arrow.arrowheadSize * arrow.arrowheadDirNormX;
        const arrowheadBaseY = arrow.endY - arrow.arrowheadSize * arrow.arrowheadDirNormY;
        
        // Arrowhead left and right points
        const arrowheadLeftX = arrowheadBaseX - arrow.arrowheadWidth * perpX;
        const arrowheadLeftY = arrowheadBaseY - arrow.arrowheadWidth * perpY;
        
        const arrowheadRightX = arrowheadBaseX + arrow.arrowheadWidth * perpX;
        const arrowheadRightY = arrowheadBaseY + arrow.arrowheadWidth * perpY;
        
        return (
      <path
            key={index}
            d={`M ${arrow.startX} ${arrow.startY} Q ${arrow.curveX} ${arrow.curveY} ${arrow.endX} ${arrow.endY} M ${arrowheadLeftX} ${arrowheadLeftY} L ${arrow.endX} ${arrow.endY} L ${arrowheadRightX} ${arrowheadRightY}`}
        stroke={color}
            strokeWidth={arrow.strokeWidth}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
            opacity="0.8"
            vectorEffect="non-scaling-stroke"
      >
        <animateTransform
          attributeName="transform"
          type="translate"
              values={`0,0; ${0.2 + index * 0.1},${-0.15 - index * 0.1}; ${-0.15 - index * 0.1},${0.2 + index * 0.1}; ${0.1 + index * 0.05},${-0.1 - index * 0.05}; 0,0`}
              dur={`${2.4 + index * 0.3}s`}
          repeatCount="indefinite"
        />
      </path>
        );
      })}
    </Box>
  );
}

