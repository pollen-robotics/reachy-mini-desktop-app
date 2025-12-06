import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

/**
 * Hook to check macOS permissions (camera, microphone)
 * Checks periodically and returns the current status
 */
export function usePermissions({ checkInterval = 2000 } = {}) {
  const [cameraGranted, setCameraGranted] = useState(false);
  const [microphoneGranted, setMicrophoneGranted] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [hasChecked, setHasChecked] = useState(false);

  useEffect(() => {
    const checkPermissions = async () => {
      try {
        setIsChecking(true);
        const [camera, mic] = await invoke('check_permissions');
        setCameraGranted(camera);
        setMicrophoneGranted(mic);
        setHasChecked(true);
      } catch (error) {
        console.error('Error checking permissions:', error);
        // On error, assume not granted (conservative)
        setCameraGranted(false);
        setMicrophoneGranted(false);
        setHasChecked(true);
      } finally {
        setIsChecking(false);
      }
    };

    // Check immediately
    checkPermissions();

    // Check periodically
    const interval = setInterval(checkPermissions, checkInterval);

    return () => clearInterval(interval);
  }, [checkInterval]);

  const allGranted = cameraGranted && microphoneGranted;

  return {
    cameraGranted,
    microphoneGranted,
    allGranted,
    isChecking,
    hasChecked,
  };
}

