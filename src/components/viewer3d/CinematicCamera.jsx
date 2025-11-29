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
  const errorTargetAngleRef = useRef(null); // Target angle on circle for error mode
  const errorStartAngleRef = useRef(null); // Starting angle for smooth transition
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
      // Ensure mesh is in scene and has geometry
      if (!errorFocusMesh.geometry) {
        console.error('❌ Error mesh has no geometry!', errorFocusMesh);
        return;
      }
      
      // Calculate bounding box of error mesh
      if (!errorFocusMesh.geometry.boundingBox) {
        errorFocusMesh.geometry.computeBoundingBox();
      }
      
      const bbox = errorFocusMesh.geometry.boundingBox;
      if (!bbox) {
        console.error('❌ Could not compute bounding box for error mesh!');
        return;
      }
      
      const center = new THREE.Vector3();
      bbox.getCenter(center);
      
      // Convert to world position - IMPORTANT: use getWorldPosition for accurate world coordinates
      const worldCenter = new THREE.Vector3();
      errorFocusMesh.getWorldPosition(worldCenter);
      // Add the local bounding box center offset
      const localCenter = center.clone();
      localCenter.applyMatrix4(errorFocusMesh.matrixWorld);
      worldCenter.add(localCenter.sub(errorFocusMesh.position));
      
      // Alternative: simpler approach using localToWorld
      const localCenter2 = center.clone();
      errorFocusMesh.localToWorld(localCenter2);
      
      // Use the simpler approach
      const finalWorldCenter = localCenter2;
      
      // ✅ Camera stays on a circle around robot center, pointing at center
      // Calculate angle on circle to face the error component
      const robotCenter = new THREE.Vector3(0, 0.15, 0);
      const directionToMesh = new THREE.Vector3().subVectors(finalWorldCenter, robotCenter);
      directionToMesh.y = 0; // Project to horizontal plane (XZ)
      
      // Check if direction is valid (not zero length)
      if (directionToMesh.length() < 0.001) {
        console.warn('⚠️ Error mesh is at robot center, cannot calculate angle');
        return;
      }
      
      directionToMesh.normalize();
      
      // Calculate angle on circle (in radians, 0 = +Z axis, counter-clockwise)
      const targetAngle = Math.atan2(directionToMesh.x, directionToMesh.z);
      
      errorTargetAngleRef.current = targetAngle;
      errorStartTimeRef.current = null; // Will be initialized on next frame
      errorStartAngleRef.current = null; // Will be captured on next frame
    } else if (errorFocusMesh && !cameraRef.current) {
      console.warn('⚠️ Error mesh set but camera not ready yet');
    }
  }, [errorFocusMesh]);

  // Camera animation - Cinematic circular arc OR focus on error
  useFrame(() => {
    if (!enabled || !cameraRef.current) return;

    // ⚠️ MODE ERREUR : Camera moves on circle to face error component, always pointing at center
    if (errorFocusMesh && errorTargetAngleRef.current !== null) {
      // Capture starting angle on first frame
      if (errorStartTimeRef.current === null) {
        errorStartTimeRef.current = Date.now();
        
        // Calculate current angle from camera position
        const currentPos = cameraRef.current.position;
        const currentAngle = Math.atan2(currentPos.x, currentPos.z);
        errorStartAngleRef.current = currentAngle;
      }
      
      const errorElapsed = (Date.now() - errorStartTimeRef.current) / 1000;
      const errorDuration = 1.5; // 1.5s for smooth transition
      const errorProgress = Math.min(errorElapsed / errorDuration, 1.0);
      
      // Very smooth easing (ease-in-out)
      const eased = errorProgress < 0.5
        ? 2 * errorProgress * errorProgress
        : 1 - Math.pow(-2 * errorProgress + 2, 2) / 2;
      
      // Interpolate angle on circle
      const startAngle = errorStartAngleRef.current;
      const targetAngle = errorTargetAngleRef.current;
      
      // Handle angle wrapping (shortest path)
      let angleDiff = targetAngle - startAngle;
      if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
      if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
      
      const currentAngle = startAngle + angleDiff * eased;
      
      // ✅ Camera stays on fixed circle, same radius and height as normal mode
      const radius = 0.35; // Same as normal mode
      const height = 0.15; // Same as normal mode
      
      // Position camera on circle at interpolated angle
      const x = Math.sin(currentAngle) * radius;
      const z = Math.cos(currentAngle) * radius;
      cameraRef.current.position.set(x, height, z);
      
      // ✅ Look at error mesh position (not robot center)
      const errorWorldPos = new THREE.Vector3();
      errorFocusMesh.getWorldPosition(errorWorldPos);
      cameraRef.current.lookAt(errorWorldPos);
      
      return;
    }

    // 🎬 NORMAL MODE: Slow rotation in wide shot
    // ⚡ Initialize timer on first frame (when scan really starts)
    if (startTimeRef.current === null) {
      startTimeRef.current = Date.now();
    }
    
    const elapsed = (Date.now() - startTimeRef.current) / 1000;

    // ✅ WIDE SHOT: Fixed position at good distance to see entire robot
    const radius = 0.30; // Closer: reduced from 0.35 to 0.30 for better view
    const height = 0.15;  // Fixed height, centered on robot with antennas folded
    
    // ✅ SLOW ROTATION: Half turn over scan duration (slower)
    // From 0° to 180° over total duration (much slower rotation)
    const rotationSpeed = (Math.PI) / animationDuration; // Radians per second (half rotation)
    const angle = elapsed * rotationSpeed;
    
    // Circular position (X and Z) - rotates clockwise
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;

    cameraRef.current.position.set(x, height, z);

    // Always look towards the center of the robot
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

