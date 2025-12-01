import { useState, useEffect, useRef } from 'react';
import useAppStore from '../../store/useAppStore';
import { DAEMON_CONFIG } from '../../config/daemon';

/**
 * Hook to extract robot power state from centralized robotStateFull
 * Uses REAL API fields: control_mode, head_joints, body_yaw, etc.
 * 
 * ⚠️ Now consumes robotStateFull from useRobotState instead of making its own API calls
 * ⚠️ Does NOT handle crash detection (delegated to useDaemonHealthCheck)
 */
export function useRobotPowerState(isActive) {
  const { robotStateFull } = useAppStore();
  const [robotState, setRobotState] = useState({
    isOn: null,           // Motors powered (control_mode === 'enabled')
    isMoving: false,      // Motors moving (detected)
  });
  
  const lastPositionsRef = useRef(null);
  const movementTimeoutRef = useRef(null);

  useEffect(() => {
    if (!isActive || !robotStateFull || !robotStateFull.data) {
      setRobotState({ isOn: null, isMoving: false });
      return;
    }

    const data = robotStateFull.data;
    
    // ✅ Utiliser control_mode du daemon (enabled/disabled)
    const motorsOn = data.control_mode === 'enabled';
    
    // ✅ Movement detection based on position changes
    let isMoving = false;
    
    if (data.body_yaw !== undefined && data.antennas_position) {
      const currentPositions = {
        body_yaw: data.body_yaw,
        antennas: data.antennas_position,
      };
      
      // Compare with previous frame
      if (lastPositionsRef.current) {
        const yawDiff = Math.abs(currentPositions.body_yaw - lastPositionsRef.current.body_yaw);
        const antennaDiff = currentPositions.antennas && lastPositionsRef.current.antennas
          ? Math.abs(currentPositions.antennas[0] - lastPositionsRef.current.antennas[0]) +
            Math.abs(currentPositions.antennas[1] - lastPositionsRef.current.antennas[1])
          : 0;
        
        // ✅ Increased threshold to filter tremors: > 0.01 radians (~0.6°)
        if (yawDiff > 0.01 || antennaDiff > 0.01) {
          isMoving = true;
          
          // Reset timeout: consider as "moving" for 800ms after last change
          if (movementTimeoutRef.current) {
            clearTimeout(movementTimeoutRef.current);
          }
          movementTimeoutRef.current = setTimeout(() => {
            setRobotState(prev => ({ ...prev, isMoving: false }));
          }, DAEMON_CONFIG.MOVEMENT.MOVEMENT_DETECTION_TIMEOUT);
        }
      }
      
      lastPositionsRef.current = currentPositions;
    }
    
    // ✅ OPTIMIZED: Only update state if values actually changed (avoid unnecessary re-renders)
    setRobotState(prev => {
      const newState = { isOn: motorsOn, isMoving: isMoving };
      // Return previous state if values haven't changed (prevents re-render)
      if (prev.isOn === newState.isOn && prev.isMoving === newState.isMoving) {
        return prev;
      }
      return newState;
    });
    
    return () => {
      if (movementTimeoutRef.current) {
        clearTimeout(movementTimeoutRef.current);
      }
    };
  }, [isActive, robotStateFull]);

  return robotState;
}

