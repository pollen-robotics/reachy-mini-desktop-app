import React from 'react';
import { Box } from '@mui/material';

/**
 * Triangle friction indicator - fixed position at top center
 * Only orientation changes to point toward active item (simulates friction like real fortune wheel)
 */
export default function WheelIndicator({ 
  activeItemAngle, 
  rotation, 
  wheelSize, 
  radiusRatio,
  isSpinning = false
}) {
  if (activeItemAngle === undefined || activeItemAngle === null) return null;
  
  // Calculate visual angle of active item after wheel rotation
  const visualAngle = activeItemAngle - rotation;
  
  // Calculate triangle position (fixed at top center, above the wheel)
  const radius = wheelSize * radiusRatio;
  const triangleTop = `calc(100% - ${wheelSize / 2}px - ${radius}px - 20px)`;
  
  // Triangle should point toward the active item
  // The active item is at angle `visualAngle` (in degrees, where -90 is top)
  // Triangle points down by default, so we rotate it to point toward the item
  // Since triangle is at top center and item is on the circle, we need to calculate the angle
  // Simple approach: point triangle in the direction of the item's angle
  // Add 90 degrees because triangle points down, and we want it to point toward the item
  const pointingAngle = visualAngle + 90;
  
  // Add subtle friction effect - triangle leans slightly in rotation direction
  const frictionAngle = rotation * 0.15; // Subtle lean effect
  const finalAngle = pointingAngle + frictionAngle;
  
  return (
    <Box
      sx={{
        position: 'absolute',
        left: '50%',
        top: triangleTop,
        transform: `translateX(-50%) rotate(${finalAngle}deg)`,
        width: 0,
        height: 0,
        borderLeft: '4px solid transparent',
        borderRight: '4px solid transparent',
        borderBottom: '6px solid rgba(255, 149, 0, 0.5)',
        zIndex: 100,
        pointerEvents: 'none',
        transition: isSpinning ? 'none' : 'transform 0.1s ease-out',
      }}
    />
  );
}

