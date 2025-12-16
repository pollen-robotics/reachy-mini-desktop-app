import { useRef, useEffect, useLayoutEffect, useState, useCallback, memo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { createXrayMaterial } from '../../utils/viewer3d/materials';
import robotModelCache from '../../utils/robotModelCache';
import useAppStore from '../../store/useAppStore';
import { logInfo } from '../../utils/logging';
import { arraysEqual } from '../../utils/arraysEqual';

/**
 * Robot component loaded from local URDF
 * Loads assets from /assets/robot-3d/ instead of daemon
 * Manages 3D model loading, head and antenna animations
 */
function URDFRobot({ 
  headPose, // ✅ Pose matrix (for debug/comparison, but we use joints)
  headJoints, // ✅ Array of 7 values [yaw_body, stewart_1, ..., stewart_6]
  passiveJoints, // ✅ Array of 21 values [passive_1_x, passive_1_y, passive_1_z, ..., passive_7_z] (optional, only if Placo active)
  yawBody, 
  antennas, 
  isActive, 
  isTransparent, 
  cellShading = { enabled: false, bands: 100, smoothShading: true },
  xrayOpacity = 0.5,
  wireframe = false, // ✅ Wireframe mode
  onMeshesReady,
  onRobotReady, // Callback with robot reference
  forceLoad = false, // ✅ Force loading even if isActive=false
}) {
  const [robot, setRobot] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const groupRef = useRef();
  const meshesRef = useRef([]);
  const displayTimeoutRef = useRef(null);
  const { camera, gl } = useThree();
  // ✅ Get darkMode from store
  const darkMode = useAppStore(state => state.darkMode);
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());
  const hoveredMesh = useRef(null);
  const frameCountRef = useRef(0); // ✅ OPTIMIZED: Frame counter for deterministic throttling (optimization #2)
  const lastClickTimeRef = useRef(0); // ✅ Throttle clicks to avoid spam
  const clickThrottleMs = 300; // Minimum time between clicks (300ms)
  
  // ✅ Reuse Three.js objects to avoid allocations on each frame
  const tempMatrix = useRef(new THREE.Matrix4());
  const tempPosition = useRef(new THREE.Vector3());
  const tempQuaternion = useRef(new THREE.Quaternion());
  const tempScale = useRef(new THREE.Vector3());
  
  // ✅ Cache to avoid unnecessary updates
  const lastHeadPoseRef = useRef(null);
  const lastHeadJointsRef = useRef(null);
  const lastPassiveJointsRef = useRef(null);
  const lastYawBodyRef = useRef(undefined);
  const lastAntennasRef = useRef(null);
  
  // ✅ Mouse movement handler for raycaster
  useEffect(() => {
    const handleMouseMove = (event) => {
      const rect = gl.domElement.getBoundingClientRect();
      mouse.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };
    
    // ✅ Click handler to log piece information
    const handleClick = (event) => {
      if (!robot) return;
      
      // Throttle clicks to avoid spam
      const now = Date.now();
      if (now - lastClickTimeRef.current < clickThrottleMs) {
        return;
      }
      lastClickTimeRef.current = now;
      
      // Use requestAnimationFrame to avoid blocking
      requestAnimationFrame(() => {
        const rect = gl.domElement.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        raycaster.current.setFromCamera(new THREE.Vector2(x, y), camera);
        const intersects = raycaster.current.intersectObject(robot, true);
        
        if (intersects.length > 0) {
          const mesh = intersects[0].object;
          if (mesh.isMesh && !mesh.userData.isErrorMesh) {
            // ✅ Fun random messages
            const messages = [
              '👆 You clicked on Reachy!',
              '🤖 That tickles!',
              '✨ Nice aim!',
              '🎯 Bullseye!',
              '👋 Hey there!'
            ];
            const randomMessage = messages[Math.floor(Math.random() * messages.length)];
            logInfo(randomMessage);
          }
        }
      });
    };
    
    gl.domElement.addEventListener('mousemove', handleMouseMove);
    gl.domElement.addEventListener('click', handleClick);
    return () => {
      gl.domElement.removeEventListener('mousemove', handleMouseMove);
      gl.domElement.removeEventListener('click', handleClick);
    };
  }, [gl, camera, robot]);
  
  // ✅ Simple function to apply materials
  const applyMaterials = useCallback((robotModel, transparent, cellShadingConfig, opacity, wireframeMode, isDarkMode) => {
    robotModel.traverse((child) => {
      if (!child.isMesh || child.userData.isErrorMesh) return;
      
      const originalColor = child.userData?.originalColor || 0xFF9500;
      // Check both userData and material name for lenses (fallback)
      const materialName = (child.userData?.materialName || child.material?.name || '').toLowerCase();
      const stlFileName = (child.userData?.stlFileName || '').toLowerCase();
      const isBigLens = child.userData?.isBigLens || 
                       materialName.includes('big_lens') ||
                       materialName.includes('small_lens') ||
                       materialName.includes('lens_d40') ||
                       materialName.includes('lens_d30');
      // Enhanced antenna detection: userData OR material name OR STL filename
      const isAntenna = child.userData?.isAntenna || 
                       materialName.includes('antenna') ||
                       stlFileName.includes('antenna');
      // Arducam (camera) detection
      const isArducam = materialName.includes('arducam') ||
                       stlFileName.includes('arducam');
      
      if (wireframeMode) {
        // Wireframe mode: simple wireframe material
        child.material = new THREE.MeshBasicMaterial({
          color: originalColor,
          wireframe: true,
          transparent: false,
        });
        // Force material update
        child.material.needsUpdate = true;
      } else if (transparent) {
        // X-ray mode: simple transparent material
        // Use lighter, more vibrant colors in dark mode for better visibility
        let xrayColor, rimColor;
        if (isDarkMode) {
          // Dark mode: brighter cyan/blue tones for better contrast
          if (isAntenna) {
            xrayColor = 0x8AACD0; // Even lighter blue-cyan
            rimColor = 0xAAC8E8; // Brighter cyan rim
          } else if (isBigLens) {
            xrayColor = 0x9BB8B8; // Even lighter teal
            rimColor = 0xB8D8D8; // Brighter teal rim
          } else {
            xrayColor = 0x8A9AAA; // Even lighter blue-gray
            rimColor = 0xAAC0D0; // Brighter blue-gray rim
          }
        } else {
          // Light mode: original colors
          xrayColor = 0x5A6570;
          if (isAntenna) xrayColor = 0x5A6B7C;
          else if (isBigLens) xrayColor = 0x6B7B7A;
          rimColor = undefined; // Use default
        }
        
        child.material = createXrayMaterial(xrayColor, { 
          opacity: isDarkMode ? Math.min(opacity * 1.5, 0.15) : opacity, // Slightly more visible in dark mode
          rimColor: rimColor,
          rimIntensity: isDarkMode ? 0.8 : 0.6, // More intense rim in dark mode
        });
      } else {
        // Normal mode: flat shading classique
        // For true flat shading, we need to compute normals per face (not per vertex)
        // Remove existing normals and recompute face normals
        if (child.geometry.attributes.normal) {
          child.geometry.deleteAttribute('normal');
        }
        // ✅ Recalculer les normales par face pour le flat shading
        child.geometry.computeVertexNormals();
        
        if (isBigLens) {
          child.material = new THREE.MeshStandardMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.75,
            flatShading: true, // ✅ Flat shading classique - normales par face
          });
        } else if (isAntenna) {
          // Antennas: light gray in dark mode, black in light mode
          const antennaColor = isDarkMode ? 0x999999 : 0x000000;
          child.material = new THREE.MeshStandardMaterial({
            color: antennaColor,
            flatShading: true,
            roughness: 0.3,
            metalness: 0.2,
          });
          // Force material update
          child.material.needsUpdate = true;
        } else if (isArducam) {
          // Arducam: gray similar to other gray robot parts (0.301961 = 0x4D4D4D)
          child.material = new THREE.MeshStandardMaterial({
            color: 0x4D4D4D, // Medium gray like body_foot_3dprint, stewart_tricap_3dprint, etc.
            flatShading: true,
            roughness: 0.7,
            metalness: 0.0,
          });
          // Force material update
          child.material.needsUpdate = true;
        } else {
          child.material = new THREE.MeshStandardMaterial({
            color: originalColor,
            flatShading: true, // ✅ Flat shading classique - normales par face
            roughness: 0.7,
            metalness: 0.0,
          });
        }
      }
    });
  }, [darkMode]);


  // STEP 1: Load URDF model from cache (preloaded at startup)
  useEffect(() => {
    // Reset state when daemon is inactive (except if forceLoad is active)
    if (!isActive && !forceLoad) {
      setRobot(null);
      setIsReady(false);
      return;
    }

    let isMounted = true;

    // ✅ Get model from cache (already preloaded)
    robotModelCache.getModel().then((cachedModel) => {
      if (!isMounted) return;
      
      // Clone model for this instance
      const robotModel = cachedModel.clone(true);
      
      // Collect meshes
      const collectedMeshes = [];
      robotModel.traverse((child) => {
        if (child.isMesh) {
          collectedMeshes.push(child);
        }
      });
      meshesRef.current = collectedMeshes;
      
      // Notify parent that meshes are ready
      if (onMeshesReady) {
        onMeshesReady(collectedMeshes);
      }
      
      // Notify that robot is ready (for HeadFollowCamera)
      if (onRobotReady) {
        onRobotReady(robotModel);
      }
      
      // ✅ Model loaded, let useLayoutEffect apply materials
      // ✅ IMPORTANT: Initialize all joints to zero to avoid incorrect initial position
      // The Stewart platform requires all joints to be initialized correctly
      if (robotModel && robotModel.joints) {
        // Initialize yaw_body to 0
        if (robotModel.joints['yaw_body']) {
          robotModel.setJointValue('yaw_body', 0);
        }
        
        // Initialize all stewart joints to 0
        const stewartJointNames = ['stewart_1', 'stewart_2', 'stewart_3', 'stewart_4', 'stewart_5', 'stewart_6'];
        stewartJointNames.forEach(jointName => {
          if (robotModel.joints[jointName]) {
            robotModel.setJointValue(jointName, 0);
          }
        });
        
        // Initialize passive joints to 0 if available
        const passiveJointNames = [
          'passive_1_x', 'passive_1_y', 'passive_1_z',
          'passive_2_x', 'passive_2_y', 'passive_2_z',
          'passive_3_x', 'passive_3_y', 'passive_3_z',
          'passive_4_x', 'passive_4_y', 'passive_4_z',
          'passive_5_x', 'passive_5_y', 'passive_5_z',
          'passive_6_x', 'passive_6_y', 'passive_6_z',
          'passive_7_x', 'passive_7_y', 'passive_7_z',
        ];
        passiveJointNames.forEach(jointName => {
          if (robotModel.joints[jointName]) {
            robotModel.setJointValue(jointName, 0);
          }
        });
        
        // ✅ Force matrix update after initialization
        robotModel.traverse((child) => {
          if (child.isObject3D) {
            child.updateMatrix();
            child.updateMatrixWorld(true);
          }
        });
      }
      
      // ✅ Wait 500ms before displaying robot to avoid tilted head glitch
      displayTimeoutRef.current = setTimeout(() => {
        if (!isMounted) return;
        setRobot(robotModel);
        displayTimeoutRef.current = null;
      }, 500);
    }).catch((err) => {
      console.error('❌ URDF loading error:', err);
    });

    return () => {
      isMounted = false;
      // Cleanup timeout if component unmounts before delay completes
      if (displayTimeoutRef.current) {
        clearTimeout(displayTimeoutRef.current);
        displayTimeoutRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, forceLoad, onMeshesReady]); // ✅ Load when isActive or forceLoad changes

  // ✅ Apply antennas on initial load and when they change (even if isActive=false)
  const lastAntennasLogRef = useRef(null);
  useEffect(() => {
    if (!robot) return;
    
    // Force antennas to position (folded by default if no value)
    const leftPos = antennas?.[0] !== undefined ? antennas[0] : 0;
    const rightPos = antennas?.[1] !== undefined ? antennas[1] : 0;
    
    const currentAntennas = [leftPos, rightPos];
    
    // ✅ FIX: Inverted mapping AND inverted values - left_antenna joint is visually on the right, and vice versa
    // The values also need to be negated to match the correct rotation direction
    if (robot.joints['left_antenna']) {
      robot.setJointValue('left_antenna', -rightPos); // Right data (negated) goes to left visual antenna
    }
    if (robot.joints['right_antenna']) {
      robot.setJointValue('right_antenna', -leftPos); // Left data (negated) goes to right visual antenna
    }
    
    // ✅ IMPORTANT: Initialize lastAntennasRef to prevent useFrame from reapplying antennas
    // ✅ OPTIMIZED: Store reference directly (currentAntennas is already a new array)
    lastAntennasRef.current = currentAntennas;
    
    // Only log if antennas changed significantly (threshold: 0.01 rad)
    const lastAntennas = lastAntennasLogRef.current;
    if (!lastAntennas || 
        Math.abs(currentAntennas[0] - lastAntennas[0]) > 0.01 ||
        Math.abs(currentAntennas[1] - lastAntennas[1]) > 0.01) {
      lastAntennasLogRef.current = currentAntennas;
    }
  }, [robot, antennas]); // Triggers on load AND when antennas change
  
  
  // ✅ Animation loop synchronized with Three.js render (60 FPS)
  // 🚀 GAME-CHANGING: Throttled to 10 Hz to match WebSocket frequency (83% reduction in checks)
  // useFrame is more performant than useEffect for Three.js updates
  useFrame(() => {
    if (!robot) return;
    
    // ✅ Allow animations if robot is loaded (isActive OR forceLoad)
    // If forceLoad is true, we want robot to move even if isActive is temporarily false
    if (!isActive && !forceLoad) return;
    
    // 🚀 GAME-CHANGING: Throttle to 10 Hz (check every 6 frames at 60 FPS)
    frameCountRef.current++;
    if (frameCountRef.current % 6 !== 0) {
      return; // Skip this frame - only process every 6th frame (~10 Hz)
    }

    // STEP 1: Apply head joints (yaw_body + stewart_1 to stewart_6)
    // ✅ Use joints directly like in Rerun code (more precise than pose matrix)
    // Joints respect URDF kinematics
    // ✅ IMPORTANT: URDFLoader automatically updates matrices on setJointValue
    // Do NOT force updateMatrixWorld() to avoid conflicts and flickering
    if (headJoints && Array.isArray(headJoints) && headJoints.length === 7) {
      const headJointsChanged = !arraysEqual(headJoints, lastHeadJointsRef.current);
      
      if (headJointsChanged) {
        // yaw_body (index 0) - Apply first
        if (robot.joints['yaw_body']) {
          robot.setJointValue('yaw_body', headJoints[0]);
        } else {
          console.warn('⚠️ Joint yaw_body not found in robot model');
        }
        
        // stewart_1 to stewart_6 (indices 1-6) - Apply next
        const stewartJointNames = ['stewart_1', 'stewart_2', 'stewart_3', 'stewart_4', 'stewart_5', 'stewart_6'];
        let appliedCount = 0;
        const appliedValues = {};
        for (let i = 0; i < 6; i++) {
          const jointName = stewartJointNames[i];
          if (robot.joints[jointName]) {
            const jointValue = headJoints[i + 1];
            robot.setJointValue(jointName, jointValue);
            appliedValues[jointName] = jointValue;
            appliedCount++;
          } else {
            if (!lastHeadJointsRef.current) {
              console.warn(`⚠️ Joint ${jointName} not found in robot model`);
            }
          }
        }
        
        if (appliedCount < 6 && !lastHeadJointsRef.current) {
          console.warn(`⚠️ Only ${appliedCount}/6 stewart joints were applied`);
        }
        
        // ✅ OPTIMIZED: Store reference directly (arrays from WebSocket are not mutated)
        // Only slice if we need a copy for safety, but WebSocket arrays are safe to reference
        lastHeadJointsRef.current = headJoints;
      }
    } else if (yawBody !== lastYawBodyRef.current && yawBody !== undefined && robot.joints['yaw_body']) {
      // ✅ Fallback: use yawBody alone if headJoints is not available
      // ✅ OPTIMIZED: Increased tolerance to match arraysEqual (0.005 rad)
      const yawChanged = Math.abs(yawBody - (lastYawBodyRef.current || 0)) > 0.005;
      if (yawChanged) {
      robot.setJointValue('yaw_body', yawBody);
      lastYawBodyRef.current = yawBody;
    }
    }

    // STEP 1.5: Apply passive joints (21 values: passive_1_x/y/z to passive_7_x/y/z)
    // ✅ CRITICAL: Passive joints are necessary for complete Stewart platform kinematics
    // Only available if Placo is active
    if (passiveJoints && (Array.isArray(passiveJoints) || (passiveJoints.array && Array.isArray(passiveJoints.array)))) {
      const passiveArray = Array.isArray(passiveJoints) ? passiveJoints : passiveJoints.array;
      const passiveJointsChanged = !arraysEqual(passiveArray, lastPassiveJointsRef.current);
    
      if (passiveJointsChanged && passiveArray.length >= 21) {
        // ✅ Passive joint names in exact daemon order
        const passiveJointNames = [
          'passive_1_x', 'passive_1_y', 'passive_1_z',
          'passive_2_x', 'passive_2_y', 'passive_2_z',
          'passive_3_x', 'passive_3_y', 'passive_3_z',
          'passive_4_x', 'passive_4_y', 'passive_4_z',
          'passive_5_x', 'passive_5_y', 'passive_5_z',
          'passive_6_x', 'passive_6_y', 'passive_6_z',
          'passive_7_x', 'passive_7_y', 'passive_7_z',
        ];
        
        // Apply all passive joints
        for (let i = 0; i < Math.min(passiveArray.length, passiveJointNames.length); i++) {
          const jointName = passiveJointNames[i];
          if (robot.joints[jointName]) {
            robot.setJointValue(jointName, passiveArray[i]);
          }
        }
        
        // ✅ OPTIMIZED: Store reference directly (arrays from WebSocket are not mutated)
        lastPassiveJointsRef.current = passiveArray;
      }
    }

    // ✅ IMPORTANT: Do NOT force updateMatrixWorld() here
    // URDFLoader automatically updates matrices on setJointValue()
    // Forcing updateMatrixWorld() can create conflicts and cause flickering

    // STEP 2: Optional - Apply head_pose for comparison/debug (but joints are priority)
    // ✅ Pose matrix can be used to verify consistency, but joints are the source of truth
    if (headPose && headPose.length === 16) {
      const headPoseChanged = !arraysEqual(headPose, lastHeadPoseRef.current);
      if (headPoseChanged) {
        // ✅ OPTIMIZED: Store reference directly (arrays from WebSocket are not mutated)
        lastHeadPoseRef.current = headPose;
        // Note: We no longer apply the matrix directly as joints are more precise
      }
    }

    // STEP 3: Update antennas - only if changed (with tolerance to avoid unnecessary updates)
    // ✅ IMPORTANT: Apply antennas even if they are [0, 0] (folded)
    // Check if antennas is defined (can be null, undefined, or an array)
    if (antennas !== null && antennas !== undefined && Array.isArray(antennas) && antennas.length >= 2) {
      // ✅ OPTIMIZED: Increased tolerance to match arraysEqual (0.005 rad) to avoid micro-updates
      const antennasChanged = !lastAntennasRef.current || 
                             Math.abs(antennas[0] - lastAntennasRef.current[0]) > 0.005 ||
                             Math.abs(antennas[1] - lastAntennasRef.current[1]) > 0.005;
    
    if (antennasChanged) {
      // ✅ FIX: Inverted mapping AND inverted values - left_antenna joint is visually on the right, and vice versa
      // The values also need to be negated to match the correct rotation direction
      if (robot.joints['left_antenna']) {
        robot.setJointValue('left_antenna', -antennas[1]); // Right data (negated) goes to left visual antenna
      }
      if (robot.joints['right_antenna']) {
        robot.setJointValue('right_antenna', -antennas[0]); // Left data (negated) goes to right visual antenna
      }
      // ✅ OPTIMIZED: Store reference directly (arrays from WebSocket are not mutated)
      lastAntennasRef.current = antennas;
        // No need to update matrices for antennas (they are independent)
      }
    }
    
    // ✅ Hover detection with raycaster for debug (COMPLETELY DISABLED in production)
    // ✅ OPTIMIZED: Raycaster completely disabled in production for maximum performance
    // In development, only run every 3rd throttled frame (~3.3 Hz) for minimal overhead
    if (process.env.NODE_ENV === 'development' && frameCountRef.current % 3 === 0) {
      raycaster.current.setFromCamera(mouse.current, camera);
      const intersects = raycaster.current.intersectObject(robot, true);
      
      if (intersects.length > 0) {
        const mesh = intersects[0].object;
        if (mesh.isMesh && mesh !== hoveredMesh.current) {
          hoveredMesh.current = mesh;
        }
      } else {
        hoveredMesh.current = null;
      }
    }
    // ✅ Production: Raycaster completely skipped (0% overhead)
  });

  // STEP 2: Apply materials (on initial load AND on changes)
  // useLayoutEffect = synchronous BEFORE render, guarantees no "flash"
  useLayoutEffect(() => {
    if (!robot) return;
    
    const isInitialSetup = !isReady;
    
    applyMaterials(robot, isTransparent, cellShading, xrayOpacity, wireframe, darkMode);
    
    // Mark as ready after first material application
    if (isInitialSetup) {
      setIsReady(true);
    }
  }, [
    robot, 
    isTransparent, 
    xrayOpacity, 
    wireframe,
    darkMode,
    applyMaterials
  ]);

  // Only render robot when EVERYTHING is ready (loaded + materials applied)
  return robot && isReady ? (
    <group position={[0, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
      <primitive ref={groupRef} object={robot} scale={1} rotation={[-Math.PI / 2, 0, 0]} />
    </group>
  ) : null;
}

// 🚀 GAME-CHANGING: Memoize URDFRobot to prevent unnecessary re-renders
// Only re-render if props actually changed (deep comparison for arrays)
const URDFRobotMemo = memo(URDFRobot, (prevProps, nextProps) => {
  // Compare primitive props
  if (
    prevProps.isActive !== nextProps.isActive ||
    prevProps.isTransparent !== nextProps.isTransparent ||
    prevProps.wireframe !== nextProps.wireframe ||
    prevProps.forceLoad !== nextProps.forceLoad ||
    prevProps.xrayOpacity !== nextProps.xrayOpacity ||
    prevProps.yawBody !== nextProps.yawBody
  ) {
    return false; // Re-render
  }
  
  // Compare cellShading object (shallow)
  if (prevProps.cellShading?.enabled !== nextProps.cellShading?.enabled) {
    return false; // Re-render
  }
  
  // Compare headJoints
  if (!arraysEqual(prevProps.headJoints, nextProps.headJoints)) {
    return false; // Re-render
  }
  
  // Compare passiveJoints
  const prevPassive = Array.isArray(prevProps.passiveJoints) ? prevProps.passiveJoints : prevProps.passiveJoints?.array;
  const nextPassive = Array.isArray(nextProps.passiveJoints) ? nextProps.passiveJoints : nextProps.passiveJoints?.array;
  if (!arraysEqual(prevPassive, nextPassive)) {
    return false; // Re-render
  }
  
  // Compare antennas
  if (!arraysEqual(prevProps.antennas, nextProps.antennas)) {
    return false; // Re-render
  }
  
  // Compare headPose
  if (!arraysEqual(prevProps.headPose, nextProps.headPose)) {
    return false; // Re-render
  }
  
  // Callbacks are assumed stable (onMeshesReady, onRobotReady)
  // If they change, we want to re-render anyway
  
  // All props are equal, skip re-render
  return true;
});

export default URDFRobotMemo;
