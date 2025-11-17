import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { DAEMON_CONFIG } from '../../config/daemon';

/**
 * Cinematic camera with smooth animation
 * Alternative to OrbitControls for more filmic rendering
 */
export default function CinematicCamera({ 
  initialPosition = [0, 0.15, 0.35],
  target = [0, 0.12, 0],
  fov = 55,
  enabled = true,
  errorFocusMesh = null, // Mesh to focus on in case of error
}) {
  const cameraRef = useRef();
  const startTimeRef = useRef(null); // ⚡ null initially, will be initialized on first frame
  const errorStartTimeRef = useRef(null);
  const errorStartPositionRef = useRef(null); // Starting position for error
  const errorStartLookAtRef = useRef(null); // Starting lookAt for error
  const errorTargetPositionRef = useRef(null);
  const errorTargetLookAtRef = useRef(null);
  const { set } = useThree();
  
  // ⚡ Animation duration read from central config
  const animationDuration = DAEMON_CONFIG.ANIMATIONS.SCAN_DURATION / 1000;

  // Set this camera as active camera
  useEffect(() => {
    if (cameraRef.current) {
      set({ camera: cameraRef.current });
    }
  }, [set]);

  // Detect when an error is raised and calculate target position
  useEffect(() => {
    if (errorFocusMesh && cameraRef.current) {
      console.log('🎥 Error detected, focusing on mesh:', errorFocusMesh);
      
      // Calculate bounding box of error mesh
      if (!errorFocusMesh.geometry.boundingBox) {
        errorFocusMesh.geometry.computeBoundingBox();
      }
      
      const bbox = errorFocusMesh.geometry.boundingBox;
      const center = new THREE.Vector3();
      bbox.getCenter(center);
      
      // Convert to world position
      const worldCenter = center.clone();
      errorFocusMesh.localToWorld(worldCenter);
      
      // Camera position: a bit further, overview
      const meshSize = new THREE.Vector3();
      bbox.getSize(meshSize);
      const baseDistance = 0.15; // Reasonable fixed distance
      
      const errorCameraPosition = new THREE.Vector3(
        worldCenter.x + baseDistance * 0.3, // Slightly to the side
        worldCenter.y + baseDistance * 0.4, // Slightly above
        worldCenter.z + baseDistance * 0.8  // Forward
      );
      
      errorTargetPositionRef.current = errorCameraPosition;
      errorTargetLookAtRef.current = worldCenter;
      errorStartTimeRef.current = null; // Will be initialized on next frame
      errorStartPositionRef.current = null; // Will be captured on next frame
      
      console.log('🎥 Error focus transition prepared:', {
        to: errorCameraPosition.toArray(),
        meshCenter: worldCenter.toArray(),
      });
    }
  }, [errorFocusMesh]);

  // Camera animation - Cinematic circular arc OR focus on error
  useFrame(() => {
    if (!enabled || !cameraRef.current) return;

    // ⚠️ MODE ERREUR : Focus sur le mesh en erreur
    if (errorFocusMesh && errorTargetPositionRef.current) {
      // Capture starting position and lookAt on first frame (avoids flicker)
      if (errorStartTimeRef.current === null) {
        errorStartTimeRef.current = Date.now();
        errorStartPositionRef.current = cameraRef.current.position.clone();
        
        // Calculate current lookAt from camera rotation
        const direction = new THREE.Vector3(0, 0, -1);
        direction.applyQuaternion(cameraRef.current.quaternion);
        errorStartLookAtRef.current = cameraRef.current.position.clone().add(direction);
        
        console.log('🎥 Error focus started from:', {
          position: errorStartPositionRef.current.toArray(),
          lookAt: errorStartLookAtRef.current.toArray(),
        });
      }
      
      const errorElapsed = (Date.now() - errorStartTimeRef.current) / 1000;
      const errorDuration = 1.5; // 1.5s for fast and smooth transition
      const errorProgress = Math.min(errorElapsed / errorDuration, 1.0);
      
      // Very smooth easing (ease-in-out)
      const eased = errorProgress < 0.5
        ? 2 * errorProgress * errorProgress
        : 1 - Math.pow(-2 * errorProgress + 2, 2) / 2;
      
      // Position interpolation
      const startPos = errorStartPositionRef.current;
      const newPos = new THREE.Vector3(
        startPos.x + (errorTargetPositionRef.current.x - startPos.x) * eased,
        startPos.y + (errorTargetPositionRef.current.y - startPos.y) * eased,
        startPos.z + (errorTargetPositionRef.current.z - startPos.z) * eased
      );
      
      cameraRef.current.position.copy(newPos);
      
      // LookAt interpolation for smooth rotation
      const startLookAt = errorStartLookAtRef.current;
      const targetLookAt = errorTargetLookAtRef.current;
      const interpolatedLookAt = new THREE.Vector3(
        startLookAt.x + (targetLookAt.x - startLookAt.x) * eased,
        startLookAt.y + (targetLookAt.y - startLookAt.y) * eased,
        startLookAt.z + (targetLookAt.z - startLookAt.z) * eased
      );
      
      cameraRef.current.lookAt(interpolatedLookAt);
      
      return;
    }

    // 🎬 NORMAL MODE: Slow rotation in wide shot
    // ⚡ Initialize timer on first frame (when scan really starts)
    if (startTimeRef.current === null) {
      startTimeRef.current = Date.now();
      console.log('🎥 Camera animation started - slow rotation');
    }
    
    const elapsed = (Date.now() - startTimeRef.current) / 1000;

    // ✅ WIDE SHOT: Fixed position at good distance to see entire robot
    const radius = 0.35; // Fixed distance, zoom on robot
    const height = 0.15;  // Fixed height, centered on robot with antennas folded
    
    // ✅ SLOW ROTATION: Full turn over scan duration
    // From 0° to 360° over total duration
    const rotationSpeed = (2 * Math.PI) / animationDuration; // Radians per second
    const angle = elapsed * rotationSpeed;
    
    // Circular position (X and Z) - rotates clockwise
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;

    cameraRef.current.position.set(x, height, z);

    // Toujours regarder vers le centre du robot
    const targetVec = new THREE.Vector3(target[0], target[1], target[2]);
    cameraRef.current.lookAt(targetVec);
  });

  return (
    <PerspectiveCamera
      ref={cameraRef}
      makeDefault
      position={initialPosition}
      fov={fov}
      near={0.01}
      far={100}
    />
  );
}

