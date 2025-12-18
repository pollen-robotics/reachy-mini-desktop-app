import { useRef, useEffect, useState, useCallback } from 'react';
import { arraysEqual } from '../../../utils/arraysEqual';
import { getWsBaseUrl, isWiFiMode } from '../../../config/daemon';
import { useKinematicsWasm } from '../../../utils/kinematics-wasm/useKinematicsWasm';

// Max reconnection attempts in WiFi mode before giving up
// (WebSocket may be blocked by Private Network Access in browsers)
const MAX_WIFI_RECONNECT_ATTEMPTS = 3;

/**
 * 🚀 GAME-CHANGING: Unified WebSocket hook for ALL robot data
 * Retrieves in real-time: head_pose, head_joints, antennas, passive_joints
 * Merges useRobotWebSocket + useRobotParts to avoid DOUBLE WebSocket
 * 
 * ⚠️ WiFi mode: WebSocket may fail due to browser Private Network Access (PNA)
 * After MAX_WIFI_RECONNECT_ATTEMPTS failures, stops reconnecting to avoid IPC spam
 */
export function useRobotWebSocket(isActive) {
  const [robotState, setRobotState] = useState({
    headPose: null, // 4x4 matrix from daemon (already computed forward kinematics)
    headJoints: null, // Array of 7 values [yaw_body, stewart_1, ..., stewart_6]
    yawBody: 0, // yaw rotation of the body (extracted from headJoints[0])
    antennas: [0, 0], // [left, right]
    passiveJoints: null, // Array of 21 values [passive_1_x, passive_1_y, passive_1_z, ..., passive_7_z]
    dataVersion: 0, // ⚡ OPTIMIZED: Increments on each change, allows useFrame to skip comparisons
  });
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null); // ✅ Track reconnect timeout for cleanup
  const isMountedRef = useRef(true);
  const reconnectAttemptsRef = useRef(0); // Track reconnection attempts
  const isWiFiRef = useRef(false); // Track if we're in WiFi mode
  
  // 🦀 WASM kinematics for calculating passive joints locally
  const { isReady: wasmReady, calculatePassiveJoints } = useKinematicsWasm();
  const wasmReadyRef = useRef(false);
  
  // Keep ref in sync with wasmReady state
  useEffect(() => {
    wasmReadyRef.current = wasmReady;
    if (wasmReady) {
      console.log('🦀 WASM Kinematics ready for passive joints calculation');
    }
  }, [wasmReady]);

  useEffect(() => {
    isMountedRef.current = true; // Reset mount state
    reconnectAttemptsRef.current = 0; // Reset attempts on new effect
    isWiFiRef.current = isWiFiMode(); // Check mode at start
    
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
      // ⚠️ WiFi mode: Check if we've exceeded max reconnection attempts
      if (isWiFiRef.current && reconnectAttemptsRef.current >= MAX_WIFI_RECONNECT_ATTEMPTS) {
        console.warn(`🌐 WiFi WebSocket: Max reconnection attempts (${MAX_WIFI_RECONNECT_ATTEMPTS}) reached. WebSocket disabled to prevent IPC spam. 3D model will use HTTP polling fallback.`);
        return; // Don't reconnect - use HTTP polling instead
      }
      
      try {
        // 🚀 GAME-CHANGING: Single WebSocket with ALL data (includes passive_joints)
        // 🌐 Dynamic URL based on connection mode (USB/WiFi/Simulation)
        // ⚡ 20 Hz for smoother robot visualization (MuJoCo control loop runs at 50 Hz)
        const wsUrl = `${getWsBaseUrl()}/api/state/ws/full?frequency=20&with_head_pose=true&use_pose_matrix=true&with_head_joints=true&with_antenna_positions=true&with_passive_joints=true`;
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          // WebSocket connected - reset attempts counter on success
          reconnectAttemptsRef.current = 0;
          if (isWiFiRef.current) {
            console.log('🌐 WiFi WebSocket: Connected successfully!');
          }
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
            
            // 🦀 Passive joints (21 values: passive_1_x/y/z to passive_7_x/y/z)
            // Either from daemon (full kinematics solver) or calculated locally via WASM
            if (data.passive_joints !== null && data.passive_joints !== undefined) {
              // Daemon provides passive joints directly
              if (Array.isArray(data.passive_joints) && data.passive_joints.length >= 21) {
                newState.passiveJoints = data.passive_joints;
              }
            } else if (wasmReadyRef.current && newState.headJoints && newState.headPose) {
              // 🦀 WASM fallback: Calculate passive joints locally
              // Uses headJoints [yaw_body, stewart_1, ..., stewart_6] and headPose (4x4 matrix)
              const calculatedPassiveJoints = calculatePassiveJoints(
                newState.headJoints,
                newState.headPose
              );
              if (calculatedPassiveJoints && calculatedPassiveJoints.length === 21) {
                newState.passiveJoints = calculatedPassiveJoints;
              }
            } else {
              // No passive joints available
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
                
                // ⚡ OPTIMIZED: Increment dataVersion so useFrame can skip comparisons
                return { ...prev, ...newState, dataVersion: prev.dataVersion + 1 };
              });
            }
          } catch (err) {
            console.error('❌ WebSocket message parse error:', err);
          }
        };

        ws.onerror = (error) => {
          // Only log full error in development, minimal log in production
          if (isWiFiRef.current) {
            console.warn(`🌐 WiFi WebSocket error (attempt ${reconnectAttemptsRef.current + 1}/${MAX_WIFI_RECONNECT_ATTEMPTS})`);
          } else {
          console.error('❌ WebSocket error:', error);
          }
        };

        ws.onclose = () => {
          // Increment reconnection attempts
          reconnectAttemptsRef.current++;
          
          // ✅ Cleanup previous timeout if exists
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
          }
          
          // In WiFi mode, check if we should stop reconnecting
          if (isWiFiRef.current && reconnectAttemptsRef.current >= MAX_WIFI_RECONNECT_ATTEMPTS) {
            console.warn(`🌐 WiFi WebSocket: Stopping reconnection after ${MAX_WIFI_RECONNECT_ATTEMPTS} failed attempts. This is expected due to browser Private Network Access restrictions.`);
            return; // Don't schedule reconnect
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

