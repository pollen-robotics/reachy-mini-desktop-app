import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

/**
 * Hook to check macOS permissions (camera, microphone)
 * Uses tauri-plugin-macos-permissions plugin
 * Checks periodically and returns the current status
 * Exposes a manual refresh function for immediate checks
 */
export function usePermissions({ checkInterval = 2000 } = {}) {
  const [cameraGranted, setCameraGranted] = useState(null);
  const [microphoneGranted, setMicrophoneGranted] = useState(null);
  const [isChecking, setIsChecking] = useState(true);
  const [hasChecked, setHasChecked] = useState(false);

  const checkPermissions = useCallback(async () => {
    try {
      setIsChecking(true);
      
      // Use tauri-plugin-macos-permissions plugin
      // Format: plugin:macos-permissions|check_camera_permission (with underscores, no params)
      console.log('[usePermissions] 🔍 Checking camera permission via plugin...');
      const cameraStartTime = Date.now();
      const cameraStatus = await invoke('plugin:macos-permissions|check_camera_permission');
      const cameraDuration = Date.now() - cameraStartTime;
      console.log(`[usePermissions] ✅ Camera check completed in ${cameraDuration}ms, result: ${cameraStatus} (type: ${typeof cameraStatus})`);
      
      console.log('[usePermissions] 🔍 Checking microphone permission via plugin...');
      const micStartTime = Date.now();
      const micStatus = await invoke('plugin:macos-permissions|check_microphone_permission');
      const micDuration = Date.now() - micStartTime;
      console.log(`[usePermissions] ✅ Microphone check completed in ${micDuration}ms, result: ${micStatus} (type: ${typeof micStatus})`);
      
      setCameraGranted(cameraStatus === true);
      setMicrophoneGranted(micStatus === true);
      setHasChecked(true);
      
      console.log(`[usePermissions] Final cameraGranted: ${cameraStatus === true} (raw: ${cameraStatus})`);
      console.log(`[usePermissions] Final microphoneGranted: ${micStatus === true} (raw: ${micStatus})`);
      
      console.log(`[usePermissions] 📊 Final state - Camera: ${cameraStatus === true ? '✅ Granted' : '❌ Not granted'}, Microphone: ${micStatus === true ? '✅ Granted' : '❌ Not granted'}`);
    } catch (error) {
      console.error('[usePermissions] ❌ Error checking permissions:', error);
      console.error('[usePermissions] Error details:', {
        message: error?.message,
        name: error?.name,
        code: error?.code,
        stack: error?.stack,
        toString: String(error)
      });
      setCameraGranted(false);
      setMicrophoneGranted(false);
      setHasChecked(true);
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    // Check immediately
    checkPermissions();

    // Check periodically
    const interval = setInterval(checkPermissions, checkInterval);

    return () => clearInterval(interval);
  }, [checkInterval, checkPermissions]);

  const allGranted = cameraGranted && microphoneGranted;

  return {
    cameraGranted,
    microphoneGranted,
    allGranted,
    isChecking,
    hasChecked,
    refresh: checkPermissions, // Expose manual refresh function
  };
}

