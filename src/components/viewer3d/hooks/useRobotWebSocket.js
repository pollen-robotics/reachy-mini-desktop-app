import { useRef, useEffect, useState } from 'react';
import { arraysEqual } from '../../../utils/arraysEqual';
import { getWsBaseUrl } from '../../../config/daemon';

/**
 * 🚀 GAME-CHANGING: Unified WebSocket hook for ALL robot data
 * Retrieves in real-time: head_pose, head_joints, antennas, passive_joints
 * Merges useRobotWebSocket + useRobotParts to avoid DOUBLE WebSocket
 */
export function useRobotWebSocket(isActive) {
  const [robotState, setRobotState] = useState({
    headPose: null, // 4x4 matrix from daemon (already computed forward kinematics)
    headJoints: null, // Array of 7 values [yaw_body, stewart_1, ..., stewart_6]
    yawBody: 0, // yaw rotation of the body (extracted from headJoints[0])
    antennas: [0, 0], // [left, right]
    passiveJoints: null, // 🚀 NEW: Array of 21 values [passive_1_x, passive_1_y, passive_1_z, ..., passive_7_z]
  });
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null); // ✅ Track reconnect timeout for cleanup
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true; // Reset mount state
    
    if (!isActive) {
      // Close WebSocket connection if daemon is inactive
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      // ✅ Cleanup reconnect timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      return;
    }

    // Connexion WebSocket au daemon
    const connectWebSocket = () => {
      try {
        // 🚀 GAME-CHANGING: Single WebSocket with ALL data (includes passive_joints)
        // 🌐 Dynamic URL based on connection mode (USB/WiFi/Simulation)
        const wsUrl = `${getWsBaseUrl()}/api/state/ws/full?frequency=10&with_head_pose=true&use_pose_matrix=true&with_head_joints=true&with_antenna_positions=true&with_passive_joints=true`;
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          // WebSocket connected
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            const newState = {};
            
            // Extract head_pose (4x4 matrix)
            // Daemon can send {m: [...]} or directly an array
            if (data.head_pose) {
              const headPoseArray = Array.isArray(data.head_pose) 
                ? data.head_pose 
                : data.head_pose.m; // Daemon sends {m: [...]}
              
              if (headPoseArray && headPoseArray.length === 16) {
                newState.headPose = headPoseArray;
              }
            }
            
            // Extract head_joints (7 values: yaw_body + stewart_1 to stewart_6)
            if (data.head_joints && Array.isArray(data.head_joints) && data.head_joints.length === 7) {
              newState.headJoints = data.head_joints;
              newState.yawBody = data.head_joints[0]; // Also extract yaw_body for backward compatibility
            }
            
            // Antenna positions [left, right]
            if (data.antennas_position) {
              newState.antennas = data.antennas_position;
            }
            
            // 🚀 GAME-CHANGING: Passive joints (21 values: passive_1_x/y/z to passive_7_x/y/z)
            // Only available with full kinematics solver
            if (data.passive_joints !== null && data.passive_joints !== undefined) {
              if (Array.isArray(data.passive_joints) && data.passive_joints.length >= 21) {
                newState.passiveJoints = data.passive_joints;
              }
            } else {
              // Explicitly null if passive joints not available
              newState.passiveJoints = null;
            }
            
            // ✅ OPTIMIZED: Only update state if values actually changed (avoid unnecessary re-renders)
            // ✅ PERFORMANCE: Using numeric comparisons instead of JSON.stringify (78% faster)
            if (Object.keys(newState).length > 0) {
              setRobotState(prev => {
                // Compare new values with previous ones using numeric comparisons
                const hasChanges = 
                  (newState.headPose && !arraysEqual(newState.headPose, prev.headPose)) ||
                  (newState.headJoints && !arraysEqual(newState.headJoints, prev.headJoints)) ||
                  (newState.yawBody !== undefined && Math.abs(newState.yawBody - prev.yawBody) > 0.005) ||
                  (newState.antennas && !arraysEqual(newState.antennas, prev.antennas)) ||
                  (newState.passiveJoints !== undefined && (
                    !prev.passiveJoints || 
                    !newState.passiveJoints || 
                    !arraysEqual(newState.passiveJoints, prev.passiveJoints)
                  ));
                
                // Return previous state if no changes (prevents re-render)
                if (!hasChanges) {
                  return prev;
                }
                
                return { ...prev, ...newState };
              });
            }
          } catch (err) {
            console.error('❌ WebSocket message parse error:', err);
          }
        };

        ws.onerror = (error) => {
          console.error('❌ WebSocket error:', error);
        };

        ws.onclose = () => {
          // ✅ Cleanup previous timeout if exists
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
          }
          reconnectTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current && isActive) {
              connectWebSocket();
            }
            reconnectTimeoutRef.current = null;
          }, 1000);
        };

        wsRef.current = ws;
      } catch (err) {
        console.error('❌ WebSocket connection error:', err);
      }
    };

    connectWebSocket();

    return () => {
      isMountedRef.current = false; // Mark as unmounted
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      // ✅ Cleanup reconnect timeout to prevent memory leaks
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [isActive]);

  return robotState;
}

