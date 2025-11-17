import { useState, useMemo, useEffect, useRef } from 'react';
import { OrbitControls } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import URDFRobot from './URDFRobot';
import { useLevaControls } from './config/levaControls';
import ScanEffect from './effects/ScanEffect';
import ScanAnnotations from './effects/ScanAnnotations';
import ErrorHighlight from './effects/ErrorHighlight';
import ParticleEffect from './effects/ParticleEffect';
import CinematicCamera from './CinematicCamera';
import HeadFollowCamera from './HeadFollowCamera';
import useAppStore from '../../store/useAppStore';
import { DAEMON_CONFIG } from '../../config/daemon';
import useRobotParts from './hooks/useRobotParts';

/**
 * Scène 3D avec éclairage, environnement et effets post-processing
 */
export default function Scene({ 
  headPose, 
  headJoints, // ✅ Array de 7 valeurs [yaw_body, stewart_1, ..., stewart_6]
  yawBody, 
  antennas, 
  isActive, 
  isTransparent, 
  showLevaControls, 
  forceLoad = false, 
  hideGrid = false,
  showScanEffect = false, // Display the scan effect
  onScanComplete = null, // Callback when scan is complete
  onScanMesh = null, // Callback for each scanned mesh
  cameraConfig = {}, // Camera config (target, minDistance, maxDistance)
  useCinematicCamera = false, // Use animated camera instead of OrbitControls
  useHeadFollowCamera = false, // Camera attached to head that follows its movements
  lockCameraToHead = false, // Lock camera to head orientation
  errorFocusMesh = null, // Mesh to focus on in case of error
  hideEffects = false, // Hide particle effects
  darkMode = false, // Dark mode to adapt grid
}) {
  // State to store meshes to outline
  const [outlineMeshes, setOutlineMeshes] = useState([]);
  const [robotRef, setRobotRef] = useState(null); // Reference to robot for HeadFollowCamera
  const [currentScannedMesh, setCurrentScannedMesh] = useState(null); // Mesh currently being scanned
  
  // ✅ Exposer les informations cinématiques du robot
  const kinematics = useRobotParts(isActive, robotRef);
  
  // ✅ Extraire les joints passifs pour les passer à URDFRobot
  const passiveJoints = kinematics.passiveJoints?.array || kinematics.passiveJoints || null;
  
  // ✅ Exposer les données cinématiques via window pour debug (accessible depuis la console)
  const lastLogRef = useRef(null);
  useEffect(() => {
    if (kinematics && Object.keys(kinematics).length > 0) {
      window.kinematics = kinematics;
      
      // ✅ Logger seulement quand les données cinématiques importantes changent
      const logKey = JSON.stringify({
        joints: kinematics.joints,
        headPose: kinematics.headPose?.matrix,
      });
      
      if (logKey !== lastLogRef.current) {
        // ✅ Log exhaustif mais intelligent pour debug cinématique
        const logData = {
          // ✅ Joints actifs (7 head joints + 2 antennas)
          joints: kinematics.joints,
          
          // ✅ Head pose (calculée par Placo FK)
          headPose: kinematics.headPose ? {
            position: kinematics.headPose.position,
            positionDirect: kinematics.headPose.positionDirect, // Position brute de la matrice
            euler: kinematics.headPose.euler,
            matrix: kinematics.headPose.matrix ? '4x4 matrix' : null,
          } : null,
          
          // ✅ Transformations des liens URDF (pour comparaison avec Placo)
          links: kinematics.links ? Object.keys(kinematics.links) : [],
          linksData: kinematics.links,
          
          // ✅ Joints passifs (21 valeurs : passive_1_x/y/z à passive_7_x/y/z)
          // Seulement disponibles si Placo est actif (kinematics_engine == "Placo")
          passiveJoints: kinematics.passiveJoints ? {
            count: kinematics.passiveJoints.count || kinematics.passiveJoints.array?.length || 0,
            hasStructured: !!kinematics.passiveJoints.structured,
            sample: kinematics.passiveJoints.structured ? {
              passive_1_x: kinematics.passiveJoints.structured.passive_1_x,
              passive_1_y: kinematics.passiveJoints.structured.passive_1_y,
              passive_7_z: kinematics.passiveJoints.structured.passive_7_z,
            } : null,
          } : null,
          hasPassiveJoints: !!kinematics.passiveJoints,
          
          timestamp: kinematics.timestamp,
        };
        
        console.log('📊 Kinematics exposed to window.kinematics', logData);
        lastLogRef.current = logKey;
      }
    }
  }, [kinematics]);
  
  // ✅ Reset currentScannedMesh when showScanEffect becomes false
  useEffect(() => {
    if (!showScanEffect) {
      setCurrentScannedMesh(null);
    }
  }, [showScanEffect]);
  
  // ⚡ Scan duration read from central config
  const scanDuration = DAEMON_CONFIG.ANIMATIONS.SCAN_DURATION / 1000;

  // Get active effect from store
  const { activeEffect } = useAppStore();

  // Centralized Leva controls
  const { cellShading, lighting, ssao, xraySettings, scene } = useLevaControls(showLevaControls);

  // Calculate Reachy's head position in real-time
  // Use useMemo to recalculate only when effect changes (optimization)
  const headPosition = useMemo(() => {
    if (!robotRef) return [0, 0.18, 0.02]; // Default position
    
    // Find camera link (at head level)
    const cameraLink = robotRef.links?.['camera'];
    if (cameraLink) {
      const worldPosition = new THREE.Vector3();
      cameraLink.getWorldPosition(worldPosition);
      
      // Add offset so particles appear above and in front of head
      return [worldPosition.x, worldPosition.y + 0.03, worldPosition.z + 0.02];
    }
    
    // Fallback to xl_330 if camera is not available
    const headLink = robotRef.links?.['xl_330'];
    if (headLink) {
      const worldPosition = new THREE.Vector3();
      headLink.getWorldPosition(worldPosition);
      return [worldPosition.x, worldPosition.y + 0.03, worldPosition.z + 0.02];
    }
    
    return [0, 0.18, 0.02]; // Fallback if no link found
  }, [robotRef, activeEffect]); // ✅ Recalculate only when a new effect starts

  // Create grid only once with useMemo - Adapted to dark mode
  const gridHelper = useMemo(() => {
    // Colors adapted to dark mode
    const majorLineColor = darkMode ? '#444444' : '#999999';
    const minorLineColor = darkMode ? '#2a2a2a' : '#cccccc';
    
    const grid = new THREE.GridHelper(2, 20, majorLineColor, minorLineColor);
    grid.material.opacity = darkMode ? 0.3 : 0.5;
    grid.material.transparent = true;
    grid.material.fog = true; // Enable fog on grid
    return grid;
  }, [darkMode]);

  // ✅ Find all camera meshes when an error is detected
  const errorMeshes = useMemo(() => {
    if (!errorFocusMesh || !robotRef || !outlineMeshes.length) {
      console.log('⚠️ ErrorHighlight: Missing prerequisites', {
        hasErrorMesh: !!errorFocusMesh,
        hasRobotRef: !!robotRef,
        meshesCount: outlineMeshes.length
      });
      return null;
    }

    console.log('🔍 Analyzing error mesh:', {
      name: errorFocusMesh.name,
      parent: errorFocusMesh.parent?.name,
      availableLinks: Object.keys(robotRef.links || {})
    });

    // Helper function to find the parent link of a mesh
    const findParentLink = (mesh) => {
      let current = mesh;
      let depth = 0;
      while (current && current.parent && depth < 10) {
        const parentName = current.parent.name || '';
        // Check if parent is a link (URDF links often have specific names)
        if (robotRef.links && Object.keys(robotRef.links).some(linkName => 
          parentName === linkName || parentName.includes(linkName)
        )) {
          return current.parent;
        }
        // Also check by name
        if (parentName.toLowerCase().includes('camera')) {
          return current.parent;
        }
        current = current.parent;
        depth++;
      }
      return null;
    };

    // Helper function to collect all child meshes from an object
    const collectMeshesFromObject = (obj, meshes = []) => {
      if (obj.isMesh && !obj.userData.isOutline) {
        meshes.push(obj);
      }
      if (obj.children) {
        obj.children.forEach(child => {
          collectMeshesFromObject(child, meshes);
        });
      }
      return meshes;
    };

    // Check if the error mesh is part of the camera
    let isCameraMesh = false;
    let cameraLink = null;
    
    // Method 1: Check via camera link directly
    if (robotRef.links?.['camera']) {
      cameraLink = robotRef.links['camera'];
      const cameraMeshes = collectMeshesFromObject(cameraLink, []);
      isCameraMesh = cameraMeshes.includes(errorFocusMesh);
      
      if (isCameraMesh) {
        console.log(`📷 Error mesh is part of camera link, found ${cameraMeshes.length} total camera meshes`);
        return cameraMeshes.length > 0 ? cameraMeshes : [errorFocusMesh];
      }
    }

    // Method 2: Traverse hierarchy to find a "camera" parent
    let current = errorFocusMesh;
    let depth = 0;
    while (current && current.parent && depth < 10) {
      const parentName = (current.parent.name || '').toLowerCase();
      const currentName = (current.name || '').toLowerCase();
      
      if (parentName.includes('camera') || currentName.includes('camera')) {
        isCameraMesh = true;
        console.log('📷 Found camera in hierarchy:', {
          parentName: current.parent.name,
          currentName: current.name
        });
        break;
      }
      current = current.parent;
      depth++;
    }

    // If it's a camera mesh, find ALL camera meshes
    if (isCameraMesh) {
      // If we have the camera link, use its meshes
      if (cameraLink) {
        const cameraMeshes = collectMeshesFromObject(cameraLink, []);
        console.log(`📷 Found ${cameraMeshes.length} camera mesh(es) via link traversal`);
        return cameraMeshes.length > 0 ? cameraMeshes : [errorFocusMesh];
      }
      
      // Otherwise, search for all meshes with "camera" in their hierarchy
      const cameraMeshes = [];
      outlineMeshes.forEach((mesh) => {
        let current = mesh;
        let depth = 0;
        while (current && current.parent && depth < 10) {
          const parentName = (current.parent.name || '').toLowerCase();
          const currentName = (current.name || '').toLowerCase();
          if (parentName.includes('camera') || currentName.includes('camera')) {
            cameraMeshes.push(mesh);
            break;
          }
          current = current.parent;
          depth++;
        }
      });

      console.log(`📷 Found ${cameraMeshes.length} camera mesh(es) via name matching`);
      return cameraMeshes.length > 0 ? cameraMeshes : [errorFocusMesh];
    }

      // Otherwise, return just the error mesh
    console.log('⚠️ Error mesh is not part of camera, highlighting only the error mesh');
    return [errorFocusMesh];
  }, [errorFocusMesh, robotRef, outlineMeshes]);

  return (
    <>
      {/* Fog for fade out effect */}
      <fog attach="fog" args={['#fdfcfa', 1, scene.fogDistance]} />
      
      {/* Three-point lighting setup */}
      <ambientLight intensity={lighting.ambient} />
      
      {/* Key Light - Main light (front-right, elevated) */}
      <directionalLight 
        position={[2, 4, 2]} 
        intensity={lighting.keyIntensity} 
        castShadow 
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      
      {/* Fill Light - Fill light (front-left, softer) */}
      <directionalLight 
        position={[-2, 2, 1.5]} 
        intensity={lighting.fillIntensity}
      />
      
      {/* Back/Rim Light - Back light (for separation) */}
      <directionalLight 
        position={[0, 3, -2]} 
        intensity={lighting.rimIntensity}
        color="#FFB366"
      />
      
      {/* Floor grid - Using primitive with Three.js GridHelper */}
      {!hideGrid && scene.showGrid && <primitive object={gridHelper} position={[0, 0, 0]} />}
      
      <URDFRobot 
        headPose={headPose} 
        headJoints={headJoints} // ✅ Utiliser les joints directement (comme Rerun)
        passiveJoints={passiveJoints} // ✅ Joints passifs pour la cinématique complète Stewart
        yawBody={yawBody} 
        antennas={antennas}
        isActive={isActive} 
        isTransparent={isTransparent}
        cellShading={cellShading}
        xrayOpacity={xraySettings.opacity}
        onMeshesReady={setOutlineMeshes}
        onRobotReady={setRobotRef}
        forceLoad={forceLoad}
      />
      
      {/* Scan effect during loading */}
      {showScanEffect && (
        <>
        <ScanEffect 
          meshes={outlineMeshes}
            scanColor="#22c55e"
          enabled={true}
            onScanMesh={(mesh, index, total) => {
              // Update currently scanned mesh for annotations
              // Reduced logging - only log every 10th mesh
              if (index % 10 === 0 || index === total - 1) {
                console.log(`📡 Scan: ${index + 1}/${total} meshes`);
              }
              setCurrentScannedMesh(mesh);
              // Call parent callback if provided
              if (onScanMesh) {
                onScanMesh(mesh, index, total);
              }
            }}
            onComplete={() => {
              // Reset scanned mesh at end to hide annotations
              setCurrentScannedMesh(null);
              if (onScanComplete) {
                onScanComplete();
              }
            }}
          />
          {/* SF annotations for scanned components */}
          <ScanAnnotations 
            enabled={showScanEffect}
            currentScannedMesh={currentScannedMesh}
        />
        </>
      )}
      
      {/* Highlight effect in case of error */}
      {errorFocusMesh && (
        <ErrorHighlight 
          errorMesh={errorFocusMesh}
          errorMeshes={errorMeshes}
          allMeshes={outlineMeshes}
          errorColor="#ff0000"
          enabled={true}
        />
      )}
      
      {/* Camera: 3 possible modes */}
      {useHeadFollowCamera ? (
        <>
          {/* Mode 1: Camera following head (ActiveRobotView) */}
          <HeadFollowCamera
            robot={robotRef}
            offset={[0, 0, 0.25]}
            fov={cameraConfig.fov || 50}
            lookAtOffset={[0, 0, 0]}
            enabled={true}
            lockToOrientation={lockCameraToHead}
          />
          
          {/* OrbitControls only in unlocked mode */}
          {!lockCameraToHead && (
            <OrbitControls 
              enablePan={false}
              enableRotate={true}
              enableZoom={true} // ✅ Allow zoom
              enableDamping={true}
              dampingFactor={0.05}
              target={cameraConfig.target || [0, 0.2, 0]}
              minDistance={cameraConfig.minDistance || 0.2} // ✅ Minimum distance (prevents zoom out)
              maxDistance={cameraConfig.maxDistance || 10} // ✅ Very large maximum distance (allows zoom)
              // ✅ No angle constraints = free 360° rotation
            />
          )}
        </>
      ) : useCinematicCamera ? (
        // Mode 2: Vertically animated camera (StartingView scan)
        <CinematicCamera
          initialPosition={cameraConfig.position || [0, 0.22, 0.35]}
          target={cameraConfig.target || [0, 0.12, 0]}
          fov={cameraConfig.fov || 55}
          enabled={true}
          errorFocusMesh={errorFocusMesh}
        />
      ) : (
        // Mode 3: Manual OrbitControls (default) - Free rotation with zoom but no zoom out
        <OrbitControls 
          enablePan={false}
          enableRotate={true}
          enableZoom={true} // ✅ Allow zoom
          enableDamping={true}
          dampingFactor={0.05}
          target={cameraConfig.target || [0, 0.2, 0]}
          minDistance={cameraConfig.minDistance || 0.2} // ✅ Minimum distance (prevents zoom out)
          maxDistance={cameraConfig.maxDistance || 10} // ✅ Very large maximum distance (allows zoom)
          // ✅ No angle constraints = free 360° rotation
        />
      )}
      
      {/* Visual particle effects (sleep, love, etc.) */}
      {!hideEffects && activeEffect && (
        <ParticleEffect
          type={activeEffect}
          spawnPoint={headPosition}
          particleCount={6}
          enabled={true}
          duration={4.0}
        />
      )}
      
      {/* ✅ AAA Post-processing: Bloom for X-ray mode */}
      {isTransparent && (
        <EffectComposer>
          <Bloom
            intensity={1.2} // Bloom intensity
            luminanceThreshold={0.6} // Luminance threshold (pixels brighter than this bloom)
            luminanceSmoothing={0.9} // Bloom smoothing
            height={300} // Bloom resolution (lower = more performant)
          />
        </EffectComposer>
      )}
    </>
  );
}

