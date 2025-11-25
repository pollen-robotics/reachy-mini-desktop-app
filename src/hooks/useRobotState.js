import { useState, useEffect, useRef } from 'react';
import useAppStore from '../store/useAppStore';
import { DAEMON_CONFIG, fetchWithTimeoutSkipInstall, buildApiUrl } from '../config/daemon';

/**
 * Hook to fetch complete robot state from daemon API
 * Uses REAL API fields: control_mode, head_joints, body_yaw, etc.
 * 
 * ⚠️ Does NOT handle crash detection (delegated to useDaemonHealthCheck)
 */
export function useRobotState(isActive) {
  const { isDaemonCrashed } = useAppStore();
  const [robotState, setRobotState] = useState({
    isOn: null,           // Motors powered (control_mode === 'enabled')
    isMoving: false,      // Motors moving (detected)
  });
  
  const lastPositionsRef = useRef(null);
  const movementTimeoutRef = useRef(null);

  useEffect(() => {
    if (!isActive) {
      setRobotState({ isOn: null, isMoving: false });
      return;
    }

    const fetchState = async () => {
      try {
        // ✅ Fetch state with standardized timeout (silent because polling)
        // Use skip-install wrapper to avoid checking during installations
        const stateResponse = await fetchWithTimeoutSkipInstall(
          buildApiUrl('/api/state/full?with_control_mode=true&with_head_joints=true&with_body_yaw=true&with_antenna_positions=true'),
          {},
          DAEMON_CONFIG.TIMEOUTS.STATE_FULL,
          { silent: true } // ⚡ Ne pas logger (polling toutes les 500ms)
        );
        
        if (stateResponse.ok) {
          const data = await stateResponse.json();
          
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
                }, 800);
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
          
          // ✅ No resetTimeouts() here, handled by useDaemonHealthCheck
        }
      } catch (error) {
        // Skip during installation (expected)
        if (error.name === 'SkippedError') {
          return;
        }
        
        // ✅ No incrementTimeouts() here, handled by useDaemonHealthCheck
        // Just log error if it's not a timeout (already handled elsewhere)
        if (error.name !== 'TimeoutError' && !error.message?.includes('timed out')) {
          console.warn('⚠️ Robot state fetch error:', error.message);
        }
      }
    };

    // Don't poll if daemon is crashed
    if (isDaemonCrashed) {
      console.warn('⚠️ Daemon crashed, stopping robot state polling');
      return;
    }

    // Fetch initial
    fetchState();

    // ✅ Frequent refresh to detect movement in real-time
    const interval = setInterval(fetchState, DAEMON_CONFIG.INTERVALS.ROBOT_STATE);

    return () => {
      clearInterval(interval);
      if (movementTimeoutRef.current) {
        clearTimeout(movementTimeoutRef.current);
      }
    };
  }, [isActive, isDaemonCrashed]);

  return robotState;
}

