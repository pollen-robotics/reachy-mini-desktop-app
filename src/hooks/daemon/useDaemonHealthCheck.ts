import { useEffect } from 'react';
import useAppStore from '../../store/useAppStore';
import {
  DAEMON_CONFIG,
  fetchWithTimeoutSkipInstall,
  buildApiUrl,
  isWiFiMode,
} from '../../config/daemon';
import { useDaemonEventBus } from './useDaemonEventBus';
import { useWindowVisible } from '../system/useWindowVisible';

/**
 * Failure reason categories reported alongside incrementTimeouts() and
 * emitted through the daemon event bus.
 */
type HealthFailureType = 'timeout' | 'network' | 'http_error' | 'backend_error' | 'unknown';

/**
 * Minimal shape we care about from GET /api/daemon/status.
 * The daemon returns more fields (version, etc.) but only `backend_status.error`
 * drives our decision here.
 */
interface DaemonStatusPayload {
  backend_status?: {
    error?: string | null;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
}

/**
 * 🎯 Centralized hook for daemon health checking
 *
 * Responsibilities (SINGLE RESPONSIBILITY):
 * 1. GET /api/daemon/status periodically when isActive=true
 * 2. Health check: count consecutive timeouts → trigger crash if 4+ failures
 * 3. Emit health events to the event bus
 *
 * NOT responsible for:
 * - Fetching robot state data (that's useRobotStateWebSocket's job)
 * - Transitioning to ready (that's StartupScanView's job)
 *
 * ⚠️ SKIP during installations (daemon may be overloaded)
 * ⚠️ SKIP during wake/sleep transitions (daemon may be busy with animation)
 * ⚠️ PAUSE when window is hidden (prevents false timeouts on Windows/Linux)
 *
 * Why /api/daemon/status instead of /health-check?
 * - /health-check only exists if --timeout-health-check is passed (not our case)
 * - /api/daemon/status is always available and very lightweight
 * - 10x lighter than /api/state/full (~200 bytes vs ~2-5KB)
 * - Separation of concerns (health ≠ data)
 *
 * 🌐 WiFi-aware timings:
 * - USB: timeout 2s, polling 3s → crash detection in ~12s (4 × 3s)
 * - WiFi: timeout 3.5s, polling 5s → crash detection in ~20s (4 × 5s)
 *
 * ⚡ IMPORTANT: Polling interval > timeout to avoid request accumulation!
 *
 * 🎯 MULTI-LAYER PROTECTION:
 * - macOS 14+: backgroundThrottling disabled in tauri.conf.json (native)
 * - All platforms: Pause polling when window hidden (JS fallback)
 * - All platforms: Pause during wake/sleep transitions
 */
export function useDaemonHealthCheck(isActive: boolean): void {
  const { isDaemonCrashed, isWakeSleepTransitioning, incrementTimeouts, resetTimeouts } =
    useAppStore();

  const eventBus = useDaemonEventBus();

  // Pause health checks when window is hidden; reset timeouts on resume
  const isWindowVisible = useWindowVisible(resetTimeouts);

  useEffect(() => {
    if (!isActive) {
      // Nothing to do when daemon is not active
      return;
    }

    // Don't poll if daemon is already crashed
    if (isDaemonCrashed) {
      return;
    }

    // 👁️ Don't poll if window is not visible (prevents false timeouts)
    // This is critical for Windows/Linux where backgroundThrottling is not supported
    if (!isWindowVisible) {
      return;
    }

    // ⏸️ Pause health check during wake/sleep transitions
    // The daemon may be busy with animation and respond slowly
    if (isWakeSleepTransitioning) {
      return;
    }

    // ⚠️ Sanity check: if isActive but no connectionMode, force crash state.
    // This can happen if state gets corrupted during rapid mode switching.
    const { connectionMode } = useAppStore.getState();
    if (isActive && !connectionMode) {
      useAppStore.getState().transitionTo.crashed();
      return;
    }

    // 🌐 WiFi-aware timeouts: higher latency on wireless connections
    const wifi = isWiFiMode();
    const healthTimeout: number = wifi
      ? DAEMON_CONFIG.TIMEOUTS.HEALTHCHECK_WIFI
      : DAEMON_CONFIG.TIMEOUTS.HEALTHCHECK;
    const pollingInterval: number = wifi
      ? DAEMON_CONFIG.INTERVALS.HEALTHCHECK_POLLING_WIFI
      : DAEMON_CONFIG.INTERVALS.HEALTHCHECK_POLLING;

    // 🎯 Dedicated AbortController for cleanup (unmount / dependency change).
    // This lets us distinguish cleanup aborts from timeout aborts in fetchWithTimeout.
    const cleanupController = new AbortController();

    const emitFailure = (error: string, type: HealthFailureType): void => {
      eventBus.emit('daemon:health:failure', { error, type });
    };

    const performHealthCheck = async (): Promise<void> => {
      // Don't run if cleanup has been triggered
      if (cleanupController.signal.aborted) return;

      try {
        const response: Response = await fetchWithTimeoutSkipInstall(
          buildApiUrl('/api/daemon/status'),
          { signal: cleanupController.signal },
          healthTimeout,
          { silent: true }
        );

        if (response.ok) {
          // ✅ Parse response to check backend_status
          const data = (await response.json()) as DaemonStatusPayload;

          // Check if backend has an error (USB disconnected, serial port error, etc.)
          if (data.backend_status?.error) {
            incrementTimeouts('backend_error');
            emitFailure(data.backend_status.error, 'backend_error');
          } else {
            // ✅ Success → reset timeout counter for crash detection
            resetTimeouts();
            eventBus.emit('daemon:health:success', { timestamp: Date.now() });
          }
        } else {
          // Response but not OK → not a timeout, but still increment
          incrementTimeouts('http_error');
          emitFailure(`HTTP ${response.status}`, 'http_error');
        }
      } catch (error: unknown) {
        const name = (error as { name?: string } | null)?.name;
        const message = (error as { message?: string } | null)?.message ?? '';

        // Skip during installation (expected)
        if (name === 'SkippedError') {
          return;
        }

        // ✅ Only ignore AbortError caused by cleanup (unmount / dependency change).
        // Timeout-caused AbortErrors must still increment the counter!
        if (cleanupController.signal.aborted) {
          return;
        }

        // ❌ Timeout or network error → increment counter for crash detection
        // AbortError from fetchWithTimeout = fetch timed out (daemon too slow)
        // TimeoutError / "Load failed" / "Could not connect" = network failure
        const isTimeoutOrNetworkError =
          name === 'AbortError' ||
          name === 'TimeoutError' ||
          message.includes('timed out') ||
          message.includes('Load failed') ||
          message.includes('Could not connect') ||
          message.includes('NetworkError') ||
          message.includes('Failed to fetch');

        if (isTimeoutOrNetworkError) {
          const failureType: HealthFailureType = name === 'AbortError' ? 'timeout' : 'network';
          incrementTimeouts(failureType);
          emitFailure(message || name || 'Network error', failureType);
        } else {
          // Other error (not network related) - still increment for safety
          incrementTimeouts('unknown');
          emitFailure(message, 'unknown');
        }
      }
    };

    // Perform initial health check
    performHealthCheck();

    // ✅ Poll at WiFi-aware interval (USB: 3s, WiFi: 5s)
    // ⚡ IMPORTANT: Must be LONGER than timeout to avoid request accumulation
    const interval = setInterval(performHealthCheck, pollingInterval);

    return () => {
      cleanupController.abort();
      clearInterval(interval);
    };
    // Zustand setters are stable - intentionally omitted from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, isDaemonCrashed, isWakeSleepTransitioning, isWindowVisible]);
}
