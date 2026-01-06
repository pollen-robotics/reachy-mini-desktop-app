import { useRef, useEffect, useLayoutEffect, useState, memo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import robotModelCache from '../../utils/robotModelCache';
import useAppStore from '../../store/useAppStore';
import { logInfo } from '../../utils/logging';
import { applyRobotMaterials } from '../../utils/viewer3d/applyRobotMaterials';
import { STEWART_JOINT_NAMES, PASSIVE_JOINT_NAMES } from '../../constants/robotBuffer';

// ✅ Passive joint names for initialization
const ALL_PASSIVE_JOINT_NAMES = [
  'passive_1_x', 'passive_1_y', 'passive_1_z',
  'passive_2_x', 'passive_2_y', 'passive_2_z',
  'passive_3_x', 'passive_3_y', 'passive_3_z',
  'passive_4_x', 'passive_4_y', 'passive_4_z',
  'passive_5_x', 'passive_5_y', 'passive_5_z',
  'passive_6_x', 'passive_6_y', 'passive_6_z',
  'passive_7_x', 'passive_7_y', 'passive_7_z',
];

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
  dataVersion = 0, // ⚡ OPTIMIZED: Skip comparisons if version hasn't changed
}) {
  const [robot, setRobot] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const groupRef = useRef();
  const meshesRef = useRef([]);
  const displayTimeoutRef = useRef(null);
  const { camera, gl } = useThree();
  // ✅ Get darkMode from store
  const darkMode = useAppStore(state => state.darkMode);
  // ✅ Get initial robot position from store (pre-populated in HardwareScanView)
  // Use a ref to capture only the INITIAL value, avoid triggering effect on every update
  const robotStateFullRef = useRef(null);
  const robotStateFull = useAppStore(state => state.robotStateFull);
  
  // ✅ Capture initial value once (when first valid data arrives)
  if (!robotStateFullRef.current && robotStateFull?.data?.head_joints) {
    robotStateFullRef.current = robotStateFull;
  }
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
  
  // ⚡ OPTIMIZED: Only track dataVersion - no need for individual value refs anymore
  const lastAppliedVersionRef = useRef(-1);
  
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
      
      // Notify that robot is ready
      if (onRobotReady) {
        onRobotReady(robotModel);
      }
      
      // ✅ Model loaded, let useLayoutEffect apply materials
      // ✅ IMPROVED: Apply initial joints from robotStateFull (pre-populated in HardwareScanView)
      // This ensures robot displays at correct position immediately, without 500ms delay
      if (robotModel && robotModel.joints) {
        // ✅ Use ref to get initial position (captured once, not reactive)
        const initialJoints = robotStateFullRef.current?.data?.head_joints;
        const hasValidInitialJoints = Array.isArray(initialJoints) && initialJoints.length === 7;
        
        if (hasValidInitialJoints) {
          // ✅ Use ACTUAL robot position from daemon
          
          
          // Apply yaw_body from first joint value
          if (robotModel.joints['yaw_body']) {
            robotModel.setJointValue('yaw_body', initialJoints[0]);
          }
          
          // Apply stewart joints (indices 1-6)
          STEWART_JOINT_NAMES.forEach((jointName, index) => {
            if (robotModel.joints[jointName]) {
              robotModel.setJointValue(jointName, initialJoints[index + 1]);
            }
          });
          
          // Apply antennas if available
          const initialAntennas = robotStateFullRef.current?.data?.antennas;
          if (Array.isArray(initialAntennas) && initialAntennas.length === 2) {
            if (robotModel.joints['left_antenna']) {
              robotModel.setJointValue('left_antenna', -initialAntennas[1]); // Right data (negated) goes to left visual antenna
            }
            if (robotModel.joints['right_antenna']) {
              robotModel.setJointValue('right_antenna', -initialAntennas[0]); // Left data (negated) goes to right visual antenna
            }
          }
        } else {
          // ✅ Fallback: Initialize all joints to zero
          
          
        // Initialize yaw_body to 0
        if (robotModel.joints['yaw_body']) {
          robotModel.setJointValue('yaw_body', 0);
        }
        
        // Initialize all stewart joints to 0
        STEWART_JOINT_NAMES.forEach(jointName => {
          if (robotModel.joints[jointName]) {
            robotModel.setJointValue(jointName, 0);
          }
        });
        }
        
        // Initialize passive joints to 0 (will be computed by WASM later)
        ALL_PASSIVE_JOINT_NAMES.forEach(jointName => {
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
        
        // ✅ If we have initial position, display immediately without delay
        if (hasValidInitialJoints) {
          if (!isMounted) return;
          setRobot(robotModel);
          return; // Skip timeout
        }
      }
      
      // ✅ Fallback: Wait 500ms before displaying robot (only if no initial position)
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
  }, [isActive, forceLoad, onMeshesReady]); // ✅ Load when isActive or forceLoad changes (initial position from ref, not reactive)

  // ✅ Apply antennas on initial load and when they change (even if isActive=false)
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
  }, [robot, antennas]); // Triggers on load AND when antennas change
  
  
  // ✅ Animation loop synchronized with Three.js render (60 FPS)
  // 🚀 GAME-CHANGING: Throttled to 10 Hz to match WebSocket frequency (83% reduction in checks)
  // useFrame is more performant than useEffect for Three.js updates
  useFrame(() => {
    if (!robot) return;
    
    // ✅ Allow animations if robot is loaded (isActive OR forceLoad)
    // If forceLoad is true, we want robot to move even if isActive is temporarily false
    if (!isActive && !forceLoad) return;
    
    // 🚀 GAME-CHANGING: Throttle to 20 Hz (check every 3 frames at 60 FPS)
    // ⚡ Doubled from 10 Hz for smoother robot visualization
    frameCountRef.current++;
    if (frameCountRef.current % 3 !== 0) {
      return; // Skip this frame - only process every 3rd frame (~20 Hz)
    }

    // ⚡ OPTIMIZED: Skip all comparisons if dataVersion hasn't changed
    // WebSocket already compared values before updating state, no need to compare again
    if (dataVersion === lastAppliedVersionRef.current) {
      return; // No new data from WebSocket, skip this frame entirely
    }
    lastAppliedVersionRef.current = dataVersion;

    // STEP 1: Apply head joints (yaw_body + stewart_1 to stewart_6)
    // ✅ Use joints directly like in Rerun code (more precise than pose matrix)
    // Joints respect URDF kinematics
    // ✅ IMPORTANT: URDFLoader automatically updates matrices on setJointValue
    // Do NOT force updateMatrixWorld() to avoid conflicts and flickering
    // ⚡ OPTIMIZED: No need to compare - dataVersion change guarantees new data
    if (headJoints && Array.isArray(headJoints) && headJoints.length === 7) {
        // yaw_body (index 0) - Apply first
        if (robot.joints['yaw_body']) {
          robot.setJointValue('yaw_body', headJoints[0]);
        }
        
      // stewart_1 to stewart_6 (indices 1-6) - Apply directly (no loop overhead)
      if (robot.joints['stewart_1']) robot.setJointValue('stewart_1', headJoints[1]);
      if (robot.joints['stewart_2']) robot.setJointValue('stewart_2', headJoints[2]);
      if (robot.joints['stewart_3']) robot.setJointValue('stewart_3', headJoints[3]);
      if (robot.joints['stewart_4']) robot.setJointValue('stewart_4', headJoints[4]);
      if (robot.joints['stewart_5']) robot.setJointValue('stewart_5', headJoints[5]);
      if (robot.joints['stewart_6']) robot.setJointValue('stewart_6', headJoints[6]);
    } else if (yawBody !== undefined && robot.joints['yaw_body']) {
      // Fallback: use yawBody alone if headJoints is not available
      robot.setJointValue('yaw_body', yawBody);
    }

    // STEP 1.5: Apply passive joints (21 values: passive_1_x/y/z to passive_7_x/y/z)
    // ⚡ OPTIMIZED: No comparison needed - dataVersion guarantees new data
    if (passiveJoints) {
      const passiveArray = Array.isArray(passiveJoints) ? passiveJoints : passiveJoints.array;
      if (passiveArray && passiveArray.length >= 21) {
        // Apply passive joints directly (loop is fine here, 21 iterations is minimal)
        for (let i = 0; i < 21; i++) {
          const jointName = PASSIVE_JOINT_NAMES[i];
          if (robot.joints[jointName]) {
            robot.setJointValue(jointName, passiveArray[i]);
          }
        }
      }
    }

    // STEP 2: Apply antennas
    // ⚡ OPTIMIZED: No comparison needed - dataVersion guarantees new data
    if (antennas && Array.isArray(antennas) && antennas.length >= 2) {
      // Inverted mapping AND inverted values for correct visual representation
      if (robot.joints['left_antenna']) {
        robot.setJointValue('left_antenna', -antennas[1]);
      }
      if (robot.joints['right_antenna']) {
        robot.setJointValue('right_antenna', -antennas[0]);
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
    
    applyRobotMaterials(robot, { 
      transparent: isTransparent, 
      wireframe, 
      xrayOpacity, 
      darkMode 
    });
    
    // Mark as ready after first material application
    if (isInitialSetup) {
      setIsReady(true);
    }
  }, [robot, isTransparent, xrayOpacity, wireframe, darkMode, isReady]);

  // Only render robot when EVERYTHING is ready (loaded + materials applied)
  return robot && isReady ? (
    <group position={[0, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
      <primitive ref={groupRef} object={robot} scale={1} rotation={[-Math.PI / 2, 0, 0]} />
    </group>
  ) : null;
}

// 🚀 GAME-CHANGING: Memoize URDFRobot to prevent unnecessary re-renders
// ⚡ OPTIMIZED: Use dataVersion instead of comparing all arrays individually
const URDFRobotMemo = memo(URDFRobot, (prevProps, nextProps) => {
  // Compare primitive props (visual/state changes that require re-render)
  if (
    prevProps.isActive !== nextProps.isActive ||
    prevProps.isTransparent !== nextProps.isTransparent ||
    prevProps.wireframe !== nextProps.wireframe ||
    prevProps.forceLoad !== nextProps.forceLoad ||
    prevProps.xrayOpacity !== nextProps.xrayOpacity
  ) {
    return false; // Re-render
  }
  
  // Compare cellShading object (shallow)
  if (prevProps.cellShading?.enabled !== nextProps.cellShading?.enabled) {
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

export default URDFRobotMemo;
