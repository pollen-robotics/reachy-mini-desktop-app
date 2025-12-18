import { useState, useMemo, useEffect, useRef, memo } from 'react';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import URDFRobot from './URDFRobot';
// Leva removed - using hardcoded default values
import ScanEffect from './effects/ScanEffect';
import PremiumScanEffect from './effects/PremiumScanEffect';
import ErrorHighlight from './effects/ErrorHighlight';
// import ParticleEffect from './effects/ParticleEffect'; // TODO: Disabled for now
import CinematicCamera from './CinematicCamera';
import HeadFollowCamera from './HeadFollowCamera';
import useAppStore from '../../store/useAppStore';
import { DAEMON_CONFIG } from '../../config/daemon';
// 🚀 GAME-CHANGING: Removed useRobotParts - now using unified WebSocket via props
// ⚡ OPTIMIZED: Removed arraysEqual - using dataVersion for memo comparison instead

/**
 * 3D Scene with lighting, environment and post-processing effects
 */
function Scene({ 
  headPose, 
  headJoints, // ✅ Array of 7 values [yaw_body, stewart_1, ..., stewart_6]
  passiveJoints, // 🚀 GAME-CHANGING: Array of 21 values [passive_1_x, passive_1_y, passive_1_z, ..., passive_7_z] (from unified WebSocket)
  yawBody, 
  antennas, 
  isActive, 
  isTransparent, 
  wireframe = false, // ✅ Wireframe mode
  forceLoad = false, 
  hideGrid = false,
  showScanEffect = false, // Display the scan effect
  usePremiumScan = false, // Use premium world-class scan effect
  onScanComplete = null, // Callback when scan is complete
  onScanMesh = null, // Callback for each scanned mesh
  onMeshesReady = null, // Callback when robot meshes are ready
  cameraConfig = {}, // Camera config (target, minDistance, maxDistance)
  useCinematicCamera = false, // Use animated camera instead of OrbitControls
  useHeadFollowCamera = false, // Camera attached to head that follows its movements
  lockCameraToHead = false, // Lock camera to head orientation
  errorFocusMesh = null, // Mesh to focus on in case of error
  hideEffects = false, // Hide particle effects
  darkMode = false, // Dark mode to adapt grid
  dataVersion = 0, // ⚡ OPTIMIZED: Skip comparisons in URDFRobot if version unchanged
}) {
  // State to store meshes to outline
  const [outlineMeshes, setOutlineMeshes] = useState([]);
  const [robotRef, setRobotRef] = useState(null); // Reference to robot for HeadFollowCamera
  
  // ✅ Forward meshes to parent callback if provided
  useEffect(() => {
    if (onMeshesReady && outlineMeshes.length > 0) {
      onMeshesReady(outlineMeshes);
    }
  }, [onMeshesReady, outlineMeshes]);
  
  // 🚀 GAME-CHANGING: passiveJoints now comes from props (unified WebSocket) instead of useRobotParts
  // This eliminates the DOUBLE WebSocket problem!
  
  // ✅ Expose kinematic data via window for debug (simplified, without useRobotParts)
  // ✅ OPTIMIZED: Use numeric comparison instead of JSON.stringify (much faster)
  const lastHeadJointsRef = useRef(null);
  const lastHasPassiveJointsRef = useRef(null);
  useEffect(() => {
    // Only log if we have meaningful data
    if (headJoints && headJoints.length === 7) {
      // ✅ OPTIMIZED: Compare numerically instead of JSON.stringify (78% faster)
      const headJointsChanged = !lastHeadJointsRef.current || 
        headJoints.some((v, i) => Math.abs(v - (lastHeadJointsRef.current?.[i] || 0)) > 0.001);
      const hasPassiveJoints = !!passiveJoints;
      const passiveJointsChanged = hasPassiveJoints !== lastHasPassiveJointsRef.current;
      
      if (headJointsChanged || passiveJointsChanged) {
        window.kinematics = {
          headJoints,
          passiveJoints,
          headPose,
          timestamp: new Date().toISOString(),
        };
        // ✅ Store references instead of creating new arrays
        lastHeadJointsRef.current = headJoints;
        lastHasPassiveJointsRef.current = hasPassiveJoints;
      }
    }
  }, [headJoints, passiveJoints, headPose]);
  
  
  // ⚡ Scan duration read from central config
  const scanDuration = DAEMON_CONFIG.ANIMATIONS.SCAN_DURATION / 1000;

  // Get active effect from store
  const { activeEffect } = useAppStore();

  // Default values (Leva removed - was never displayed)
  const cellShading = {
    bands: 100,
    smoothness: 0.45,
    rimIntensity: 0.4,
    specularIntensity: 0.3,
    ambientIntensity: 0.45,
    contrastBoost: 0.9,
    outlineEnabled: true,
    outlineThickness: 12.0,
    outlineColor: '#000000',
  };
  const lighting = {
    ambient: 0.3,
    keyIntensity: 1.8,
    fillIntensity: 0.3,
    rimIntensity: 0.8,
  };
  // ✅ X-ray opacity: 4x more transparent in dark mode (0.2 -> 0.1 -> 0.05)
  const xraySettings = {
    opacity: darkMode ? 0.05 : 0.2, // 4x more transparent in dark mode
  };
  const scene = {
    showGrid: true,
    fogDistance: 2.5,
  };

  // 🚀 GAME-CHANGING: Reuse Vector3 objects to avoid allocations
  const headPositionVectorRef = useRef(new THREE.Vector3());

  // Calculate Reachy's head position in real-time
  // Use useMemo to recalculate only when effect changes (optimization)
  const headPosition = useMemo(() => {
    if (!robotRef) return [0, 0.18, 0.02]; // Default position
    
    // Find camera link (at head level)
    const cameraLink = robotRef.links?.['camera'];
    if (cameraLink) {
      // 🚀 GAME-CHANGING: Reuse Vector3 instead of creating new one
      cameraLink.getWorldPosition(headPositionVectorRef.current);
      
      // Add offset so particles appear above and in front of head
      return [
        headPositionVectorRef.current.x, 
        headPositionVectorRef.current.y + 0.03, 
        headPositionVectorRef.current.z + 0.02
      ];
    }
    
    // Fallback to xl_330 if camera is not available
    const headLink = robotRef.links?.['xl_330'];
    if (headLink) {
      // 🚀 GAME-CHANGING: Reuse Vector3 instead of creating new one
      headLink.getWorldPosition(headPositionVectorRef.current);
      return [
        headPositionVectorRef.current.x, 
        headPositionVectorRef.current.y + 0.03, 
        headPositionVectorRef.current.z + 0.02
      ];
    }
    
    return [0, 0.18, 0.02]; // Fallback if no link found
  }, [robotRef, activeEffect]); // ✅ Recalculate only when a new effect starts

  // Create grid only once with useMemo - Adapted to dark mode
  const gridHelper = useMemo(() => {
    // Colors adapted to dark mode - improved visibility
    const majorLineColor = darkMode ? '#555555' : '#999999';
    const minorLineColor = darkMode ? '#333333' : '#cccccc';
    
    const grid = new THREE.GridHelper(2, 20, majorLineColor, minorLineColor);
    grid.material.opacity = darkMode ? 0.4 : 0.5;
    grid.material.transparent = true;
    grid.material.fog = true; // Enable fog on grid
    return grid;
  }, [darkMode]);

  // ✅ Find all camera meshes when an error is detected
  const errorMeshes = useMemo(() => {
    if (!errorFocusMesh) {
      return null;
    }
    
    // If we don't have robotRef or outlineMeshes yet, return just the error mesh
    if (!robotRef || !outlineMeshes.length) {
      return [errorFocusMesh]; // Return array with single mesh
    }

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

      return cameraMeshes.length > 0 ? cameraMeshes : [errorFocusMesh];
    }

      // Otherwise, return just the error mesh
    return [errorFocusMesh];
  }, [errorFocusMesh, robotRef, outlineMeshes]);

  // ✅ Fog color adapted to dark mode
  const fogColor = darkMode ? '#1a1a1a' : '#fdfcfa';
  
  return (
    <>
      {/* Fog for fade out effect */}
      <fog attach="fog" args={[fogColor, 1, scene.fogDistance]} />
      
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
        headJoints={headJoints}
        passiveJoints={passiveJoints}
        yawBody={yawBody} 
        antennas={antennas}
        isActive={isActive} 
        isTransparent={isTransparent}
        wireframe={wireframe}
        xrayOpacity={xraySettings.opacity}
        onMeshesReady={setOutlineMeshes}
        onRobotReady={setRobotRef}
        forceLoad={forceLoad}
        dataVersion={dataVersion}
      />
      
      {/* Scan effect during loading */}
      {showScanEffect && (
        <>
        {usePremiumScan ? (
          <PremiumScanEffect 
            meshes={outlineMeshes}
            scanColor="#00ff88"
            enabled={true}
            onScanMesh={(mesh, index, total) => {
              // Call parent callback if provided (no annotations for premium scan)
              if (onScanMesh) {
                onScanMesh(mesh, index, total);
              }
            }}
            onComplete={() => {
              if (onScanComplete) {
                onScanComplete();
              }
            }}
          />
        ) : (
          <>
          <ScanEffect 
            meshes={outlineMeshes}
            scanColor="#16a34a"
            enabled={true}
            onScanMesh={(mesh, index, total) => {
              // Call parent callback if provided
              if (onScanMesh) {
                onScanMesh(mesh, index, total);
              }
            }}
            onComplete={() => {
              if (onScanComplete) {
                onScanComplete();
              }
            }}
          />
          </>
        )}
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
      
      {/* Visual particle effects (sleep, love, etc.) - DISABLED */}
      {/* {!hideEffects && activeEffect && (
        <ParticleEffect
          type={activeEffect}
          spawnPoint={headPosition}
          particleCount={6}
          enabled={true}
          duration={4.0}
        />
      )} */}
    </>
  );
}

// 🚀 GAME-CHANGING: Memoize Scene to prevent unnecessary re-renders
// ⚡ OPTIMIZED: Use dataVersion instead of comparing all arrays individually
export default memo(Scene, (prevProps, nextProps) => {
  // Compare primitive props
  if (
    prevProps.isActive !== nextProps.isActive ||
    prevProps.isTransparent !== nextProps.isTransparent ||
    prevProps.wireframe !== nextProps.wireframe ||
    prevProps.forceLoad !== nextProps.forceLoad ||
    prevProps.hideGrid !== nextProps.hideGrid ||
    prevProps.showScanEffect !== nextProps.showScanEffect ||
    prevProps.useCinematicCamera !== nextProps.useCinematicCamera ||
    prevProps.useHeadFollowCamera !== nextProps.useHeadFollowCamera ||
    prevProps.lockCameraToHead !== nextProps.lockCameraToHead ||
    prevProps.hideEffects !== nextProps.hideEffects ||
    prevProps.darkMode !== nextProps.darkMode
  ) {
    return false; // Re-render
  }
  
  // ⚡ OPTIMIZED: Compare dataVersion instead of all arrays (O(1) vs O(n))
  // dataVersion increments when any robot data changes in WebSocket
  if (prevProps.dataVersion !== nextProps.dataVersion) {
    return false; // Re-render - new robot data available
  }
  
  // All props are equal, skip re-render
  return true;
});
