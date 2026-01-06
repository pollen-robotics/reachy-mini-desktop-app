import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { isMacOS } from '../../utils/platform';

/**
 * Hook to check macOS permissions (camera, microphone)
 * Uses tauri-plugin-macos-permissions plugin
 * Checks periodically and returns the current status
 * Exposes a manual refresh function for immediate checks
 *
 * On non-macOS platforms (Windows, Linux), permissions are automatically granted
 * as these platforms handle permissions at the browser/webview level.
 *
 * Uses a version counter to prevent race conditions where stale
 * API responses could overwrite more recent permission states.
 */
export function usePermissions({ checkInterval = 2000 } = {}) {
  const isMac = isMacOS();
  const [cameraGranted, setCameraGranted] = useState(!isMac); // Auto-grant on non-macOS
  const [microphoneGranted, setMicrophoneGranted] = useState(!isMac); // Auto-grant on non-macOS
  const [isChecking, setIsChecking] = useState(isMac); // Only check on macOS
  const [hasChecked, setHasChecked] = useState(!isMac); // Already "checked" on non-macOS

  // Race condition protection: track the current check version
  const checkVersionRef = useRef(0);
  const mountedRef = useRef(true);
  
  // Track previous state to only log changes
  const previousStateRef = useRef({ camera: null, microphone: null });

  const checkPermissions = useCallback(async () => {
    // Skip permission checks on non-macOS platforms
    if (!isMac || !mountedRef.current) {
      return;
    }

    // Increment version for this check - any older pending checks become stale
    const currentVersion = ++checkVersionRef.current;

    try {
      setIsChecking(true);

      // Use tauri-plugin-macos-permissions plugin
      const cameraStatus = await invoke('plugin:macos-permissions|check_camera_permission');

      // 🔒 Check if this response is stale (a newer check was launched)
      if (currentVersion !== checkVersionRef.current) {
        return;
      }

      const micStatus = await invoke('plugin:macos-permissions|check_microphone_permission');

      // 🔒 Check again after mic check (another check could have started)
      if (currentVersion !== checkVersionRef.current) {
        return;
      }

      const cameraResult = cameraStatus === true;
      const micResult = micStatus === true;

      // Only log if state changed or first check
      const stateChanged = 
        previousStateRef.current.camera !== cameraResult || 
        previousStateRef.current.microphone !== micResult ||
        previousStateRef.current.camera === null;

      if (stateChanged) {
        previousStateRef.current = { camera: cameraResult, microphone: micResult };
      }

      setCameraGranted(cameraResult);
      setMicrophoneGranted(micResult);
      setHasChecked(true);
    } catch (error) {
      // 🔒 Don't update state if this check is stale
      if (currentVersion !== checkVersionRef.current) {
        return;
      }

      console.error('[usePermissions] ❌ Error checking permissions:', error);
      setCameraGranted(false);
      setMicrophoneGranted(false);
      setHasChecked(true);
    } finally {
      // 🔒 Only update isChecking if this is still the current check
      if (currentVersion === checkVersionRef.current) {
        setIsChecking(false);
      }
    }
  }, [isMac]);

  useEffect(() => {
    mountedRef.current = true;
    
    // Check immediately
    checkPermissions();

    // Check periodically
    const interval = setInterval(checkPermissions, checkInterval);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
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

