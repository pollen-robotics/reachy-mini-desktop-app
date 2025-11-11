import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';

/**
 * Caméra qui suit la tête de Reachy
 * Attachée au link xl_330 (tête) pour tracker tous ses mouvements
 */
export default function HeadFollowCamera({ 
  robot = null, // Référence au modèle URDF du robot
  offset = [0, 0, 0.25], // Offset par rapport à la tête [x, y, z]
  fov = 50,
  lookAtOffset = [0, 0, 0], // Offset du point de vue
  enabled = true,
  lockToOrientation = false, // Si true, suit l'orientation de la tête, sinon juste la position
}) {
  const cameraRef = useRef();
  const { set } = useThree();
  const frameCountRef = useRef(0);
  const targetPositionRef = useRef(new THREE.Vector3());
  const targetLookAtRef = useRef(new THREE.Vector3());

  // Définir cette caméra comme caméra active
  useEffect(() => {
    if (cameraRef.current) {
      set({ camera: cameraRef.current });
    }
  }, [set]);

  // Suivre la tête du robot
  useFrame(() => {
    if (!enabled || !cameraRef.current || !robot) return;

    // Trouver le link de la tête (xl_330)
    const headLink = robot.links?.['xl_330'];
    
    if (headLink) {
      const headWorldPosition = new THREE.Vector3();
      headLink.getWorldPosition(headWorldPosition);
      
      if (lockToOrientation) {
        // 🔒 MODE LOCKED : Suit l'orientation de la tête via le frame camera
        const cameraFrame = robot.links?.['camera'];
        
        if (cameraFrame) {
          const cameraWorldPosition = new THREE.Vector3();
          const cameraWorldQuaternion = new THREE.Quaternion();
          cameraFrame.getWorldPosition(cameraWorldPosition);
          cameraFrame.getWorldQuaternion(cameraWorldQuaternion);
          
          // Calculer forward vector basé sur l'orientation
          const forwardVector = new THREE.Vector3(1, 0, 0);
          forwardVector.applyQuaternion(cameraWorldQuaternion);
          
          const distance = Math.sqrt(offset[0]**2 + offset[1]**2 + offset[2]**2) || 0.26;
          const targetPosition = cameraWorldPosition.clone().add(
            forwardVector.multiplyScalar(distance)
          );
          
          // Lissage pour éviter tremblements
          cameraRef.current.position.lerp(targetPosition, 0.1);
          cameraRef.current.lookAt(cameraWorldPosition);
        } else {
          cameraRef.current.position.set(...offset);
          cameraRef.current.lookAt(headWorldPosition);
        }
      } else {
        // 🔓 MODE UNLOCKED : Position et target FIXES (ne suit rien)
        // La caméra reste à une position fixe dans le monde
        const fixedCameraPosition = new THREE.Vector3(0, 0.25, 0.32);
        const fixedTarget = new THREE.Vector3(0, 0.2, 0);
        
        cameraRef.current.position.copy(fixedCameraPosition);
        cameraRef.current.lookAt(fixedTarget);
      }
    } else {
      // Fallback : position fixe si pas de tête trouvée
      cameraRef.current.position.set(...offset);
      cameraRef.current.lookAt(0, 0.2, 0);
    }
  });

  return (
    <PerspectiveCamera
      ref={cameraRef}
      makeDefault
      position={offset}
      fov={fov}
      near={0.01}
      far={100}
    />
  );
}

