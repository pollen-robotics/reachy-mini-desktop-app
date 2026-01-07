import { useEffect } from 'react';
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
 * - Fetching robot state data (that's useRobotState's job)
 * - Transitioning to ready (that's HardwareScanView's job)
 *
 * ⚠️ SKIP during installations (daemon may be overloaded)
 * ⚠️ SKIP during wake/sleep transitions (daemon may be busy with animation)
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
 */
export function useDaemonHealthCheck(isActive) {
  const { isDaemonCrashed, isWakeSleepTransitioning, incrementTimeouts, resetTimeouts } =
    useAppStore();

  // ✅ Event Bus for centralized event handling
  const eventBus = useDaemonEventBus();

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
  }, [isActive, isDaemonCrashed, isWakeSleepTransitioning]); // Removed setters from deps - Zustand setters are stable
}
