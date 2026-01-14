/**
 * useTelemetry - React hook for telemetry
 *
 * Provides a convenient API for tracking events in React components.
 * All methods are memoized to avoid unnecessary re-renders.
 *
 * Usage:
 *   const { track } = useTelemetry();
 *   track.expressionPlayed({ name: 'loving1', type: 'emotion' });
 */

import { useMemo } from 'react';
import { telemetry } from './index';

/**
 * React hook for telemetry
 * @returns {{ track: typeof telemetry }}
 */
export function useTelemetry() {
  // Memoize the telemetry object to maintain reference stability
  const track = useMemo(() => telemetry, []);

  return { track };
}

export default useTelemetry;
