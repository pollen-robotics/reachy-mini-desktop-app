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
  passiveJoints, // ✅ Array of 21 values [passive_1_x, passive_1_y, passive_1_z, ..., passive_7_z] (optional, requires full kinematics solver)
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
  
  // ✅ Track visibility state of stewart platform (hidden when passiveJoints not available)
  const lastRodsVisibleRef = useRef(null);
  const stewartRodMeshesRef = useRef([]); // Rods meshes
  const stewartPlatformMeshesRef = useRef([]); // All platform meshes (horns, balls, etc.)
  const headLinkRef = useRef(null); // Reference to xl_330 link (head)
  const bodyLinkRef = useRef(null); // Reference to body_down_3dprint link (body after yaw_body)
  const headLinkParentMatrixRef = useRef(new THREE.Matrix4()); // Parent matrix for head positioning
  
  // ✅ Transformation matrices for coordinate system conversion (daemon Z-up → Three.js Y-up)
  const rotationXRef = useRef(new THREE.Matrix4().makeRotationX(-Math.PI / 2)); // -90° around X
  const rotationYRef = useRef(new THREE.Matrix4().makeRotationY(-Math.PI / 2)); // -90° around Y
  const tempMatrix2 = useRef(new THREE.Matrix4());
  
  // ✅ Head offset above body (from MuJoCo backend: 0.177m)
  const HEAD_HEIGHT_OFFSET = 0.177;
  
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
      const stewartRodMeshes = [];
      const stewartPlatformMeshes = [];
      let headLink = null;
      
      robotModel.traverse((child) => {
        const childName = (child.name || '').toLowerCase();
        const parentName = (child.parent?.name || '').toLowerCase();
        
        // ✅ Find the head link (xl_330)
        if (child.name === 'xl_330') {
          headLink = child;
        }
        
        // ✅ Find the body link (body_down_3dprint - after yaw_body joint)
        if (child.name === 'body_down_3dprint') {
          bodyLinkRef.current = child;
        }
        
        if (child.isMesh) {
          collectedMeshes.push(child);
          
          // ✅ Identify stewart rod meshes (the rods connecting to passive joints)
          if (childName.includes('stewart_link_rod') || parentName.includes('stewart_link_rod')) {
            stewartRodMeshes.push(child);
          }
          
          // ✅ Identify stewart platform meshes (horns, balls, passive links)
          // These are all elements that depend on passive joints for correct positioning
          if (childName.includes('stewart_link_ball') || 
              childName.includes('dc15_a01_horn') ||
              parentName.includes('dc15_a01_horn') ||
              parentName.includes('passive_') ||
              childName.includes('passive_')) {
            stewartPlatformMeshes.push(child);
          }
        }
      });
      
      meshesRef.current = collectedMeshes;
      stewartRodMeshesRef.current = stewartRodMeshes;
      stewartPlatformMeshesRef.current = stewartPlatformMeshes;
      headLinkRef.current = headLink;
      
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

  // ✅ Toggle visibility of stewart platform based on passiveJoints availability
  // When passiveJoints is null, hide rods and platform elements to avoid incorrect positioning
  // Head will be positioned directly via headPose matrix instead
  useEffect(() => {
    if (!robot) return;
    
    const hasPassiveJoints = passiveJoints !== null && passiveJoints !== undefined && 
      (Array.isArray(passiveJoints) ? passiveJoints.length >= 21 : passiveJoints?.array?.length >= 21);
    
    // Only update if visibility state changed
    if (lastRodsVisibleRef.current !== hasPassiveJoints) {
      // Hide/show stewart rods
      stewartRodMeshesRef.current.forEach(mesh => {
        mesh.visible = hasPassiveJoints;
      });
      
      // Hide/show stewart platform elements (horns, balls)
      stewartPlatformMeshesRef.current.forEach(mesh => {
        mesh.visible = hasPassiveJoints;
      });
      
      lastRodsVisibleRef.current = hasPassiveJoints;
      
      if (!hasPassiveJoints) {
        logInfo('🔧 Stewart platform hidden (using direct head pose)');
      }
    }
  }, [robot, passiveJoints]);

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

    // ✅ Check if we have passive joints (full kinematics mode)
    const hasPassiveJoints = passiveJoints !== null && passiveJoints !== undefined && 
      (Array.isArray(passiveJoints) ? passiveJoints.length >= 21 : passiveJoints?.array?.length >= 21);

    // =====================================================
    // MODE 1: Full kinematics (with passive joints)
    // Apply all joints normally via URDF kinematics
    // =====================================================
    if (hasPassiveJoints) {
      // ✅ Re-enable matrixAutoUpdate if we were in simplified mode before
      if (headLinkRef.current && !headLinkRef.current.matrixAutoUpdate) {
        headLinkRef.current.matrixAutoUpdate = true;
      }
      
      // STEP 1: Apply head joints (yaw_body + stewart_1 to stewart_6)
      if (headJoints && Array.isArray(headJoints) && headJoints.length === 7) {
        const headJointsChanged = !arraysEqual(headJoints, lastHeadJointsRef.current);
        
        if (headJointsChanged) {
          // yaw_body (index 0)
          if (robot.joints['yaw_body']) {
            robot.setJointValue('yaw_body', headJoints[0]);
          }
          
          // stewart_1 to stewart_6 (indices 1-6)
          const stewartJointNames = ['stewart_1', 'stewart_2', 'stewart_3', 'stewart_4', 'stewart_5', 'stewart_6'];
          for (let i = 0; i < 6; i++) {
            const jointName = stewartJointNames[i];
            if (robot.joints[jointName]) {
              robot.setJointValue(jointName, headJoints[i + 1]);
            }
          }
          
          lastHeadJointsRef.current = headJoints;
        }
      }

      // STEP 1.5: Apply passive joints (21 values)
      const passiveArray = Array.isArray(passiveJoints) ? passiveJoints : passiveJoints.array;
      const passiveJointsChanged = !arraysEqual(passiveArray, lastPassiveJointsRef.current);
    
      if (passiveJointsChanged && passiveArray.length >= 21) {
        const passiveJointNames = [
          'passive_1_x', 'passive_1_y', 'passive_1_z',
          'passive_2_x', 'passive_2_y', 'passive_2_z',
          'passive_3_x', 'passive_3_y', 'passive_3_z',
          'passive_4_x', 'passive_4_y', 'passive_4_z',
          'passive_5_x', 'passive_5_y', 'passive_5_z',
          'passive_6_x', 'passive_6_y', 'passive_6_z',
          'passive_7_x', 'passive_7_y', 'passive_7_z',
        ];
        
        for (let i = 0; i < Math.min(passiveArray.length, passiveJointNames.length); i++) {
          const jointName = passiveJointNames[i];
          if (robot.joints[jointName]) {
            robot.setJointValue(jointName, passiveArray[i]);
          }
        }
        
        lastPassiveJointsRef.current = passiveArray;
      }
    }
    // =====================================================
    // MODE 2: Simplified mode (no passive joints)
    // Apply only yaw_body + position head directly via headPose
    // Stewart platform is hidden
    // =====================================================
    else {
      // STEP 1: Apply only yaw_body (body rotation)
      if (headJoints && Array.isArray(headJoints) && headJoints.length >= 1) {
        const yawChanged = !lastHeadJointsRef.current || 
          Math.abs(headJoints[0] - (lastHeadJointsRef.current[0] || 0)) > 0.005;
        
        if (yawChanged && robot.joints['yaw_body']) {
          robot.setJointValue('yaw_body', headJoints[0]);
          lastHeadJointsRef.current = headJoints;
        }
      } else if (yawBody !== undefined && robot.joints['yaw_body']) {
        const yawChanged = Math.abs(yawBody - (lastYawBodyRef.current || 0)) > 0.005;
        if (yawChanged) {
          robot.setJointValue('yaw_body', yawBody);
          lastYawBodyRef.current = yawBody;
        }
      }

      // STEP 2: Position head relative to BODY (not to broken URDF chain)
      // Without passive joints, the stewart platform chain is broken
      // So we position the head directly above the body using headPose orientation
      if (headPose && headPose.length === 16 && headLinkRef.current && bodyLinkRef.current) {
        const headPoseChanged = !arraysEqual(headPose, lastHeadPoseRef.current);
        
        if (headPoseChanged) {
          const headLink = headLinkRef.current;
          const bodyLink = bodyLinkRef.current;
          
          // Get body's world position (after yaw_body rotation)
          bodyLink.updateWorldMatrix(true, false);
          const bodyWorldPos = new THREE.Vector3();
          bodyLink.getWorldPosition(bodyWorldPos);
          
          // Convert headPose array to Three.js Matrix4
          // ⚠️ headPose from daemon is in ROW-MAJOR order (numpy flatten)
          tempMatrix.current.fromArray(headPose);
          tempMatrix.current.transpose(); // Convert row-major to column-major
          
          // Extract rotation from headPose
          tempQuaternion.current.setFromRotationMatrix(tempMatrix.current);
          
          // The rotation is in daemon frame (Z-up, looking forward)
          // We need to transform it to match the robot's orientation in the scene
          // The robot primitive has rotation [-π/2, 0, 0] and group has [0, -π/2, 0]
          
          // Position head above body (in world coordinates)
          // Head should be HEAD_HEIGHT_OFFSET above body in the Z-up daemon frame
          // Which is Y-up in Three.js after the scene rotations
          const headWorldPos = new THREE.Vector3(
            bodyWorldPos.x,
            bodyWorldPos.y + HEAD_HEIGHT_OFFSET, // Above body in Y (Three.js up)
            bodyWorldPos.z
          );
          
          // Set head world position by computing local position from parent
          if (headLink.parent) {
            headLink.parent.updateWorldMatrix(true, false);
            const parentInverse = new THREE.Matrix4().copy(headLink.parent.matrixWorld).invert();
            const localPos = headWorldPos.clone().applyMatrix4(parentInverse);
            headLink.position.copy(localPos);
          } else {
            headLink.position.copy(headWorldPos);
          }
          
          // Apply head orientation (keep original for now, the URDF default orientation)
          // The headPose rotation is small (head is nearly upright) so we can skip complex transforms
          
          headLink.updateMatrixWorld(true);
          lastHeadPoseRef.current = headPose;
        }
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
