import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { DAEMON_CONFIG } from '../../config/daemon';

/**
 * Caméra cinématique avec animation smooth
 * Alternative à OrbitControls pour un rendu plus filmique
 */
export default function CinematicCamera({ 
  initialPosition = [0, 0.15, 0.35],
  target = [0, 0.12, 0],
  fov = 55,
  enabled = true,
  errorFocusMesh = null, // Mesh à focus en cas d'erreur
}) {
  const cameraRef = useRef();
  const startTimeRef = useRef(null); // ⚡ null au départ, sera initialisé au premier frame
  const errorStartTimeRef = useRef(null);
  const errorStartPositionRef = useRef(null); // Position de départ pour l'erreur
  const errorStartLookAtRef = useRef(null); // LookAt de départ pour l'erreur
  const errorTargetPositionRef = useRef(null);
  const errorTargetLookAtRef = useRef(null);
  const { set } = useThree();
  
  // ⚡ Durée de l'animation lue depuis la config centrale
  const animationDuration = DAEMON_CONFIG.ANIMATIONS.SCAN_DURATION / 1000;

  // Définir cette caméra comme caméra active
  useEffect(() => {
    if (cameraRef.current) {
      set({ camera: cameraRef.current });
    }
  }, [set]);

  // Détecter quand une erreur est levée et calculer la position cible
  useEffect(() => {
    if (errorFocusMesh && cameraRef.current) {
      console.log('🎥 Error detected, focusing on mesh:', errorFocusMesh);
      
      // Calculer la bounding box du mesh en erreur
      if (!errorFocusMesh.geometry.boundingBox) {
        errorFocusMesh.geometry.computeBoundingBox();
      }
      
      const bbox = errorFocusMesh.geometry.boundingBox;
      const center = new THREE.Vector3();
      bbox.getCenter(center);
      
      // Convertir en position world
      const worldCenter = center.clone();
      errorFocusMesh.localToWorld(worldCenter);
      
      // Position de la caméra : un peu plus loin, vue d'ensemble
      const meshSize = new THREE.Vector3();
      bbox.getSize(meshSize);
      const baseDistance = 0.15; // Distance fixe raisonnable
      
      const errorCameraPosition = new THREE.Vector3(
        worldCenter.x + baseDistance * 0.3, // Légèrement sur le côté
        worldCenter.y + baseDistance * 0.4, // Légèrement au-dessus
        worldCenter.z + baseDistance * 0.8  // En avant
      );
      
      errorTargetPositionRef.current = errorCameraPosition;
      errorTargetLookAtRef.current = worldCenter;
      errorStartTimeRef.current = null; // Sera initialisé au prochain frame
      errorStartPositionRef.current = null; // Sera capturé au prochain frame
      
      console.log('🎥 Error focus transition prepared:', {
        to: errorCameraPosition.toArray(),
        meshCenter: worldCenter.toArray(),
      });
    }
  }, [errorFocusMesh]);

  // Animation de la caméra - Arc circulaire cinématique OU focus sur erreur
  useFrame(() => {
    if (!enabled || !cameraRef.current) return;

    // ⚠️ MODE ERREUR : Focus sur le mesh en erreur
    if (errorFocusMesh && errorTargetPositionRef.current) {
      // Capturer la position et lookAt de départ au premier frame (évite le flicker)
      if (errorStartTimeRef.current === null) {
        errorStartTimeRef.current = Date.now();
        errorStartPositionRef.current = cameraRef.current.position.clone();
        
        // Calculer le lookAt actuel à partir de la rotation de la caméra
        const direction = new THREE.Vector3(0, 0, -1);
        direction.applyQuaternion(cameraRef.current.quaternion);
        errorStartLookAtRef.current = cameraRef.current.position.clone().add(direction);
        
        console.log('🎥 Error focus started from:', {
          position: errorStartPositionRef.current.toArray(),
          lookAt: errorStartLookAtRef.current.toArray(),
        });
      }
      
      const errorElapsed = (Date.now() - errorStartTimeRef.current) / 1000;
      const errorDuration = 1.5; // 1.5s pour une transition rapide et smooth
      const errorProgress = Math.min(errorElapsed / errorDuration, 1.0);
      
      // Easing très smooth (ease-in-out)
      const eased = errorProgress < 0.5
        ? 2 * errorProgress * errorProgress
        : 1 - Math.pow(-2 * errorProgress + 2, 2) / 2;
      
      // Interpolation position
      const startPos = errorStartPositionRef.current;
      const newPos = new THREE.Vector3(
        startPos.x + (errorTargetPositionRef.current.x - startPos.x) * eased,
        startPos.y + (errorTargetPositionRef.current.y - startPos.y) * eased,
        startPos.z + (errorTargetPositionRef.current.z - startPos.z) * eased
      );
      
      cameraRef.current.position.copy(newPos);
      
      // Interpolation lookAt pour rotation smooth
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

    // 🎬 MODE NORMAL : Animation en arc
    // ⚡ Initialiser le timer au premier frame (quand le scan démarre vraiment)
    if (startTimeRef.current === null) {
      startTimeRef.current = Date.now();
      console.log('🎥 Camera animation started');
    }
    
    const elapsed = (Date.now() - startTimeRef.current) / 1000;
    const progress = Math.min(elapsed / animationDuration, 1.0);

    // Easing très doux (ease-in-out cubique)
    const eased = progress < 0.5
      ? 4 * progress * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 3) / 2;

    // ✅ Mouvement en ARC : rotation circulaire + descente progressive
    const startRadius = 0.45; // Commence plus loin
    const endRadius = 0.25;   // Termine proche de la vue normale
    const radius = startRadius + (eased * (endRadius - startRadius));
    
    const startAngle = Math.PI * 0.25; // Commence plus à droite (45°)
    const endAngle = 0;  // Termine face (0°) pour correspondre à la vue normale
    const angle = startAngle + (eased * (endAngle - startAngle));
    
    // Position circulaire (X et Z)
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;
    
    // Descente progressive (Y) - termine à 0.25 pour correspondre à la vue normale
    const startY = 0.32; // Commence haut
    const endY = 0.25;   // Termine à la hauteur de la vue normale
    const y = startY + (eased * (endY - startY));

    cameraRef.current.position.set(x, y, z);

    // Regarder vers le centre du robot - se rapprochant de la target normale (0, 0.2, 0)
    const startTargetY = target[1];  // 0.12
    const endTargetY = 0.2;           // Target de la vue normale
    const targetY = startTargetY + (eased * (endTargetY - startTargetY));
    const targetVec = new THREE.Vector3(target[0], targetY, target[2]);
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

