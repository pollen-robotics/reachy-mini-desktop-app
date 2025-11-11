import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import useAppStore from '../store/useAppStore';

export const useUsbDetection = () => {
  const { isUsbConnected, usbPortName, isFirstCheck, setIsUsbConnected, setUsbPortName, setIsFirstCheck } = useAppStore();

  const checkUsbRobot = useCallback(async () => {
    const startTime = Date.now();
    
    try {
      const portName = await invoke('check_usb_robot');
      
      // Ensure at least 1.5 seconds for smooth UX on first check only
      if (isFirstCheck) {
        const elapsed = Date.now() - startTime;
        const minDelay = 1500;
        
        if (elapsed < minDelay) {
          await new Promise(resolve => setTimeout(resolve, minDelay - elapsed));
        }
        
        setIsFirstCheck(false);
      }
      
      // portName is either a string (connected) or null (not connected)
      setIsUsbConnected(portName !== null);
      setUsbPortName(portName);
    } catch (e) {
      console.error('Error checking USB:', e);
      
      // Still apply minimum delay even on error for first check
      if (isFirstCheck) {
        const elapsed = Date.now() - startTime;
        const minDelay = 1500;
        
        if (elapsed < minDelay) {
          await new Promise(resolve => setTimeout(resolve, minDelay - elapsed));
        }
        
        setIsFirstCheck(false);
      }
      
      setIsUsbConnected(false);
      setUsbPortName(null);
    }
  }, [isFirstCheck, setIsUsbConnected, setUsbPortName, setIsFirstCheck]);

  return {
    isUsbConnected,
    usbPortName,
    checkUsbRobot,
  };
};

