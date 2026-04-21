import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { Box, Typography } from '@mui/material';
import { useShallow } from 'zustand/react/shallow';
import { invoke } from '@tauri-apps/api/core';
import useAppStore from '../../store/useAppStore';
import type { FullAppState } from '../../store/useStore';
import {
  HARDWARE_ERROR_CONFIGS,
  getErrorMeshes,
  type HardwareErrorConfig as HardwareErrorConfigBase,
  type MeshLike,
  type RobotRefLike,
} from '../../utils/hardwareErrors';
import { useDaemonStartupLogs } from '../../hooks/daemon/useDaemonStartupLogs';
import { useDaemonEventBus } from '../../hooks/daemon/useDaemonEventBus';
import reachySetupSvg from '../../assets/reachy-how-to-create-app.svg';
import {
  BootstrapOverlay,
  ScanErrorDisplay,
  ScanStepsIndicator,
  StartupLogsPanel,
} from './components';
import type { DaemonStep } from './components/ScanStepsIndicator';
import {
  useBootstrapDetection,
  usePostReadySequence,
  useScanProgress,
  useStartupElapsed,
} from './hooks';

type HardwareErrorConfig = HardwareErrorConfigBase;

export interface StartupViewProps {
  startupError?: unknown;
  onScanComplete?: () => void;
  startDaemon?: () => Promise<void> | void;
}

/**
 * Startup phase of the app: orchestrates bootstrap detection / daemon
 * readiness / post-ready pipeline, and surfaces errors through the hard-hat
 * Reachy illustration + retry UI.
 *
 * The heavy lifting is split into focused hooks and sub-components:
 *   - `useBootstrapDetection`  : decides if we're in first-run setup
 *   - `useStartupElapsed`      : elapsed seconds + progressive messages
 *   - `useScanProgress`        : throttled scan-mesh tracking (kept for when
 *                                 the 3D scan viewer is re-enabled)
 *   - `usePostReadySequence`   : WS stable frames + WASM + apps pre-fetch
 *   - `BootstrapOverlay`       : "Setting things up" UI during bootstrap
 *   - `StartupLogsPanel`       : bottom mini-console + fullscreen overlay
 */
