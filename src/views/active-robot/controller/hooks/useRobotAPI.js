import { useCallback, useRef } from 'react';
import { ROBOT_POSITION_RANGES } from '../../../../utils/inputConstants';
import { clamp } from '../../../../utils/inputHelpers';
import { useActiveRobotContext } from '../../context';

// Enable/disable right antenna mirroring (inversion)
// When true: right antenna value is negated for symmetric movement
// When false: right antenna value is sent as-is
const ENABLE_RIGHT_ANTENNA_MIRRORING = false;

// Simple throttle - same as v0.8.10 that worked well
const SEND_THROTTLE_MS = 50; // ~20fps - proven to work for both USB and WiFi

/**
 * Transform antennas for API: optionally invert right antenna for mirror behavior
 * Left antenna: sent as-is
 * Right antenna: inverted (negated) if ENABLE_RIGHT_ANTENNA_MIRRORING is true
 * 
 * @param {Array} antennas - [left, right] antenna values
 * @returns {Array} - [left, right] or [left, -right] depending on config
 */
function transformAntennasForAPI(antennas) {
  if (!antennas || antennas.length !== 2) return antennas;
  return ENABLE_RIGHT_ANTENNA_MIRRORING 
    ? [antennas[0], -antennas[1]] 
    : antennas;
}

/**
 * Hook for managing robot API calls
 * 
 * Simple fire-and-forget pattern (same as v0.8.10):
 * - Throttled to 20fps (50ms)
 * - Direct fetch, no queue management
 * - Works reliably for both USB and WiFi
 */
export function useRobotAPI(isActive, robotState, isDraggingRef) {
  const { api } = useActiveRobotContext();
  const { buildApiUrl, fetchWithTimeout, config: DAEMON_CONFIG } = api;
  
  // Simple throttle tracking
  const lastSendTimeRef = useRef(0);

  /**
   * Send command via HTTP POST (fire-and-forget)
   * Simple throttle - same pattern as v0.8.10
   */
  const sendCommand = useCallback((headPose, antennas, bodyYaw) => {
    if (!isActive) return;
    
    // Simple throttle
    const now = Date.now();
    if (now - lastSendTimeRef.current < SEND_THROTTLE_MS) {
      return; // Skip this frame
    }
    lastSendTimeRef.current = now;
    
    const validBodyYaw = typeof bodyYaw === 'number' ? bodyYaw : (robotState.bodyYaw || 0);
    
            const requestBody = {
              target_head_pose: headPose,
              target_antennas: transformAntennasForAPI(antennas),
              target_body_yaw: validBodyYaw,
            };
    
    // Fire and forget - direct fetch
            fetchWithTimeout(
              buildApiUrl('/api/move/set_target'),
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
              },
              DAEMON_CONFIG.MOVEMENT.CONTINUOUS_MOVE_TIMEOUT,
      { label: 'Set target', silent: true, fireAndForget: true }
    ).catch(() => {}); // Ignore errors silently
  }, [isActive, robotState.bodyYaw, buildApiUrl, fetchWithTimeout, DAEMON_CONFIG]);

  /**
   * Force send command - bypasses throttle
   * Use for final position on drag end
   */
  const forceSendCommand = useCallback((headPose, antennas, bodyYaw) => {
    if (!isActive) return;
    
    const validBodyYaw = typeof bodyYaw === 'number' ? bodyYaw : (robotState.bodyYaw || 0);

    const requestBody = {
      target_head_pose: headPose,
      target_antennas: transformAntennasForAPI(antennas),
      target_body_yaw: validBodyYaw,
    };
    
    // Bypass throttle - send immediately
    lastSendTimeRef.current = Date.now();
    fetchWithTimeout(
      buildApiUrl('/api/move/set_target'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      },
      DAEMON_CONFIG.MOVEMENT.CONTINUOUS_MOVE_TIMEOUT,
      { label: 'Set target (force)', silent: true, fireAndForget: true }
    ).catch(() => {}); // Ignore errors silently
  }, [isActive, robotState.bodyYaw, buildApiUrl, fetchWithTimeout, DAEMON_CONFIG]);

  /**
   * Send single command - legacy API, now uses forceSend internally
   * For non-continuous updates like reset
   */
  const sendSingleCommand = useCallback((headPose, antennas, bodyYaw) => {
    if (!isActive) return Promise.resolve();
    
    const validBodyYaw = typeof bodyYaw === 'number' ? bodyYaw : (robotState.bodyYaw || 0);
    
    const requestBody = {
      target_head_pose: headPose ? {
        x: clamp(headPose.x, ROBOT_POSITION_RANGES.POSITION.min, ROBOT_POSITION_RANGES.POSITION.max),
        y: clamp(headPose.y, ROBOT_POSITION_RANGES.POSITION.min, ROBOT_POSITION_RANGES.POSITION.max),
        z: clamp(headPose.z, ROBOT_POSITION_RANGES.POSITION.min, ROBOT_POSITION_RANGES.POSITION.max),
        pitch: clamp(headPose.pitch, ROBOT_POSITION_RANGES.PITCH.min, ROBOT_POSITION_RANGES.PITCH.max),
        yaw: clamp(headPose.yaw, ROBOT_POSITION_RANGES.YAW.min, ROBOT_POSITION_RANGES.YAW.max),
        roll: clamp(headPose.roll, ROBOT_POSITION_RANGES.ROLL.min, ROBOT_POSITION_RANGES.ROLL.max),
      } : robotState.headPose,
      target_antennas: transformAntennasForAPI(antennas || robotState.antennas || [0, 0]),
      target_body_yaw: validBodyYaw,
    };

    // Use direct fetch for single commands (need the response)
    return fetchWithTimeout(
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
  }, [isActive, robotState, buildApiUrl, fetchWithTimeout, DAEMON_CONFIG]);

  /**
   * Stop continuous updates - kept for backward compatibility
   */
  const stopContinuousUpdates = useCallback(() => {
    // No-op with simple throttle pattern
  }, []);

  /**
   * Start continuous updates - kept for backward compatibility
   */
  const startContinuousUpdates = useCallback(() => {
    // No-op with simple throttle pattern
  }, []);

  return {
    sendCommand,
    forceSendCommand,
    sendSingleCommand,
    startContinuousUpdates,
    stopContinuousUpdates,
  };
}
