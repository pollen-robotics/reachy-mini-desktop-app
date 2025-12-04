import { useEffect, useRef } from 'react';
import useAppStore from '../../store/useAppStore';
import { DAEMON_CONFIG, fetchWithTimeoutSkipInstall, buildApiUrl } from '../../config/daemon';
import { useDaemonEventBus } from '../daemon/useDaemonEventBus';

/**
 * 🎯 Centralized hook for robot state polling
 * 
 * ONE SINGLE place that polls /api/state/full with all parameters every 500ms
 * Updates robotStateFull in the store for all consumers
 * Also handles health check timeouts for crash detection
 * 
 * ⚠️ SKIP during installations (daemon may be overloaded)
 */
export function useRobotState(isActive) {
  const { 
    isDaemonCrashed,
    hardwareError,
    setRobotStateFull,
    setActiveMoves,
    incrementTimeouts,
    resetTimeouts,
    setIsActive,
    clearStartupTimeout,
    setHardwareError,
  } = useAppStore();
  
  // ✅ Event Bus for centralized event handling
  const eventBus = useDaemonEventBus();
  
  // Track consecutive successful responses to clear hardwareError
  // If daemon responds successfully multiple times, it means the error is resolved
  const consecutiveSuccessRef = useRef(0);
  
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
            
            // ✅ CRITICAL: Don't set isActive to true if there's a hardware error
            // This prevents transitioning to active view when there's an error
            const currentState = useAppStore.getState();
            
            // ✅ CRITICAL: If daemon is still starting, don't clear hardwareError yet
            // Wait for startup to complete (isStarting = false) before clearing errors
            // This prevents clearing errors if daemon responds briefly before crashing
            if (!currentState.hardwareError) {
              setIsActive(true);
              // ✅ Clear startup timeout since daemon is now active
              clearStartupTimeout();
              consecutiveSuccessRef.current = 0; // Reset counter
            } else if (!currentState.isStarting) {
              // ✅ Only clear hardwareError if daemon is NOT starting anymore
              // This means startup completed, so if daemon responds successfully,
              // the error was resolved. Increment success counter.
              // After 3 successful responses (~1.5s), clear the error
              consecutiveSuccessRef.current += 1;
              if (consecutiveSuccessRef.current >= 3) {
                console.log('✅ Daemon responding successfully multiple times after startup, clearing hardwareError');
                setHardwareError(null);
                setIsActive(true);
                clearStartupTimeout();
                consecutiveSuccessRef.current = 0;
              }
            }
            // If isStarting = true and hardwareError exists, don't clear it yet
            // Wait for startup to complete (either success or failure)
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
          
          // ❌ Timeout → increment counter for crash detection
          if (error.name === 'TimeoutError' || error.message?.includes('timed out')) {
            console.warn('⚠️ Robot state fetch timeout, incrementing counter');
            incrementTimeouts();
            // ✅ Emit health failure event to bus
            eventBus.emit('daemon:health:failure', { error: 'Timeout', type: 'timeout' });
            setRobotStateFull(prev => ({
              ...prev,
              error: 'Timeout',
            }));
          } else {
            // Other error
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

