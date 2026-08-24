import { useCallback } from 'react';
import useAppStore from '../../../store/useAppStore';
import { useAppFetching, mergeAppsData } from '../../active-robot/application-store/hooks';
import type { DaemonStep } from '../components/ScanStepsIndicator';

// Tuning knobs for the "wait for WS stable frames" loop.
const WS_STABLE_FRAMES = 3;
const WS_CHECK_INTERVAL_MS = 50;
const WS_TIMEOUT_MS = 3000;
// Small grace period so users see the "completed" state before we swap views.
const COMPLETION_HOLD_MS = 1200;

export interface UsePostReadySequenceParams {
  setShouldStreamRobotState: (v: boolean) => void;
  setAvailableApps: (apps: unknown[]) => void;
  setInstalledApps: (apps: unknown[]) => void;
  setAppsLoading: (v: boolean) => void;
  setWaitingForDaemon: (v: boolean) => void;
  setWaitingForWebSocket: (v: boolean) => void;
  setWaitingForApps: (v: boolean) => void;
  setDaemonStep: (v: DaemonStep) => void;
  onScanComplete?: () => void;
}

/**
 * Orchestrate everything that must happen AFTER `daemon:ready` fires, before
 * we hand control to `ActiveRobotView`:
 *
 *   1. Start the robot-state WebSocket stream.
 *   2. Wait for a few stable frames so we know we have fresh data.
 *   3. Pre-fetch available + installed apps (avoids a loading flash).
 *   4. Hold the "completed" state briefly and invoke the parent callback.
 *
 * The returned callback is idempotent from the caller's perspective (the
 * calling effect guards against re-entry).
 */
export function usePostReadySequence(params: UsePostReadySequenceParams): () => Promise<void> {
  const {
    setShouldStreamRobotState,
    setAvailableApps,
    setInstalledApps,
    setAppsLoading,
    setWaitingForDaemon,
    setWaitingForWebSocket,
    setWaitingForApps,
    setDaemonStep,
    onScanComplete,
  } = params;

  const { fetchAppsFromWebsite, fetchInstalledApps } = useAppFetching();

  return useCallback(async () => {
    setWaitingForDaemon(false);
    setWaitingForWebSocket(true);
    setDaemonStep('syncing');

    // Start the WS stream so ActiveRobotView has fresh data on mount.
    setShouldStreamRobotState(true);

    await waitForStableWebSocketFrames();

    setWaitingForWebSocket(false);

    // Pre-fetch the app catalog so ActiveRobotView doesn't show a loading flash.
    setWaitingForApps(true);
    setDaemonStep('loading_apps');

    try {
      setAppsLoading(true);
      const [websiteResult, installedResult] = await Promise.allSettled([
        fetchAppsFromWebsite(),
        fetchInstalledApps(),
      ]);

      const availableFromWebsite =
        websiteResult.status === 'fulfilled'
          ? ((websiteResult.value as unknown[] | undefined) ?? [])
          : [];
      const installedFromDaemon =
        installedResult.status === 'fulfilled'
          ? ((installedResult.value as { apps?: unknown[] } | undefined)?.apps ?? [])
          : [];

      const { enrichedApps, installedApps } = (
        mergeAppsData as (
          available: unknown[],
          installed: unknown[]
        ) => { enrichedApps: unknown[]; installedApps: unknown[] }
      )(availableFromWebsite, installedFromDaemon);

      setAvailableApps(enrichedApps);
      setInstalledApps(installedApps);

      // If the website fetch failed, don't cache an incomplete catalog.
      if (availableFromWebsite.length === 0 && installedFromDaemon.length > 0) {
        (useAppStore.getState() as { invalidateAppsCache: () => void }).invalidateAppsCache();
      }
    } catch {
      // Apps will be refetched in ActiveRobotView.
    } finally {
      setAppsLoading(false);
      // Intentionally keep `waitingForApps=true` until the hold delay below
      // so the indicator doesn't flash back to "Connect" during the transition.
    }

    await new Promise<void>(resolve => setTimeout(resolve, COMPLETION_HOLD_MS));

    setWaitingForApps(false);
    onScanComplete?.();
  }, [
    fetchAppsFromWebsite,
    fetchInstalledApps,
    onScanComplete,
    setAppsLoading,
    setAvailableApps,
    setDaemonStep,
    setInstalledApps,
    setShouldStreamRobotState,
    setWaitingForApps,
    setWaitingForDaemon,
    setWaitingForWebSocket,
  ]);
}

/**
 * Poll the zustand store until we've seen `WS_STABLE_FRAMES` frames with the
 * expected head pose/joints shape, so ActiveRobotView mounts with fresh data.
 * Bails out on `WS_TIMEOUT_MS` either way.
 */
async function waitForStableWebSocketFrames(): Promise<void> {
  const wsStartTime = Date.now();

  return new Promise<void>(resolve => {
    const check = () => {
      const state = useAppStore.getState() as {
        robotStateFull?: {
          data?: {
            dataVersion?: number;
            head_joints?: number[];
            head_pose?: number[];
          };
        };
      };
      const data = state.robotStateFull?.data;
      const dataVersion = data?.dataVersion;
      const hasHeadJoints = Array.isArray(data?.head_joints) && data.head_joints.length === 7;
      const hasHeadPose = Array.isArray(data?.head_pose) && data.head_pose.length === 16;
      const elapsed = Date.now() - wsStartTime;

      if (
        (dataVersion !== undefined &&
          dataVersion >= WS_STABLE_FRAMES &&
          hasHeadJoints &&
          hasHeadPose) ||
        elapsed > WS_TIMEOUT_MS
      ) {
        resolve();
        return;
      }

      setTimeout(check, WS_CHECK_INTERVAL_MS);
    };
    check();
  });
}
