/**
 * Poll the daemon's central-robot-status proxy endpoint.
 *
 * The daemon holds the user's HF token and forwards the query to the
 * central signaling server. The response tells us, for each of the user's
 * robots, whether it's currently held by a remote JS app — so we can show
 * a busy badge in the header and block local app runs that would fight
 * the remote session over the robot's single control slot.
 *
 * This hook writes its result to the global store (`centralRobotStatus`)
 * so the badge and gate can read it without prop-drilling or duplicate
 * polling. Only one instance of this hook should be mounted.
 */
import { useEffect, useRef } from 'react';
import { fetchWithTimeout, buildApiUrl, DAEMON_CONFIG } from '@config/daemon';
import useAppStore from '../../store/useAppStore';

const POLL_INTERVAL_MS = 5000;

export function useCentralRobotStatus({ enabled = true } = {}) {
  const setCentralRobotStatus = useAppStore(state => state.setCentralRobotStatus);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      // Reset to neutral state so stale data doesn't leak into the UI
      // after logout / disconnect.
      setCentralRobotStatus({ available: false, robots: [] });
      return undefined;
    }

    let cancelled = false;

    const tick = async () => {
      try {
        const response = await fetchWithTimeout(
          buildApiUrl('/api/hf-auth/central-robot-status'),
          {},
          DAEMON_CONFIG.TIMEOUTS.COMMAND,
          { silent: true }
        );

        if (cancelled || !mountedRef.current) return;

        if (!response.ok) {
          // Daemon endpoint missing (older daemon) — treat as unavailable.
          setCentralRobotStatus({ available: false, robots: [] });
          return;
        }

        const data = await response.json();
        if (cancelled || !mountedRef.current) return;

        setCentralRobotStatus({
          available: Boolean(data.available),
          robots: Array.isArray(data.robots) ? data.robots : [],
        });
      } catch {
        // Silent: network blip, daemon restarting, etc. Next tick retries.
        if (!cancelled && mountedRef.current) {
          setCentralRobotStatus({ available: false, robots: [] });
        }
      }
    };

    // Fire once immediately so the badge isn't blank for 5 s after load,
    // then poll on an interval.
    tick();
    const interval = setInterval(tick, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [enabled, setCentralRobotStatus]);
}

/**
 * Derived: is any of the user's robots currently busy with a remote app?
 *
 * Returns `{ isBusy, activeApp }`. When the central is unreachable or the
 * user isn't authenticated, `isBusy` is `false` (don't block the user on
 * unknown state).
 */
export function selectCentralBusy(state) {
  const status = state.centralRobotStatus;
  if (!status || !status.available) return { isBusy: false, activeApp: null };
  const busyRobot = status.robots.find(r => r && r.busy);
  if (!busyRobot) return { isBusy: false, activeApp: null };
  return {
    isBusy: true,
    activeApp: busyRobot.activeApp || 'another app',
    robotName: busyRobot.robotName || null,
  };
}
