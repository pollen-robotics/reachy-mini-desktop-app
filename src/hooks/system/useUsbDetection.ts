import { useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import useAppStore from '../../store/useAppStore';
import { isSimulationMode, SIMULATED_USB_PORT } from '../../utils/simulationMode';
import { DAEMON_CONFIG } from '../../config/daemon';

export interface UseUsbDetectionResult {
  isUsbConnected: boolean;
  usbPortName: string | null;
  checkUsbRobot: () => Promise<void>;
}

export const useUsbDetection = (): UseUsbDetectionResult => {
  const {
    isUsbConnected,
    usbPortName,
    isFirstCheck,
    setIsUsbConnected,
    setUsbPortName,
    setIsFirstCheck,
  } = useAppStore();

  // Track if a check is already in progress to avoid overlapping calls.
  const isCheckingRef = useRef<boolean>(false);

  const checkUsbRobot = useCallback(async (): Promise<void> => {
    // Skip if already checking (prevents callback accumulation).
    if (isCheckingRef.current) {
      return;
    }

    isCheckingRef.current = true;
    const startTime = Date.now();

    try {
      // 🎭 Simulation mode: simulate USB connection.
      if (isSimulationMode()) {
        // Ensure at least minimum delay for smooth UX on first check only.
        if (isFirstCheck) {
          const elapsed = Date.now() - startTime;
          const minDelay = DAEMON_CONFIG.MIN_DISPLAY_TIMES.USB_CHECK_FIRST;

          if (elapsed < minDelay) {
            await new Promise<void>(resolve => setTimeout(resolve, minDelay - elapsed));
          }

          setIsFirstCheck(false);
        }

        setIsUsbConnected(true);
        setUsbPortName(SIMULATED_USB_PORT);
        return;
      }

      // Normal mode: real USB check.
      const portName = (await invoke('check_usb_robot')) as string | null;

      // Ensure at least minimum delay for smooth UX on first check only.
      if (isFirstCheck) {
        const elapsed = Date.now() - startTime;
        const minDelay = DAEMON_CONFIG.MIN_DISPLAY_TIMES.USB_CHECK_FIRST;

        if (elapsed < minDelay) {
          await new Promise<void>(resolve => setTimeout(resolve, minDelay - elapsed));
        }

        setIsFirstCheck(false);
      }

      // portName is either a string (connected) or null (not connected).
      setIsUsbConnected(portName !== null);
      setUsbPortName(portName);
    } catch {
      // Still apply minimum delay even on error for first check.
      if (isFirstCheck) {
        const elapsed = Date.now() - startTime;
        const minDelay = 1500;

        if (elapsed < minDelay) {
          await new Promise<void>(resolve => setTimeout(resolve, minDelay - elapsed));
        }

        setIsFirstCheck(false);
      }

      setIsUsbConnected(false);
      setUsbPortName(null);
    } finally {
      isCheckingRef.current = false;
    }
  }, [isFirstCheck, setIsUsbConnected, setUsbPortName, setIsFirstCheck]);

  return {
    isUsbConnected,
    usbPortName,
    checkUsbRobot,
  };
};
