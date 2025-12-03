import { useEffect, useRef } from 'react';
import { INPUT_THRESHOLDS, TIMING } from '../../../../utils/inputConstants';

/**
 * Hook for synchronizing robot state with local values
 * Handles syncing from robotStateFull to localValues when appropriate
 */
export function useRobotSync(
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
) {
  // Use ref to store current localValues to avoid dependency issues
  const localValuesRef = useRef(localValues);
  
  // Keep ref in sync with localValues
  useEffect(() => {
    localValuesRef.current = localValues;
  }, [localValues]);
  
  // ✅ Update robotState from centralized data (NO POLLING)
  useEffect(() => {
    if (!isActive || !robotStateFull || !robotStateFull.data) return;

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
      
      // Only update robotState if values actually changed to prevent infinite loops
      setRobotState(prev => {
        const headPoseChanged = 
          Math.abs(prev.headPose.x - newState.headPose.x) > 0.0001 ||
          Math.abs(prev.headPose.y - newState.headPose.y) > 0.0001 ||
          Math.abs(prev.headPose.z - newState.headPose.z) > 0.0001 ||
          Math.abs(prev.headPose.pitch - newState.headPose.pitch) > 0.0001 ||
          Math.abs(prev.headPose.yaw - newState.headPose.yaw) > 0.0001 ||
          Math.abs(prev.headPose.roll - newState.headPose.roll) > 0.0001;
        const bodyYawChanged = Math.abs(prev.bodyYaw - newState.bodyYaw) > 0.0001;
        const antennasChanged = 
          !prev.antennas ||
          Math.abs((prev.antennas[0] || 0) - newState.antennas[0]) > 0.0001 ||
          Math.abs((prev.antennas[1] || 0) - newState.antennas[1]) > 0.0001;
        
        if (headPoseChanged || bodyYawChanged || antennasChanged) {
          return newState;
        }
        return prev; // No change, return previous state
      });
      
      // ✅ CRITICAL: After a user drag, we should NEVER sync automatically
      // The robot should stay exactly where the user put it
      // Only sync for major external changes (like someone manually moving the robot)
      const timeSinceGamepadRelease = Date.now() - lastGamepadKeyboardReleaseRef.current;
      
      // If user recently interacted, NEVER sync - robot should stay where user put it
      const RECENT_USER_INTERACTION = 30000; // 30 seconds - if user interacted recently, don't sync
      const hasRecentUserInteraction = 
        timeSinceDragEnd < RECENT_USER_INTERACTION || 
        timeSinceGamepadRelease < RECENT_USER_INTERACTION;
      
      const canSyncFromRobot = 
        !isDraggingRef.current && 
        !isUsingGamepadKeyboardRef.current && 
        !hasRecentUserInteraction; // Never sync if user recently interacted
      
      if (canSyncFromRobot) {
        // Use ref to get current localValues without creating dependency
        const currentLocalValues = localValuesRef.current;
        
        // Get current target values and current smoothed values from smoothing manager
        const targetValues = targetSmoothingRef.current.getTargetValues();
        const currentSmoothed = targetSmoothingRef.current.getCurrentValues();
        
        // IMPORTANT: Don't sync if robot values are already very close to our TARGET values OR smoothed values
        // This means the robot has already reached (or is close to) where we want it to be
        // This prevents the "jump" and continuous movement when values converge at the end of animation
        const closeTolerance = INPUT_THRESHOLDS.SYNC_TOLERANCE * 5; // Tolerance for "already close" check
        
        // Check if robot is close to our TARGET values (where we want to go)
        // If robot is already at or near our target, don't sync - it's where we want it!
        const robotCloseToTarget = 
          Math.abs(newState.headPose.x - targetValues.headPose.x) < closeTolerance &&
          Math.abs(newState.headPose.y - targetValues.headPose.y) < closeTolerance &&
          Math.abs(newState.headPose.z - targetValues.headPose.z) < closeTolerance &&
          Math.abs(newState.headPose.pitch - targetValues.headPose.pitch) < closeTolerance &&
          Math.abs(newState.headPose.yaw - targetValues.headPose.yaw) < closeTolerance &&
          Math.abs(newState.headPose.roll - targetValues.headPose.roll) < closeTolerance &&
          Math.abs(newState.bodyYaw - targetValues.bodyYaw) < closeTolerance &&
          Math.abs(newState.antennas[0] - targetValues.antennas[0]) < closeTolerance &&
          Math.abs(newState.antennas[1] - targetValues.antennas[1]) < closeTolerance;
        
        // Check if robot is close to our CURRENT smoothed values (what we're actually sending)
        const robotCloseToSmoothed = 
          Math.abs(newState.headPose.x - currentSmoothed.headPose.x) < closeTolerance &&
          Math.abs(newState.headPose.y - currentSmoothed.headPose.y) < closeTolerance &&
          Math.abs(newState.headPose.z - currentSmoothed.headPose.z) < closeTolerance &&
          Math.abs(newState.headPose.pitch - currentSmoothed.headPose.pitch) < closeTolerance &&
          Math.abs(newState.headPose.yaw - currentSmoothed.headPose.yaw) < closeTolerance &&
          Math.abs(newState.headPose.roll - currentSmoothed.headPose.roll) < closeTolerance &&
          Math.abs(newState.bodyYaw - currentSmoothed.bodyYaw) < closeTolerance &&
          Math.abs(newState.antennas[0] - currentSmoothed.antennas[0]) < closeTolerance &&
          Math.abs(newState.antennas[1] - currentSmoothed.antennas[1]) < closeTolerance;
        
        // CRITICAL: If robot is already close to our target OR what we're sending, NEVER sync
        // This means the robot has reached (or is close to) where we want it - don't create new movement!
        if (robotCloseToTarget || robotCloseToSmoothed) {
          return;
        }
        
        // Only sync if there's a REALLY significant difference (external change, not just smoothing drift)
        // Use a very large tolerance to only sync for major external changes
        const majorChangeTolerance = INPUT_THRESHOLDS.SYNC_TOLERANCE * 20; // Very large tolerance - only sync for major changes
        
        // Check which specific values have changed SIGNIFICANTLY (only sync for major external changes)
        // Use very large tolerance to prevent syncing after user drags - only sync for real external changes
        const xChanged = Math.abs(newState.headPose.x - currentLocalValues.headPose.x) > majorChangeTolerance;
        const yChanged = Math.abs(newState.headPose.y - currentLocalValues.headPose.y) > majorChangeTolerance;
        const zChanged = Math.abs(newState.headPose.z - currentLocalValues.headPose.z) > majorChangeTolerance;
        const pitchChanged = Math.abs(newState.headPose.pitch - currentLocalValues.headPose.pitch) > majorChangeTolerance;
        const yawChanged = Math.abs(newState.headPose.yaw - currentLocalValues.headPose.yaw) > majorChangeTolerance;
        const rollChanged = Math.abs(newState.headPose.roll - currentLocalValues.headPose.roll) > majorChangeTolerance;
        const bodyYawChanged = Math.abs(newState.bodyYaw - currentLocalValues.bodyYaw) > majorChangeTolerance;
        const antennaLeftChanged = !currentLocalValues.antennas || Math.abs(newState.antennas[0] - (currentLocalValues.antennas[0] || 0)) > majorChangeTolerance;
        const antennaRightChanged = !currentLocalValues.antennas || Math.abs(newState.antennas[1] - (currentLocalValues.antennas[1] || 0)) > majorChangeTolerance;
        
        // Build partial updates - only sync values that actually changed
        const syncUpdates = {};
        let hasAnyChange = false;
        
        // Only sync headPose values that changed
        if (xChanged || yChanged || zChanged || pitchChanged || yawChanged || rollChanged) {
          syncUpdates.headPose = {};
          if (xChanged) syncUpdates.headPose.x = newState.headPose.x;
          if (yChanged) syncUpdates.headPose.y = newState.headPose.y;
          if (zChanged) syncUpdates.headPose.z = newState.headPose.z;
          if (pitchChanged) syncUpdates.headPose.pitch = newState.headPose.pitch;
          if (yawChanged) syncUpdates.headPose.yaw = newState.headPose.yaw;
          if (rollChanged) syncUpdates.headPose.roll = newState.headPose.roll;
          hasAnyChange = true;
        }
        
        if (bodyYawChanged) {
          syncUpdates.bodyYaw = newState.bodyYaw;
          hasAnyChange = true;
        }
        
        if (antennaLeftChanged || antennaRightChanged) {
          syncUpdates.antennas = [...newState.antennas];
          if (antennaLeftChanged || antennaRightChanged) {
            antennasRef.current = newState.antennas;
          }
          hasAnyChange = true;
        }
        
        // Only sync if at least one value changed
        if (hasAnyChange) {
          // Sync smoothing manager with only the changed values
          // Use setTargets instead of sync to preserve unchanged values
          targetSmoothingRef.current.setTargets(syncUpdates);
          
          // Update localValues to reflect the sync (but smoothing will handle the transition)
          // Only update the values that changed, preserve others
          setLocalValues(prev => {
            const updated = { ...prev };
            let needsUpdate = false;
            
            if (syncUpdates.headPose) {
              updated.headPose = { ...prev.headPose, ...syncUpdates.headPose };
              needsUpdate = true;
            }
            if (syncUpdates.bodyYaw !== undefined) {
              updated.bodyYaw = syncUpdates.bodyYaw;
              needsUpdate = true;
            }
            if (syncUpdates.antennas) {
              updated.antennas = syncUpdates.antennas;
              needsUpdate = true;
            }
            
            return needsUpdate ? updated : prev;
          });
        }
      }
    }
  }, [isActive, robotStateFull, robotState, setRobotState, setLocalValues, isDraggingRef, isUsingGamepadKeyboardRef, lastDragEndTimeRef, lastGamepadKeyboardReleaseRef, antennasRef, targetSmoothingRef]); // localValues removed from deps to prevent infinite loop - we use ref instead
}

