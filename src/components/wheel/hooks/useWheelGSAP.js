import { useRef, useCallback } from 'react';
import { gsap } from 'gsap';
import { normalizeIndex, normalizeAngleDelta } from '@utils/wheel/normalization';
import { calculateSnapRotation } from '@utils/wheel/geometry';
import { MIN_MOMENTUM, MIN_ROTATIONS, MAX_ROTATIONS, SPIN_DURATION_MIN, SPIN_DURATION_MAX, RANDOM_EXCLUSION_RADIUS } from '@utils/wheel/constants';

/**
 * Hook to manage wheel rotation with GSAP for smooth physics-based animations
 * Provides spring-like animations with bounce and snap effects
 */
export const useWheelGSAP = ({
  rotation,
  setRotation,
  setIsSpinning,
  gap,
  itemCount,
  displayItems,
  onMomentumEnd,
  onRandomEnd,
  isMountedRef,
}) => {
  const rotationRef = useRef({ value: rotation });
  const tweenRef = useRef(null);
  const isDraggingRef = useRef(false);

  // Update ref when rotation changes externally
  if (rotationRef.current.value !== rotation) {
    rotationRef.current.value = rotation;
  }

  // Kill any active animation
  const killAnimation = useCallback(() => {
    if (tweenRef.current) {
      tweenRef.current.kill();
      tweenRef.current = null;
    }
  }, []);

  // Optimized: Use RAF throttling for setRotation to reduce re-renders
  const rafRef = useRef(null);
  const lastUpdateRef = useRef(0);
  const updateRotation = useCallback((value) => {
    const now = performance.now();
    // Throttle to ~60fps max (16ms between updates)
    if (now - lastUpdateRef.current >= 16) {
      setRotation(value);
      lastUpdateRef.current = now;
    } else {
      // Schedule update for next frame if not already scheduled
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(() => {
          setRotation(rotationRef.current.value);
          rafRef.current = null;
          lastUpdateRef.current = performance.now();
        });
      }
    }
  }, [setRotation]);

  // Animate rotation with GSAP spring physics - optimized
  const animateRotation = useCallback((targetRotation, options = {}) => {
    killAnimation();

    const {
      duration = 0.6,
      ease = 'elastic.out(1, 0.3)', // Spring with bounce
      onComplete = null,
      immediate = false,
    } = options;

    if (immediate) {
      rotationRef.current.value = targetRotation;
      setRotation(targetRotation);
      if (onComplete) onComplete();
      return;
    }

    setIsSpinning(true);

    // Use GSAP's optimized update with throttled React updates
    tweenRef.current = gsap.to(rotationRef.current, {
      value: targetRotation,
      duration,
      ease,
      onUpdate: () => {
        // Throttled update to reduce React re-renders
        updateRotation(rotationRef.current.value);
      },
      onComplete: () => {
        // Ensure final value is set
        setRotation(rotationRef.current.value);
        setIsSpinning(false);
        if (onComplete) onComplete();
        tweenRef.current = null;
      },
    });
  }, [setRotation, setIsSpinning, killAnimation, updateRotation]);

  // Handle momentum spin after drag
  const startMomentumSpin = useCallback((initialVelocity, startRotation = null) => {
    if (!isMountedRef.current) return;

    const currentRotation = rotationRef.current.value;
    const initialRot = startRotation !== null ? startRotation : currentRotation;

    // Calculate target rotation based on velocity
    // Higher velocity = more rotation - increased sensitivity
    const velocityFactor = Math.abs(initialVelocity) / 5; // Reduced divisor from 10 to 5 for more rotation
    const direction = initialVelocity > 0 ? 1 : -1;
    const additionalRotation = velocityFactor * gap * 3; // Increased from 2 to 3 for more distance
    const targetRotation = currentRotation + (additionalRotation * direction);

    // Snap to nearest item
    const snappedRotation = calculateSnapRotation(targetRotation, gap, itemCount);
    const snappedIndex = normalizeIndex(Math.round(snappedRotation / gap), itemCount);
    const targetItem = displayItems[snappedIndex] || displayItems[0];

    // Animate with spring physics - less bouncy, slower
    animateRotation(snappedRotation, {
      duration: 1.0 + (velocityFactor * 0.4), // Slower, longer for higher velocity
      ease: 'power1.out', // Softer, less bouncy deceleration
      onComplete: () => {
        if (onMomentumEnd) {
          onMomentumEnd(targetItem, snappedRotation, initialRot);
        }
      },
    });
  }, [gap, itemCount, displayItems, onMomentumEnd, animateRotation, isMountedRef]);

  // Handle random spin
  const startRandomSpin = useCallback(() => {
    if (!isMountedRef.current) return;

    setIsSpinning(true);

    const rotations = MIN_ROTATIONS + Math.random() * (MAX_ROTATIONS - MIN_ROTATIONS);
    const currentRotationOffset = rotationRef.current.value / gap;
    const currentListIndex = normalizeIndex(Math.round(currentRotationOffset), itemCount);

    // Calculate excluded indices
    const excludedIndices = new Set();
    for (let offset = -RANDOM_EXCLUSION_RADIUS; offset <= RANDOM_EXCLUSION_RADIUS; offset++) {
      const excludedIndex = normalizeIndex(currentListIndex + offset, itemCount);
      excludedIndices.add(excludedIndex);
    }

    // Pick random index
    let randomFinalIndex;
    if (itemCount > excludedIndices.size) {
      const availableIndices = Array.from({ length: itemCount }, (_, i) => i)
        .filter(i => !excludedIndices.has(i));
      randomFinalIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
    } else {
      const otherIndices = Array.from({ length: itemCount }, (_, i) => i)
        .filter(i => i !== currentListIndex);
      randomFinalIndex = otherIndices.length > 0 
        ? otherIndices[Math.floor(Math.random() * otherIndices.length)]
        : currentListIndex;
    }

    const targetRotation = randomFinalIndex * gap + (rotations * 360);
    const totalRotation = normalizeAngleDelta(targetRotation - rotationRef.current.value);
    const endRotation = rotationRef.current.value + totalRotation;
    const duration = SPIN_DURATION_MIN + Math.random() * (SPIN_DURATION_MAX - SPIN_DURATION_MIN);

    // Animate with smooth easing - slower, less bouncy
    animateRotation(endRotation, {
      duration: duration / 1000, // Convert ms to seconds
      ease: 'power1.out', // Softer easing
      onComplete: () => {
        const snappedRotation = calculateSnapRotation(endRotation, gap, itemCount);
        const snappedIndex = normalizeIndex(Math.round(snappedRotation / gap), itemCount);
        const targetItem = displayItems[snappedIndex] || displayItems[0];

        // Final snap with subtle bounce - less bouncy
        animateRotation(snappedRotation, {
          duration: 0.6, // Slower
          ease: 'elastic.out(1, 0.2)', // Less bouncy (0.2 instead of 0.4)
          onComplete: () => {
            if (onRandomEnd) {
              onRandomEnd(targetItem, snappedRotation);
            }
          },
        });
      },
    });
  }, [gap, itemCount, displayItems, onRandomEnd, animateRotation, isMountedRef, setIsSpinning]);

  // Snap to nearest item with bounce - softer at low speeds, less bouncy overall
  const snapToNearest = useCallback((targetRotation = null, velocity = 0) => {
    const currentRot = targetRotation !== null ? targetRotation : rotationRef.current.value;
    const snappedRotation = calculateSnapRotation(currentRot, gap, itemCount);

    // Softer snap at lower velocities - less magnetic
    const absVelocity = Math.abs(velocity);
    const isLowVelocity = absVelocity < 15;
    
    animateRotation(snappedRotation, {
      duration: isLowVelocity ? 0.4 : 0.6, // Slower, less bouncy
      ease: isLowVelocity ? 'power1.out' : 'elastic.out(1, 0.2)', // Less bounce (0.2 instead of 0.35)
    });
  }, [gap, itemCount, animateRotation]);

  // Update rotation during drag (immediate, no animation)
  const updateRotationDuringDrag = useCallback((newRotation) => {
    if (tweenRef.current) {
      tweenRef.current.kill();
      tweenRef.current = null;
    }
    rotationRef.current.value = newRotation;
    setRotation(newRotation);
  }, [setRotation]);

  // Set dragging state
  const setDragging = useCallback((isDragging) => {
    isDraggingRef.current = isDragging;
    if (isDragging) {
      killAnimation();
    }
  }, [killAnimation]);

  // Cleanup
  const cleanup = useCallback(() => {
    killAnimation();
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, [killAnimation]);

  return {
    rotationRef,
    animateRotation,
    startMomentumSpin,
    startRandomSpin,
    snapToNearest,
    updateRotationDuringDrag,
    setDragging,
    killAnimation,
    cleanup,
  };
};

