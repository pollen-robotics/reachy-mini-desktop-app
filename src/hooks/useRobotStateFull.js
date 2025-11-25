import { useEffect } from 'react';
import useAppStore from '../store/useAppStore';
import { DAEMON_CONFIG, fetchWithTimeoutSkipInstall, buildApiUrl } from '../config/daemon';

/**
 * 🎯 CENTRALIZED hook for fetching complete robot state
 * 
 * ONE SINGLE source of truth for /api/state/full polling
 * Replaces scattered polling in:
 * - useRobotState.js (500ms)
 * - useDaemonHealthCheck.js (1.33s)
 * - RobotPositionControl.jsx (1000ms)
 * 
 * ✅ Benefits:
 * - Reduces HTTP requests from ~3.75/s to 2/s (500ms polling)
 * - All components share the same data (no sync issues)
 * - Easier to maintain
 * 
 * 🔄 Stores result in useAppStore.robotStateFull
 */
export function useRobotStateFull(isActive) {
  const { isDaemonCrashed, setRobotStateFull, incrementTimeouts, resetTimeouts } = useAppStore();

  useEffect(() => {
    // Don't poll if daemon not active or crashed
    if (!isActive || isDaemonCrashed) {
      return;
    }

    const fetchFullState = async () => {
      try {
        // ✅ Fetch COMPLETE state with ALL necessary parameters
        // This single request replaces 3 separate polling loops
        const response = await fetchWithTimeoutSkipInstall(
          buildApiUrl(
            '/api/state/full?' +
            'with_control_mode=true&' +      // For useRobotState (motors on/off)
            'with_head_joints=true&' +       // For useRobotState (movement detection)
            'with_body_yaw=true&' +          // For all (body position)
            'with_antenna_positions=true&' + // For all (antennas)
            'with_head_pose=true&' +         // For RobotPositionControl (head position)
            'use_pose_matrix=false'          // For RobotPositionControl (format)
          ),
          {},
          DAEMON_CONFIG.TIMEOUTS.STATE_FULL,
          { silent: true } // Don't log (frequent polling)
        );

        if (response.ok) {
          const data = await response.json();

          // ✅ Store in centralized state
          setRobotStateFull({
            data,
            lastUpdate: Date.now(),
            error: null,
          });
          
          // ✅ Reset timeout counter (daemon is alive)
          resetTimeouts();
        } else {
          // Response but not OK → not a timeout, don't increment
          console.warn('⚠️ Robot state responded but not OK:', response.status);
          
          setRobotStateFull((prev) => ({
            ...prev,
            error: `HTTP ${response.status}`,
          }));
        }
      } catch (error) {
        // Skip during installation (expected)
        if (error.name === 'SkippedError') {
          return;
        }

        // ❌ Timeout or error → increment counter
        if (error.name === 'TimeoutError' || error.message?.includes('timed out')) {
          incrementTimeouts();
          
          setRobotStateFull((prev) => ({
            ...prev,
            error: 'Timeout',
          }));
        } else {
          // Other error (network, etc.)
        setRobotStateFull((prev) => ({
          ...prev,
            error: error.message || 'Unknown error',
        }));
        }
      }
    };

    // First immediate fetch
    fetchFullState();

    // ✅ Poll every 500ms for real-time updates
    // This is the fastest polling rate we need (from useRobotState)
    const interval = setInterval(fetchFullState, DAEMON_CONFIG.INTERVALS.ROBOT_STATE);

    return () => clearInterval(interval);
  }, [isActive, isDaemonCrashed, setRobotStateFull, incrementTimeouts, resetTimeouts]);
}
