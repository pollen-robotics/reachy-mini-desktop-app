import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Box, Typography } from '@mui/material';
import { useWheelItems } from '@hooks/wheel/useWheelItems';
import { useWheelVirtualization } from '@hooks/wheel/useWheelVirtualization';
import WheelSelectionLabel from '@components/wheel/WheelSelectionLabel';
import WheelDiceButton from '@components/wheel/WheelDiceButton';
import WheelIndicator from '@components/wheel/WheelIndicator';
import {
  WHEEL_SIZE_MULTIPLIER,
  RADIUS_RATIO,
  MIN_ROTATIONS,
  MAX_ROTATIONS,
  SPIN_DURATION_MIN,
  SPIN_DURATION_MAX,
  FRICTION,
  MIN_VELOCITY,
  MIN_MOMENTUM,
  RESIZE_DEBOUNCE_MS,
  DRAG_THROTTLE_MS,
  TOP_ANGLE,
} from '@utils/wheel/constants';
import { normalizeIndex, getShortestPath, normalizeAngleDelta } from '@utils/wheel/normalization';
import { getAngleFromCenter, getItemPosition, calculateSelectedIndex, calculateSnapRotation } from '@utils/wheel/geometry';
import { debounce, throttle, easeOutCubic } from '@utils/wheel/performance';

/**
 * Spinning Wheel Component for Expressions
 * Virtualized rotating wheel - only displays visible items with configurable spacing
 */
