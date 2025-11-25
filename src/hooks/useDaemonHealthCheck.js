import { useEffect } from 'react';
import useAppStore from '../store/useAppStore';
import { DAEMON_CONFIG, fetchWithTimeoutSkipInstall, buildApiUrl } from '../config/daemon';

/**
 * 🏥 Centralized hook for daemon health detection
 * 
 * ONE SINGLE place to increment timeout counter AND update isActive state
 * Replaces scattered calls in useDaemon and useRobotState
 * 
 * ⚠️ SKIP during installations (daemon may be overloaded)
 */
export function useDaemonHealthCheck() {
  const { 
    isDaemonCrashed, 
    isActive,
    setIsActive,
    incrementTimeouts, 
    resetTimeouts 
  } = useAppStore();
  
  useEffect(() => {
    // Don't check if already detected as crashed
    if (isDaemonCrashed) {
      console.warn('⚠️ Daemon marked as crashed, health check disabled');
      return;
    }
    
    // Don't check if daemon not active
    if (!isActive) {
      return;
    }
    
    const checkHealth = async () => {
      try {
        const response = await fetchWithTimeoutSkipInstall(
          buildApiUrl(DAEMON_CONFIG.ENDPOINTS.STATE_FULL),
          {},
          DAEMON_CONFIG.TIMEOUTS.HEALTHCHECK,
          { silent: true } // Don't log (polling)
        );
        
        if (response.ok) {
          resetTimeouts(); // ✅ Success → reset counter
          setIsActive(true); // ✅ Also update isActive state
        } else {
          // Response but not OK → not a timeout, don't increment
          console.warn('⚠️ Daemon responded but not OK:', response.status);
        }
      } catch (error) {
        // Skip during installation (expected)
        if (error.name === 'SkippedError') {
          return;
        }
        
        // ❌ Timeout → increment counter
        if (error.name === 'TimeoutError' || error.message?.includes('timed out')) {
          console.warn('⚠️ Health check timeout, incrementing counter');
          incrementTimeouts();
          // Don't set isActive to false immediately - let crash detection handle it
        }
      }
    };
    
    // First immediate check
    checkHealth();
    
    // ✅ Health check every ~1.33s to detect crash in 4s (3 timeouts)
    const interval = setInterval(checkHealth, DAEMON_CONFIG.TIMEOUTS.HEALTHCHECK);
    
    return () => clearInterval(interval);
  }, [isDaemonCrashed, isActive, setIsActive, incrementTimeouts, resetTimeouts]);
}

