import React, { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { DAEMON_CONFIG } from '../../config/daemon';

export interface CinematicCameraProps {
  initialPosition?: [number, number, number];
  target?: [number, number, number];
  fov?: number;
  enabled?: boolean;
  errorFocusMesh?: THREE.Mesh | null;
}

export default function CinematicCamera({
  initialPosition = [0, 0.15, 0.35],
  target = [0, 0.12, 0],
  fov = 55,
  enabled = true,
  errorFocusMesh = null,
}: CinematicCameraProps): React.ReactElement {
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const startTimeRef = useRef<number | null>(null);
  const errorStartTimeRef = useRef<number | null>(null);
  const errorTargetAngleRef = useRef<number | null>(null);
  const errorStartAngleRef = useRef<number | null>(null);
  const { set } = useThree();

  const animationDuration = DAEMON_CONFIG.ANIMATIONS.SCAN_DURATION / 1000;

  useEffect(() => {
    if (cameraRef.current) {
      set({ camera: cameraRef.current });
    }
  }, [set]);

  useEffect(() => {
    if (errorFocusMesh && cameraRef.current) {
      if (!errorFocusMesh.geometry) {
        console.error('❌ Error mesh has no geometry!', errorFocusMesh);
        return;
      }

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

      const worldCenter = new THREE.Vector3();
      errorFocusMesh.getWorldPosition(worldCenter);
      const localCenter = center.clone();
      localCenter.applyMatrix4(errorFocusMesh.matrixWorld);
      worldCenter.add(localCenter.sub(errorFocusMesh.position));

      const localCenter2 = center.clone();
      errorFocusMesh.localToWorld(localCenter2);

      const finalWorldCenter = localCenter2;

      const robotCenter = new THREE.Vector3(0, 0.15, 0);
      const directionToMesh = new THREE.Vector3().subVectors(finalWorldCenter, robotCenter);
      directionToMesh.y = 0;

      if (directionToMesh.length() < 0.001) {
        console.warn('⚠️ Error mesh is at robot center, cannot calculate angle');
        return;
      }

      directionToMesh.normalize();

      const targetAngle = Math.atan2(directionToMesh.x, directionToMesh.z);

      errorTargetAngleRef.current = targetAngle;
      errorStartTimeRef.current = null;
      errorStartAngleRef.current = null;
    } else if (errorFocusMesh && !cameraRef.current) {
      console.warn('⚠️ Error mesh set but camera not ready yet');
    }
  }, [errorFocusMesh]);

  useFrame(() => {
    if (!enabled || !cameraRef.current) return;

    if (errorFocusMesh && errorTargetAngleRef.current !== null) {
      if (errorStartTimeRef.current === null) {
        errorStartTimeRef.current = Date.now();

        const currentPos = cameraRef.current.position;
        const currentAngle = Math.atan2(currentPos.x, currentPos.z);
        errorStartAngleRef.current = currentAngle;
      }

      const errorElapsed = (Date.now() - errorStartTimeRef.current) / 1000;
      const errorDuration = 1.5;
      const errorProgress = Math.min(errorElapsed / errorDuration, 1.0);

      const eased =
        errorProgress < 0.5
          ? 2 * errorProgress * errorProgress
          : 1 - Math.pow(-2 * errorProgress + 2, 2) / 2;

      const startAngle = errorStartAngleRef.current as number;
      const targetAngle = errorTargetAngleRef.current;

      let angleDiff = targetAngle - startAngle;
      if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
      if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

      const currentAngle = startAngle + angleDiff * eased;

      const radius = 0.35;
      const height = 0.15;

      const x = Math.sin(currentAngle) * radius;
      const z = Math.cos(currentAngle) * radius;
      cameraRef.current.position.set(x, height, z);

      const errorWorldPos = new THREE.Vector3();
      errorFocusMesh.getWorldPosition(errorWorldPos);
      cameraRef.current.lookAt(errorWorldPos);

      return;
    }

    if (startTimeRef.current === null) {
      startTimeRef.current = Date.now();
    }

    const elapsed = (Date.now() - startTimeRef.current) / 1000;

    const radius = 0.3;
    const height = 0.15;

    const rotationSpeed = Math.PI / animationDuration;
    const angle = elapsed * rotationSpeed;

    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;

    cameraRef.current.position.set(x, height, z);

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
