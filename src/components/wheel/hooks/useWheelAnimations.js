import { useCallback, useRef } from 'react';
import { FRICTION, MIN_VELOCITY, MIN_ROTATIONS, MAX_ROTATIONS, SPIN_DURATION_MIN, SPIN_DURATION_MAX } from '@utils/wheel/constants';
import { normalizeIndex, normalizeAngleDelta } from '@utils/wheel/normalization';
import { calculateSnapRotation } from '@utils/wheel/geometry';
import { easeOutCubic } from '@utils/wheel/performance';

/**
 * Hook to manage wheel animations (momentum spin and random spin)
 * 
 * @param {Object} params
 * @param {number} params.rotation - Current rotation
 * @param {Function} params.setRotation - Function to update rotation
 * @param {Function} params.setIsSpinning - Function to update spinning state
 * @param {number} params.gap - Gap between items in degrees
 * @param {number} params.itemCount - Total number of items
 * @param {Array} params.displayItems - All display items
 * @param {Function} params.onMomentumEnd - Callback when momentum ends (receives targetItem)
 * @param {Function} params.onRandomEnd - Callback when random spin ends (receives targetItem)
 * @param {Object} params.isMountedRef - Ref to track if component is mounted
 * @param {Object} params.animationFrameRef - Ref for animation frame
 * @param {Object} params.spinAnimationRef - Ref for spin animation frame
 * @returns {Object} { startMomentumSpin, startRandomSpin }
 */
export const useWheelAnimations = ({
  rotation,
  setRotation,
  setIsSpinning,
  gap,
  itemCount,
  displayItems,
  onMomentumEnd,
  onRandomEnd,
  isMountedRef,
  animationFrameRef,
  spinAnimationRef,
}) => {
  // Momentum spin after drag with snap at the end
  const startMomentumSpin = useCallback((initialVelocity) => {
    if (!isMountedRef.current) return;
    
    setIsSpinning(true);
    let currentVelocity = initialVelocity;
    let currentRotation = rotation;
    
    const animate = () => {
      if (!isMountedRef.current || Math.abs(currentVelocity) < MIN_VELOCITY) {
        setIsSpinning(false);
        const finalRotation = calculateSnapRotation(currentRotation, gap, itemCount);
        const snappedIndex = normalizeIndex(Math.round(finalRotation / gap), itemCount);
        const targetItem = displayItems[snappedIndex] || displayItems[0];
        
        setRotation(finalRotation);
        
        if (onMomentumEnd) {
          setTimeout(() => {
            onMomentumEnd(targetItem, finalRotation);
          }, 50);
        }
        return;
      }
      
      currentRotation += currentVelocity;
      setRotation(currentRotation);
      currentVelocity *= FRICTION;
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    
    animationFrameRef.current = requestAnimationFrame(animate);
  }, [rotation, gap, itemCount, displayItems, onMomentumEnd, isMountedRef, animationFrameRef, setIsSpinning, setRotation]);
  
  // Random spin (dice button)
  const startRandomSpin = useCallback(() => {
    if (!isMountedRef.current) return;
    
    setIsSpinning(true);
    
    const rotations = MIN_ROTATIONS + Math.random() * (MAX_ROTATIONS - MIN_ROTATIONS);
    
    // Simple random: pick any index except the current one (to ensure movement)
    const currentRotationOffset = rotation / gap;
    const currentListIndex = normalizeIndex(Math.round(currentRotationOffset), itemCount);
    
    // Pick a random index, excluding the current one to ensure the wheel moves
    let randomFinalIndex;
    if (itemCount > 1) {
      const otherIndices = Array.from({ length: itemCount }, (_, i) => i).filter(i => i !== currentListIndex);
      randomFinalIndex = otherIndices[Math.floor(Math.random() * otherIndices.length)];
    } else {
      randomFinalIndex = 0;
    }
    
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
        // Animation complete - snap to exact position
        const snappedRotation = calculateSnapRotation(endRotation, gap, itemCount);
        const snappedIndex = normalizeIndex(Math.round(snappedRotation / gap), itemCount);
        const targetItem = displayItems[snappedIndex] || displayItems[0];
        
        setRotation(snappedRotation);
        setIsSpinning(false);
        
        if (onRandomEnd) {
          setTimeout(() => {
            onRandomEnd(targetItem, snappedRotation);
          }, 50);
        }
      }
    };
    
    spinAnimationRef.current = requestAnimationFrame(animate);
  }, [rotation, gap, itemCount, displayItems, onRandomEnd, isMountedRef, spinAnimationRef, setIsSpinning, setRotation]);
  
  // Cleanup function
  const cleanup = useCallback(() => {
    if (animationFrameRef?.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (spinAnimationRef?.current) {
      cancelAnimationFrame(spinAnimationRef.current);
      spinAnimationRef.current = null;
    }
  }, [animationFrameRef, spinAnimationRef]);
  
  return { startMomentumSpin, startRandomSpin, cleanup };
};
