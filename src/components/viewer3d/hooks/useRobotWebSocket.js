import { useRef, useEffect, useState } from 'react';

/**
 * Hook custom pour gérer la connexion WebSocket au daemon Reachy
 * Récupère en temps réel : head_pose, yaw_body, antennas
 */
export default function useRobotWebSocket(isActive) {
  const [robotState, setRobotState] = useState({
    headPose: null, // 4x4 matrix from daemon (already computed forward kinematics)
    headJoints: null, // Array of 7 values [yaw_body, stewart_1, ..., stewart_6]
    yawBody: 0, // yaw rotation of the body (extracted from headJoints[0])
    antennas: [0, 0], // [left, right]
  });
  const wsRef = useRef(null);

  useEffect(() => {
    if (!isActive) {
      // Fermer la connexion WebSocket si le daemon est inactif
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    // Connexion WebSocket au daemon
    const connectWebSocket = () => {
      try {
        const ws = new WebSocket(
          'ws://localhost:8000/api/state/ws/full?frequency=10&with_head_pose=true&use_pose_matrix=true&with_head_joints=true&with_antenna_positions=true'
        );

        ws.onopen = () => {
          console.log('🔌 WebSocket connected to daemon');
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            // Reduced logging - only log every 1000 messages (~every 100 seconds at 10Hz)
            if (!ws.messageCount) ws.messageCount = 0;
            ws.messageCount++;
            if (ws.messageCount % 1000 === 1) {
              console.log('📡 Animation data:', {
                yaw_body: data.head_joints?.[0]?.toFixed(3),
                antennas: data.antennas_position?.map(v => v.toFixed(3)),
                head_pose_rotation: data.head_pose ? '4x4 matrix' : 'N/A',
              });
            }

            const newState = {};
            
            // Extraire head_pose (matrice 4x4)
            // Le daemon peut envoyer {m: [...]} ou directement un array
            if (data.head_pose) {
              const headPoseArray = Array.isArray(data.head_pose) 
                ? data.head_pose 
                : data.head_pose.m; // Le daemon envoie {m: [...]}
              
              if (headPoseArray && headPoseArray.length === 16) {
                newState.headPose = headPoseArray;
              }
            }
            
            // Extract head_joints (7 values: yaw_body + stewart_1 to stewart_6)
            if (data.head_joints && Array.isArray(data.head_joints) && data.head_joints.length === 7) {
              newState.headJoints = data.head_joints;
              newState.yawBody = data.head_joints[0]; // Also extract yaw_body for backward compatibility
            }
            
            // Positions des antennes [left, right]
            if (data.antennas_position) {
              newState.antennas = data.antennas_position;
            }
            
            // Update state only with new data
            if (Object.keys(newState).length > 0) {
              setRobotState(prev => ({ ...prev, ...newState }));
            }
          } catch (err) {
            console.error('❌ WebSocket message parse error:', err);
          }
        };

        ws.onerror = (error) => {
          console.error('❌ WebSocket error:', error);
        };

        ws.onclose = () => {
          console.log('🔌 WebSocket disconnected, reconnecting in 1s...');
          setTimeout(() => {
            if (isActive) {
              connectWebSocket();
            }
          }, 1000);
        };

        wsRef.current = ws;
      } catch (err) {
        console.error('❌ WebSocket connection error:', err);
      }
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [isActive]);

  return robotState;
}

