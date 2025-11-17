import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';

/**
 * Camera that follows Reachy's head
 * Attached to xl_330 link (head) to track all its movements
 */
export default function HeadFollowCamera({ 
  robot = null, // Reference to URDF robot model
  offset = [0, 0, 0.25], // Offset relative to head [x, y, z]
  fov = 50,
  lookAtOffset = [0, 0, 0], // Viewpoint offset
  enabled = true,
  lockToOrientation = false, // If true, follows head orientation, otherwise just position
}) {
  const cameraRef = useRef();
  const { set } = useThree();
  const frameCountRef = useRef(0);
  const targetPositionRef = useRef(new THREE.Vector3());
  const targetLookAtRef = useRef(new THREE.Vector3());

  // Set this camera as active camera
  useEffect(() => {
    if (cameraRef.current) {
      set({ camera: cameraRef.current });
    }
  }, [set]);

  // Follow robot head
  useFrame(() => {
    if (!enabled || !cameraRef.current || !robot) return;

    // Find head link (xl_330)
    const headLink = robot.links?.['xl_330'];
    
    if (headLink) {
      const headWorldPosition = new THREE.Vector3();
      headLink.getWorldPosition(headWorldPosition);
      
      if (lockToOrientation) {
        // 🔒 LOCKED MODE: Follows head orientation via camera frame
        const cameraFrame = robot.links?.['camera'];
        
        if (cameraFrame) {
          const cameraWorldPosition = new THREE.Vector3();
          const cameraWorldQuaternion = new THREE.Quaternion();
          cameraFrame.getWorldPosition(cameraWorldPosition);
          cameraFrame.getWorldQuaternion(cameraWorldQuaternion);
          
          // Calculate forward vector based on orientation
          const forwardVector = new THREE.Vector3(1, 0, 0);
          forwardVector.applyQuaternion(cameraWorldQuaternion);
          
          const distance = Math.sqrt(offset[0]**2 + offset[1]**2 + offset[2]**2) || 0.26;
          const targetPosition = cameraWorldPosition.clone().add(
            forwardVector.multiplyScalar(distance)
          );
          
          // Smoothing to avoid jitter
          cameraRef.current.position.lerp(targetPosition, 0.1);
          cameraRef.current.lookAt(cameraWorldPosition);
        } else {
          cameraRef.current.position.set(...offset);
          cameraRef.current.lookAt(headWorldPosition);
        }
      } else {
        // 🔓 UNLOCKED MODE: FIXED position and target (doesn't follow anything)
        // Camera stays at fixed position in world
        const fixedCameraPosition = new THREE.Vector3(0, 0.25, 0.32);
        const fixedTarget = new THREE.Vector3(0, 0.2, 0);
        
        cameraRef.current.position.copy(fixedCameraPosition);
        cameraRef.current.lookAt(fixedTarget);
      }
    } else {
      // Fallback: fixed position if no head found
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

