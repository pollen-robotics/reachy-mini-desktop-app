import { useCallback, useEffect, useRef, useState } from 'react';
import { DAEMON_CONFIG } from '../../../config/daemon';

export interface UseStartupElapsedResult {
  elapsedSeconds: number;
  /** Progressive message shown after long waits ("Taking a moment", etc.). */
  getProgressiveMessage: () => string | null;
  /** Force-reset the counter (used on retry before the next `isStarting` cycle). */
  reset: () => void;
}

/**
 * Track the number of seconds spent in the "starting" phase so the UI can
 * show progressively reassuring messages ("First launch takes longer" after
 * N seconds, etc.). The counter auto-resets when `isStarting` flips off.
 */
export function useStartupElapsed(isStarting: boolean): UseStartupElapsedResult {
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const elapsedSecondsRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { MESSAGE_THRESHOLDS } = DAEMON_CONFIG.HARDWARE_SCAN;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    elapsedSecondsRef.current = 0;
    setElapsedSeconds(0);
    clearTimer();
  }, [clearTimer]);

  useEffect(() => {
    if (!isStarting) {
      reset();
      return;
    }
    elapsedSecondsRef.current = 0;
    setElapsedSeconds(0);
    timerRef.current = setInterval(() => {
      elapsedSecondsRef.current += 1;
      setElapsedSeconds(elapsedSecondsRef.current);
    }, 1000);
    return clearTimer;
  }, [isStarting, reset, clearTimer]);

  const getProgressiveMessage = useCallback((): string | null => {
    if (elapsedSeconds >= MESSAGE_THRESHOLDS.VERY_LONG) return 'Almost there...';
    if (elapsedSeconds >= MESSAGE_THRESHOLDS.LONG_WAIT) return 'Still working on it';
    if (elapsedSeconds >= MESSAGE_THRESHOLDS.TAKING_TIME) return 'Taking a moment';
    if (elapsedSeconds >= MESSAGE_THRESHOLDS.FIRST_LAUNCH) return 'First launch takes longer';
    return null;
  }, [elapsedSeconds, MESSAGE_THRESHOLDS]);

  return { elapsedSeconds, getProgressiveMessage, reset };
}
