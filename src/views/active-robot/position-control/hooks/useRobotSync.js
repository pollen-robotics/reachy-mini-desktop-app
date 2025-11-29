import { useEffect } from 'react';
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
  }, [isActive, robotStateFull, robotState, setRobotState, localValues, setLocalValues, isDraggingRef, isUsingGamepadKeyboardRef, lastDragEndTimeRef, lastGamepadKeyboardReleaseRef, antennasRef, targetSmoothingRef]);
}

