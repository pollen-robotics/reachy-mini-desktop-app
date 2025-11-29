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
  INPUT_SMOOTHING_FACTORS,
  INPUT_MAPPING_FACTORS,
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
import { useRobotAPI } from './useRobotAPI';
import { useRobotSmoothing } from './useRobotSmoothing';
import { useRobotSync } from './useRobotSync';
import { mapInputToRobot } from '../../../../utils/inputMappings';

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
  
  // Use extracted hooks for better organization
  // API management hook
  const {
    sendCommand,
    sendSingleCommand,
    startContinuousUpdates,
    stopContinuousUpdates,
    rafRef,
    pendingPoseRef,
    lastSentPoseRef,
  } = useRobotAPI(isActive, robotState, isDraggingRef);

  // Ref to store sendCommand to avoid dependency issues
  const sendCommandRef = useRef(sendCommand);
  useEffect(() => {
    sendCommandRef.current = sendCommand;
  }, [sendCommand]);
      
  // Smoothing hook
  const { targetSmoothingRef, smoothingRafRef, smoothedValues: smoothedValuesFromHook } = useRobotSmoothing(
    isActive,
    isDraggingRef,
    sendCommandRef,
    setLocalValues
  );

  // Sync hook
  useRobotSync(
    isActive,
    robotStateFull,
    robotState,
    setRobotState,
    localValues,
    setLocalValues,
    isDraggingRef,
    isUsingGamepadKeyboardRef,
    lastDragEndTimeRef,
    lastGamepadKeyboardReleaseRef,
    antennasRef,
    targetSmoothingRef
  );


  // Note: stopContinuousUpdates is no longer needed since smoothing loop handles all updates
  // But keeping it for backward compatibility and cleanup
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
          moveForward: INPUT_SMOOTHING_FACTORS.POSITION,
          moveRight: INPUT_SMOOTHING_FACTORS.POSITION,
          moveUp: INPUT_SMOOTHING_FACTORS.POSITION_Z,
          lookHorizontal: INPUT_SMOOTHING_FACTORS.ROTATION,
          lookVertical: INPUT_SMOOTHING_FACTORS.ROTATION,
          roll: INPUT_SMOOTHING_FACTORS.POSITION,
          bodyYaw: INPUT_SMOOTHING_FACTORS.BODY_YAW,
          antennaLeft: INPUT_SMOOTHING_FACTORS.ANTENNA,
          antennaRight: INPUT_SMOOTHING_FACTORS.ANTENNA,
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
      // Left stick mapping:
      // - Horizontal (moveRight): droite = +1 → robot avance (Y positif)
      // - Vertical (moveForward): haut = +1 → robot droite (X positif)
      // This matches user expectation: joystick right = robot forward
      const POSITION_SENSITIVITY_FACTOR = INPUT_MAPPING_FACTORS.POSITION;
      const ROTATION_SENSITIVITY_FACTOR = INPUT_MAPPING_FACTORS.ROTATION;
      const BODY_YAW_SENSITIVITY_FACTOR = INPUT_MAPPING_FACTORS.BODY_YAW;
      
      // Map joystick values (-1 to 1) to extended position ranges
      // Inverted mapping: moveRight (horizontal) → Y (forward), moveForward (vertical) → X (right)
      const newX = inputs.moveForward * EXTENDED_ROBOT_RANGES.POSITION.max * POSITION_SENSITIVITY_FACTOR;
      const newY = inputs.moveRight * EXTENDED_ROBOT_RANGES.POSITION.max * POSITION_SENSITIVITY_FACTOR;
      
      // Z position - progressive increment (same logic as body yaw)
      // inputs.moveUp is a progressive value: 0.2 on first press, then increases linearly to 1.0
      // Use same approach as body yaw: multiply by range and sensitivity
      const zIncrement = inputs.moveUp * ROBOT_POSITION_RANGES.POSITION.max * POSITION_SENSITIVITY_FACTOR;
      const newZ = currentHeadPose.z + zIncrement;

      // Right stick (lookHorizontal, lookVertical) → Pitch/Yaw (head rotation)
      // Use centralized mappings for transformations
      const mappedPitch = mapInputToRobot(inputs.lookVertical, 'pitch');
      const mappedYaw = mapInputToRobot(inputs.lookHorizontal, 'yaw');
      const newPitch = mappedPitch * EXTENDED_ROBOT_RANGES.PITCH.max * ROTATION_SENSITIVITY_FACTOR;
      const newYaw = mappedYaw * EXTENDED_ROBOT_RANGES.YAW.max * ROTATION_SENSITIVITY_FACTOR;
      const newRoll = inputs.roll * ROBOT_POSITION_RANGES.ROLL.max * ROTATION_SENSITIVITY_FACTOR;

      // Body yaw - progressive increment (inputs.bodyYaw is already progressive from InputManager)
      // Increment current body yaw instead of direct mapping
      // Body yaw range: -160° to 160° in radians (same as antennas)
      const BODY_YAW_RANGE = { min: -160 * Math.PI / 180, max: 160 * Math.PI / 180 };
      const bodyYawRange = BODY_YAW_RANGE.max - BODY_YAW_RANGE.min;
      const bodyYawIncrement = inputs.bodyYaw * bodyYawRange * BODY_YAW_SENSITIVITY_FACTOR;
      const newBodyYaw = currentBodyYaw + bodyYawIncrement;
      const clampedBodyYaw = clamp(newBodyYaw, BODY_YAW_RANGE.min, BODY_YAW_RANGE.max);

      // Antennas control (triggers) - direct mapping to full range
      // Map trigger values (0 to 1) to antenna position in radians
      // Left trigger → Left antenna, Right trigger → Right antenna
      // More pressure = more rotation
      // Full range mapping: 0 (not pressed) = min, 1 (fully pressed) = max
      // Input values are now guaranteed to be 0-1 from InputManager.combineInputs()
      const antennaRange = ROBOT_POSITION_RANGES.ANTENNA.max - ROBOT_POSITION_RANGES.ANTENNA.min;
      // Direct mapping: 0 → min, 1 → max
      const newAntennaLeft = ROBOT_POSITION_RANGES.ANTENNA.min + (inputs.antennaLeft * antennaRange);
      const newAntennaRight = ROBOT_POSITION_RANGES.ANTENNA.min + (inputs.antennaRight * antennaRange);
      
      // Clamp antennas to valid range (in radians)
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

      // Update localValues to reflect the target (what user wants)
      setLocalValues(prev => ({
        ...prev,
        headPose: targetHeadPose,
        bodyYaw: clampedBodyYaw,
        antennas: newAntennas,
      }));

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
      
      // Update localValues to reflect the target (what user wants)
      setLocalValues(prev => ({
        ...prev,
        headPose: clampedHeadPose,
      }));
      
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
      
      // Update localValues to reflect the target (what user wants)
      setLocalValues(prev => ({
        ...prev,
        bodyYaw: clampedValue,
      }));
      
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
      const bodyYawRad = clampedValue.toFixed(3);
      if (now - lastLogTimeRef.current > 500) {
        addFrontendLog(`→ Body Yaw: ${bodyYawRad}rad`);
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
      
      // Update localValues to reflect the target (what user wants)
      setLocalValues(prev => ({
        ...prev,
        antennas: clampedAntennas,
      }));
      
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
      const leftRad = clampedAntennas[0].toFixed(3);
      const rightRad = clampedAntennas[1].toFixed(3);
      if (now - lastLogTimeRef.current > 500) {
        addFrontendLog(`→ Antennas: L:${leftRad}rad R:${rightRad}rad`);
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
    sendSingleCommand(resetValues.headPose, resetValues.antennas, resetValues.bodyYaw);
  }, [sendSingleCommand]);

  // Use smoothed values from useRobotSmoothing hook (updated every frame)
  // These represent the current smoothed/interpolated values (where we actually are)
  // The ghost shows the smoothed position that follows the target
  const smoothedValues = smoothedValuesFromHook || {
    headPose: { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0 },
    bodyYaw: 0,
    antennas: [0, 0],
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

