import { useEffect, useRef, useState } from 'react';
import useAppStore from '../../store/useAppStore';
import { DAEMON_CONFIG, fetchWithTimeoutSkipInstall, buildApiUrl } from '../../config/daemon';
import { useDaemonEventBus } from './useDaemonEventBus';

/**
 * 🎯 Centralized hook for daemon health checking
 *
 * Responsibilities (SINGLE RESPONSIBILITY):
 * 1. GET /api/daemon/status every 2.5s when isActive=true
 * 2. Health check: count consecutive timeouts → trigger crash if 3+ failures
 * 3. Emit health events to the event bus
 *
 * NOT responsible for:
 * - Fetching robot state data (that's useRobotStateWebSocket's job)
 * - Transitioning to ready (that's HardwareScanView's job)
 *
 * ⚠️ SKIP during installations (daemon may be overloaded)
 * ⚠️ SKIP during wake/sleep transitions (daemon may be busy with animation)
 * ⚠️ PAUSE when window is hidden (prevents false timeouts on Windows/Linux)
 *
 * Why /api/daemon/status instead of /health-check?
 * - /health-check only exists if --timeout-health-check is passed (not our case)
 * - /api/daemon/status is always available and very lightweight
 * - 10x lighter than /api/state/full (~200 bytes vs ~2-5KB)
 * - Faster detection of crashes (7.5s vs 15s)
 * - Better for WiFi connections
 * - Separation of concerns (health ≠ data)
 *
 * ⚡ IMPORTANT: Polling interval (2.5s) > timeout (1.33s) to avoid accumulation!
 * If interval = timeout, slow responses cause avalanche timeouts and false crashes.
 *
 * 🎯 MULTI-LAYER PROTECTION:
 * - macOS 14+: backgroundThrottling disabled in tauri.conf.json (native)
 * - All platforms: Pause polling when window hidden (JS fallback)
 * - All platforms: Pause during wake/sleep transitions
 */
export function useDaemonHealthCheck(isActive) {
  const { isDaemonCrashed, isWakeSleepTransitioning, incrementTimeouts, resetTimeouts } =
    useAppStore();

  // ✅ Event Bus for centralized event handling
  const eventBus = useDaemonEventBus();

  // 🎯 Track window visibility to pause health checks when not visible
  // This prevents false timeouts caused by browser/WebView throttling (Windows/Linux)
  // On macOS 14+, backgroundThrottling is disabled natively, but this adds extra safety
  const [isWindowVisible, setIsWindowVisible] = useState(() => {
    // Initialize based on current visibility state
    return typeof document !== 'undefined' ? document.visibilityState === 'visible' : true;
  });

  // Track if we were paused (to reset timeouts on resume)
  const wasPausedRef = useRef(false);

  // 👁️ Listen to visibility changes (tab hidden, window minimized, etc.)
  useEffect(() => {
    const handleVisibilityChange = () => {
      const visible = document.visibilityState === 'visible';
      setIsWindowVisible(visible);

      if (!visible) {
        wasPausedRef.current = true;
        console.log('👁️ Window hidden - pausing health check (fallback for Windows/Linux)');
      } else if (wasPausedRef.current) {
        // Reset timeouts when becoming visible again (prevent false crash from accumulated timeouts)
        console.log('👁️ Window visible - resuming health check, resetting timeout counter');
        resetTimeouts();
        wasPausedRef.current = false;
      }
    };

    // Also listen to window focus/blur as backup (some edge cases)
    const handleWindowBlur = () => {
      // Only pause if visibility API didn't catch it
      if (document.visibilityState === 'visible') {
        wasPausedRef.current = true;
        setIsWindowVisible(false);
        console.log('👁️ Window blur - pausing health check');
      }
    };

    const handleWindowFocus = () => {
      if (!isWindowVisible) {
        console.log('👁️ Window focus - resuming health check, resetting timeout counter');
        resetTimeouts();
        wasPausedRef.current = false;
        setIsWindowVisible(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [isWindowVisible, resetTimeouts]);

  useEffect(() => {
    if (!isActive) {
      // Nothing to do when daemon is not active
      return;
    }

    // Don't poll if daemon is already crashed
    if (isDaemonCrashed) {
      console.warn('⚠️ Daemon crashed, stopping health check polling');
      return;
    }

    // 👁️ Don't poll if window is not visible (prevents false timeouts)
    // This is critical for Windows/Linux where backgroundThrottling is not supported
    if (!isWindowVisible) {
      console.log('👁️ Health check paused (window not visible)');
      return;
    }

    // ⏸️ Pause health check during wake/sleep transitions
    // The daemon may be busy with animation and respond slowly
    if (isWakeSleepTransitioning) {
      return;
    }

    // ⚠️ Sanity check: if isActive but no connectionMode, force crash state
    // This can happen if state gets corrupted during rapid mode switching
    const { connectionMode } = useAppStore.getState();
    if (isActive && !connectionMode) {
      console.error(
        '🔴 Invalid state detected: isActive=true but connectionMode=null. Triggering crash...'
      );
      useAppStore.getState().transitionTo.crashed();
      return;
    }

    const performHealthCheck = async () => {
      try {
        const response = await fetchWithTimeoutSkipInstall(
          buildApiUrl('/api/daemon/status'),
          {},
          DAEMON_CONFIG.TIMEOUTS.HEALTHCHECK, // 1333ms
          { silent: true } // ⚡ Don't log (polling every 1.33s)
        );

        if (response.ok) {
          // ✅ Parse response to check backend_status
          const data = await response.json();

          // Check if backend has an error (USB disconnected, serial port error, etc.)
          if (data.backend_status?.error) {
            console.warn('⚠️ Backend error detected:', data.backend_status.error);
            incrementTimeouts();
            eventBus.emit('daemon:health:failure', {
              error: data.backend_status.error,
              type: 'backend_error',
            });
          } else {
            // ✅ Success → reset timeout counter for crash detection
            resetTimeouts();

            // ✅ Emit health success event to bus
            eventBus.emit('daemon:health:success', { timestamp: Date.now() });
          }
        } else {
          // Response but not OK → not a timeout, but still increment
          console.warn('⚠️ Health check responded but not OK:', response.status);
          incrementTimeouts();
          eventBus.emit('daemon:health:failure', {
            error: `HTTP ${response.status}`,
            type: 'http_error',
          });
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
          console.warn('⚠️ Health check failed (network error), incrementing counter');
          incrementTimeouts();
          // ✅ Emit health failure event to bus
          eventBus.emit('daemon:health:failure', {
            error: error.message || 'Network error',
            type: 'network',
          });
        } else {
          // Other error (not network related) - still increment for safety
          console.warn('⚠️ Health check error:', error.message);
          incrementTimeouts();
          // ✅ Emit health failure event to bus
          eventBus.emit('daemon:health:failure', {
            error: error.message,
            type: 'error',
          });
        }
      }
    };

    // Perform initial health check
    performHealthCheck();

    // ✅ Poll every 2.5s (HEALTHCHECK_POLLING interval)
    // ⚡ IMPORTANT: Must be LONGER than HEALTHCHECK timeout (1.33s) to avoid accumulation
    const interval = setInterval(performHealthCheck, DAEMON_CONFIG.INTERVALS.HEALTHCHECK_POLLING);

    return () => {
      clearInterval(interval);
    };
  }, [isActive, isDaemonCrashed, isWakeSleepTransitioning, isWindowVisible]); // Removed setters from deps - Zustand setters are stable
}
