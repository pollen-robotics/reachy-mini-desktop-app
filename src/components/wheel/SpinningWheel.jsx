import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Box, Typography } from '@mui/material';
import { useWheelItems, useWheelVirtualization, useWheelActionTrigger, useWheelAnimations } from './hooks';
import WheelSelectionLabel from '@components/wheel/WheelSelectionLabel';
import WheelDiceButton from '@components/wheel/WheelDiceButton';
import WheelIndicator from '@components/wheel/WheelIndicator';
import WheelItem from '@components/wheel/WheelItem';
import {
  WHEEL_SIZE_MULTIPLIER,
  RADIUS_RATIO,
  MIN_ROTATIONS,
  MAX_ROTATIONS,
  SPIN_DURATION_MIN,
  SPIN_DURATION_MAX,
  MIN_MOMENTUM,
  RESIZE_DEBOUNCE_MS,
  DRAG_THROTTLE_MS,
  TOP_ANGLE,
} from '@utils/wheel/constants';
import { normalizeIndex, normalizeAngleDelta } from '@utils/wheel/normalization';
import { getAngleFromCenter, getItemPosition, calculateSnapRotation } from '@utils/wheel/geometry';
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
  emojiSize = 80, // Configurable emoji size
  gap = 120, // Configurable gap between emojis (in degrees)
  sizeMultiplier = WHEEL_SIZE_MULTIPLIER, // Configurable size multiplier
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
  const spinAnimationRef = useRef(null);
  const lastDragTimeRef = useRef(0);
  const lastDragAngleRef = useRef(0);
  const isMountedRef = useRef(true);
  const isClickingRef = useRef(false); // Lock to prevent multiple simultaneous clicks

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
      const newSize = maxDim * sizeMultiplier;
      setWheelSize(newSize);
      setMaxDimension(maxDim);
    }
  }, [sizeMultiplier]);

  // Setup ResizeObserver when container is available
  useEffect(() => {
    if (!containerRef.current) return;

    // Cleanup previous observer
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
    }

    // Create new ResizeObserver with debounced updates for better performance
    const debouncedUpdate = debounce(() => {
      if (!isMountedRef.current) return;
      updateContainerSize();
    }, RESIZE_DEBOUNCE_MS);
    
    resizeObserverRef.current = new ResizeObserver(() => {
      debouncedUpdate();
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
  // ✅ OPTIMIZED: Use requestAnimationFrame for throttling (better performance, no memory leaks)
  const itemCount = displayItems.length;
  const [throttledRotation, setThrottledRotation] = useState(rotation);
  const throttleRafRef = useRef(null);
  const lastThrottledRotationRef = useRef(rotation);
  const frameSkipCountRef = useRef(0);
  
  useEffect(() => {
    // Cancel any pending animation frame
    if (throttleRafRef.current) {
      cancelAnimationFrame(throttleRafRef.current);
      throttleRafRef.current = null;
    }
    
    // Update throttled rotation less frequently during animations
    if (isDragging || isSpinning) {
      // During drag/spin, update every 2 frames (roughly 30fps instead of 60fps)
      const updateThrottled = () => {
        frameSkipCountRef.current++;
        // Skip every other frame (update at ~30fps)
        if (frameSkipCountRef.current >= 2) {
        setThrottledRotation(rotation);
          lastThrottledRotationRef.current = rotation;
          frameSkipCountRef.current = 0;
        }
        throttleRafRef.current = requestAnimationFrame(updateThrottled);
      };
      throttleRafRef.current = requestAnimationFrame(updateThrottled);
    } else {
      // When idle, update immediately
      setThrottledRotation(rotation);
      lastThrottledRotationRef.current = rotation;
      frameSkipCountRef.current = 0;
    }
    
    return () => {
      if (throttleRafRef.current) {
        cancelAnimationFrame(throttleRafRef.current);
        throttleRafRef.current = null;
      }
    };
  }, [rotation, isDragging, isSpinning]);
  
  const visibleItems = useWheelVirtualization(displayItems, throttledRotation, gap);

  // Calculate triangle position (above the wheel at the top)
  const triangleTop = useMemo(() => {
    // Wheel center is at: 100% - wheelSize/2
    // Circle top (where items are) is at: 100% - wheelSize/2 - radius
    // Triangle should be just above: 100% - wheelSize/2 - radius - 20px
    const radius = wheelSize * RADIUS_RATIO;
    return `calc(100% - ${wheelSize / 2}px - ${radius}px - 20px)`;
  }, [wheelSize]);

  // Calculate selected item index directly from rotation (not from visible items)
  // This ensures correct index in infinite loop where same item can appear multiple times
  // Formula: rotation / gap gives the item index that should be at top
  const selectedIndex = useMemo(() => {
    if (!gap || !itemCount) return 0;
    const rotationOffset = throttledRotation / gap;
    const closestIndex = Math.round(rotationOffset);
    return normalizeIndex(closestIndex, itemCount);
  }, [throttledRotation, gap, itemCount]);
  
  // Calculate activeItemAngle from selectedIndex for consistency
  // Use real rotation (not throttled) to calculate which item should be selected
  const selectedIndexForAngle = useMemo(() => {
    if (!gap || !itemCount) return 0;
    const rotationOffset = rotation / gap;
    const closestIndex = Math.round(rotationOffset);
    return normalizeIndex(closestIndex, itemCount);
  }, [rotation, gap, itemCount]);
  
  // Calculate the angle of the selected item
  const activeItemAngle = useMemo(() => {
    if (!gap || !itemCount) return null;
    return TOP_ANGLE + (selectedIndexForAngle * gap);
  }, [selectedIndexForAngle, gap, itemCount]);

  const selectedItem = displayItems[selectedIndex];

  // Action trigger system - extracted to hook
  const { dispatchAction } = useWheelActionTrigger({
    rotation,
    isSpinning,
    isDragging,
    onActionClick,
    isMounted: isMountedRef.current,
    setIsSpinning, // Pass setIsSpinning so action trigger can reset it when action is triggered
  });
  
  // Wheel animations - extracted to hook
  const { startMomentumSpin, startRandomSpin, cleanup: cleanupAnimations } = useWheelAnimations({
    rotation,
    setRotation,
    setIsSpinning,
    gap,
    itemCount,
    displayItems,
    onMomentumEnd: (targetItem, finalRotation) => {
      dispatchAction({ type: 'PENDING', item: targetItem, rotation: finalRotation });
    },
    onRandomEnd: (targetItem, snappedRotation) => {
      dispatchAction({ type: 'PENDING', item: targetItem, rotation: snappedRotation });
    },
    isMountedRef,
    animationFrameRef,
    spinAnimationRef,
  });

  // Handle mouse/touch start for drag
  const handleStart = useCallback((clientX, clientY) => {
    if (isSpinning || !isActive || isBusy || !isReady) {
      return;
    }
    
    
    // Cancel any pending action when starting a new drag
    dispatchAction({ type: 'CANCEL', rotation });
    
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
  }, [isSpinning, isActive, isBusy, isReady, rotation, dispatchAction]);

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
    
    // Check if there was any significant movement
    const rotationDelta = Math.abs(rotation - dragStartRotation);
    const minRotationDelta = 2; // Minimum rotation change in degrees to consider it a real swipe
    
    
    setIsDragging(false);
    
    // If there was no significant movement, don't mark action as pending
    // This prevents double triggering when user just clicks without really dragging
    if (rotationDelta <= minRotationDelta && Math.abs(velocity) <= MIN_MOMENTUM) {
      return;
    }
    
    if (Math.abs(velocity) > MIN_MOMENTUM) {
      // Start momentum spin - callback will handle action triggering
      startMomentumSpin(velocity);
    } else {
      // Snap to nearest item at top when drag ends without momentum
      // BUT: Don't trigger action if movement was too small (slow swipe)
      // Only trigger action if there was significant movement (fast swipe)
      const snappedRotation = calculateSnapRotation(rotation, gap, itemCount);
      const snappedIndex = normalizeIndex(Math.round(snappedRotation / gap), itemCount);
      const targetItem = displayItems[snappedIndex] || displayItems[0];
      
      // Check if movement was significant (at least 3 items worth of rotation)
      const minRotationForAction = gap * 3; // Au moins 3 items de différence
      const totalRotationDelta = Math.abs(snappedRotation - dragStartRotation);
      
      
      setRotation(snappedRotation);
      
      // Only mark action as pending if movement was significant (fast swipe)
      if (totalRotationDelta >= minRotationForAction) {
        setTimeout(() => {
          dispatchAction({ type: 'PENDING', item: targetItem, rotation: snappedRotation });
        }, 50);
      } else {
      }
    }
  }, [isDragging, velocity, rotation, gap, itemCount, displayItems, dragStartRotation, startMomentumSpin, dispatchAction]);

  // Random spin (dice button)
  const handleRandomSpin = useCallback(() => {
    if (isSpinning || !isActive || isBusy || !isReady || !displayItems.length) {
      return;
    }
    
    // Shake animation for dice
    setIsDiceShaking(true);
    setTimeout(() => setIsDiceShaking(false), 500);
    
    // Use hook's startRandomSpin - callback is handled by onRandomEnd in hook
    startRandomSpin();
  }, [isSpinning, isActive, isBusy, isReady, displayItems.length, startRandomSpin, dispatchAction]);

  // Handle item click - only the selected item triggers action
  const handleItemClick = useCallback((e, item, listIndex) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    
    // Only handle clicks on the selected item (active emoji at bottom)
    // Just launch the action, nothing else
    if (listIndex === selectedIndex) {
      // Prevent multiple simultaneous clicks
      if (isClickingRef.current) {
        return;
      }
      
      isClickingRef.current = true;
      
      // Cancel any pending action to prevent double triggering
      dispatchAction({ type: 'CANCEL', rotation });
      
      if (onActionClick && item.originalAction) {
        try {
        // Trigger immediately for click (no need to wait for stabilization)
        onActionClick(item.originalAction);
        } catch (error) {
          console.error('Error in handleItemClick:', error);
        } finally {
          // Reset lock after a short delay to allow action to process
          setTimeout(() => {
            isClickingRef.current = false;
          }, 500);
        }
      } else {
        isClickingRef.current = false;
      }
      return;
    }
    // Clicking on other items does nothing (no rotation, no action)
    // User must use drag or dice button to change selection
  }, [selectedIndex, onActionClick, rotation, dispatchAction]);

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
    
    const handleWheel = (e) => {
      if (isSpinning || !isActive || isBusy || !isReady) {
        return;
      }
      
      e.preventDefault();
      e.stopPropagation();
      
      // Get wheel delta (normalize for different browsers)
      const delta = e.deltaY || e.detail || -e.wheelDelta;
      const rotationDelta = delta > 0 ? gap : -gap;
      
      // Update rotation
      const newRotation = rotation + rotationDelta;
      setRotation(newRotation);
      
      // Snap to nearest item (no auto-action for wheel)
      const snappedRotation = calculateSnapRotation(newRotation, gap, itemCount);
      setRotation(snappedRotation);
      // Pas d'action automatique pour la molette - juste navigation
    };
    
    if (wheelRef.current) {
      const wheel = wheelRef.current;
      wheel.addEventListener('mousedown', handleMouseDown);
      wheel.addEventListener('wheel', handleWheel, { passive: false });
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        wheel.removeEventListener('mousedown', handleMouseDown);
        wheel.removeEventListener('wheel', handleWheel);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [handleStart, handleEnd, isSpinning, isActive, isBusy, isReady, rotation, gap, itemCount, displayItems]);

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
      cleanupAnimations();
    };
  }, [cleanupAnimations]);

  // Keyboard navigation support (accessibility)
  useEffect(() => {
    if (!isActive || isBusy || isSpinning) return;

    const handleKeyDown = (e) => {
      // Only handle if wheel is focused or no other input is focused
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      try {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          // Navigation vers la gauche (item précédent)
          setRotation(prev => prev - gap);
          // Pas d'action automatique, juste navigation
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          // Navigation vers la droite (item suivant)
          setRotation(prev => prev + gap);
          // Pas d'action automatique, juste navigation
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          // Navigation vers le haut (item précédent) - même comportement que gauche
          setRotation(prev => prev - gap);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          // Navigation vers le bas (item suivant) - même comportement que droite
          setRotation(prev => prev + gap);
        } else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          // Entrée ou Espace : déclencher l'action manuellement
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
        overflow: 'hidden',
        zIndex: 0, // Lower than header
        // CSS custom property for max dimension
        '--wheel-max-dimension': `${maxDimension}px`,
        userSelect: 'none', // Prevent text selection in the entire component
      }}
    >
      {/* Gradient overlays for Apple-style fade effect */}
      {(() => {
        // Gradient configuration variables
        const gradientHeight = '240px';
        const gradientWidth = '160px';
        const maxOpacity = 1; // Increased for better visibility
        const midOpacity = 0.6; // Increased for better visibility
        const sideMidOpacity = 0.85; // Increased for better visibility
        const topBottomFadeStart = '25%';
        const topBottomFadeEnd = '65%';
        const sideFadeStart = '35%';
        const sideFadeEnd = '75%';
        
        const darkColor = 'rgba(26, 26, 26,';
        const lightColor = 'rgba(250, 250, 252,';
        
        const topGradient = darkMode
          ? `linear-gradient(to bottom, ${darkColor} ${maxOpacity}) 0%, ${darkColor} ${midOpacity}) ${topBottomFadeStart}, transparent ${topBottomFadeEnd})`
          : `linear-gradient(to bottom, ${lightColor} ${maxOpacity}) 0%, ${lightColor} ${midOpacity}) ${topBottomFadeStart}, transparent ${topBottomFadeEnd})`;
        
        const bottomGradient = darkMode
          ? `linear-gradient(to top, ${darkColor} ${maxOpacity}) 0%, ${darkColor} ${midOpacity}) ${topBottomFadeStart}, transparent ${topBottomFadeEnd})`
          : `linear-gradient(to top, ${lightColor} ${maxOpacity}) 0%, ${lightColor} ${midOpacity}) ${topBottomFadeStart}, transparent ${topBottomFadeEnd})`;
        
        const leftGradient = darkMode
          ? `linear-gradient(to right, ${darkColor} ${maxOpacity}) 0%, ${darkColor} ${sideMidOpacity}) ${sideFadeStart}, transparent ${sideFadeEnd})`
          : `linear-gradient(to right, ${lightColor} ${maxOpacity}) 0%, ${lightColor} ${sideMidOpacity}) ${sideFadeStart}, transparent ${sideFadeEnd})`;
        
        const rightGradient = darkMode
          ? `linear-gradient(to left, ${darkColor} ${maxOpacity}) 0%, ${darkColor} ${sideMidOpacity}) ${sideFadeStart}, transparent ${sideFadeEnd})`
          : `linear-gradient(to left, ${lightColor} ${maxOpacity}) 0%, ${lightColor} ${sideMidOpacity}) ${sideFadeStart}, transparent ${sideFadeEnd})`;
        
        const gradientBoxStyle = {
          position: 'absolute',
          pointerEvents: 'none',
          zIndex: 3,
        };
        
        return (
          <>
            <Box sx={{ ...gradientBoxStyle, top: 0, left: 0, right: 0, height: gradientHeight, background: topGradient }} />
            <Box sx={{ ...gradientBoxStyle, bottom: 0, left: 0, right: 0, height: gradientHeight, background: bottomGradient }} />
            <Box sx={{ ...gradientBoxStyle, left: 0, top: 0, bottom: 0, width: gradientWidth, background: leftGradient }} />
            <Box sx={{ ...gradientBoxStyle, right: 0, top: 0, bottom: 0, width: gradientWidth, background: rightGradient }} />
          </>
        );
      })()}
      {/* Triangle friction indicator - follows active emoji */}
      <WheelIndicator 
        activeItemAngle={activeItemAngle}
        rotation={rotation}
        wheelSize={wheelSize}
        radiusRatio={RADIUS_RATIO}
        isSpinning={isSpinning}
      />

      {/* Combined container for label, index and random button */}
      <Box
        sx={{
          position: 'absolute',
          left: '50%',
          top: 'calc(50% + 90px)', // Position remontée
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2.5, // Espacement harmonieux entre les éléments
          zIndex: 4, // Above gradients and wheel items
          pointerEvents: 'none', // Container doesn't block interactions
        }}
      >
        {/* Selection Label and Index */}
        <Box sx={{ pointerEvents: 'none' }}>
      <WheelSelectionLabel
        selectedItem={selectedItem}
        selectedIndex={selectedIndex}
        itemCount={itemCount}
        darkMode={darkMode}
      />
        </Box>

      {/* Dice button */}
        <Box sx={{ 
          pointerEvents: 'auto',
          zIndex: 10, // Ensure button container is above everything
          position: 'relative', // Needed for z-index to work
        }}>
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
        </Box>
      </Box>

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
          top: '90%', // Even lower position to show fewer emojis at once
          // Use CSS calc with custom property to base size on max dimension
          // This ensures the wheel is always sizeMultiplier% of the container's max dimension
          width: `calc(var(--wheel-max-dimension, ${maxDimension}px) * ${sizeMultiplier})`,
          height: `calc(var(--wheel-max-dimension, ${maxDimension}px) * ${sizeMultiplier})`,
          aspectRatio: '1 / 1', // Ensure it's always square
          maxWidth: 'none', // Allow overflow
          maxHeight: 'none', // Allow overflow
          marginLeft: `calc(var(--wheel-max-dimension, ${maxDimension}px) * ${sizeMultiplier} * -0.5)`, // Center using calculated size
          marginTop: `calc(var(--wheel-max-dimension, ${maxDimension}px) * ${sizeMultiplier} * -0.5)`, // Center using calculated size
          transform: `rotate(${rotation}deg)`,
          transformOrigin: 'center center',
          transition: isDragging ? 'none' : (isSpinning ? 'none' : 'transform 0.1s ease-out'),
          cursor: isDragging ? 'grabbing' : (isSpinning ? 'default' : 'grab'),
          userSelect: 'none',
          touchAction: 'none',
          zIndex: 0, // Lower than header
          pointerEvents: 'auto', // Allow wheel interactions
          outline: 'none', // Remove default focus outline (we handle it with ARIA)
          willChange: isDragging || isSpinning ? 'transform' : 'auto', // Optimize animations
        }}
      >
        {/* Infinite wheel items - only render items in the visible top arc */}
        {visibleItems.map(({ item, angle, listIndex, rawIndex }) => {
          // Safety check
          if (!item) {
            return null;
          }
          
          // Calculate position on wheel using utility
          const { x, y } = getItemPosition(angle, wheelSize, RADIUS_RATIO);
          
          // Item is selected if it's at the fixed top position (always, even during spin)
          const isSelected = listIndex === selectedIndex;
          
          return (
            <WheelItem
              key={`wheel-item-${listIndex}-${rawIndex}`}
              item={item}
              x={x}
              y={y}
              rotation={rotation}
              isSelected={isSelected}
              isDragging={isDragging}
              isSpinning={isSpinning}
              isBusy={isBusy}
              emojiSize={emojiSize}
              activeTab={activeTab}
              onItemClick={handleItemClick}
              listIndex={listIndex}
            />
          );
        })}
      </Box>

    </Box>
  );
}

