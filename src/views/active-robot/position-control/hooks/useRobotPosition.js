import { useState, useEffect, useCallback, useRef } from 'react';
import { buildApiUrl, fetchWithTimeout, DAEMON_CONFIG } from '../../../../config/daemon';
import useAppStore from '../../../../store/useAppStore';
import { formatPoseForLog, hasSignificantChange } from '../utils';
import { getInputManager } from '../../../../utils/InputManager';
import { 
  ROBOT_POSITION_RANGES, 
  INPUT_SENSITIVITY, 
  INPUT_THRESHOLDS,
  TIMING,
  EXTENDED_ROBOT_RANGES,
} from '../../../../utils/inputConstants';
import {
  hasActiveInput,
  isHeadPoseZero,
  areAntennasZero,
  clamp,
  createZeroHeadPose,
  createZeroAntennas,
} from '../../../../utils/inputHelpers';
import {
  smoothInputs,
  getDeltaTime,
} from '../../../../utils/inputSmoothing';
import { TargetSmoothingManager } from '../../../../utils/targetSmoothing';

/**
 * Hook to manage robot position control logic
 * Handles state synchronization, API calls, continuous updates, and logging
 */
export function useRobotPosition(isActive) {
  const { robotStateFull, addFrontendLog } = useAppStore();
  
  const [robotState, setRobotState] = useState({
    headPose: { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0 },
    bodyYaw: 0,
    antennas: [0, 0],
  });

  const [localValues, setLocalValues] = useState({
    headPose: { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0 },
    bodyYaw: 0,
    antennas: [0, 0], // [left, right] in radians
  });
  
  // Initialize antennasRef with initial state
  useEffect(() => {
    if (localValues.antennas && localValues.antennas.length === 2) {
      antennasRef.current = localValues.antennas;
    }
  }, []);

  // Removed interpolation - only using set_target (no interpolation needed)
  const [isDragging, setIsDragging] = useState(false);
  const rafRef = useRef(null);
  const pendingPoseRef = useRef(null);
  const lastSentPoseRef = useRef(null);
  const isDraggingRef = useRef(false);
  const lastDragEndTimeRef = useRef(0);
  const lastLoggedPoseRef = useRef(null);
  const dragStartPoseRef = useRef(null);
  const lastLogTimeRef = useRef(0);
  const antennasRef = useRef([0, 0]); // Track antennas during drag for smooth continuous updates
  const isUsingGamepadKeyboardRef = useRef(false); // Track if we're actively using gamepad/keyboard
  const lastGamepadKeyboardReleaseRef = useRef(0); // Track when gamepad/keyboard was last released
  
  // Smoothing state for inputs (middleware layer for fluid movement)
  const smoothedInputsRef = useRef({
    moveForward: 0,
    moveRight: 0,
    moveUp: 0,
    lookHorizontal: 0,
    lookVertical: 0,
    roll: 0,
    bodyYaw: 0,
    antennaLeft: 0,
    antennaRight: 0,
  });
  const lastFrameTimeRef = useRef(performance.now());
  
  // Unified target smoothing manager - applies smoothing to ALL input sources (mouse, gamepad, keyboard)
  const targetSmoothingRef = useRef(new TargetSmoothingManager());
  const smoothingRafRef = useRef(null);

  // Start continuous smoothing loop (runs every frame)
  // This applies smoothing to ALL input sources (mouse, gamepad, keyboard)
  useEffect(() => {
    if (!isActive) return;

    const smoothingLoop = () => {
      // Update smoothed values towards targets
      const smoothedValues = targetSmoothingRef.current.update();
      
      // Send smoothed values to robot if we're in dragging mode
      if (isDraggingRef.current) {
        // Clamp to actual robot limits before sending
        const apiClampedHeadPose = {
          x: clamp(smoothedValues.headPose.x, ROBOT_POSITION_RANGES.POSITION.min, ROBOT_POSITION_RANGES.POSITION.max),
          y: clamp(smoothedValues.headPose.y, ROBOT_POSITION_RANGES.POSITION.min, ROBOT_POSITION_RANGES.POSITION.max),
          z: clamp(smoothedValues.headPose.z, ROBOT_POSITION_RANGES.POSITION.min, ROBOT_POSITION_RANGES.POSITION.max),
          pitch: clamp(smoothedValues.headPose.pitch, ROBOT_POSITION_RANGES.PITCH.min, ROBOT_POSITION_RANGES.PITCH.max),
          yaw: clamp(smoothedValues.headPose.yaw, ROBOT_POSITION_RANGES.YAW.min, ROBOT_POSITION_RANGES.YAW.max),
          roll: clamp(smoothedValues.headPose.roll, ROBOT_POSITION_RANGES.ROLL.min, ROBOT_POSITION_RANGES.ROLL.max),
        };
        
        sendCommandRef.current(
          apiClampedHeadPose,
          smoothedValues.antennas,
          smoothedValues.bodyYaw
        );
      }
      
      // Update local values for display (smoothed values, can use extended ranges for UI)
      setLocalValues(prev => ({
        ...prev,
        headPose: {
          x: clamp(smoothedValues.headPose.x, EXTENDED_ROBOT_RANGES.POSITION.min, EXTENDED_ROBOT_RANGES.POSITION.max),
          y: clamp(smoothedValues.headPose.y, EXTENDED_ROBOT_RANGES.POSITION.min, EXTENDED_ROBOT_RANGES.POSITION.max),
          z: clamp(smoothedValues.headPose.z, ROBOT_POSITION_RANGES.POSITION.min, ROBOT_POSITION_RANGES.POSITION.max),
          pitch: clamp(smoothedValues.headPose.pitch, EXTENDED_ROBOT_RANGES.PITCH.min, EXTENDED_ROBOT_RANGES.PITCH.max),
          yaw: clamp(smoothedValues.headPose.yaw, EXTENDED_ROBOT_RANGES.YAW.min, EXTENDED_ROBOT_RANGES.YAW.max),
          roll: clamp(smoothedValues.headPose.roll, ROBOT_POSITION_RANGES.ROLL.min, ROBOT_POSITION_RANGES.ROLL.max),
        },
        bodyYaw: smoothedValues.bodyYaw,
        antennas: smoothedValues.antennas,
      }));
      
      smoothingRafRef.current = requestAnimationFrame(smoothingLoop);
    };

    smoothingRafRef.current = requestAnimationFrame(smoothingLoop);

    return () => {
      if (smoothingRafRef.current) {
        cancelAnimationFrame(smoothingRafRef.current);
        smoothingRafRef.current = null;
      }
    };
  }, [isActive]);

  // ✅ Update robotState from centralized data (NO POLLING)
  useEffect(() => {
    if (!isActive || !robotStateFull.data) return;

    const data = robotStateFull.data;
    const timeSinceDragEnd = Date.now() - lastDragEndTimeRef.current;
    
    if (data.head_pose) {
      const newState = {
        headPose: {
          x: data.head_pose.x || 0,
          y: data.head_pose.y || 0,
          z: data.head_pose.z || 0,
          pitch: data.head_pose.pitch || 0,
          yaw: data.head_pose.yaw || 0,
          roll: data.head_pose.roll || 0,
        },
        bodyYaw: typeof data.body_yaw === 'number' ? data.body_yaw : 0,
        antennas: data.antennas_position || [0, 0],
      };
      
      setRobotState(newState);
      
      // ✅ Only update localValues if user is not dragging AND not using gamepad/keyboard
      // Also wait a bit after gamepad/keyboard release to allow robot to return to zero
      const timeSinceGamepadRelease = Date.now() - lastGamepadKeyboardReleaseRef.current;
      const canSyncFromRobot = 
        !isDraggingRef.current && 
        !isUsingGamepadKeyboardRef.current && 
        timeSinceDragEnd >= TIMING.DRAG_END_SYNC_DELAY &&
        timeSinceGamepadRelease >= TIMING.GAMEPAD_RELEASE_SYNC_DELAY;
      
      if (canSyncFromRobot) {
        // Only update if values changed significantly (tolerance to avoid micro-adjustments)
        // Increased tolerance to prevent "magnet" effect - only sync if there's a real significant change
        const tolerance = INPUT_THRESHOLDS.SYNC_TOLERANCE * 10; // 10x tolerance to prevent unwanted snapping
        const headPoseChanged = 
          Math.abs(newState.headPose.x - localValues.headPose.x) > tolerance ||
          Math.abs(newState.headPose.y - localValues.headPose.y) > tolerance ||
          Math.abs(newState.headPose.z - localValues.headPose.z) > tolerance ||
          Math.abs(newState.headPose.pitch - localValues.headPose.pitch) > tolerance ||
          Math.abs(newState.headPose.yaw - localValues.headPose.yaw) > tolerance ||
          Math.abs(newState.headPose.roll - localValues.headPose.roll) > tolerance;
        const bodyYawChanged = Math.abs(newState.bodyYaw - localValues.bodyYaw) > tolerance;
        
        const antennasChanged = 
          !localValues.antennas ||
          Math.abs(newState.antennas[0] - (localValues.antennas[0] || 0)) > tolerance ||
          Math.abs(newState.antennas[1] - (localValues.antennas[1] || 0)) > tolerance;
        
        // Only sync if change is significant enough to avoid "magnet" effect
        // Use smoothing manager to sync smoothly instead of direct assignment (prevents snap)
        if (headPoseChanged || bodyYawChanged || antennasChanged) {
          antennasRef.current = newState.antennas;
          // Sync smoothing manager smoothly instead of directly setting localValues
          // This prevents sudden snaps when robot state changes
          targetSmoothingRef.current.sync({
            headPose: newState.headPose,
            bodyYaw: newState.bodyYaw,
            antennas: newState.antennas,
          });
          // Update localValues to reflect the sync (but smoothing will handle the transition)
          setLocalValues({
            headPose: newState.headPose,
            bodyYaw: newState.bodyYaw,
            antennas: newState.antennas,
          });
        }
      }
    }
  }, [isActive, robotStateFull]);

  // Stop continuous updates
  const stopContinuousUpdates = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    pendingPoseRef.current = null;
  }, []);

  // Continuous update loop
  const startContinuousUpdates = useCallback(() => {
    if (rafRef.current) return;
    
    const updateLoop = () => {
      if (pendingPoseRef.current && isDraggingRef.current) {
        const { headPose, antennas, bodyYaw } = pendingPoseRef.current;
        // Include antennas in poseKey to detect changes properly
        const poseKey = JSON.stringify({ headPose, antennas, bodyYaw });
        
        if (lastSentPoseRef.current !== poseKey) {
          const validBodyYaw = typeof bodyYaw === 'number' ? bodyYaw : 0;
          
          // ✅ If only body_yaw is changing, send body_yaw with current values for others
          // The API needs the current state to properly calculate body yaw movement
          if (headPose === null && antennas === null) {
            // Send current values so API can preserve them and calculate body yaw correctly
            const requestBody = {
              target_body_yaw: validBodyYaw,
              target_head_pose: robotState.headPose, // Send current head pose
              target_antennas: robotState.antennas || [0, 0], // Send current antennas
            };
            fetchWithTimeout(
              buildApiUrl('/api/move/set_target'),
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
              },
              DAEMON_CONFIG.MOVEMENT.CONTINUOUS_MOVE_TIMEOUT,
              { label: 'Continuous move (body_yaw)', silent: true }
            ).catch((error) => {
              console.error('❌ set_target (body_yaw only) error:', error);
            });
          } else {
            // Normal case: send everything
            const requestBody = {
              target_head_pose: headPose,
              target_antennas: antennas,
              target_body_yaw: validBodyYaw,
            };
            fetchWithTimeout(
              buildApiUrl('/api/move/set_target'),
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
              },
              DAEMON_CONFIG.MOVEMENT.CONTINUOUS_MOVE_TIMEOUT,
              { label: 'Continuous move', silent: true }
            ).catch((error) => {
              console.error('❌ set_target error:', error);
            });
          }
          
          lastSentPoseRef.current = poseKey;
        }
        // Keep pendingPoseRef.current during drag - it will be updated by sendCommand calls
        // Only clear it when drag ends (handled by stopContinuousUpdates)
      }
      
      // Continue loop if still dragging
      if (isDraggingRef.current) {
        rafRef.current = requestAnimationFrame(updateLoop);
      } else {
        rafRef.current = null;
        stopContinuousUpdates();
      }
    };
    
    rafRef.current = requestAnimationFrame(updateLoop);
  }, [robotState, stopContinuousUpdates]);

  useEffect(() => {
    if (!isDragging) {
      stopContinuousUpdates();
    }
    return () => stopContinuousUpdates();
  }, [isDragging, stopContinuousUpdates]);

  // Ref to store current values without creating circular dependencies
  const localValuesRef = useRef(localValues);
  useEffect(() => {
    localValuesRef.current = localValues;
  }, [localValues]);

  // Send command using set_target (always continuous mode)
  const sendCommand = useCallback((headPose, antennas, bodyYaw) => {
    if (!isActive) return;
    const validBodyYaw = typeof bodyYaw === 'number' ? bodyYaw : (robotState.bodyYaw || 0);

    // Always use set_target (continuous mode)
    pendingPoseRef.current = { headPose, antennas, bodyYaw: validBodyYaw };
    if (!rafRef.current) {
      startContinuousUpdates();
    }
  }, [isActive, startContinuousUpdates, robotState.bodyYaw]);

  // Ref to store sendCommand to avoid dependency issues
  const sendCommandRef = useRef(sendCommand);
  useEffect(() => {
    sendCommandRef.current = sendCommand;
  }, [sendCommand]);

  // Function to process inputs and update robot
  // Defined outside useEffect to comply with Rules of Hooks
  const processInputs = useCallback((rawInputs) => {
      // Calculate delta time for frame-rate independent smoothing
      const { deltaTime, currentTime } = getDeltaTime(lastFrameTimeRef.current);
      lastFrameTimeRef.current = currentTime;
      
      // Apply exponential smoothing to inputs for fluid movement
      // This creates smooth interpolation between input changes
      smoothedInputsRef.current = smoothInputs(
        smoothedInputsRef.current,
        rawInputs,
        {
          // Different smoothing factors for different inputs
          moveForward: 0.2,      // Position: more responsive
          moveRight: 0.2,
          moveUp: 0.25,          // Z position: slightly smoother
          lookHorizontal: 0.15,  // Camera: very responsive
          lookVertical: 0.15,
          roll: 0.2,
          bodyYaw: 0.3,         // Body yaw: smoother for precision
          antennaLeft: 0.2,
          antennaRight: 0.2,
        }
      );
      
      // Use smoothed inputs for processing
      const inputs = smoothedInputsRef.current;
      
      // Get current values from ref first (needed for both input and no-input cases)
      const currentValues = localValuesRef.current;
      const currentHeadPose = currentValues.headPose;
      const currentBodyYaw = currentValues.bodyYaw;
      const currentAntennas = currentValues.antennas || [0, 0];

      // Check if an input is active (above threshold)
      const hasInput = hasActiveInput(inputs, INPUT_THRESHOLDS.ACTIVE_INPUT);

      // Debug logging removed to avoid spam

      // If no input, stop dragging but DON'T force reset to zero
      // This prevents "magnet" effect at center (0,0)
      if (!hasInput) {
        // Mark that we're no longer using gamepad/keyboard
        isUsingGamepadKeyboardRef.current = false;
        lastGamepadKeyboardReleaseRef.current = Date.now();
        
        // Stop dragging - let values stay where they are (no forced reset)
        if (isDraggingRef.current) {
          setIsDragging(false);
          isDraggingRef.current = false;
          lastDragEndTimeRef.current = Date.now();
        }
        
        return;
      }

      // Mark that we're using gamepad/keyboard
      isUsingGamepadKeyboardRef.current = true;

      // Check if we are dragging with mouse
      // If a mouse drag ended recently, ignore gamepad inputs to avoid immediate conflicts
      const timeSinceDragEnd = Date.now() - lastDragEndTimeRef.current;
      const isRecentMouseDrag = timeSinceDragEnd < TIMING.MOUSE_DRAG_COOLDOWN;
      
      // If we are dragging AND it's recent, it's probably a mouse drag
      // In this case, ignore gamepad inputs to avoid conflicts
      if (isDraggingRef.current && isRecentMouseDrag) {
        return;
      }
      
      // Otherwise, we can process gamepad/keyboard inputs normally

      // Use direct mapping approach with extended range support
      // Joysticks now have 3x the range to allow finer control
      // Left stick (moveRight, moveForward) → Position XY
      // Note: in RobotPositionControl, x and y are inverted (valueX={localValues.headPose.y}, valueY={localValues.headPose.x})
      // Use full range: joystick max maps to extended range with sensitivity
      const POSITION_SENSITIVITY_FACTOR = 1.0; // Use full range now that joystick range is extended
      const ROTATION_SENSITIVITY_FACTOR = 1.0; // Use full range now that joystick range is extended
      const BODY_YAW_SENSITIVITY_FACTOR = 0.3; // Reduce body yaw sensitivity to 30%
      
      // Map joystick values (-1 to 1) to extended position ranges
      const newX = inputs.moveRight * EXTENDED_ROBOT_RANGES.POSITION.max * POSITION_SENSITIVITY_FACTOR;
      const newY = inputs.moveForward * EXTENDED_ROBOT_RANGES.POSITION.max * POSITION_SENSITIVITY_FACTOR;
      
      // Z position - progressive increment (same logic as body yaw)
      // inputs.moveUp is a progressive value: 0.2 on first press, then increases linearly to 1.0
      // Use same approach as body yaw: multiply by range and sensitivity
      const zIncrement = inputs.moveUp * ROBOT_POSITION_RANGES.POSITION.max * POSITION_SENSITIVITY_FACTOR;
      const newZ = currentHeadPose.z + zIncrement;

      // Right stick (lookHorizontal, lookVertical) → Pitch/Yaw (head rotation)
      // Map joystick values to extended rotation ranges
      // Pitch: stick up = pitch positive (look up), stick down = pitch negative (look down)
      // lookVertical is already inverted in InputManager (up = +1), so use directly
      const newPitch = inputs.lookVertical * EXTENDED_ROBOT_RANGES.PITCH.max * ROTATION_SENSITIVITY_FACTOR;
      // Yaw: stick right = yaw positive (turn right), stick left = yaw negative (turn left)
      // Inverted to match intuition (right stick right = head turns right)
      const newYaw = -inputs.lookHorizontal * EXTENDED_ROBOT_RANGES.YAW.max * ROTATION_SENSITIVITY_FACTOR;
      const newRoll = inputs.roll * ROBOT_POSITION_RANGES.ROLL.max * ROTATION_SENSITIVITY_FACTOR;

      // Body yaw - progressive increment (inputs.bodyYaw is already progressive from InputManager)
      // Increment current body yaw instead of direct mapping
      // Body yaw range: -160° to 160° (same as antennas)
      const BODY_YAW_RANGE = { min: -160 * Math.PI / 180, max: 160 * Math.PI / 180 };
      const bodyYawRange = BODY_YAW_RANGE.max - BODY_YAW_RANGE.min;
      const bodyYawIncrement = inputs.bodyYaw * bodyYawRange * BODY_YAW_SENSITIVITY_FACTOR;
      const newBodyYaw = currentBodyYaw + bodyYawIncrement;
      const clampedBodyYaw = clamp(newBodyYaw, BODY_YAW_RANGE.min, BODY_YAW_RANGE.max);

      // Antennas control (triggers) - direct mapping to full range
      // Map trigger values (0 to 1) to antenna position (-160° to 160°)
      // Left trigger → Left antenna, Right trigger → Right antenna
      // More pressure = more rotation
      // Full range mapping: 0 (not pressed) = min (-160°), 1 (fully pressed) = max (+160°)
      // Input values are now guaranteed to be 0-1 from InputManager.combineInputs()
      const antennaRange = ROBOT_POSITION_RANGES.ANTENNA.max - ROBOT_POSITION_RANGES.ANTENNA.min;
      // Direct mapping: 0 → min, 1 → max
      const newAntennaLeft = ROBOT_POSITION_RANGES.ANTENNA.min + (inputs.antennaLeft * antennaRange);
      const newAntennaRight = ROBOT_POSITION_RANGES.ANTENNA.min + (inputs.antennaRight * antennaRange);
      
      // Clamp antennas to valid range (-160° to 160°)
      const clampedAntennaLeft = clamp(newAntennaLeft, ROBOT_POSITION_RANGES.ANTENNA.min, ROBOT_POSITION_RANGES.ANTENNA.max);
      const clampedAntennaRight = clamp(newAntennaRight, ROBOT_POSITION_RANGES.ANTENNA.min, ROBOT_POSITION_RANGES.ANTENNA.max);
      const newAntennas = [clampedAntennaLeft, clampedAntennaRight];

      // Limit values within allowed ranges (safety)
      // Only clamp to extended ranges for joystick display - API will handle final clamping
      // This avoids double clamping which can create "anchor" points at limits
      const clampedX = clamp(newX, EXTENDED_ROBOT_RANGES.POSITION.min, EXTENDED_ROBOT_RANGES.POSITION.max);
      const clampedY = clamp(newY, EXTENDED_ROBOT_RANGES.POSITION.min, EXTENDED_ROBOT_RANGES.POSITION.max);
      const clampedZ = clamp(newZ, ROBOT_POSITION_RANGES.POSITION.min, ROBOT_POSITION_RANGES.POSITION.max);
      const clampedPitch = clamp(newPitch, EXTENDED_ROBOT_RANGES.PITCH.min, EXTENDED_ROBOT_RANGES.PITCH.max);
      const clampedYaw = clamp(newYaw, EXTENDED_ROBOT_RANGES.YAW.min, EXTENDED_ROBOT_RANGES.YAW.max);
      const clampedRoll = clamp(newRoll, ROBOT_POSITION_RANGES.ROLL.min, ROBOT_POSITION_RANGES.ROLL.max);

      // Create new head pose
      // Use extended range values directly - API will clamp to physical limits
      // This prevents double clamping which creates "snap" effects at boundaries
      const apiClampedX = clampedX;
      const apiClampedY = clampedY;
      const apiClampedPitch = clampedPitch;
      const apiClampedYaw = clampedYaw;
      
      const targetHeadPose = {
        x: apiClampedX,
        y: apiClampedY,
        z: clampedZ,
        pitch: apiClampedPitch,
        yaw: apiClampedYaw,
        roll: clampedRoll,
      };

      // Set targets in smoothing manager (smoothing will be applied automatically)
      targetSmoothingRef.current.setTargets({
        headPose: targetHeadPose,
        antennas: newAntennas,
        bodyYaw: clampedBodyYaw,
      });

      // Update antennas ref for smooth continuous updates
      antennasRef.current = newAntennas;

      // Mark as dragging - smoothing loop will send smoothed values
      setIsDragging(true);
      isDraggingRef.current = true;
  }, [localValuesRef, sendCommandRef, isDraggingRef, lastDragEndTimeRef, isUsingGamepadKeyboardRef, lastGamepadKeyboardReleaseRef, lastFrameTimeRef, targetSmoothingRef]);

  // Keyboard/gamepad input integration to control robot
  useEffect(() => {
    if (!isActive) return;

    const inputManager = getInputManager();

    // Subscribe to input updates
    const unsubscribe = inputManager.addListener(processInputs);

    return () => {
      unsubscribe();
    };
  }, [isActive, processInputs]);

  // Handle drag end with logging
  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    isDraggingRef.current = false;
    lastDragEndTimeRef.current = Date.now();
    
    // ✅ Log drag end with final pose (if significant change)
    const finalPose = {
      headPose: localValues.headPose,
      bodyYaw: localValues.bodyYaw,
    };
    
    if (dragStartPoseRef.current && hasSignificantChange(dragStartPoseRef.current, finalPose)) {
      const now = Date.now();
      if (now - lastLogTimeRef.current > 500) {
        const formatted = formatPoseForLog(finalPose.headPose, finalPose.bodyYaw);
        addFrontendLog(`→ Position: ${formatted}`);
        lastLoggedPoseRef.current = finalPose;
        lastLogTimeRef.current = now;
      }
    }
    
    dragStartPoseRef.current = null;
    // No need to send goto anymore - just stop continuous updates
  }, [localValues, addFrontendLog]);

  // Handle head pose changes (always continuous with set_target)
  // Now uses unified target smoothing system
  const handleChange = useCallback((updates, continuous = false) => {
    const newHeadPose = { ...localValues.headPose, ...updates };
    
    // Clamp to extended ranges (for joystick display)
    const clampedHeadPose = {
      x: clamp(newHeadPose.x, EXTENDED_ROBOT_RANGES.POSITION.min, EXTENDED_ROBOT_RANGES.POSITION.max),
      y: clamp(newHeadPose.y, EXTENDED_ROBOT_RANGES.POSITION.min, EXTENDED_ROBOT_RANGES.POSITION.max),
      z: clamp(newHeadPose.z, ROBOT_POSITION_RANGES.POSITION.min, ROBOT_POSITION_RANGES.POSITION.max),
      pitch: clamp(newHeadPose.pitch, EXTENDED_ROBOT_RANGES.PITCH.min, EXTENDED_ROBOT_RANGES.PITCH.max),
      yaw: clamp(newHeadPose.yaw, EXTENDED_ROBOT_RANGES.YAW.min, EXTENDED_ROBOT_RANGES.YAW.max),
      roll: clamp(newHeadPose.roll, ROBOT_POSITION_RANGES.ROLL.min, ROBOT_POSITION_RANGES.ROLL.max),
    };

    if (continuous) {
      // ✅ Log drag start (only once)
      if (!isDraggingRef.current && !dragStartPoseRef.current) {
        dragStartPoseRef.current = {
          headPose: { ...localValues.headPose },
          bodyYaw: localValues.bodyYaw,
        };
        addFrontendLog(`▶️ Moving head...`);
      }
      
      // Set targets in smoothing manager (smoothing will be applied automatically)
      const antennas = robotState.antennas || [0, 0];
      targetSmoothingRef.current.setTargets({
        headPose: clampedHeadPose,
        antennas: antennas,
        bodyYaw: localValues.bodyYaw,
      });
      
      // Mark as dragging - smoothing loop will send smoothed values
      setIsDragging(true);
      isDraggingRef.current = true;
    } else {
      // For non-continuous (onChangeCommitted), set target and let smoothing finish
      const antennas = robotState.antennas || [0, 0];
      targetSmoothingRef.current.setTargets({
        headPose: clampedHeadPose,
        antennas: antennas,
        bodyYaw: localValues.bodyYaw,
      });
      
      // Wait for smoothing, then send final value
      const newPose = {
        headPose: clampedHeadPose,
        bodyYaw: localValues.bodyYaw,
      };
      
      const now = Date.now();
      if (hasSignificantChange(lastLoggedPoseRef.current, newPose) && now - lastLogTimeRef.current > 500) {
        const formatted = formatPoseForLog(newPose.headPose, newPose.bodyYaw);
        addFrontendLog(`→ Position: ${formatted}`);
        lastLoggedPoseRef.current = newPose;
        lastLogTimeRef.current = now;
      }
      
      // Send via set_target after smoothing (use smoothed values)
      setTimeout(() => {
        const smoothed = targetSmoothingRef.current.getCurrentValues();
        const apiClampedHeadPose = {
          x: clamp(smoothed.headPose.x, ROBOT_POSITION_RANGES.POSITION.min, ROBOT_POSITION_RANGES.POSITION.max),
          y: clamp(smoothed.headPose.y, ROBOT_POSITION_RANGES.POSITION.min, ROBOT_POSITION_RANGES.POSITION.max),
          z: clamp(smoothed.headPose.z, ROBOT_POSITION_RANGES.POSITION.min, ROBOT_POSITION_RANGES.POSITION.max),
          pitch: clamp(smoothed.headPose.pitch, ROBOT_POSITION_RANGES.PITCH.min, ROBOT_POSITION_RANGES.PITCH.max),
          yaw: clamp(smoothed.headPose.yaw, ROBOT_POSITION_RANGES.YAW.min, ROBOT_POSITION_RANGES.YAW.max),
          roll: clamp(smoothed.headPose.roll, ROBOT_POSITION_RANGES.ROLL.min, ROBOT_POSITION_RANGES.ROLL.max),
        };
        
        const requestBody = {
          target_head_pose: apiClampedHeadPose,
          target_antennas: smoothed.antennas,
          target_body_yaw: smoothed.bodyYaw,
        };
        
        fetchWithTimeout(
          buildApiUrl('/api/move/set_target'),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
          },
          DAEMON_CONFIG.MOVEMENT.CONTINUOUS_MOVE_TIMEOUT,
          { label: 'Set target', silent: true }
        ).catch((error) => {
          console.error('❌ set_target error:', error);
        });
      }, 50); // Small delay to allow smoothing to apply
    }
  }, [localValues, robotState.antennas, addFrontendLog]);

  // Handle body yaw changes (always using set_target)
  // Now uses unified target smoothing system
  const handleBodyYawChange = useCallback((value, continuous = false) => {
    const validValue = typeof value === 'number' && !isNaN(value) ? value : 0;
    const BODY_YAW_RANGE = { min: -160 * Math.PI / 180, max: 160 * Math.PI / 180 };
    const clampedValue = clamp(validValue, BODY_YAW_RANGE.min, BODY_YAW_RANGE.max);
    
    if (continuous) {
      // ✅ Log body yaw drag start (only once)
      if (!isDraggingRef.current) {
        addFrontendLog(`▶️ Rotating body...`);
      }
      
      // Set target in smoothing manager
      targetSmoothingRef.current.setTargets({
        bodyYaw: clampedValue,
      });
      
      // Mark as dragging - smoothing loop will send smoothed values
      setIsDragging(true);
      isDraggingRef.current = true;
    } else {
      // For non-continuous (onChangeCommitted), set target and let smoothing finish
      targetSmoothingRef.current.setTargets({
        bodyYaw: clampedValue,
      });
      
      const now = Date.now();
      const bodyYawDeg = (clampedValue * 180 / Math.PI).toFixed(1);
      if (now - lastLogTimeRef.current > 500) {
        addFrontendLog(`→ Body Yaw: ${bodyYawDeg}°`);
        lastLogTimeRef.current = now;
        lastLoggedPoseRef.current = {
          headPose: localValues.headPose,
          bodyYaw: clampedValue,
        };
      }
      
      setIsDragging(false);
      isDraggingRef.current = false;
      lastDragEndTimeRef.current = Date.now();
      
      // Wait for smoothing, then send final value
      setTimeout(() => {
        if (!isActive) return;
        
        const smoothed = targetSmoothingRef.current.getCurrentValues();
        const requestBody = {
          target_body_yaw: smoothed.bodyYaw,
          target_head_pose: robotState.headPose, // Send current head pose
          target_antennas: robotState.antennas || [0, 0], // Send current antennas
        };

        fetchWithTimeout(
          buildApiUrl('/api/move/set_target'),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
          },
          DAEMON_CONFIG.MOVEMENT.CONTINUOUS_MOVE_TIMEOUT,
          { label: 'Set target (body_yaw)', silent: true }
        ).catch((error) => {
          console.error('❌ set_target (body_yaw) error:', error);
        });
      }, 50); // Small delay to allow smoothing to apply
    }
  }, [robotState.bodyYaw, robotState.headPose, robotState.antennas, localValues.headPose, addFrontendLog, isActive]);

  // Handle antennas changes (always using set_target)
  // Changed signature: now accepts 'left' or 'right' as first param, and the new value as second
  const handleAntennasChange = useCallback((antenna, value, continuous = false) => {
    // Always use ref to get the most current values (especially during continuous drag)
    const currentAntennas = antennasRef.current.length === 2 ? antennasRef.current : (localValues.antennas || [0, 0]);
    
    const newAntennas = antenna === 'left' 
      ? [value, currentAntennas[1]] 
      : [currentAntennas[0], value];
    
    // Clamp antennas to valid range
    const clampedAntennas = [
      clamp(newAntennas[0], ROBOT_POSITION_RANGES.ANTENNA.min, ROBOT_POSITION_RANGES.ANTENNA.max),
      clamp(newAntennas[1], ROBOT_POSITION_RANGES.ANTENNA.min, ROBOT_POSITION_RANGES.ANTENNA.max),
    ];
    
    // Update ref immediately (before state update) to ensure next call has latest values
    antennasRef.current = clampedAntennas;
    
    if (continuous) {
      // Log antennas drag start (only once)
      if (!isDraggingRef.current) {
        addFrontendLog(`▶️ Moving antennas...`);
      }
      
      // Set targets in smoothing manager
      targetSmoothingRef.current.setTargets({
        antennas: clampedAntennas,
      });
      
      // Mark as dragging - smoothing loop will send smoothed values
      setIsDragging(true);
      isDraggingRef.current = true;
    } else {
      // For non-continuous (onChangeCommitted), set target and let smoothing finish
      targetSmoothingRef.current.setTargets({
        antennas: clampedAntennas,
      });
      
      const now = Date.now();
      const leftDeg = (clampedAntennas[0] * 180 / Math.PI).toFixed(1);
      const rightDeg = (clampedAntennas[1] * 180 / Math.PI).toFixed(1);
      if (now - lastLogTimeRef.current > 500) {
        addFrontendLog(`→ Antennas: L:${leftDeg}° R:${rightDeg}°`);
        lastLogTimeRef.current = now;
      }
      
      setIsDragging(false);
      isDraggingRef.current = false;
      lastDragEndTimeRef.current = Date.now();
      
      // Wait for smoothing, then send final value
      setTimeout(() => {
        if (!isActive) return;
        
        const smoothed = targetSmoothingRef.current.getCurrentValues();
        const requestBody = {
          target_head_pose: robotState.headPose,
          target_antennas: smoothed.antennas,
          target_body_yaw: robotState.bodyYaw || 0,
        };

        fetchWithTimeout(
          buildApiUrl('/api/move/set_target'),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
          },
          DAEMON_CONFIG.MOVEMENT.CONTINUOUS_MOVE_TIMEOUT,
          { label: 'Set target (antennas)', silent: true }
        ).catch((error) => {
          console.error('❌ set_target (antennas) error:', error);
        });
      }, 50); // Small delay to allow smoothing to apply
    }
  }, [robotState.headPose, robotState.bodyYaw, localValues.antennas, addFrontendLog, isActive]);

  // Reset all values to zero (used by global reset function)
  const resetAllValues = useCallback(() => {
    // Update local values directly
    const resetValues = {
      headPose: { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0 },
      bodyYaw: 0,
      antennas: [0, 0],
    };
    
    // Reset both local state and target smoothing manager
    setLocalValues(resetValues);
    targetSmoothingRef.current.reset();
    antennasRef.current = [0, 0];
    
    // Send single API call with all values at zero
    const resetPose = {
      target_head_pose: resetValues.headPose,
      target_antennas: resetValues.antennas,
      target_body_yaw: resetValues.bodyYaw,
    };
    
    fetchWithTimeout(
      buildApiUrl('/api/move/set_target'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resetPose),
      },
      DAEMON_CONFIG.MOVEMENT.CONTINUOUS_MOVE_TIMEOUT,
      { label: 'Reset all positions', silent: true }
    ).catch((error) => {
      console.error('❌ Reset error:', error);
    });
  }, []);

  // Get target values for ghost visualization (from target smoothing manager)
  // These represent where we're heading (targets), not the smoothed values
  const targetValues = targetSmoothingRef.current.getTargetValues();
  
  const smoothedValues = {
    headPose: targetValues.headPose, // Show targets as "ghost" (where we're going)
    bodyYaw: targetValues.bodyYaw,
    antennas: targetValues.antennas,
  };

  return {
    localValues,
    smoothedValues, // Expose smoothed values for ghost visualization
    handleChange,
    handleBodyYawChange,
    handleAntennasChange,
    handleDragEnd,
    addFrontendLog,
    resetAllValues,
  };
}

