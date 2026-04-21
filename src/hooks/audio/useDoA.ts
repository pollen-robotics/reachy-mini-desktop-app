import { useMemo, useState, useEffect, useRef } from 'react';
import useAppStore from '../../store/useAppStore';

type TimeoutId = ReturnType<typeof setTimeout>;

export interface UseDoAResult {
  /** DoA angle (see daemon DoA type - expressed in radians in practice). */
  angle: number | null;
  /** Debounced speech-detection flag (instant ON, delayed OFF). */
  isTalking: boolean;
  isAvailable: boolean;
}

/**
 * 🚀 Reads DoA (Direction of Arrival) from the centralized store (WebSocket).
 *
 * Previously polled `/api/state/doa` at 10Hz (HTTP).
 * Now reads from `robotStateFull` which is streamed via WebSocket at 20Hz.
 *
 * Benefits:
 * - No additional HTTP requests (was 10 req/sec!)
 * - Real-time updates at 20Hz
 * - Single source of truth
 * - Debounced `isTalking` to prevent flickering
 *
 * The DoA indicates the direction of detected sound:
 * - 0 rad    = left
 * - π/2 rad  = front/back
 * - π rad    = right
 *
 * @param isActive Whether DoA should be active (API compatibility flag).
 */
export function useDoA(isActive: boolean): UseDoAResult {
  // Read DoA from centralized store (selective subscription).
  const doa = useAppStore(state => state.robotStateFull?.data?.doa);

  // Debounced isTalking state (instant ON, delayed OFF to prevent flickering).
  const [debouncedTalking, setDebouncedTalking] = useState<boolean>(false);
  const timeoutRef = useRef<TimeoutId | null>(null);

  const rawTalking = Boolean(isActive && doa?.speech_detected);

  useEffect(() => {
    // Clear any pending timeout.
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (rawTalking) {
      // Instant ON - respond immediately to speech.
      setDebouncedTalking(true);
    } else {
      // Delayed OFF - wait long enough to bridge natural pauses between words.
      timeoutRef.current = setTimeout(() => {
        setDebouncedTalking(false);
      }, 600);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [rawTalking]);

  // Build DoA state from store data.
  const doaState = useMemo<UseDoAResult>(() => {
    if (!isActive || !doa) {
      return {
        angle: null,
        isTalking: false,
        isAvailable: false,
      };
    }

    return {
      angle: doa.angle,
      isTalking: debouncedTalking,
      isAvailable: true,
    };
  }, [isActive, doa, debouncedTalking]);

  return doaState;
}

/**
 * Convert a DoA angle (radians) to a human-readable direction label.
 * Returns 'unknown' when `angleRad` is null.
 */
export function getDoADirection(angleRad: number | null): string {
  if (angleRad === null) return 'unknown';

  // Normalize to 0-π range.
  const normalized = Math.abs(angleRad % Math.PI);

  if (normalized < Math.PI / 6) return 'left';
  if (normalized < Math.PI / 3) return 'front-left';
  if (normalized < (2 * Math.PI) / 3) return 'front';
  if (normalized < (5 * Math.PI) / 6) return 'front-right';
  return 'right';
}

/**
 * Convert a DoA angle (radians) to CSS rotation degrees.
 *
 * Mapping:
 * - 0 rad   (left)  → -90deg
 * - π/2 rad (front) →   0deg
 * - π rad   (right) →  90deg
 */
export function doaToCssRotation(angleRad: number | null): number {
  if (angleRad === null) return 0;

  // Formula: (angleRad / π) * 180 - 90
  return (angleRad / Math.PI) * 180 - 90;
}

export default useDoA;
