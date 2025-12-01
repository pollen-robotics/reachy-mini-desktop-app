/**
 * Normalization utilities for circular/wrapping calculations
 */

/**
 * Normalize index to valid range with wrapping
 * @param {number} index - The index to normalize
 * @param {number} itemCount - Total number of items
 * @returns {number} Normalized index in range [0, itemCount)
 */
export const normalizeIndex = (index, itemCount) => {
  return ((index % itemCount) + itemCount) % itemCount;
};

/**
 * Calculate shortest path between two indices on a circular list
 * @param {number} fromIndex - Starting index
 * @param {number} toIndex - Target index
 * @param {number} itemCount - Total number of items
 * @returns {number} Shortest path difference (can be negative)
 */
export const getShortestPath = (fromIndex, toIndex, itemCount) => {
  let diff = toIndex - fromIndex;
  if (diff > itemCount / 2) diff -= itemCount;
  if (diff < -itemCount / 2) diff += itemCount;
  return diff;
};

/**
 * Normalize angle delta to shortest path (-180 to 180)
 * @param {number} delta - Angle difference in degrees
 * @returns {number} Normalized angle in range [-180, 180]
 */
export const normalizeAngleDelta = (delta) => {
  if (delta > 180) return delta - 360;
  if (delta < -180) return delta + 360;
  return delta;
};

