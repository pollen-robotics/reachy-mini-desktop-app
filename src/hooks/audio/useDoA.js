import { useState, useEffect, useRef, useCallback } from 'react';
import { buildApiUrl, fetchWithTimeout, DAEMON_CONFIG } from '../../config/daemon';

/**
 * Hook to fetch Direction of Arrival (DoA) from the robot's microphone array.
 * 
 * The DoA indicates the direction of detected sound:
 * - 0 rad = left
 * - π/2 rad (~1.57) = front/back
 * - π rad (~3.14) = right
 * 
 * @param {boolean} isActive - Whether to poll the DoA
 * @param {number} pollInterval - Polling interval in ms (default: 100ms = 10Hz)
 * @returns {{ angle: number | null, isTalking: boolean, isAvailable: boolean }}
 */
export function useDoA(isActive, pollInterval = 100) {
  const [doaState, setDoaState] = useState({
    angle: null,        // Angle in radians (0 = left, π/2 = front, π = right)
    isTalking: false,   // Speech detected
    isAvailable: false, // DoA sensor available
  });
  
  const intervalRef = useRef(null);
  const isMountedRef = useRef(true);

  const fetchDoA = useCallback(async () => {
    if (!isMountedRef.current) return;
    
    try {
      const response = await fetchWithTimeout(
        buildApiUrl('/api/state/doa'),
        {},
        DAEMON_CONFIG.TIMEOUTS.STATE_FULL,
        { silent: true }
      );
      
      if (!isMountedRef.current) return;
      
      if (response.ok) {
        const data = await response.json();
        
        if (data === null) {
          // DoA not available (no audio device)
          setDoaState({
            angle: null,
            isTalking: false,
            isAvailable: false,
          });
        } else {
          setDoaState({
            angle: data.angle,
            isTalking: data.speech_detected,
            isAvailable: true,
          });
        }
      } else {
        // Route not found (404) or other error - graceful degradation
        setDoaState(prev => ({ ...prev, isAvailable: false }));
      }
    } catch {
      // Silent error - don't spam logs for polling
      if (isMountedRef.current) {
        setDoaState(prev => ({ ...prev, isAvailable: false }));
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    
    if (isActive) {
      // Initial fetch
      fetchDoA();
      
      // Start polling
      intervalRef.current = setInterval(fetchDoA, pollInterval);
    } else {
      // Reset state when inactive
      setDoaState({
        angle: null,
        isTalking: false,
        isAvailable: false,
      });
    }
    
    return () => {
      isMountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isActive, pollInterval, fetchDoA]);

  return doaState;
}

/**
 * Convert DoA angle (radians) to a human-readable direction
 * @param {number} angleRad - Angle in radians
 * @returns {string} Direction label
 */
export function getDoADirection(angleRad) {
  if (angleRad === null) return 'unknown';
  
  // Normalize to 0-π range
  const normalized = Math.abs(angleRad % Math.PI);
  
  if (normalized < Math.PI / 6) return 'left';
  if (normalized < Math.PI / 3) return 'front-left';
  if (normalized < 2 * Math.PI / 3) return 'front';
  if (normalized < 5 * Math.PI / 6) return 'front-right';
  return 'right';
}

/**
 * Convert DoA angle (radians) to CSS rotation degrees
 * Maps: 0 rad (left) → -90deg, π/2 rad (front) → 0deg, π rad (right) → 90deg
 * @param {number} angleRad - Angle in radians
 * @returns {number} Rotation in degrees for CSS transform
 */
export function doaToCssRotation(angleRad) {
  if (angleRad === null) return 0;
  
  // Convert radians to degrees: 0 rad = -90deg, π/2 rad = 0deg, π rad = 90deg
  // Formula: (angleRad / π) * 180 - 90
  return (angleRad / Math.PI) * 180 - 90;
}