export default function SpinningWheel({
  actions = [],
  onActionClick = null,
  isReady = false,
  isActive = false,
  isBusy = false,
  darkMode = false,
  activeTab = 'emotions',
  onTabChange = null,
  emojiSize = 72, // Configurable emoji size
  gap = 120, // Configurable gap between emojis (in degrees)
}) {
  const [rotation, setRotation] = useState(0); // Current rotation in degrees
  const [isDragging, setIsDragging] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [dragStartAngle, setDragStartAngle] = useState(0);
  const [dragStartRotation, setDragStartRotation] = useState(0);
  const [velocity, setVelocity] = useState(0);
  const [isDiceShaking, setIsDiceShaking] = useState(false);
  
  const wheelRef = useRef(null);
  const containerRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const animationFrameRef = useRef(null);
  const lastDragTimeRef = useRef(0);
  const lastDragAngleRef = useRef(0);
  const spinAnimationRef = useRef(null);
  const isMountedRef = useRef(true);

  // Get all items from active library using hook
  const displayItems = useWheelItems(activeTab, actions);

  // Calculate wheel size as percentage of container's max dimension
  // We need the actual pixel size for calculations, but use percentage for CSS
  const [wheelSize, setWheelSize] = useState(1200); // Default fallback for calculations
  const [maxDimension, setMaxDimension] = useState(600); // Max dimension of container for CSS calc
  const containerSizeRef = useRef({ width: 0, height: 0 });

  // Update container size reference for percentage-based calculations
  const updateContainerSize = useCallback(() => {
    if (!containerRef.current || !isMountedRef.current) return;
    
    const container = containerRef.current;
    const containerWidth = container.clientWidth || container.offsetWidth || 0;
    const containerHeight = container.clientHeight || container.offsetHeight || 0;
    
    if (containerWidth > 0 && containerHeight > 0) {
      containerSizeRef.current = { width: containerWidth, height: containerHeight };
      const maxDim = Math.max(containerWidth, containerHeight);
      const newSize = maxDim * WHEEL_SIZE_MULTIPLIER;
      setWheelSize(newSize);
      setMaxDimension(maxDim);
    }
  }, []);

  // Setup ResizeObserver when container is available
  useEffect(() => {
    if (!containerRef.current) return;

    // Cleanup previous observer
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
    }

    // Create new ResizeObserver
    resizeObserverRef.current = new ResizeObserver((entries) => {
      if (!isMountedRef.current) return;
      requestAnimationFrame(() => {
        updateContainerSize();
      });
    });

    resizeObserverRef.current.observe(containerRef.current);

    // Initial size calculation
    const tryUpdate = () => {
      if (containerRef.current) {
        const container = containerRef.current;
        if (container.clientWidth > 0 && container.clientHeight > 0) {
          updateContainerSize();
        } else {
          setTimeout(tryUpdate, 10);
        }
      }
    };
    
    tryUpdate();
    const timeoutId = setTimeout(tryUpdate, 50);

    return () => {
      clearTimeout(timeoutId);
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
    };
  }, [updateContainerSize]);

  // Calculate visible items for virtualization using hook
  const itemCount = displayItems.length;
  const visibleItems = useWheelVirtualization(displayItems, rotation, gap);

  // Calculate triangle position (above the wheel at the top)
  const triangleTop = useMemo(() => {
    // Wheel center is at: 100% - wheelSize/2
    // Circle top (where items are) is at: 100% - wheelSize/2 - radius
    // Triangle should be just above: 100% - wheelSize/2 - radius - 20px
    const radius = wheelSize * RADIUS_RATIO;
    return `calc(100% - ${wheelSize / 2}px - ${radius}px - 20px)`;
  }, [wheelSize]);

  // Calculate selected item index: item with highest Y position (closest to top of screen)
  // Also track the angle of the active item for the friction triangle
  const { selectedIndex, activeItemAngle } = useMemo(() => {
    if (!visibleItems.length) return { selectedIndex: 0, activeItemAngle: null };
    
    let minY = Infinity;
    let selectedListIndex = 0;
    let activeAngle = null;
    const wheelCenter = wheelSize / 2;
    const rotationRad = (rotation * Math.PI) / 180;
    const cos = Math.cos(rotationRad);
    const sin = Math.sin(rotationRad);
    
    visibleItems.forEach(({ item, angle, listIndex }) => {
      if (!item) return;
      
      // Get item position, then rotate around wheel center
      const { x: itemX, y: itemY } = getItemPosition(angle, wheelSize, RADIUS_RATIO);
      const dx = itemX - wheelCenter;
      const dy = itemY - wheelCenter;
      
      // Apply rotation transformation
      const rotatedY = wheelCenter + (dx * sin + dy * cos);
      
      // Item with smallest Y is highest on screen
      if (rotatedY < minY) {
        minY = rotatedY;
        selectedListIndex = listIndex;
        activeAngle = angle; // Store angle for triangle positioning
      }
    });
    
    return { selectedIndex: selectedListIndex, activeItemAngle: activeAngle };
  }, [visibleItems, wheelSize, rotation]);

  const selectedItem = displayItems[selectedIndex];

  // Centralized action trigger system
  // Use a ref to track when action should be triggered
  const pendingActionRef = useRef(false);
  const lastStableRotationRef = useRef(rotation);
  const actionTimeoutRef = useRef(null);
  
  // Helper to trigger action for current selected item
  const triggerAction = useCallback(() => {
    if (!onActionClick || !isMountedRef.current || !selectedItem?.originalAction) return;
    
    // Clear any pending timeout
    if (actionTimeoutRef.current) {
      clearTimeout(actionTimeoutRef.current);
      actionTimeoutRef.current = null;
    }
    
    // Small delay to ensure UI is stable
    actionTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current && onActionClick && selectedItem?.originalAction) {
        onActionClick(selectedItem.originalAction);
        pendingActionRef.current = false;
      }
      actionTimeoutRef.current = null;
    }, 200);
  }, [onActionClick, selectedItem]);
  
  // Monitor rotation stability and trigger action when ready
  useEffect(() => {
    // Clear any pending timeout when dependencies change
    if (actionTimeoutRef.current) {
      clearTimeout(actionTimeoutRef.current);
      actionTimeoutRef.current = null;
    }
    
    // Check if we should trigger action
    const rotationStable = Math.abs(rotation - lastStableRotationRef.current) < 0.1;
    const shouldTrigger = pendingActionRef.current && 
                         !isSpinning && 
                         !isDragging && 
                         rotationStable &&
                         selectedItem?.originalAction;
    
    if (shouldTrigger) {
      triggerAction();
    }
    
    // Update last stable rotation if wheel is not moving
    if (!isSpinning && !isDragging) {
      lastStableRotationRef.current = rotation;
    }
    
    return () => {
      if (actionTimeoutRef.current) {
        clearTimeout(actionTimeoutRef.current);
        actionTimeoutRef.current = null;
      }
    };
  }, [rotation, isSpinning, isDragging, selectedItem, triggerAction]);

  // Handle mouse/touch start for drag
  const handleStart = useCallback((clientX, clientY) => {
    if (isSpinning || !isActive || isBusy || !isReady) return;
    
    if (wheelRef.current) {
      const rect = wheelRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const angle = getAngleFromCenter(centerX, centerY, clientX, clientY);
      
      setIsDragging(true);
      setDragStartAngle(angle);
      setDragStartRotation(rotation);
      setVelocity(0);
      lastDragTimeRef.current = Date.now();
      lastDragAngleRef.current = angle;
    }
  }, [isSpinning, isActive, isBusy, isReady, rotation, getAngleFromCenter]);

  // Handle mouse/touch move for drag
  const handleMoveInternal = useCallback((clientX, clientY) => {
    if (!isDragging || !wheelRef.current || !isMountedRef.current) return;
    
    try {
      const rect = wheelRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const currentAngle = getAngleFromCenter(centerX, centerY, clientX, clientY);
      
      // Calculate rotation delta
      const angleDelta = normalizeAngleDelta(currentAngle - dragStartAngle);
      setRotation(dragStartRotation + angleDelta);
      
      // Calculate velocity for momentum
      const now = Date.now();
      const timeDelta = now - lastDragTimeRef.current;
      if (timeDelta > 0) {
        const angleDelta2 = normalizeAngleDelta(currentAngle - lastDragAngleRef.current);
        const newVelocity = (angleDelta2 / timeDelta) * 16; // Scale factor
        setVelocity(newVelocity);
      }
      
      lastDragTimeRef.current = now;
      lastDragAngleRef.current = currentAngle;
    } catch (error) {
      console.error('Error in handleMove:', error);
    }
  }, [isDragging, dragStartAngle, dragStartRotation, getAngleFromCenter]);
  
  // Throttled version stored in ref to avoid recreating on each render
  const throttledHandleMoveRef = useRef(null);
  useEffect(() => {
    throttledHandleMoveRef.current = throttle(handleMoveInternal, DRAG_THROTTLE_MS);
  }, [handleMoveInternal]);

  // Handle mouse/touch end for drag with snap to nearest item
  const handleEnd = useCallback(() => {
    if (!isDragging) return;
    
    setIsDragging(false);
    
    if (Math.abs(velocity) > MIN_MOMENTUM) {
      // Mark action as pending - will trigger after momentum ends
      pendingActionRef.current = true;
      startMomentumSpin(velocity);
    } else {
      // Snap to nearest item at top when drag ends without momentum
      const snappedRotation = calculateSnapRotation(rotation, gap, itemCount);
      setRotation(snappedRotation);
      // Mark action as pending - will trigger when rotation stabilizes
      pendingActionRef.current = true;
    }
  }, [isDragging, velocity, rotation, gap, itemCount]);

  // Momentum spin after drag with snap at the end
  const startMomentumSpin = useCallback((initialVelocity) => {
    if (!isMountedRef.current) return;
    
    setIsSpinning(true);
    let currentVelocity = initialVelocity;
    let currentRotation = rotation; // Track rotation locally
    
    const animate = () => {
      if (!isMountedRef.current || Math.abs(currentVelocity) < MIN_VELOCITY) {
        setIsSpinning(false);
        // Snap to nearest item at top after momentum ends
        const finalRotation = calculateSnapRotation(currentRotation, gap, itemCount);
        setRotation(finalRotation);
        // Action will be triggered by useEffect when rotation stabilizes
        // pendingActionRef is already set to true in handleEnd
        return;
      }
      
      currentRotation += currentVelocity;
      setRotation(currentRotation);
      currentVelocity *= FRICTION;
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    
    animationFrameRef.current = requestAnimationFrame(animate);
  }, [rotation, gap, itemCount]);

  // Random spin (dice button)
  const handleRandomSpin = useCallback(() => {
    if (isSpinning || !isActive || isBusy || !isReady || !displayItems.length) return;
    
    // Shake animation for dice
    setIsDiceShaking(true);
    setTimeout(() => setIsDiceShaking(false), 500);
    
    setIsSpinning(true);
    
    const rotations = MIN_ROTATIONS + Math.random() * (MAX_ROTATIONS - MIN_ROTATIONS);
    
    // Calculate current index from rotation to ensure we have the most up-to-date value
    // This is more reliable than using selectedIndex which might not be updated yet
    const currentRotationOffset = rotation / gap;
    const currentListIndex = normalizeIndex(Math.round(currentRotationOffset), itemCount);
    
    // Also use selectedIndex as a fallback/verification
    // If they differ significantly, there might be a timing issue
    const indexFromSelected = selectedIndex;
    const indexDiff = Math.abs(getShortestPath(currentListIndex, indexFromSelected, itemCount));
    
    // If there's a big difference, log it for debugging
    if (indexDiff > 5) {
      console.warn(`⚠️ Index mismatch: rotation-based=${currentListIndex}, selectedIndex=${indexFromSelected}, diff=${indexDiff}`);
    }
    
    // Generate random index with minimum 20 items difference
    const MIN_DIFFERENCE = 20;
    let randomFinalIndex;
    
    // If we have fewer items than MIN_DIFFERENCE, just pick any random one
    if (itemCount <= MIN_DIFFERENCE) {
      randomFinalIndex = Math.floor(Math.random() * itemCount);
    } else {
      // Generate random index ensuring minimum difference
      // Calculate valid range: exclude items within MIN_DIFFERENCE of current (in both directions)
      const validIndices = [];
      for (let i = 0; i < itemCount; i++) {
        // Skip the current index itself
        if (i === currentListIndex) continue;
        
        // Calculate shortest path (can be negative or positive)
        const path = getShortestPath(currentListIndex, i, itemCount);
        const absPath = Math.abs(path);
        
        // Only include if distance is at least MIN_DIFFERENCE
        if (absPath >= MIN_DIFFERENCE) {
          validIndices.push(i);
        }
      }
      
      // Pick random from valid indices
      if (validIndices.length > 0) {
        randomFinalIndex = validIndices[Math.floor(Math.random() * validIndices.length)];
        
        // Double-check the difference
        const finalDiff = getShortestPath(currentListIndex, randomFinalIndex, itemCount);
        const finalAbsDiff = Math.abs(finalDiff);
        
        // If somehow we got an invalid index, try again with a simpler approach
        if (finalAbsDiff < MIN_DIFFERENCE) {
          // Fallback: pick from indices that are definitely far enough
          const safeIndices = validIndices.filter(idx => {
            const path = getShortestPath(currentListIndex, idx, itemCount);
            return Math.abs(path) >= MIN_DIFFERENCE;
          });
          
          if (safeIndices.length > 0) {
            randomFinalIndex = safeIndices[Math.floor(Math.random() * safeIndices.length)];
          } else {
            // Last resort: pick any index that's not the current one
            const otherIndices = Array.from({ length: itemCount }, (_, i) => i).filter(i => i !== currentListIndex);
            randomFinalIndex = otherIndices[Math.floor(Math.random() * otherIndices.length)];
          }
        }
      } else {
        // Fallback: just pick any random (shouldn't happen)
        const otherIndices = Array.from({ length: itemCount }, (_, i) => i).filter(i => i !== currentListIndex);
        randomFinalIndex = otherIndices.length > 0 
          ? otherIndices[Math.floor(Math.random() * otherIndices.length)]
          : Math.floor(Math.random() * itemCount);
      }
    }
    
    // Calculate rotation needed to bring randomFinalIndex to the top
    const diff = getShortestPath(currentListIndex, randomFinalIndex, itemCount);
    const absDiff = Math.abs(diff);
    
    // Final verification - log if difference is too small (for debugging)
    if (absDiff < MIN_DIFFERENCE) {
      console.warn(`⚠️ Random spin: difference too small! Current: ${currentListIndex}, Random: ${randomFinalIndex}, Diff: ${absDiff}`);
    }
    // The target rotation should position randomFinalIndex at the top (TOP_ANGLE = -90)
    // Item at index i is at: TOP_ANGLE + (i * gap) - rotation
    // We want: TOP_ANGLE + (i * gap) - rotation = TOP_ANGLE
    // So: rotation = i * gap
    const targetRotation = randomFinalIndex * gap + (rotations * 360);
    const totalRotation = normalizeAngleDelta(targetRotation - rotation);
    
    const startRotation = rotation;
    const endRotation = rotation + totalRotation;
    const duration = SPIN_DURATION_MIN + Math.random() * (SPIN_DURATION_MAX - SPIN_DURATION_MIN);
    const startTime = Date.now();
    
    const animate = () => {
      if (!isMountedRef.current) {
        setIsSpinning(false);
        return;
      }
      
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);
      
      setRotation(startRotation + (endRotation - startRotation) * eased);
      
      if (progress < 1) {
        spinAnimationRef.current = requestAnimationFrame(animate);
      } else {
        setIsSpinning(false);
        // Snap to exact position for clean alignment
        const snappedRotation = calculateSnapRotation(endRotation, gap, itemCount);
        setRotation(snappedRotation);
        // Mark action as pending - will trigger when rotation stabilizes
        pendingActionRef.current = true;
      }
    };
    
    spinAnimationRef.current = requestAnimationFrame(animate);
  }, [isSpinning, isActive, isBusy, isReady, displayItems, rotation, gap, itemCount, onActionClick, selectedIndex]);

  // Handle item click - only the selected item triggers action
  const handleItemClick = useCallback((e, item, listIndex) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    
    // Only handle clicks on the selected item (active emoji at bottom)
    // Just launch the action, nothing else
    if (listIndex === selectedIndex) {
      if (onActionClick && item.originalAction) {
        // Trigger immediately for click (no need to wait for stabilization)
        onActionClick(item.originalAction);
      }
      return;
    }
    
    // Clicking on other items does nothing (no rotation, no action)
    // User must use drag or dice button to change selection
  }, [selectedIndex, onActionClick]);

  // Mouse events
  useEffect(() => {
    const handleMouseDown = (e) => {
      handleStart(e.clientX, e.clientY);
    };
    
    const handleMouseMove = (e) => {
      if (throttledHandleMoveRef.current) {
        throttledHandleMoveRef.current(e.clientX, e.clientY);
      }
    };
    
    const handleMouseUp = () => {
      handleEnd();
    };
    
    if (wheelRef.current) {
      const wheel = wheelRef.current;
      wheel.addEventListener('mousedown', handleMouseDown);
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        wheel.removeEventListener('mousedown', handleMouseDown);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [handleStart, handleEnd]);

  // Touch events
  useEffect(() => {
    const handleTouchStart = (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      handleStart(touch.clientX, touch.clientY);
    };
    
    const handleTouchMove = (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      if (throttledHandleMoveRef.current) {
        throttledHandleMoveRef.current(touch.clientX, touch.clientY);
      }
    };
    
    const handleTouchEnd = (e) => {
      e.preventDefault();
      handleEnd();
    };
    
    if (wheelRef.current) {
      const wheel = wheelRef.current;
      wheel.addEventListener('touchstart', handleTouchStart, { passive: false });
      wheel.addEventListener('touchmove', handleTouchMove, { passive: false });
      wheel.addEventListener('touchend', handleTouchEnd, { passive: false });
      
      return () => {
        wheel.removeEventListener('touchstart', handleTouchStart);
        wheel.removeEventListener('touchmove', handleTouchMove);
        wheel.removeEventListener('touchend', handleTouchEnd);
      };
    }
  }, [handleStart, handleEnd]);

  // Cleanup animations and mount state
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (spinAnimationRef.current) {
        cancelAnimationFrame(spinAnimationRef.current);
      }
    };
  }, []);

  // Keyboard navigation support (accessibility)
  useEffect(() => {
    if (!isActive || isBusy || isSpinning) return;

    const handleKeyDown = (e) => {
      // Only handle if wheel is focused or no other input is focused
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      try {
        if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
          e.preventDefault();
          setRotation(prev => prev - gap);
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
          e.preventDefault();
          setRotation(prev => prev + gap);
        } else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (selectedItem?.originalAction && onActionClick) {
            onActionClick(selectedItem.originalAction);
          }
        } else if (e.key === 'Home') {
          e.preventDefault();
          setRotation(0);
        } else if (e.key === 'End') {
          e.preventDefault();
          setRotation((itemCount - 1) * gap);
        }
      } catch (error) {
        console.error('Error in keyboard navigation:', error);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, isBusy, isSpinning, gap, itemCount, selectedItem, onActionClick]);


  if (displayItems.length === 0) return null;

  return (
    <Box 
      ref={containerRef}
      sx={{ 
        width: '100%', 
        height: '100%', 
        position: 'relative', 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'flex-start', 
        overflow: 'visible',
        zIndex: 1, // Lower than header
        // CSS custom property for max dimension
        '--wheel-max-dimension': `${maxDimension}px`,
        userSelect: 'none', // Prevent text selection in the entire component
      }}
    >
      {/* Selection Indicator */}
      <WheelSelectionLabel
        selectedItem={selectedItem}
        selectedIndex={selectedIndex}
        itemCount={itemCount}
        darkMode={darkMode}
      />

      {/* Dice button */}
      <WheelDiceButton
        onRandomSpin={handleRandomSpin}
        isSpinning={isSpinning}
        isActive={isActive}
        isBusy={isBusy}
        isReady={isReady}
        darkMode={darkMode}
        activeTab={activeTab}
        isDiceShaking={isDiceShaking}
      />

      {/* Triangle friction indicator - follows active emoji */}
      <WheelIndicator 
        activeItemAngle={activeItemAngle}
        rotation={rotation}
        wheelSize={wheelSize}
        radiusRatio={RADIUS_RATIO}
        isSpinning={isSpinning}
      />

      {/* Spinning Wheel - Positioned much lower to show fewer emojis */}
      <Box
        ref={wheelRef}
        role="listbox"
        aria-label={`${activeTab === 'emotions' ? 'Emotions' : 'Dances'} selection wheel`}
        aria-activedescendant={`wheel-item-${selectedIndex}`}
        tabIndex={isActive && !isBusy ? 0 : -1}
        onClick={(e) => {
          // Only handle clicks on the wheel container itself, not on items
          // Items have their own onClick handlers
          if (e.target === e.currentTarget) {
            e.stopPropagation();
          }
        }}
        sx={{
          position: 'absolute',
          left: '50%',
          top: '100%', // Even lower position to show fewer emojis at once
          // Use CSS calc with custom property to base size on max dimension
          // This ensures the wheel is always 200% of the container's max dimension
          width: `calc(var(--wheel-max-dimension, ${maxDimension}px) * ${WHEEL_SIZE_MULTIPLIER})`,
          height: `calc(var(--wheel-max-dimension, ${maxDimension}px) * ${WHEEL_SIZE_MULTIPLIER})`,
          aspectRatio: '1 / 1', // Ensure it's always square
          maxWidth: 'none', // Allow overflow
          maxHeight: 'none', // Allow overflow
          marginLeft: `calc(var(--wheel-max-dimension, ${maxDimension}px) * ${WHEEL_SIZE_MULTIPLIER} * -0.5)`, // Center using calculated size
          marginTop: `calc(var(--wheel-max-dimension, ${maxDimension}px) * ${WHEEL_SIZE_MULTIPLIER} * -0.5)`, // Center using calculated size
          transform: `rotate(${rotation}deg)`,
          transformOrigin: 'center center',
          transition: isDragging ? 'none' : (isSpinning ? 'none' : 'transform 0.1s ease-out'),
          cursor: isDragging ? 'grabbing' : (isSpinning ? 'default' : 'grab'),
          userSelect: 'none',
          touchAction: 'none',
          zIndex: 1, // Lower than header tabs
          pointerEvents: 'auto', // Allow wheel interactions
          outline: 'none', // Remove default focus outline (we handle it with ARIA)
        }}
      >
        {/* Infinite wheel items - only render items in the visible top arc */}
        {visibleItems.map(({ item, angle, listIndex, rawIndex }) => {
          // Safety check
          if (!item) {
            console.warn('🔍 Rendering: item is null/undefined', { listIndex, rawIndex });
            return null;
          }
          
          // Calculate position on wheel using utility
          const { x, y } = getItemPosition(angle, wheelSize, RADIUS_RATIO);
          
          // Item is selected if it's at the fixed top position (always, even during spin)
          const isSelected = listIndex === selectedIndex;
          
          // Ensure emoji exists, fallback to default if not
          const displayEmoji = item.emoji || (activeTab === 'emotions' ? '😐' : '🎵');
          
          if (!displayEmoji) {
            console.warn('🔍 Rendering: no emoji found', { listIndex, item, activeTab });
          }
          
          return (
            <Box
              key={`wheel-item-${listIndex}-${rawIndex}`}
              role="option"
              aria-selected={isSelected}
              id={`wheel-item-${listIndex}`}
              onClick={(e) => {
                // Stop propagation immediately to prevent any parent handlers
                e.stopPropagation();
                e.preventDefault();
                handleItemClick(e, item, listIndex);
              }}
              onMouseDown={(e) => {
                // Also stop propagation on mousedown to prevent drag from starting
                e.stopPropagation();
              }}
              sx={{
                position: 'absolute',
                left: `${x}px`,
                top: `${y}px`,
                transform: `translate(-50%, -50%) rotate(${-rotation}deg) ${isSelected ? 'scale(1.15)' : 'scale(1)'}`,
                width: emojiSize + 40,
                height: emojiSize + 40,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: isSelected ? 'pointer' : 'default',
                transition: isDragging || isSpinning ? 'none' : 'transform 0.2s ease-out',
                zIndex: isSelected ? 10 : 5,
                pointerEvents: 'auto',
                border: isSelected ? '2px solid #FF9500' : '1px solid transparent',
                borderRadius: isSelected ? '50%' : '0',
                opacity: isBusy && !isSelected ? 0.3 : 1,
                filter: isBusy && !isSelected ? 'grayscale(50%)' : (isSelected ? 'drop-shadow(0 0 8px rgba(255, 149, 0, 0.6))' : 'none'),
              }}
            >
              <Typography
                component="span"
                aria-label={item.label}
                sx={{
                  fontSize: emojiSize,
                  lineHeight: 1,
                  userSelect: 'none',
                }}
              >
                {displayEmoji}
              </Typography>
            </Box>
          );
        })}
      </Box>

    </Box>
  );
}

