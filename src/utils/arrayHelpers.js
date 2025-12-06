/**
 * ✅ OPTIMIZED: Compare arrays numerically with tolerance (much faster than JSON.stringify)
 * Used across the codebase for comparing robot state arrays (headJoints, antennas, etc.)
 * 
 * @param {Array} a - First array
 * @param {Array} b - Second array
 * @param {number} tolerance - Tolerance for comparison (default: 0.005 rad ~0.3°)
 * @returns {boolean} True if arrays are equal within tolerance
 */
export const arraysEqual = (a, b, tolerance = 0.005) => {
  if (a === b) return true; // ✅ Early return if same reference
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > tolerance) return false;
  }
  return true;
};

