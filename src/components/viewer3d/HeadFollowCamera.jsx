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
  // ✅ OPTIMIZED: Reuse Vector3 objects to avoid allocations on each frame
  const targetPositionRef = useRef(new THREE.Vector3());
  const targetLookAtRef = useRef(new THREE.Vector3());
  const headWorldPositionRef = useRef(new THREE.Vector3());
  const cameraWorldPositionRef = useRef(new THREE.Vector3());
  const cameraWorldQuaternionRef = useRef(new THREE.Quaternion());
  const forwardVectorRef = useRef(new THREE.Vector3(1, 0, 0));

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
      // ✅ OPTIMIZED: Reuse Vector3 objects instead of creating new ones
      headLink.getWorldPosition(headWorldPositionRef.current);
      
      if (lockToOrientation) {
        // 🔒 LOCKED MODE: Follows head orientation via camera frame
        const cameraFrame = robot.links?.['camera'];
        
        if (cameraFrame) {
          cameraFrame.getWorldPosition(cameraWorldPositionRef.current);
          cameraFrame.getWorldQuaternion(cameraWorldQuaternionRef.current);
          
          // Calculate forward vector based on orientation (reuse existing vector)
          forwardVectorRef.current.set(1, 0, 0);
          forwardVectorRef.current.applyQuaternion(cameraWorldQuaternionRef.current);
          
          const distance = Math.sqrt(offset[0]**2 + offset[1]**2 + offset[2]**2) || 0.26;
          targetPositionRef.current.copy(cameraWorldPositionRef.current);
          targetPositionRef.current.add(forwardVectorRef.current.multiplyScalar(distance));
          
          // Smoothing to avoid jitter
          cameraRef.current.position.lerp(targetPositionRef.current, 0.1);
          cameraRef.current.lookAt(cameraWorldPositionRef.current);
        } else {
          cameraRef.current.position.set(...offset);
          cameraRef.current.lookAt(headWorldPositionRef.current);
        }
      } else {
        // 🔓 UNLOCKED MODE: FIXED position and target (doesn't follow anything)
        // Camera stays at fixed position in world (reuse vectors)
        targetPositionRef.current.set(0, 0.25, 0.32);
        targetLookAtRef.current.set(0, 0.2, 0);
        
        cameraRef.current.position.copy(targetPositionRef.current);
        cameraRef.current.lookAt(targetLookAtRef.current);
      }
    } else {
      // Fallback: fixed position if no head found
      cameraRef.current.position.set(...offset);
      targetLookAtRef.current.set(0, 0.2, 0);
      cameraRef.current.lookAt(targetLookAtRef.current);
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

