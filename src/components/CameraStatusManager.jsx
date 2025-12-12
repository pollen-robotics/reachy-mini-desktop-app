
import React, { useState, useEffect } from 'react';
import { usePermissions } from '../hooks/system';
import PermissionsRequiredView from '../views/permissions-required/PermissionsRequiredView';
import WebRTCVideo from './WebRTCVideo';
import LocalVideo from './LocalVideo';
import CameraFeed from '../views/active-robot/camera/CameraFeed';
import { buildApiUrl } from '../config/daemon';

/**
 * CameraStatusManager Component
 * Manages the complete camera workflow:
 * 1. Check permissions
 * 2. Check camera availability
 * 3. Connect WebRTC
 * 4. Handle errors and fallbacks
 */
export default function CameraStatusManager({ width = 640, height = 480, isLarge = false }) {
  const { cameraGranted, microphoneGranted, hasChecked } = usePermissions({ checkInterval: 2000 });
  const [cameraStatus, setCameraStatus] = useState(null);
  const [connectionError, setConnectionError] = useState(null);
  const [isCheckingCamera, setIsCheckingCamera] = useState(false);

  // Check camera status when permissions are granted
  useEffect(() => {
    const checkCameraStatus = async () => {
      if (!cameraGranted) {
        setCameraStatus(null);
        return;
      }

      try {
        setIsCheckingCamera(true);
        console.log('[CameraStatusManager] Checking camera status...');

        // Try to fetch camera status from backend
        // Use full URL to reach the Python daemon
        const response = await fetch(buildApiUrl('/api/camera/status'));

        if (!response.ok) {
          // If camera API doesn't exist or returns error, assume camera is not available
          if (response.status === 404) {
            console.log('[CameraStatusManager] Camera API endpoint not found - daemon upgrade required');
            setCameraStatus({ available: false, backend: 'DAEMON_OUTDATED' });
            return;
          }
          throw new Error('HTTP ' + response.status + ': ' + response.statusText);
        }

        const status = await response.json();
        console.log('[CameraStatusManager] Camera status:', status);
        setCameraStatus(status);
        setConnectionError(null);

      } catch (error) {
        console.error('[CameraStatusManager] Camera status check failed:', error.message);

        // Handle different types of errors
        if (error.message.includes('Failed to fetch')) {
          // Network error - backend might not be running or CORS issue
          setConnectionError('Camera service unavailable');
        } else if (error.message.includes('string did not match the expected pattern')) {
          // This suggests the API exists but returns unexpected format
          setConnectionError('Camera API format error');
        } else {
          setConnectionError('Camera check error: ' + error.message);
        }

        setCameraStatus(null);
      } finally {
        setIsCheckingCamera(false);
      }
    };

    checkCameraStatus();
  }, [cameraGranted]);

  // Log state changes
  useEffect(() => {
    console.log('[CameraStatusManager] State update:', {
      cameraGranted,
      microphoneGranted,
      cameraStatus,
      connectionError,
      isCheckingCamera
    });
  }, [cameraGranted, microphoneGranted, cameraStatus, connectionError, isCheckingCamera]);

  // Check if we're still verifying permissions
  if (!hasChecked) {
    console.log('[CameraStatusManager] Rendering: Checking permissions...');
    return null; // Or a loading spinner if preferred, but null prevents flickering
  }

  // Permission not granted - show permission request
  if (!cameraGranted) {
    console.log('[CameraStatusManager] Rendering: Permissions not granted');
    return <PermissionsRequiredView />;
  }

  // Checking camera status
  if (isCheckingCamera) {
    console.log('[CameraStatusManager] Rendering: Checking camera status');
    return <WebRTCVideo width={width} height={height} isLarge={isLarge} />;
  }

  // Connection error
  if (connectionError) {
    console.log('[CameraStatusManager] Rendering: Connection error');
    return <CameraFeed width={width} height={height} isLarge={isLarge} message={connectionError} />;
  }

  // Camera not available
  if (cameraStatus && !cameraStatus.available) {
    console.log('[CameraStatusManager] Rendering: Camera not available');

    // If backend has no media manager, fall back to local camera
    if (cameraStatus.backend === 'NO_MEDIA') {
      console.log('[CameraStatusManager] Backend has no media - using LocalVideo fallback');
      return <LocalVideo width={width} height={height} isLarge={isLarge} />;
    }

    let msg = 'Camera Unavailable(' + cameraStatus.backend + ')';
    if (cameraStatus.backend === 'DAEMON_OUTDATED') {
      msg = 'Update & Restart Daemon';
    }

    return <CameraFeed width={width} height={height} isLarge={isLarge} message={msg} />;
  }

  // Camera available - show WebRTC video
  console.log('[CameraStatusManager] Rendering: WebRTC video');
  return <WebRTCVideo width={width} height={height} isLarge={isLarge} />;
}