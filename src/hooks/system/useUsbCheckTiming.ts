import { useEffect, useState, useMemo } from 'react';
import { DAEMON_CONFIG } from '../../config/daemon';
import useAppStore from '../../store/useAppStore';

export interface UseUsbCheckTimingResult {
  usbCheckStartTime: number | null;
  shouldShowUsbCheck: boolean;
}

/**
 * Manage USB check timing after update check completes.
 *
 * Ensures the USB check only starts after the update view is dismissed,
 * and tracks minimum display time for the USB check view.
 *
 * @param shouldShowUpdateView Whether the update view is currently showing.
 */
export function useUsbCheckTiming(shouldShowUpdateView: boolean): UseUsbCheckTimingResult {
  const [usbCheckStartTime, setUsbCheckStartTime] = useState<number | null>(null);
  const { isFirstCheck, isActive, isStarting, isStopping } = useAppStore();

  // Start USB check only after update check is complete.
  useEffect(() => {
    // Don't start USB check if update view is still showing.
    if (shouldShowUpdateView) {
      // Reset USB check start time if update view is showing.
      if (usbCheckStartTime !== null) {
        setUsbCheckStartTime(null);
      }
      return;
    }

    // Start USB check tracking after update check completes (first time only).
    if (usbCheckStartTime === null && isFirstCheck && !shouldShowUpdateView) {
      setUsbCheckStartTime(Date.now());
    }
  }, [shouldShowUpdateView, usbCheckStartTime, isFirstCheck]);

  // Reset USB check tracking after minimum time.
  useEffect(() => {
    if (usbCheckStartTime !== null && !isFirstCheck) {
      const elapsed = Date.now() - usbCheckStartTime;
      if (elapsed >= DAEMON_CONFIG.MIN_DISPLAY_TIMES.USB_CHECK) {
        setUsbCheckStartTime(null);
      } else {
        const timer = setTimeout(() => {
          setUsbCheckStartTime(null);
        }, DAEMON_CONFIG.MIN_DISPLAY_TIMES.USB_CHECK - elapsed);
        return () => clearTimeout(timer);
      }
    }
    return undefined;
  }, [usbCheckStartTime, isFirstCheck]);

  // Determine whether the USB check view should be shown (after update check).
  const shouldShowUsbCheck = useMemo<boolean>(() => {
    // Don't show if the update view is still showing.
    if (shouldShowUpdateView) return false;

    // Don't show if the daemon is active/starting/stopping.
    if (isActive || isStarting || isStopping) return false;

    // Show if USB check minimum time hasn't elapsed yet (during first check).
    if (usbCheckStartTime !== null && isFirstCheck) {
      const elapsed = Date.now() - usbCheckStartTime;
      return elapsed < DAEMON_CONFIG.MIN_DISPLAY_TIMES.USB_CHECK;
    }

    return false;
  }, [shouldShowUpdateView, isActive, isStarting, isStopping, usbCheckStartTime, isFirstCheck]);

  return { usbCheckStartTime, shouldShowUsbCheck };
}
