import { useMemo } from 'react';
import { TOP_ANGLE } from '@utils/wheel/constants';
import { normalizeIndex } from '@utils/wheel/normalization';

/**
 * Hook to calculate visible items for virtualization
 * Only renders items within visible arc to improve performance
 * 
 * @param {Array} displayItems - All available items
 * @param {number} rotation - Current rotation in degrees
 * @param {number} gap - Gap between items in degrees
 * @returns {Array} Array of visible items with angle, listIndex, rawIndex
 */
export const useWheelVirtualization = (displayItems, rotation, gap) => {
  const itemCount = displayItems.length;
  
  return useMemo(() => {
    try {
      // Validation
      if (!gap || gap <= 0 || !itemCount || !displayItems?.length) {
        return [];
      }
      
      // Calculate how many items make one full circle
      const itemsPerCircle = 360 / gap;
      const halfCircleItems = itemsPerCircle / 2;
      
      // Calculate which item should be at the top
      const rotationOffset = rotation / gap;
      const centerItemIndex = Math.round(rotationOffset);
      
      // Only check items within one full circle (half on each side)
      const itemsToCheck = Math.ceil(halfCircleItems) + 1; // +1 for safety
      
      const visible = [];
      const seenRawIndices = new Set(); // Track rawIndex to prevent duplicates
      
      // Iterate through potential item positions
      for (let offset = -itemsToCheck; offset <= itemsToCheck; offset++) {
        const rawIndex = centerItemIndex + offset;
        const listIndex = normalizeIndex(rawIndex, itemCount);
        
        // Skip if already processed
        if (seenRawIndices.has(rawIndex)) continue;
        
        const item = displayItems[listIndex];
        if (!item) continue;
        
        // Calculate distance from top after rotation
        const distanceFromTop = (rawIndex * gap) - rotation;
        
        // Normalize to -180 to 180 range
        let normalizedDistance = distanceFromTop;
        while (normalizedDistance > 180) normalizedDistance -= 360;
        while (normalizedDistance < -180) normalizedDistance += 360;
        
        // Include item if within visible range
        const maxDistance = 180 + gap; // Slightly more than 180 to prevent gaps
        if (Math.abs(normalizedDistance) <= maxDistance) {
          const itemAngle = TOP_ANGLE + (rawIndex * gap);
          
          // Check for duplicate angles (within 1 degree)
          const isDuplicateAngle = visible.some(v => {
            const angleDiff = Math.abs(v.angle - itemAngle);
            const normalizedDiff = angleDiff > 180 ? 360 - angleDiff : angleDiff;
            return normalizedDiff < 1;
          });
          
          if (!isDuplicateAngle) {
            seenRawIndices.add(rawIndex);
            visible.push({
              item,
              angle: itemAngle,
              listIndex,
              rawIndex,
            });
          }
        }
      }
      
      // Sort by angle for consistent rendering
      return visible.sort((a, b) => a.angle - b.angle);
    } catch (error) {
      console.error('Error calculating visible items:', error);
      return [];
    }
  }, [rotation, displayItems, itemCount, gap]);
};

