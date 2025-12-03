/**
 * Geometric calculations for wheel positioning and angles
 */

import { TOP_ANGLE } from './constants';

/**
 * Calculate angle from center point to a given point
 * @param {number} centerX - X coordinate of center
 * @param {number} centerY - Y coordinate of center
 * @param {number} pointX - X coordinate of point
 * @param {number} pointY - Y coordinate of point
 * @returns {number} Angle in degrees
 */
export const getAngleFromCenter = (centerX, centerY, pointX, pointY) => {
  const dx = pointX - centerX;
  const dy = pointY - centerY;
  return Math.atan2(dy, dx) * (180 / Math.PI);
};

/**
 * Calculate item position on wheel circle
 * @param {number} angle - Angle in degrees
 * @param {number} wheelSize - Size of wheel
 * @param {number} radiusRatio - Radius as ratio of wheel size
 * @returns {{x: number, y: number}} Position coordinates
 */
export const getItemPosition = (angle, wheelSize, radiusRatio) => {
  const itemAngleRad = (angle * Math.PI) / 180;
  const radius = wheelSize * radiusRatio;
  const x = wheelSize / 2 + radius * Math.cos(itemAngleRad);
  const y = wheelSize / 2 + radius * Math.sin(itemAngleRad);
  return { x, y };
};

/**
 * Calculate selected item index based on rotation
 * Selected item is the one closest to the fixed top position (TOP_ANGLE = -90 degrees)
 * The top position is fixed visually - items rotate around it
 * 
 * Formula:
 * - Item at index i is positioned at: TOP_ANGLE + (i * gap)
 * - After rotation, it appears at: TOP_ANGLE + (i * gap) - rotation
 * - For it to be exactly at TOP_ANGLE: (i * gap) - rotation = 0
 * - Therefore: i = rotation / gap
 * 
 * We find the item whose angle after rotation is closest to TOP_ANGLE
 * 
 * @param {number} rotation - Current rotation in degrees
 * @param {number} gap - Gap between items in degrees
 * @param {number} itemCount - Total number of items
 * @returns {number} Selected item index
 */
export const calculateSelectedIndex = (rotation, gap, itemCount) => {
  if (!gap || gap <= 0 || !itemCount) return 0;
  
  // Calculate which item index should be at the fixed top position
  const exactIndex = rotation / gap;
  
  // Check both floor and ceil to find which is actually closer to TOP_ANGLE
  const floorIndex = Math.floor(exactIndex);
  const ceilIndex = Math.ceil(exactIndex);
  
  // Calculate the actual angle offset from TOP_ANGLE for each candidate
  // Item at index i appears at: TOP_ANGLE + (i * gap) - rotation
  // Distance from TOP_ANGLE = (i * gap) - rotation
  const floorOffset = (floorIndex * gap) - rotation;
  const ceilOffset = (ceilIndex * gap) - rotation;
  
  // Normalize offsets to -180 to 180 range (shortest path)
  const normalizeOffset = (offset) => {
    while (offset > 180) offset -= 360;
    while (offset < -180) offset += 360;
    return offset;
  };
  
  const floorDist = Math.abs(normalizeOffset(floorOffset));
  const ceilDist = Math.abs(normalizeOffset(ceilOffset));
  
  // Choose the one with smaller distance to TOP_ANGLE
  const closestIndex = floorDist <= ceilDist ? floorIndex : ceilIndex;
  
  // Normalize with wrapping to valid range [0, itemCount)
  return ((closestIndex % itemCount) + itemCount) % itemCount;
};

/**
 * Calculate selected item index and active angle based on visible items and rotation
 * Uses actual visual Y position after rotation transformation (more accurate than angle-based)
 * 
 * @param {Array} visibleItems - Array of visible items with { item, angle, listIndex }
 * @param {number} rotation - Current rotation in degrees
 * @param {number} wheelSize - Size of the wheel
 * @param {number} radiusRatio - Radius as ratio of wheel size
 * @returns {{selectedIndex: number, activeItemAngle: number|null}} Selected index and angle
 */
export const calculateSelectedIndexFromVisible = (visibleItems, rotation, wheelSize, radiusRatio) => {
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
    const { x: itemX, y: itemY } = getItemPosition(angle, wheelSize, radiusRatio);
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
};

/**
 * Calculate snap rotation to align item to top position
 * @param {number} currentRotation - Current rotation in degrees
 * @param {number} gap - Gap between items in degrees
 * @param {number} itemCount - Total number of items
 * @returns {number} Snapped rotation that aligns item to top
 */
export const calculateSnapRotation = (currentRotation, gap, itemCount) => {
  if (!gap || gap <= 0 || !itemCount) return currentRotation;
  
  // Find which item is closest to top
  const rotationOffset = currentRotation / gap;
  const closestIndex = Math.round(rotationOffset);
  
  // Calculate rotation needed to align this item to top (TOP_ANGLE = -90)
  // Item at index i should be at: TOP_ANGLE + (i * gap)
  // After rotation, it's at: TOP_ANGLE + (i * gap) - rotation
  // We want: TOP_ANGLE + (i * gap) - rotation = TOP_ANGLE
  // So: rotation = i * gap
  const snappedRotation = closestIndex * gap;
  
  return snappedRotation;
};

