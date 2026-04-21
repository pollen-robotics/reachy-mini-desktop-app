/**
 * Compare two arrays with tolerance (optimized for Three.js/WebSocket data).
 * Avoids unnecessary re-renders when values change by tiny amounts.
 *
 * @param a - First array
 * @param b - Second array
 * @param tolerance - Tolerance threshold (default: 0.005 rad ≈ 0.3°)
 * @returns True if arrays are equal within tolerance
 */
export function arraysEqual(
  a: ArrayLike<number> | null | undefined,
  b: ArrayLike<number> | null | undefined,
  tolerance: number = 0.005
): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > tolerance) return false;
  }
  return true;
}

export default arraysEqual;
