import { useEffect } from 'react';
import useAppStore from '../../store/useAppStore';
import { DAEMON_CONFIG, fetchWithTimeoutSkipInstall, buildApiUrl } from '../../config/daemon';
import { useDaemonEventBus } from '../daemon/useDaemonEventBus';

/**
 * 🎯 Centralized hook for robot state polling
 * 
 * Responsibilities (SINGLE RESPONSIBILITY):
 * 1. Poll /api/state/full every 500ms when isActive=true
 * 2. Poll /api/move/running every 500ms when isActive=true
 * 3. Health check: count consecutive timeouts → trigger crash if 3+ failures
 * 
 * NOT responsible for:
 * - Transitioning to ready (that's HardwareScanView's job)
 * - Clearing startup timeout (that's useDaemon's job)
 * - Clearing hardware errors (that's startConnection's job)
 * 
 * ⚠️ SKIP during installations (daemon may be overloaded)
 */
export function useRobotState(isActive) {
  const { 
    isDaemonCrashed,
    setRobotStateFull,
    setActiveMoves,
    incrementTimeouts,
    resetTimeouts,
  } = useAppStore();
  
  // ✅ Event Bus for centralized event handling
  const eventBus = useDaemonEventBus();
  
  useEffect(() => {
    if (!isActive) {
      // Clear state when daemon is not active
      setRobotStateFull({
        data: null,
        lastUpdate: null,
        error: null,
      });
      setActiveMoves([]);
      return;
    }
    
    // Don't poll if daemon is crashed
    if (isDaemonCrashed) {
      console.warn('⚠️ Daemon crashed, stopping robot state polling');
      return;
    }
    
    // ⚠️ Sanity check: if isActive but no connectionMode, force crash state
    // This can happen if state gets corrupted during rapid mode switching
    const { connectionMode } = useAppStore.getState();
    if (isActive && !connectionMode) {
      console.error('🔴 Invalid state detected: isActive=true but connectionMode=null. Triggering crash...');
      useAppStore.getState().transitionTo.crashed();
      return;
    }
    
    const fetchState = async () => {
      // ✅ Fetch both state/full and move/running in parallel (independent error handling)
      const statePromise = (async () => {
        try {
          const stateResponse = await fetchWithTimeoutSkipInstall(
            buildApiUrl('/api/state/full?with_control_mode=true&with_head_joints=true&with_body_yaw=true&with_antenna_positions=true'),
            {},
            DAEMON_CONFIG.TIMEOUTS.STATE_FULL,
            { silent: true } // ⚡ Don't log (polling every 500ms)
          );
          
          if (stateResponse.ok) {
            const data = await stateResponse.json();
            
            // ✅ Update centralized state in store
            setRobotStateFull({
              data,
              lastUpdate: Date.now(),
              error: null,
            });
            
            // ✅ Success → reset timeout counter for health check
            resetTimeouts();
            
            // ✅ Emit health success event to bus
            eventBus.emit('daemon:health:success', { data });
          } else {
            // Response but not OK → not a timeout, don't increment
            console.warn('⚠️ Daemon responded but not OK:', stateResponse.status);
            setRobotStateFull(prev => ({
              ...prev,
              error: `HTTP ${stateResponse.status}`,
            }));
          }
        } catch (error) {
          // Skip during installation (expected)
          if (error.name === 'SkippedError') {
            return;
          }
          
          // Silently ignore AbortError (expected when component unmounts or dependencies change)
          if (error.name === 'AbortError') {
            return;
          }
          
          // ❌ Network error → increment counter for crash detection
          // This includes: TimeoutError, "Load failed", "Could not connect", etc.
          const isNetworkError = 
            error.name === 'TimeoutError' || 
            error.message?.includes('timed out') ||
            error.message?.includes('Load failed') ||
            error.message?.includes('Could not connect') ||
            error.message?.includes('NetworkError') ||
            error.message?.includes('Failed to fetch');
          
          if (isNetworkError) {
            console.warn('⚠️ Robot state fetch failed (network error), incrementing counter');
            incrementTimeouts();
            // ✅ Emit health failure event to bus
            eventBus.emit('daemon:health:failure', { error: error.message || 'Network error', type: 'network' });
            setRobotStateFull(prev => ({
              ...prev,
              error: error.message || 'Network error',
            }));
          } else {
            // Other error (not network related)
            console.warn('⚠️ Robot state fetch error:', error.message);
            // ✅ Emit health failure event to bus
            eventBus.emit('daemon:health:failure', { error: error.message, type: 'error' });
            setRobotStateFull(prev => ({
              ...prev,
              error: error.message,
            }));
          }
        }
      })();
      
      const movesPromise = (async () => {
        try {
          const movesResponse = await fetchWithTimeoutSkipInstall(
            buildApiUrl('/api/move/running'),
            {},
            DAEMON_CONFIG.TIMEOUTS.COMMAND,
            { silent: true } // ⚡ Don't log (polling every 500ms)
          );
          
          if (movesResponse.ok) {
            const movesData = await movesResponse.json();
            // API returns an array of MoveUUID objects: [{ uuid: "..." }, ...]
            if (Array.isArray(movesData)) {
              setActiveMoves(movesData);
            } else {
              setActiveMoves([]);
            }
          }
        } catch (error) {
          // Skip during installation (expected)
          if (error.name === 'SkippedError') {
            return;
          }
          // Silently ignore AbortError (expected when component unmounts or dependencies change)
          if (error.name === 'AbortError') {
            return;
          }
          // Silently fail for moves (non-critical for health check)
          console.warn('⚠️ Failed to fetch active moves:', error.message);
        }
      })();
      
      // Wait for both to complete (independent error handling)
      await Promise.allSettled([statePromise, movesPromise]);
    };
    
    // Fetch initial
    fetchState();
    
    // ✅ Poll every 500ms (unified interval)
    const interval = setInterval(fetchState, DAEMON_CONFIG.INTERVALS.ROBOT_STATE);
    
    return () => {
      clearInterval(interval);
    };
  }, [isActive, isDaemonCrashed]); // Removed setters from deps - Zustand setters are stable and don't need to be in deps
}

