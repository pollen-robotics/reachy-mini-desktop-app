import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Typography } from '@mui/material';

/**
 * 2D Joystick Component - Compact
 * Follows mouse directly for intuitive control
 */
export default function Joystick2D({ label, valueX, valueY, onChange, onDragEnd, minX = -1, maxX = 1, minY = -1, maxY = 1, size = 100, darkMode, disabled = false, smoothedValueX, smoothedValueY }) {
  const containerRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [localStickX, setLocalStickX] = useState(size / 2);
  const [localStickY, setLocalStickY] = useState(size / 2);

  const centerX = size / 2;
  const centerY = size / 2;
  const maxRadius = size / 2 - 16;
  const stickRadius = 8;

  // Track last drag end time to prevent immediate repositioning
  const lastDragEndTimeRef = useRef(0);
  
  // Update local stick position when values change (from external updates)
  // But only if we're not dragging and enough time has passed since last drag
  // DISABLED: This was causing "magnet" effect at center - stick now only moves when user drags
  // The visual position is now only controlled by user interaction, not by value changes
  useEffect(() => {
    // Only update if we're not dragging and it's been a long time since last drag
    // This prevents the visual "magnet" effect at center
    if (!isDragging) {
      const timeSinceDragEnd = Date.now() - lastDragEndTimeRef.current;
      // Increased delay to 5 seconds to prevent unwanted visual updates
      // Only update if values are significantly different from current visual position
      if (timeSinceDragEnd >= 5000) {
        const normalizedX = ((valueX - minX) / (maxX - minX)) * 2 - 1;
        const normalizedY = 1 - ((valueY - minY) / (maxY - minY)) * 2; // Inverted Y
        // Visual sensitivity: multiply by 2 for display (stick moves 2x further visually)
        const visualMultiplier = 2.0;
        const visualX = normalizedX * visualMultiplier;
        const visualY = normalizedY * visualMultiplier;
        // Clamp to circle bounds
        const visualDistance = Math.sqrt(visualX * visualX + visualY * visualY);
        const clampedVisualX = visualDistance > 1 ? visualX / visualDistance : visualX;
        const clampedVisualY = visualDistance > 1 ? visualY / visualDistance : visualY;
        const newStickX = centerX + clampedVisualX * maxRadius;
        const newStickY = centerY - clampedVisualY * maxRadius;
        
        // Only update if the difference is significant (more than 2 pixels) to avoid micro-movements
        const dx = Math.abs(newStickX - localStickX);
        const dy = Math.abs(newStickY - localStickY);
        if (dx > 2 || dy > 2) {
          setLocalStickX(newStickX);
          setLocalStickY(newStickY);
        }
      }
    }
  }, [valueX, valueY, minX, maxX, minY, maxY, centerX, centerY, maxRadius, isDragging, localStickX, localStickY]);

  // Convert mouse coordinates to joystick values
  const getValuesFromMouse = useCallback((clientX, clientY) => {
    if (!containerRef.current) return { x: valueX, y: valueY };
    
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;
    
    // Calculate offset from center
    let dx = mouseX - centerX;
    let dy = mouseY - centerY;
    
    // Calculate distance from center
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Visual sensitivity: multiply by 2 for display (stick moves 2x further visually)
    const visualMultiplier = 2.0;
    const visualDx = dx * visualMultiplier;
    const visualDy = dy * visualMultiplier;
    const visualDistance = Math.sqrt(visualDx * visualDx + visualDy * visualDy);
    
    // Clamp visual position to circle for visual feedback
    let displayX = mouseX;
    let displayY = mouseY;
    if (visualDistance > maxRadius) {
      const angle = Math.atan2(visualDy, visualDx);
      displayX = centerX + Math.cos(angle) * maxRadius;
      displayY = centerY + Math.sin(angle) * maxRadius;
    } else {
      // Apply visual multiplier for display
      displayX = centerX + visualDx;
      displayY = centerY + visualDy;
    }
    
    // Update local stick position for immediate visual feedback (with 2x visual sensitivity)
    setLocalStickX(displayX);
    setLocalStickY(displayY);
    
    // Normalize to -1 to 1 range
    const normalizedX = dx / maxRadius; // Left is negative, right is positive
    const normalizedY = dy / maxRadius; // Top is negative, bottom is positive
    
    // No sensitivity reduction - use full range now that we have extended ranges
    // This allows the stick to reach the full visual circle when values are at max
    
    // Convert normalized values (-1 to 1) to actual value range
    // X: left is min, right is max (corrected)
    // Y: top is min, bottom is max
    const newX = minX + (normalizedX + 1) / 2 * (maxX - minX);
    const newY = minY + (normalizedY + 1) / 2 * (maxY - minY);
    
    return { x: newX, y: newY };
  }, [centerX, centerY, maxRadius, minX, maxX, minY, maxY, valueX, valueY]);

  const handleMouseDown = (e) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    const { x, y } = getValuesFromMouse(e.clientX, e.clientY);
    onChange(x, y, true);
  };

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;
    e.preventDefault();
    e.stopPropagation();
    const { x, y } = getValuesFromMouse(e.clientX, e.clientY);
    onChange(x, y, true);
  }, [isDragging, getValuesFromMouse, onChange]);

  const handleMouseUp = useCallback((e) => {
    if (!isDragging) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    lastDragEndTimeRef.current = Date.now(); // Mark drag end time
    if (onDragEnd) onDragEnd();
  }, [isDragging, onDragEnd]);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove, { passive: false });
      document.addEventListener('mouseup', handleMouseUp, { passive: false });
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const displayX = typeof valueX === 'number' ? valueX.toFixed(3) : '0.000';
  const displayY = typeof valueY === 'number' ? valueY.toFixed(3) : '0.000';

  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      gap: 0.5,
      p: 0.75,
      borderRadius: '0px',
      bgcolor: 'transparent',
      border: 'none',
      opacity: disabled ? 0.5 : 1,
      pointerEvents: disabled ? 'none' : 'auto',
    }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.25, mb: 0.5 }}>
        <Typography sx={{ fontSize: 10, fontWeight: 700, color: darkMode ? '#f5f5f5' : '#333', letterSpacing: '-0.2px' }}>
          {label}
        </Typography>
        <Typography sx={{ 
          fontSize: 9, 
          fontFamily: 'monospace', 
          fontWeight: 500, 
          color: darkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)',
          letterSpacing: '0.02em',
        }}>
          X: {displayX}  Y: {displayY}
        </Typography>
      </Box>
      <Box
        ref={containerRef}
        sx={{
          width: size,
          height: size,
          overflow: 'hidden',
          border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`,
          borderRadius: '10px',
          cursor: disabled ? 'not-allowed' : (isDragging ? 'grabbing' : 'grab'),
          opacity: disabled ? 0.5 : 1,
          position: 'relative',
          userSelect: 'none',
          transition: 'all 0.2s ease',
          '&:hover': {
            borderColor: 'rgba(255, 149, 0, 0.5)',
          }
        }}
        onMouseDown={handleMouseDown}
      >
        <svg width={size} height={size} style={{ display: 'block' }}>
          <defs>
            <radialGradient id={`stickGrad-${label}`}>
              <stop offset="0%" stopColor="#FF9500" stopOpacity="1" />
              <stop offset="100%" stopColor="#FF9500" stopOpacity="0.7" />
            </radialGradient>
            <pattern id={`grid-${label}`} width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M 10 0 L 0 0 0 10" fill="none" stroke={darkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)'} strokeWidth="0.5"/>
            </pattern>
          </defs>
          
          {/* Center crosshair - primary color */}
          <g opacity={0.25}>
            <line x1={centerX} y1={0} x2={centerX} y2={size} stroke="#FF9500" strokeWidth={1} />
            <line x1={0} y1={centerY} x2={size} y2={centerY} stroke="#FF9500" strokeWidth={1} />
          </g>

          {/* Boundary circle - primary color */}
          <circle cx={centerX} cy={centerY} r={maxRadius} fill="none" stroke="rgba(255, 149, 0, 0.3)" strokeWidth={1.5} strokeDasharray="2 2" />
          {/* Ghost position (smoothed/interpolated value) - shows where we're heading */}
          {smoothedValueX !== undefined && smoothedValueY !== undefined && (
            <>
              {/* Ghost connection line - semi-transparent */}
              {(() => {
                // Apply 2x visual multiplier for ghost display
                const visualMultiplier = 2.0;
                const normalizedGhostX = ((smoothedValueX - minX) / (maxX - minX) * 2 - 1);
                const normalizedGhostY = 1 - ((smoothedValueY - minY) / (maxY - minY) * 2); // Inverted Y
                const visualGhostX = normalizedGhostX * visualMultiplier;
                const visualGhostY = normalizedGhostY * visualMultiplier;
                // Clamp to circle bounds
                const ghostDistance = Math.sqrt(visualGhostX * visualGhostX + visualGhostY * visualGhostY);
                const clampedGhostX = ghostDistance > 1 ? visualGhostX / ghostDistance : visualGhostX;
                const clampedGhostY = ghostDistance > 1 ? visualGhostY / ghostDistance : visualGhostY;
                const ghostX = centerX + clampedGhostX * maxRadius;
                const ghostY = centerY - clampedGhostY * maxRadius;
                return (
                  <>
                    <line 
                      x1={centerX} 
                      y1={centerY} 
                      x2={ghostX} 
                      y2={ghostY} 
                      stroke="rgba(255, 149, 0, 0.3)" 
                      strokeWidth={1.5} 
                      strokeLinecap="round" 
                      strokeDasharray="3 3"
                      opacity={0.6}
                    />
                    <circle 
                      cx={ghostX} 
                      cy={ghostY} 
                      r={stickRadius * 0.8} 
                      fill="rgba(255, 149, 0, 0.2)" 
                      stroke="rgba(255, 149, 0, 0.5)" 
                      strokeWidth={1.5}
                    />
                  </>
                );
              })()}
            </>
          )}
          {/* Connection line - primary color */}
          <line x1={centerX} y1={centerY} x2={localStickX} y2={localStickY} stroke="#FF9500" strokeWidth={2} strokeLinecap="round" opacity={0.5} />
          {/* Joystick stick - primary color */}
          <circle cx={localStickX} cy={localStickY} r={stickRadius} fill="#FF9500" stroke={darkMode ? 'rgba(26, 26, 26, 0.8)' : '#fff'} strokeWidth={2} />
        </svg>
      </Box>
    </Box>
  );
}