export default function StartupView({
  startupError,
  onScanComplete: onScanCompleteCallback,
  startDaemon,
}: StartupViewProps): React.ReactElement {
  // ─── Store bindings ───────────────────────────────────────────────
  const {
    setHardwareError,
    setStartupError,
    darkMode,
    transitionTo,
    robotStatus,
    setShouldStreamRobotState,
    setAvailableApps,
    setInstalledApps,
    setAppsLoading,
    resetAll,
    connectionMode,
  } = useAppStore(
    useShallow((state: FullAppState) => {
      const s = state as unknown as Record<string, unknown>;
      return {
        setHardwareError: s.setHardwareError,
        setStartupError: s.setStartupError,
        darkMode: s.darkMode,
        transitionTo: s.transitionTo,
        robotStatus: s.robotStatus,
        setShouldStreamRobotState: s.setShouldStreamRobotState,
        setAvailableApps: s.setAvailableApps,
        setInstalledApps: s.setInstalledApps,
        setAppsLoading: s.setAppsLoading,
        resetAll: s.resetAll,
        connectionMode: s.connectionMode,
      };
    })
  ) as {
    setHardwareError: (err: unknown) => void;
    setStartupError: (err: unknown) => void;
    darkMode: boolean;
    transitionTo: { ready: () => void; starting: () => void; [key: string]: () => void };
    robotStatus: string;
    setShouldStreamRobotState: (v: boolean) => void;
    setAvailableApps: (apps: unknown[]) => void;
    setInstalledApps: (apps: unknown[]) => void;
    setAppsLoading: (v: boolean) => void;
    resetAll: () => void;
    connectionMode: string | null;
  };

  const isStarting = robotStatus === 'starting';
  const eventBus = useDaemonEventBus();

  // ─── Focused hooks ────────────────────────────────────────────────
  const { logs: startupLogs } = useDaemonStartupLogs(isStarting);
  const { isBootstrapping, bootstrapMessage } = useBootstrapDetection(isStarting);
  const { getProgressiveMessage, reset: resetElapsed } = useStartupElapsed(isStarting);
  const {
    scanProgress,
    handleScanMesh,
    markComplete: markScanProgressComplete,
    reset: resetScanProgress,
  } = useScanProgress();

  // ─── Local UI state ───────────────────────────────────────────────
  const [scanError, setScanError] = useState<unknown>(null);
  void setScanError; // reserved for future scan-time failures.
  const [errorMesh, setErrorMesh] = useState<unknown>(null);
  const [allMeshes, setAllMeshes] = useState<MeshLike[]>([]);
  const [isRetrying, setIsRetrying] = useState<boolean>(false);
  const [logsExpanded, setLogsExpanded] = useState<boolean>(false);
  const [scanComplete, setScanComplete] = useState<boolean>(false);

  // Legacy flags kept alive for ScanStepsIndicator / progressive messages.
  const [waitingForDaemon, setWaitingForDaemon] = useState<boolean>(false);
  const [waitingForWebSocket, setWaitingForWebSocket] = useState<boolean>(false);
  const [waitingForApps, setWaitingForApps] = useState<boolean>(false);
  const [daemonStep, setDaemonStep] = useState<DaemonStep>('connecting');

  // Readiness gates: both must flip true before the post-ready sequence runs.
  const [daemonReady, setDaemonReady] = useState<boolean>(false);
  const [scanAnimationDone, setScanAnimationDone] = useState<boolean>(false);
  const postReadyStartedRef = useRef<boolean>(false);
  const robotRefRef = useRef<RobotRefLike | null>(null);
  void robotRefRef;

  // ─── Derived error state ──────────────────────────────────────────
  const errorConfig = useMemo<HardwareErrorConfig | null>(() => {
    if (!startupError || typeof startupError !== 'object') return null;
    const configs = HARDWARE_ERROR_CONFIGS as unknown as Record<string, HardwareErrorConfig>;
    const key = Object.keys(configs).find(
      k => configs[k].type === (startupError as { type?: string }).type
    );
    return key ? (configs[key] ?? null) : null;
  }, [startupError]);

  // When the scan/startup fails we swap the 3D viewer for the hard-hat
  // Reachy illustration - it communicates the error state much better than
  // a frozen URDF model and avoids paying the rendering cost.
  const hasError = Boolean(startupError || scanError);

  // Pull a single "probable cause" line out of the collected startup logs so
  // the error card can surface WHY the daemon died (GStreamer assertion,
  // Python traceback, permission denied, ...) without forcing the user to
  // open the fullscreen logs overlay. We scan backwards from the most
  // recent line and prefer error-looking content; if none matches we fall
  // back to the very last line (which is often the crash tail).
  const liveProbableCause = useMemo<string | null>(() => {
    if (!hasError || startupLogs.length === 0) return null;

    const ERROR_HINT =
      /(\b(ERROR|CRITICAL|FATAL|Traceback|Exception)\b|\b\w+(?:Error|Exception):|\b(failed|refused|denied|not\s+found|unable)\b)/i;

    // Logger framing noise we don't want to pollute the card with:
    // "2024-... uvicorn.error ERROR: ...", "[daemon] ERROR:", etc.
    const cleanPrefix = (raw: string): string =>
      raw
        .replace(/^\s*\[?\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?\]?\s*/, '')
        .replace(/^\[\d{2}:\d{2}:\d{2}(?:[.,]\d+)?\]\s*/, '')
        .replace(/^\[[^\]]+\]\s*/, '')
        .replace(/^(INFO|WARNING|WARN|ERROR|CRITICAL|FATAL|DEBUG)\s*[:\-]?\s*/i, '')
        .trim();

    for (let i = startupLogs.length - 1; i >= 0; i--) {
      const raw = startupLogs[i]?.message ?? '';
      if (ERROR_HINT.test(raw)) {
        const cleaned = cleanPrefix(raw);
        return cleaned || raw;
      }
    }

    const tail = startupLogs[startupLogs.length - 1]?.message ?? '';
    const cleanedTail = cleanPrefix(tail);
    return cleanedTail || tail || null;
  }, [hasError, startupLogs]);

  // Freeze `probableCause` at the moment the error appears.
  // Otherwise, once the user clicks "Try Again", the daemon keeps emitting
  // lines (the stop/start dance takes ~1s while the error card is still
  // mounted in `isRetrying` state) and `liveProbableCause` would re-evaluate
  // against the *new* attempt's logs, making the card silently flip to an
  // unrelated message. We snapshot the cause on the false->true transition
  // of `hasError` and clear it when the error is dismissed, so the text
  // stays stable for the duration of a single error session.
  const [frozenProbableCause, setFrozenProbableCause] = useState<string | null>(null);
  const prevHasErrorRef = useRef<boolean>(false);
  useEffect(() => {
    if (hasError && !prevHasErrorRef.current) {
      setFrozenProbableCause(liveProbableCause);
    } else if (!hasError && prevHasErrorRef.current) {
      setFrozenProbableCause(null);
    }
    prevHasErrorRef.current = hasError;
  }, [hasError, liveProbableCause]);

  // Prefer the frozen snapshot, but fall back to the live value for the
  // single render that happens before the effect above has had a chance
  // to commit on the very first error tick.
  const probableCause = frozenProbableCause ?? liveProbableCause;

  // Find which meshes should be highlighted when an error is active.
  useEffect(() => {
    if (!errorConfig || allMeshes.length === 0) {
      setErrorMesh(null);
      return;
    }
    const meshes = getErrorMeshes(errorConfig, robotRefRef.current, allMeshes);
    setErrorMesh(meshes && meshes.length > 0 ? meshes[0] : null);
  }, [errorConfig, allMeshes]);

  const handleMeshesReady = useCallback((meshes: MeshLike[]) => {
    setAllMeshes(meshes);
  }, []);

  // ─── Post-ready pipeline ──────────────────────────────────────────
  const runPostReadySequence = usePostReadySequence({
    setShouldStreamRobotState,
    setAvailableApps,
    setInstalledApps,
    setAppsLoading,
    setWaitingForDaemon,
    setWaitingForWebSocket,
    setWaitingForApps,
    setDaemonStep,
    onScanComplete: onScanCompleteCallback,
  });

  // Listen for the single "daemon is ready" signal from useDaemonLifecycle.
  useEffect(() => {
    if (!isStarting) return;
    return eventBus.on('daemon:ready', () => setDaemonReady(true));
  }, [isStarting, eventBus]);

  // Drive the "Healthcheck" step: once the scan finished but the daemon
  // isn't ready yet, show "detecting".
  useEffect(() => {
    if (!isStarting) return;
    if (scanAnimationDone && !daemonReady) {
      setWaitingForDaemon(true);
      setDaemonStep('detecting');
    }
  }, [isStarting, scanAnimationDone, daemonReady]);

  // Kick off post-ready once both gates are open (idempotent via the ref guard).
  useEffect(() => {
    if (!daemonReady || !scanAnimationDone) return;
    if (postReadyStartedRef.current) return;
    postReadyStartedRef.current = true;
    runPostReadySequence();
  }, [daemonReady, scanAnimationDone, runPostReadySequence]);

  // ─── Scan animation lifecycle ─────────────────────────────────────
  const handleScanComplete = useCallback(() => {
    if (scanAnimationDone) return;

    const currentState = useAppStore.getState() as { hardwareError?: unknown };
    const hasStartupErrObj =
      !!startupError &&
      typeof startupError === 'object' &&
      !!(startupError as { type?: unknown }).type;
    if (currentState.hardwareError || hasStartupErrObj) return;

    markScanProgressComplete();
    setScanComplete(true);
    setScanAnimationDone(true);
  }, [scanAnimationDone, startupError, markScanProgressComplete]);

  // With the 3D scan viewer removed from this view, nothing calls
  // `handleScanComplete` on its own anymore. Flip the scan gate as soon as
  // we know we're not in bootstrap/error territory so `usePostReadySequence`
  // can still run once the daemon is ready.
  useEffect(() => {
    if (isBootstrapping !== false) return;
    if (hasError) return;
    if (scanAnimationDone) return;
    handleScanComplete();
  }, [isBootstrapping, hasError, scanAnimationDone, handleScanComplete]);

  // ─── Retry ────────────────────────────────────────────────────────
  const handleRetry = useCallback(async () => {
    setIsRetrying(true);

    try {
      await invoke('stop_daemon');
      await new Promise<void>(resolve => setTimeout(resolve, 1000));

      setErrorMesh(null);
      setScanComplete(false);
      setWaitingForDaemon(false);
      setWaitingForWebSocket(false);
      setWaitingForApps(false);
      setShouldStreamRobotState(false);
      setDaemonStep('connecting');
      setDaemonReady(false);
      setScanAnimationDone(false);
      postReadyStartedRef.current = false;
      resetScanProgress();
      resetElapsed();

      // CRITICAL: reset BOTH hardwareError and startupError. `daemonErrorHandler`
      // writes to both, and `useViewRouter` passes `hardwareError || startupError`
      // down to this view - leaving `startupError` stale would keep the error
      // branch active even after a successful restart.
      setHardwareError(null);
      setStartupError(null);

      if (startDaemon) {
        transitionTo.starting();
        await startDaemon();
        setIsRetrying(false);
      } else {
        window.location.reload();
      }
    } catch {
      setIsRetrying(false);
      // Keep the scan view active; startDaemon will re-surface the error
      // through its own error handler if it still fails.
    }
  }, [
    transitionTo,
    startDaemon,
    setShouldStreamRobotState,
    setHardwareError,
    setStartupError,
    resetScanProgress,
    resetElapsed,
  ]);

  // ─── Render ───────────────────────────────────────────────────────
  const progressiveMessage = getProgressiveMessage();
  const showProgressiveMessage =
    (waitingForDaemon || waitingForWebSocket) && Boolean(progressiveMessage);

  // Human-readable label for the active connection mode, shown under the
  // main "Connecting to Reachy Mini" title so the user always knows WHICH
  // transport is being brought up (useful when debugging mode switches).
  const connectionModeLabel = useMemo<string | null>(() => {
    switch (connectionMode) {
      case 'usb':
        return 'via USB';
      case 'wifi':
        return 'via Wi-Fi';
      case 'simulation':
        return 'in simulation';
      case 'external':
        return 'to external daemon';
      default:
        return null;
    }
  }, [connectionMode]);

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        px: 4,
        mt: 2,
        bgcolor: 'transparent',
        position: 'relative',
      }}
    >
      {/*
       * Only show BootstrapOverlay when we've confirmed bootstrap is
       * happening (`isBootstrapping === true`). Showing it during the
       * brief `null` detection window would create a visible flicker on
       * every connection (common path: no first-run setup).
       *
       * Error state lives inside the status card (ScanErrorDisplay)
       * below - the illustration is part of the card now so the whole
       * thing reads as one coherent unit instead of two stacked blocks.
       */}
      {isBootstrapping === true ? (
        <BootstrapOverlay
          darkMode={darkMode}
          isBootstrapping={isBootstrapping}
          bootstrapMessage={bootstrapMessage}
        />
      ) : null}

      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          maxWidth: '450px',
          // On error we let the card grow naturally (illustration + title
          // + subtitle + strip + CTA don't fit in 100 px); on the nominal
          // path we keep the fixed height so the stepper doesn't jump
          // when the progressive message appears/disappears. The extra
          // headroom accounts for the "Connecting to Reachy Mini" title
          // block we now render above the stepper.
          height: hasError ? 'auto' : '160px',
        }}
      >
        {!isBootstrapping && (startupError || scanError) ? (
          <ScanErrorDisplay
            error={startupError as never}
            scanError={scanError as never}
            isRetrying={isRetrying}
            onRetry={handleRetry}
            onBack={resetAll}
            darkMode={darkMode}
            illustrationSrc={reachySetupSvg}
            connectionMode={connectionMode}
            probableCause={probableCause}
            logs={startupLogs}
          />
        ) : isBootstrapping ? null : (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 1,
              width: '100%',
              maxWidth: '340px',
              px: 1,
            }}
          >
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 0.25,
                mb: 1.5,
                textAlign: 'center',
              }}
            >
              <Typography
                component="h1"
                sx={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: darkMode ? '#e5e5e5' : '#1a1a1a',
                  lineHeight: 1.3,
                }}
              >
                Connecting to Reachy Mini
              </Typography>
              {connectionModeLabel ? (
                <Typography
                  sx={{
                    fontSize: 12,
                    fontWeight: 400,
                    color: darkMode ? '#888' : '#888',
                    lineHeight: 1.3,
                  }}
                >
                  {connectionModeLabel}
                </Typography>
              ) : null}
            </Box>

            <ScanStepsIndicator
              scanComplete={scanComplete}
              waitingForDaemon={waitingForDaemon}
              waitingForWebSocket={waitingForWebSocket}
              waitingForApps={waitingForApps}
              daemonStep={daemonStep}
              darkMode={darkMode}
              scanProgress={scanProgress as unknown as number}
            />

            {showProgressiveMessage && (
              <Typography
                sx={{
                  fontSize: 10,
                  fontWeight: 400,
                  color: darkMode ? '#555' : '#aaa',
                  mt: 1,
                  fontStyle: 'italic',
                  textAlign: 'center',
                }}
              >
                {progressiveMessage}
              </Typography>
            )}
          </Box>
        )}
      </Box>

      <StartupLogsPanel
        logs={startupLogs as unknown[]}
        darkMode={darkMode}
        prominentMini={Boolean(isBootstrapping)}
        hasError={hasError}
        expanded={logsExpanded}
        onExpand={() => setLogsExpanded(true)}
        onClose={() => setLogsExpanded(false)}
      />
    </Box>
  );
}
