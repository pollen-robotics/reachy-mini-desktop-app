import { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { convertRowMajorToColumnMajor, extractPositionFromRowMajorMatrix } from '../utils/matrixUtils';

/**
 * Hook pour exposer les informations cinématiques du robot
 * Focus sur la cinématique : joints actifs, transformations des liens clés, pose de la tête
 * 
 * @param {boolean} isActive - Si le daemon est actif
 * @param {Object} robotModel - Le modèle URDF du robot (depuis URDFRobot)
 * @returns {Object} État cinématique du robot
 */
export default function useRobotParts(isActive, robotModel) {
  const [kinematics, setKinematics] = useState({
    // ✅ Joints actifs (positions actuelles en radians)
    joints: {
      yaw_body: null,
      head_joint_1: null,
      head_joint_2: null,
      head_joint_3: null,
      head_joint_4: null,
      head_joint_5: null,
      head_joint_6: null,
      left_antenna: null,
      right_antenna: null,
    },
    
    // ✅ Pose de la tête (matrice 4x4 transformée)
    headPose: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      euler: { x: 0, y: 0, z: 0 }, // Euler angles pour debug
      matrix: null, // Matrice 4x4 complète [16 valeurs]
    },
    
    // ✅ Transformations des liens clés (pour la cinématique)
    links: {
      xl_330: null, // Link principal de la tête (Stewart platform)
      yaw_body: null, // Link du body yaw
    },
    
    // ✅ Joints passifs (si disponibles)
    passiveJoints: null,
    
    // ✅ Métadonnées
    timestamp: null,
  });
  
  const wsRef = useRef(null);
  const lastKinematicsRef = useRef(null);
  const tempMatrix = useRef(new THREE.Matrix4());
  const tempPosition = useRef(new THREE.Vector3());
  const tempQuaternion = useRef(new THREE.Quaternion());
  const tempEuler = useRef(new THREE.Euler());

  // ✅ Récupérer les données cinématiques du WebSocket
  useEffect(() => {
    if (!isActive || !robotModel) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    const connectWebSocket = () => {
      try {
        const ws = new WebSocket(
          'ws://localhost:8000/api/state/ws/full?frequency=10&with_head_pose=true&use_pose_matrix=true&with_head_joints=true&with_antenna_positions=true&with_passive_joints=true'
        );

        ws.onopen = () => {
          // Reduced logging
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            const newKinematics = {
              timestamp: data.timestamp || new Date().toISOString(),
            };

            // ✅ Head pose (matrice 4x4) - Extraire position et rotation
            // Placo calcule cette matrice via FK: T_world_head = robot.get_T_world_frame("head")
            // La matrice contient [R|t] où R est la rotation 3x3 et t est la translation 3x1
            if (data.head_pose) {
              // ✅ Le daemon peut envoyer soit un array directement, soit un objet {m: [...]}
              let headPoseArray = null;
              if (Array.isArray(data.head_pose)) {
                headPoseArray = data.head_pose;
              } else if (data.head_pose.m && Array.isArray(data.head_pose.m)) {
                headPoseArray = data.head_pose.m;
              }
              
              if (headPoseArray && headPoseArray.length === 16) {
                // ✅ IMPORTANT: Le daemon envoie la matrice en row-major (C-style)
                // arr.flatten().tolist() donne: [m11, m12, m13, m14, m21, m22, m23, m24, ...]
                // Three.js attend column-major (Fortran-style): [m11, m21, m31, m41, m12, m22, ...]
                
                // ✅ Extraire directement depuis la matrice row-major (format daemon)
                const directPosition = extractPositionFromRowMajorMatrix(headPoseArray);
                
                // ✅ Convertir row-major -> column-major pour Three.js
                const columnMajorArray = convertRowMajorToColumnMajor(headPoseArray);
                tempMatrix.current.fromArray(columnMajorArray);
                tempMatrix.current.decompose(tempPosition.current, tempQuaternion.current, new THREE.Vector3());
                tempEuler.current.setFromQuaternion(tempQuaternion.current);
                
                newKinematics.headPose = {
                  position: {
                    x: tempPosition.current.x,
                    y: tempPosition.current.y,
                    z: tempPosition.current.z,
                  },
                  positionDirect: directPosition, // Position extraite directement de la matrice row-major
                  rotation: {
                    x: tempQuaternion.current.x,
                    y: tempQuaternion.current.y,
                    z: tempQuaternion.current.z,
                    w: tempQuaternion.current.w,
                  },
                  euler: {
                    x: tempEuler.current.x,
                    y: tempEuler.current.y,
                    z: tempEuler.current.z,
                  },
                  matrix: headPoseArray,
                };
              }
            }

            // ✅ Head joints (7 valeurs : yaw_body + 6 joints Stewart)
            if (data.head_joints && Array.isArray(data.head_joints) && data.head_joints.length === 7) {
              newKinematics.joints = {
                yaw_body: data.head_joints[0],
                head_joint_1: data.head_joints[1],
                head_joint_2: data.head_joints[2],
                head_joint_3: data.head_joints[3],
                head_joint_4: data.head_joints[4],
                head_joint_5: data.head_joints[5],
                head_joint_6: data.head_joints[6],
                left_antenna: null,
                right_antenna: null,
              };
            }

            // ✅ Antennas
            if (data.antennas_position && Array.isArray(data.antennas_position)) {
              newKinematics.joints = {
                ...newKinematics.joints,
                left_antenna: data.antennas_position[0],
                right_antenna: data.antennas_position[1],
              };
            }

            // ✅ Passive joints (21 valeurs : passive_1_x/y/z à passive_7_x/y/z)
            // Seulement disponibles si Placo est actif (kinematics_engine == "Placo")
            // Le daemon retourne None si Placo n'est pas actif
            if (data.passive_joints !== null && data.passive_joints !== undefined) {
              if (Array.isArray(data.passive_joints)) {
                // ✅ Structurer les joints passifs par groupe (comme dans le code Rerun)
                // passive_1_x/y/z (indices 0, 1, 2)
                // passive_2_x/y/z (indices 3, 4, 5)
                // ... jusqu'à passive_7_x/y/z (indices 18, 19, 20)
                const passiveJointsStructured = {};
                const passiveNames = [
                  'passive_1_x', 'passive_1_y', 'passive_1_z',
                  'passive_2_x', 'passive_2_y', 'passive_2_z',
                  'passive_3_x', 'passive_3_y', 'passive_3_z',
                  'passive_4_x', 'passive_4_y', 'passive_4_z',
                  'passive_5_x', 'passive_5_y', 'passive_5_z',
                  'passive_6_x', 'passive_6_y', 'passive_6_z',
                  'passive_7_x', 'passive_7_y', 'passive_7_z',
                ];
                
                data.passive_joints.forEach((value, index) => {
                  if (index < passiveNames.length) {
                    passiveJointsStructured[passiveNames[index]] = value;
                  }
                });
                
                newKinematics.passiveJoints = {
                  array: data.passive_joints, // Array brut pour compatibilité
                  structured: passiveJointsStructured, // Objet structuré par nom
                  count: data.passive_joints.length,
                };
              } else {
                // Si ce n'est pas un array, le stocker tel quel
                newKinematics.passiveJoints = data.passive_joints;
              }
            } else {
              // Explicitement null si Placo n'est pas actif
              newKinematics.passiveJoints = null;
            }

            // ✅ Extraire les transformations des liens clés depuis le modèle URDF
            if (robotModel && robotModel.links) {
              const keyLinks = {};
              
              // Link principal de la tête
              if (robotModel.links['xl_330']) {
                const link = robotModel.links['xl_330'];
                if (link && link.isObject3D) {
                  const worldPos = new THREE.Vector3();
                  const worldQuat = new THREE.Quaternion();
                  link.getWorldPosition(worldPos);
                  link.getWorldQuaternion(worldQuat);
                  
                  const euler = new THREE.Euler().setFromQuaternion(worldQuat);
                  
                  keyLinks.xl_330 = {
                    position: { x: worldPos.x, y: worldPos.y, z: worldPos.z },
                    rotation: { x: worldQuat.x, y: worldQuat.y, z: worldQuat.z, w: worldQuat.w },
                    euler: { x: euler.x, y: euler.y, z: euler.z },
                    matrix: link.matrixWorld ? link.matrixWorld.toArray() : null,
                  };
                }
              }
              
              // Link du body yaw
              if (robotModel.links['yaw_body']) {
                const link = robotModel.links['yaw_body'];
                if (link && link.isObject3D) {
                  const worldPos = new THREE.Vector3();
                  const worldQuat = new THREE.Quaternion();
                  link.getWorldPosition(worldPos);
                  link.getWorldQuaternion(worldQuat);
                  
                  const euler = new THREE.Euler().setFromQuaternion(worldQuat);
                  
                  keyLinks.yaw_body = {
                    position: { x: worldPos.x, y: worldPos.y, z: worldPos.z },
                    rotation: { x: worldQuat.x, y: worldQuat.y, z: worldQuat.z, w: worldQuat.w },
                    euler: { x: euler.x, y: euler.y, z: euler.z },
                    matrix: link.matrixWorld ? link.matrixWorld.toArray() : null,
                  };
                }
              }
              
              newKinematics.links = keyLinks;
            }

            // ✅ Mettre à jour seulement si les données cinématiques importantes ont changé
            const kinematicsKey = JSON.stringify({
              joints: newKinematics.joints,
              headPose: newKinematics.headPose?.matrix,
            });
            
            if (kinematicsKey !== lastKinematicsRef.current) {
              setKinematics(prev => ({
                ...prev,
                ...newKinematics,
              }));
              lastKinematicsRef.current = kinematicsKey;
            }
          } catch (err) {
            console.error('❌ Kinematics WebSocket parse error:', err);
          }
        };

        ws.onerror = (error) => {
          // Reduced logging - only log errors
        };

        ws.onclose = () => {
          setTimeout(() => {
            if (isActive && robotModel) {
              connectWebSocket();
            }
          }, 1000);
        };

        wsRef.current = ws;
      } catch (err) {
        console.error('❌ Kinematics WebSocket connection error:', err);
      }
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [isActive, robotModel]);

  return kinematics;
}
