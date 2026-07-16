import React, { useState, useCallback, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { Box, Typography, Button, CircularProgress } from '@mui/material';
import useDaemonLogStream from '../../hooks/useDaemonLogStream';
import { useResizeObserver } from '../../hooks/useResizeObserver';
import { logInfo } from '../../utils/logging';
import FullscreenOverlayUntyped from '../../components/FullscreenOverlay';
import Viewer3DUntyped from '../../components/viewer3d';
import CameraFeed from './camera/CameraFeed';
import { ViewportSwapper } from './layout';
import LogConsoleUntyped from '@components/LogConsole';
import { RightPanel } from './right-panel';
import RobotHeader from './RobotHeader';
import { PowerButton } from './controls';
import AudioControls from './audio/AudioControls';

// TODO(ts): The following components live outside this agent's migration scope
// and either expose `.jsx`/`unknown`-typed props; cast locally to `React.FC` shapes
// that match the real runtime call signatures we have always used.
const FullscreenOverlay = FullscreenOverlayUntyped as unknown as React.FC<{
  open: boolean;
  onClose: () => void;
  children?: React.ReactNode;
  darkMode?: boolean;
  zIndex?: number;
  showCloseButton?: boolean;
  backdropBlur?: number;
  backdropOpacity?: number;
  centered?: boolean;
  centeredX?: boolean;
  centeredY?: boolean;
  onBackdropClick?: () => void;
  hidden?: boolean;
  keepMounted?: boolean;
  debugName?: string;
}>;
const Viewer3D = Viewer3DUntyped as unknown as React.FC<{
  isActive?: boolean;
  forceLoad?: boolean;
  showStatusTag?: boolean;
  isOn?: boolean | null;
  isMoving?: boolean;
  robotStatus?: unknown;
  busyReason?: unknown;
  hideCameraFeed?: boolean;
}>;
const LogConsole = LogConsoleUntyped as unknown as React.FC<{
  logs?: unknown;
  darkMode?: boolean;
  maxHeight?: number | string;
  height?: number | string;
  compact?: boolean;
  fullSize?: boolean;
  onExpand?: () => void;
}>;
import { useRobotPowerState, useRobotMovementStatus } from './hooks';
import { useAudioControls } from './audio/hooks';
import { useAppLogs, useApps, useAppHandlers } from './application-store/hooks';
import { useActiveRobotContext } from './context';
import {
  CHOREOGRAPHY_DATASETS,
  QUICK_ACTIONS,
  getDanceDataset,
  type QuickAction,
} from '../../constants/choreographies';
import { WebRTCStreamProvider } from '../../contexts/WebRTCStreamContext';
import { useToast } from '../../hooks/useToast';
import ConnectionLostIllustration from '../../assets/connection-lost.svg';
import useAppStore from '../../store/useAppStore';
import type { FullAppState } from '../../store/useStore';
import type { DaemonLogSource } from '../../hooks/useDaemonLogStream';
import { useShallow } from 'zustand/react/shallow';
import { blackAlpha } from '@styles/tokens';
import { BLUR, FONT_WEIGHT, RADIUS, TYPO, useAppPalette } from '@styles';

export interface ActiveRobotViewProps {
  isActive: boolean;
  isStarting: boolean;
  isStopping: boolean;
  stopDaemon: () => Promise<void> | void;
  sendCommand: (...args: unknown[]) => unknown;
  playRecordedMove: (...args: unknown[]) => unknown;
  isCommandRunning: boolean;
  logs: unknown[];
  daemonVersion?: string | null;
  usbPortName?: string | null;
}

interface AvailableAppLike {
  name?: string;
  isInstalled?: boolean;
  [key: string]: unknown;
}

/**
 * Reports the right column's live width to the store (used by AppTopBar's
 * embedded-app drag offset) WITHOUT re-rendering the parent ActiveRobotView.
 * Isolated into its own null-rendering component so its per-frame ResizeObserver
 * updates stay local. `paused` skips the store write during a split drag so it
 * doesn't churn every store subscriber 60×/s; the width is committed on release
 * when `paused` flips back to false.
 */
function RightPanelWidthReporter({
  targetRef,
  paused,
}: {
  targetRef: React.RefObject<HTMLDivElement | null>;
  paused: boolean;
}): null {
  const size = useResizeObserver(targetRef);
  useEffect(() => {
    if (paused) return;
    if (size.width > 0) {
      useAppStore.getState().setRightPanelWidth(size.width);
    }
  }, [size.width, paused]);
  return null;
}

// Camera-bottom collision guard geometry (see cameraBottomCapPx). The viewer is
// 4:3, so a wider left pane makes a TALLER viewer — drag far enough right and the
// small camera preview (pinned CAMERA_OVERHANG_PX below the viewer) would run off
// the bottom of the screen. VIEWER_ASPECT turns an available height back into a
// viewer width; SCREEN_EDGE_MARGIN_PX keeps the preview's shadow clear of the edge.
const VIEWER_ASPECT = 4 / 3;
const CAMERA_OVERHANG_PX = 60;
const SCREEN_EDGE_MARGIN_PX = 10;

// Left-column log console scale reference. On develop the console was a fixed
// 120px inside the fixed 900×670 "expanded" window (see useWindowResize.ts). We
// keep that 120/670 ratio so the console — and therefore the gap below it — grow
// proportionally as the window is resized or fullscreened, instead of the console
// ballooning to eat all remaining height. 120px is also the floor: shorter windows
// look like develop and the column scrolls rather than the console shrinking.
const LOGS_BASELINE_HEIGHT_PX = 120;
const LOGS_BASELINE_WINDOW_PX = 670;

function ActiveRobotView({
  isActive,
  isStarting: _isStarting,
  isStopping,
  stopDaemon,
  sendCommand,
  playRecordedMove,
  isCommandRunning: _isCommandRunning,
  logs,
  daemonVersion,
  usbPortName: _usbPortName,
}: ActiveRobotViewProps): React.ReactElement {
  const palette = useAppPalette();

  // Report the (now fluid) right-panel width so AppTopBar can offset its drag
  // strip correctly in the embedded-app case (it used to assume a fixed 450px).
  // The observer lives in an isolated child (see RightPanelWidthReporter) so it
  // doesn't re-render this large view every frame while the split is dragged.
  const rightColumnRef = useRef<HTMLDivElement | null>(null);

  // --- Resizable split between the two columns ---
  // The left column width is derived from `leftFraction` but clamped in PX to a
  // fixed travel range so the divider can only slide between LEFT_MIN_PX and
  // LEFT_MAX_PX — enforced on BOTH drag and window resize. RIGHT_MIN_PX keeps
  // the right pane from collapsing on a narrow window (the left range yields to
  // it there, so nothing overflows). The chosen ratio persists across sessions.
  const LEFT_MIN_PX = 500;
  const LEFT_MAX_PX = 1900;
  // Hard minimum right-pane width, matching the main branch's fixed 450px right
  // column (both the app store and the controller shipped at that width). The
  // divider can never make the right pane narrower than this on any view, so the
  // controller's HEAD row can't squish (Pitch/Yaw dropping below X/Y) and the apps
  // tab stays consistent with main at the default 900×670 window. In CSS px, so it
  // holds under the fullscreen webview zoom (which shrinks the CSS-px viewport while
  // the controls keep a fixed CSS-px size).
  const RIGHT_MIN_PX = 450;
  // Gap left when the divider meets the tagged HF username badge (see collisionCapPx).
  const COLLISION_MARGIN_PX = 8;
  const DIVIDER_PX = 12;
  // Floor for the left-column log console so it can't be shrunk to a sliver by
  // the fixed content stacked above it (viewer + header + audio controls).
  const LOGS_MIN_HEIGHT_PX = 200;
  const contentRowRef = useRef<HTMLDivElement | null>(null);
  const contentRowSize = useResizeObserver(contentRowRef);
  const [leftFraction, setLeftFraction] = useState<number>(() => {
    const stored =
      typeof window !== 'undefined' ? localStorage.getItem('activeSplitFraction') : null;
    const n = stored ? parseFloat(stored) : NaN;
    return Number.isFinite(n) && n > 0.1 && n < 0.9 ? n : 0.5;
  });
  const [isDraggingSplit, setIsDraggingSplit] = useState<boolean>(false);

  // Structural offsets the camera-bottom cap needs, measured after layout and
  // constant across pane widths: `chrome` = column padding + border + reserved
  // scrollbar gutter; `viewerTop` = the viewer's inset below the top of the row.
  // Seeded with sane defaults, corrected on the first committed layout.
  const chromeRef = useRef<number>(54);
  const viewerTopRef = useRef<number>(33);

  // Left column element — resized imperatively during a drag (see below).
  const leftColRef = useRef<HTMLDivElement | null>(null);

  // Widest the left pane may get before the 4:3 viewer grows tall enough that the
  // camera preview's bottom collides with the bottom of the screen. +Infinity
  // when unmeasured or the window is too short to constrain (we then fall back to
  // the width-based limits only).
  const cameraBottomCapPx = useCallback((): number => {
    const rowH = contentRowSize.height;
    if (rowH <= 0) return Number.POSITIVE_INFINITY;
    const availViewerHeight =
      rowH - viewerTopRef.current - CAMERA_OVERHANG_PX - SCREEN_EDGE_MARGIN_PX;
    if (availViewerHeight <= 0) return Number.POSITIVE_INFINITY;
    return availViewerHeight * VIEWER_ASPECT + chromeRef.current;
  }, [contentRowSize.height]);

  // Max left-pane width at which the divider's right edge just meets the tagged
  // collision element (the HF username badge in the right panel). +Infinity when
  // that element isn't on screen (e.g. logged out) so it imposes no limit.
  const collisionCapPx = useCallback((): number => {
    const rowEl = contentRowRef.current;
    if (!rowEl) return Number.POSITIVE_INFINITY;
    const target = rowEl.querySelector<HTMLElement>('[data-divider-collision]');
    if (!target) return Number.POSITIVE_INFINITY;
    const rowLeft = rowEl.getBoundingClientRect().left;
    const targetLeft = target.getBoundingClientRect().left;
    return targetLeft - rowLeft - DIVIDER_PX - COLLISION_MARGIN_PX;
  }, []);

  // Single source of truth for the divider clamp, shared by the drag path and the
  // committed/relayout memo. RIGHT_MIN_PX is a HARD floor (main's 450px column): the
  // right pane can never be narrower than it on any view — so the controller's HEAD
  // row can't squish and the apps tab stays consistent with main. On a narrow window
  // the left pane yields below LEFT_MIN_PX to honor that floor. Also bounded by
  // LEFT_MAX_PX, the username-badge collision cap (only ever keeps the right pane
  // wider), and the camera-bottom cap.
  const clampPaneWidthPx = useCallback(
    (desiredPx: number, rowWidth: number): number => {
      const usable = Math.max(0, rowWidth - DIVIDER_PX);
      const maxByRight = usable - RIGHT_MIN_PX;
      // On a narrow window that can't honor LEFT_MIN_PX, yield to the right pane.
      const minPx = Math.min(LEFT_MIN_PX, Math.max(0, maxByRight));
      const maxPx = Math.max(
        minPx,
        Math.min(LEFT_MAX_PX, maxByRight, collisionCapPx(), cameraBottomCapPx())
      );
      return Math.max(minPx, Math.min(maxPx, desiredPx));
    },
    [collisionCapPx, cameraBottomCapPx]
  );

  // Left pane width in px, recomputed whenever the row or ratio changes so the
  // limits hold even as the window shrinks.
  const leftPaneWidth = useMemo<number>(() => {
    const container = contentRowSize.width || 900;
    return Math.round(clampPaneWidthPx(leftFraction * container, container));
  }, [contentRowSize.width, leftFraction, clampPaneWidthPx]);

  // The viewer block inside the column — measured to derive the camera-bottom cap.
  const viewerBlockRef = useRef<HTMLDivElement | null>(null);
  const dragFracRef = useRef<number>(leftFraction);

  // Apply the committed pane width to the DOM. During a drag we bypass React and
  // write the width straight to this element; on release the committed fraction
  // recomputes `leftPaneWidth` and this re-applies the same value seamlessly.
  // useLayoutEffect so the width is set before the browser paints.
  useLayoutEffect(() => {
    const el = leftColRef.current;
    if (el) el.style.width = `${leftPaneWidth}px`;
    // Re-measure the (pane-width-independent) offsets the camera-bottom cap needs.
    // Cheap, and only on committed width changes — never mid-drag.
    const rowEl = contentRowRef.current;
    const vbEl = viewerBlockRef.current;
    if (el && rowEl && vbEl) {
      const vbRect = vbEl.getBoundingClientRect();
      chromeRef.current = Math.max(0, el.getBoundingClientRect().width - vbRect.width);
      viewerTopRef.current = vbRect.top - rowEl.getBoundingClientRect().top;
    }
  }, [leftPaneWidth]);

  // Re-clamp the divider whenever the UI's effective resolution changes — a window
  // resize, fullscreen enter/exit, or a display/DPR change all shift the fullscreen
  // webview zoom, which changes the CSS-px viewport and therefore where the
  // RIGHT_MIN_PX floor falls. The ResizeObserver-driven `leftPaneWidth` memo also
  // reacts to the row-width change, but `setZoom()` is async, so we re-run the clamp
  // from the committed fraction here on those events too — the right pane can't be
  // left under its minimum after the resolution jumps. Skipped mid-drag, where the
  // pointer handler owns the width.
  useEffect(() => {
    const reclamp = (): void => {
      if (isDraggingSplit) return;
      const rowEl = contentRowRef.current;
      const el = leftColRef.current;
      if (!rowEl || !el) return;
      const rowWidth = rowEl.getBoundingClientRect().width;
      if (rowWidth <= 0) return;
      el.style.width = `${Math.round(clampPaneWidthPx(leftFraction * rowWidth, rowWidth))}px`;
    };
    const dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    window.addEventListener('resize', reclamp);
    dprQuery.addEventListener('change', reclamp);
    return () => {
      window.removeEventListener('resize', reclamp);
      dprQuery.removeEventListener('change', reclamp);
    };
  }, [clampPaneWidthPx, leftFraction, isDraggingSplit]);

  // Clamp a pointer X to the pane travel range, returning both the pixel width
  // (to apply imperatively) and the fraction (to persist on release).
  const computeSplitFromClientX = useCallback(
    (clientX: number): { widthPx: number; frac: number } | null => {
      const el = contentRowRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return null;
      const clampedPx = clampPaneWidthPx(clientX - rect.left, rect.width);
      const frac = clampedPx / rect.width;
      if (!Number.isFinite(frac)) return null;
      return { widthPx: Math.round(clampedPx), frac };
    },
    [clampPaneWidthPx]
  );

  useEffect(() => {
    if (!isDraggingSplit) return;
    // Drive the resize imperatively: coalesce pointermove to one write per frame
    // and set the left column's width DIRECTLY, without setState — so the heavy
    // ActiveRobotView subtree doesn't re-render (and re-run its effects) 60×/s
    // mid-drag. The fraction is committed to state + localStorage once, on
    // release; the WebGL buffer resize is debounced in Viewer3D so the canvas
    // just CSS-scales smoothly while dragging.
    let rafId: number | null = null;
    let pendingClientX = 0;
    const flush = (): void => {
      rafId = null;
      const next = computeSplitFromClientX(pendingClientX);
      if (!next) return;
      dragFracRef.current = next.frac;
      const el = leftColRef.current;
      if (el) el.style.width = `${next.widthPx}px`;
    };
    const onMove = (e: PointerEvent): void => {
      pendingClientX = e.clientX;
      if (rafId === null) rafId = requestAnimationFrame(flush);
    };
    const onUp = (): void => {
      setIsDraggingSplit(false);
      setLeftFraction(dragFracRef.current);
      try {
        localStorage.setItem('activeSplitFraction', String(dragFracRef.current));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [isDraggingSplit, computeSplitFromClientX]);

  // Get dependencies from context
  const { robotState, actions } = useActiveRobotContext();

  // Extract state from context
  const {
    isDaemonCrashed,
    robotStatus,
    busyReason,
    currentAppName,
    isAppRunning,
    robotStateFull,
    rightPanelView,
  } = robotState;

  // Extract actions from context
  const { resetTimeouts, triggerEffect, stopEffect, isBusy, isReady } = actions;

  // Compute busy/ready state
  const isBusyState = isBusy();
  const isReadyState = isReady();

  // Get complete robot state from daemon API
  const { isOn, isMoving } = useRobotPowerState(isActive);

  // ✅ Centralized app logs system - listens to sidecar stdout/stderr and adds to store
  useAppLogs(currentAppName, isAppRunning);

  // ✅ Monitor active movements and update store status (robotStatus: 'busy', busyReason: 'moving')
  useRobotMovementStatus(isActive);

  // Toast notifications (global - rendered in App.jsx)
  const { showToast } = useToast();

  // ✅ Apps hook for deep link installation
  const { availableApps, installApp, fetchAvailableApps, error: _appsError } = useApps(isActive);

  // ✅ App handlers for deep link installation
  // TODO(ts): `useAppHandlers` requires full `installApp`/`removeApp`/`startApp`/`stopCurrentApp`/`triggerUpdate` signatures;
  // the deep-link flow only ever calls `handleInstall`, so cast stub handlers to keep runtime behavior 1:1.
  const noopAsync = (() => Promise.resolve()) as unknown as (
    ...args: unknown[]
  ) => Promise<unknown>;
  const { handleInstall } = useAppHandlers({
    currentApp: null,
    activeJobs: new Map(),
    installApp,
    removeApp: noopAsync as (appName: string) => Promise<unknown>,
    startApp: noopAsync as (appName: string) => Promise<unknown>,
    stopCurrentApp: noopAsync as () => Promise<unknown>,
    triggerUpdate: noopAsync as (appName: string) => Promise<unknown>,
    applyStartupApp: noopAsync as (appName: string | null) => Promise<void>,
    startupAppName: null,
    showToast,
  });

  // ✅ Deep link pending install - processed from root App.jsx
  const { pendingDeepLinkInstall, clearPendingDeepLinkInstall } = useAppStore(
    useShallow((state: FullAppState) => ({
      pendingDeepLinkInstall: (state as { pendingDeepLinkInstall?: string | null })
        .pendingDeepLinkInstall,
      clearPendingDeepLinkInstall: (state as { clearPendingDeepLinkInstall: () => void })
        .clearPendingDeepLinkInstall,
    }))
  );

  // Process pending deep link install when it's set
  useEffect(() => {
    if (!pendingDeepLinkInstall) return;

    const processDeepLinkInstall = async (): Promise<void> => {
      const appName = pendingDeepLinkInstall;

      // Clear immediately to avoid re-processing
      clearPendingDeepLinkInstall();

      // Find app in available apps
      let app = (availableApps as unknown as AvailableAppLike[]).find(
        a => a.name === appName || a.name?.toLowerCase() === appName?.toLowerCase()
      );

      if (!app) {
        // Check network status before fetching
        if (!navigator.onLine) {
          showToast?.('No internet connection. Cannot fetch app list.', 'error');
          return;
        }

        await fetchAvailableApps(true); // Force refresh

        // Check if there was an error during fetch
        const storeState = useAppStore.getState() as unknown as {
          appsError?: string | null;
          availableApps?: AvailableAppLike[];
        };
        const storeAppsError = storeState.appsError;
        if (storeAppsError && storeAppsError.includes('internet')) {
          showToast?.('No internet connection. Please check your network.', 'error');
          return;
        }

        // Retry after refresh - need to get fresh state
        const freshApps = storeState.availableApps || [];
        app = freshApps.find(
          a => a.name === appName || a.name?.toLowerCase() === appName?.toLowerCase()
        );

        if (!app) {
          // More helpful message depending on context
          if (freshApps.length === 0) {
            showToast?.('Could not load app list. Check your internet connection.', 'error');
          } else {
            showToast?.(`App "${appName}" not found in the store`, 'error');
          }
          return;
        }
      }

      if (app.isInstalled) {
        showToast?.(`${app.name} is already installed`, 'info');
        return;
      }

      showToast?.(`Starting installation of ${app.name}...`, 'success');
      // TODO(ts): `AppInfo` lives outside this agent's scope; cast to preserve original runtime call.
      handleInstall(app as never);
    };

    processDeepLinkInstall();
  }, [
    pendingDeepLinkInstall,
    clearPendingDeepLinkInstall,
    availableApps,
    fetchAvailableApps,
    handleInstall,
    showToast,
  ]);

  // Logs fullscreen modal
  const [logsFullscreenOpen, setLogsFullscreenOpen] = useState<boolean>(false);

  // Remote daemon log stream (WiFi mode only).
  // Side-effect hook: pushes incoming lines into `state.logs`, so every
  // surface (LogConsole, standalone LogViewerWindow via windowSync) sees them
  // without needing its own WebSocket.
  const logMode = useAppStore((s: FullAppState) => (s as { logMode?: string }).logMode as string);
  const remoteCategories = useMemo<DaemonLogSource[]>(
    () => (logMode === 'dev' ? ['daemon', 'app', 'api'] : ['daemon']),
    [logMode]
  );
  useDaemonLogStream(remoteCategories);

  // Audio controls - Extracted to hook
  const {
    volume,
    microphoneVolume,
    speakerDevice,
    microphoneDevice,
    speakerPlatform,
    microphonePlatform,
    handleVolumeChange,
    handleMicrophoneChange,
    handleMicrophoneVolumeChange,
    handleSpeakerMute,
    handleMicrophoneMute,
  } = useAudioControls(isActive);

  // Apps and robot position are pre-loaded during StartupScanView + wake-up sequence.
  // The "Preparing robot..." overlay only shows if position data isn't ready yet.
  const hasHeadJoints =
    robotStateFull?.data?.head_joints &&
    Array.isArray(robotStateFull.data.head_joints) &&
    robotStateFull.data.head_joints.length === 7;
  const hasPassiveJoints =
    robotStateFull?.data?.passive_joints &&
    Array.isArray(robotStateFull.data.passive_joints) &&
    robotStateFull.data.passive_joints.length === 21;

  // Fallback: if head_joints are present but passive_joints are missing for >2s,
  // proceed anyway — the 3D viewer calculates them independently via WASM.
  const [passiveJointsGracePeriodExpired, setPassiveJointsGracePeriodExpired] =
    useState<boolean>(false);
  useEffect(() => {
    if (hasPassiveJoints || !hasHeadJoints) {
      setPassiveJointsGracePeriodExpired(false);
      return;
    }
    const timer = setTimeout(() => setPassiveJointsGracePeriodExpired(true), 2000);
    return () => clearTimeout(timer);
  }, [hasHeadJoints, hasPassiveJoints]);

  const robotPositionReady = hasHeadJoints && (hasPassiveJoints || passiveJointsGracePeriodExpired);

  const [appsLoading, setAppsLoading] = useState<boolean>(false);
  const hasLoadedOnceRef = useRef<boolean>(true);

  const isFullyReady = !appsLoading && robotPositionReady;

  const handleAppsLoadingChange = useCallback((loading: boolean): void => {
    if (loading && hasLoadedOnceRef.current) {
      return;
    }
    if (!loading) {
      hasLoadedOnceRef.current = true;
    }
    setAppsLoading(loading);
  }, []);

  // Wrapper for Quick Actions with toast and visual effects
  const handleQuickAction = useCallback(
    (action: QuickAction): void => {
      const prefix =
        action.type === 'dance'
          ? 'Playing dance'
          : action.type === 'action'
            ? 'Playing action'
            : 'Playing emotion';
      logInfo(`${prefix}: ${action.label || action.name}`);

      if (action.type === 'action') {
        sendCommand(`/api/move/play/${action.name}`, action.label);
      } else if (action.type === 'dance') {
        playRecordedMove(getDanceDataset(action.name), action.name);
      } else {
        playRecordedMove(CHOREOGRAPHY_DATASETS.EMOTIONS, action.name);
      }

      // Trigger corresponding 3D visual effect
      const effectMap: Record<string, string | null> = {
        goto_sleep: 'sleep',
        wake_up: null,
        loving1: 'love',
        sad1: 'sad',
        surprised1: 'surprised',
      };

      const effectType = effectMap[action.name];
      if (effectType) {
        triggerEffect(effectType);
        // Stop effect after 4 seconds
        setTimeout(() => {
          stopEffect();
        }, 4000);
      }

      showToast(`${action.emoji} ${action.label}`, 'info');
    },
    [sendCommand, playRecordedMove, showToast]
  );

  // Quick Actions: Curated mix of emotions, dances, and actions (no redundancy)
  const quickActions = QUICK_ACTIONS;

  const handleBackToConnection = useCallback((): void => {
    // Leave the "daemon crashed" overlay and return to ``FindingRobotView``.
    // ``resetAll()`` wipes ``connectionMode`` (so ``useViewRouter`` falls back
    // to the connection screen) and resets ``isDaemonCrashed`` via
    // ``buildDerivedState(DISCONNECTED)`` (so the overlay closes).
    resetTimeouts();

    // Best-effort daemon stop: fire-and-forget so the UI transitions instantly.
    // If the daemon has genuinely crashed, ``stopDaemon`` will time out and we
    // don't want to keep the user staring at the overlay while that happens.
    Promise.resolve(stopDaemon()).catch(() => {
      /* best effort */
    });

    useAppStore.getState().resetAll();
  }, [resetTimeouts, stopDaemon]);

  return (
    <WebRTCStreamProvider>
      <Box
        sx={{
          width: '100vw',
          height: '100vh',
          // TODO(style-migration): root viewport scrim uses 0.95/0.85 alpha; palette.surfaceBg is opaque/translucent differently.
          background: palette.isDark ? 'rgba(26, 26, 26, 0.95)' : 'rgba(250, 250, 252, 0.85)',
          backdropFilter: BLUR.lg,
          WebkitBackdropFilter: BLUR.lg,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Error overlay if daemon crashed - Modern design with FullscreenOverlay */}
        <FullscreenOverlay
          open={isDaemonCrashed}
          onClose={() => {}}
          darkMode={palette.isDark}
          zIndex={9999}
          backdropBlur={20}
        >
          <Box
            sx={{
              maxWidth: 420,
              textAlign: 'center',
              px: 3,
            }}
          >
            {/* Illustration */}
            <Box
              component="img"
              src={ConnectionLostIllustration}
              alt="Connection Lost"
              sx={{
                width: 180,
                height: 180,
                mx: 'auto',
                mb: 3,
                opacity: palette.isDark ? 0.9 : 1,
              }}
            />

            {/* Title */}
            <Typography
              sx={{
                fontSize: TYPO.xl,
                fontWeight: FONT_WEIGHT.bold,
                color: palette.textPrimary,
                mb: 1,
                letterSpacing: '0.2px',
              }}
            >
              Something went wrong
            </Typography>

            {/* Description */}
            <Typography
              sx={{
                fontSize: TYPO.sm,
                color: palette.textMuted,
                mb: 3.5,
                lineHeight: 1.6,
              }}
            >
              The connection to your Reachy Mini was interrupted. This can happen if the robot lost
              power, the network dropped, or the daemon crashed.
            </Typography>

            {/* Back-to-connection button */}
            <Button
              variant="outlined"
              color="primary"
              onClick={handleBackToConnection}
              sx={{
                fontWeight: FONT_WEIGHT.semibold,
                fontSize: TYPO.body,
                px: 4,
                py: 1.25,
                borderRadius: RADIUS.xl,
                textTransform: 'none',
              }}
            >
              Back to connection
            </Button>
          </Box>
        </FullscreenOverlay>

        {/* Loading overlay - shown while apps are being fetched OR robot position not ready */}
        {!isFullyReady && (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              // TODO(style-migration): loading scrim uses 0.98 alpha; palette.surfaceBg has a different opacity.
              bgcolor: palette.isDark ? 'rgba(26, 26, 26, 0.98)' : 'rgba(250, 250, 252, 0.98)',
              backdropFilter: 'blur(20px)',
              zIndex: 9998,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            <CircularProgress
              size={32}
              thickness={3}
              sx={{
                // TODO(style-migration): loading spinner uses pure #fff/#1a1a1a; no direct palette token.
                color: palette.isDark ? '#fff' : '#1a1a1a',
                opacity: 0.7,
              }}
            />
            <Typography
              sx={{
                fontSize: TYPO.body,
                color: palette.textMuted,
                fontWeight: FONT_WEIGHT.medium,
                letterSpacing: '0.3px',
              }}
            >
              Preparing robot...
            </Typography>
          </Box>
        )}

        {/* Content - 2 columns */}
        <Box
          ref={contentRowRef}
          sx={{
            display: 'flex',
            flexDirection: 'row',
            height: '100%',
            gap: 0,
            position: 'relative',
            bgcolor: 'transparent',
          }}
        >
          {/* Reports right-pane width to the store without re-rendering this view
              (paused mid-drag so it doesn't churn store subscribers). */}
          <RightPanelWidthReporter targetRef={rightColumnRef} paused={isDraggingSplit} />

          {/* Left column - width driven by the draggable split (applied to the
              DOM imperatively via leftColRef so a drag doesn't re-render React). */}
          <Box
            ref={leftColRef}
            sx={{
              flexShrink: 0,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              px: 3,
              pt: '33px',
              pb: '10px',
              // Hide the scrollbar entirely — the column stays scrollable via
              // wheel/trackpad. It's only a fallback scroll region for short
              // windows, and a visible bar here rendered as a bright vertical
              // line on macOS "always show scroll bars" (doubled up next to the
              // split divider). Hiding it also keeps the content width CONSTANT:
              // a classic scrollbar that appears/disappears as content overflows
              // would resize the 4:3 viewer and make the sim oscillate — which is
              // exactly why we can't just fall back to `overflowY: 'auto'` alone.
              overflowY: 'auto',
              scrollbarWidth: 'none',
              '&::-webkit-scrollbar': { display: 'none' },
              overflowX: 'hidden',
              position: 'relative',
              zIndex: 1,
              height: '100%',
              // TODO(style-migration): left-column scrim uses 0.6/0.7 alpha; no direct palette surface token match.
              bgcolor: palette.isDark ? 'rgba(20, 20, 20, 0.6)' : 'rgba(245, 245, 247, 0.7)',
              // No borderRight here: the draggable divider's grip line is the single
              // separator. A border would sit ~5px from the grip and read as a second
              // parallel line. The soft boxShadow below still gives the column depth.
              boxShadow: palette.isDark
                ? `2px 0 8px -2px ${blackAlpha(0.3)}`
                : `2px 0 8px -2px ${blackAlpha(0.1)}`,
            }}
          >
            {/* Main viewer block - Both components are always mounted */}
            <Box
              ref={viewerBlockRef}
              sx={{
                width: '100%',
                position: 'relative',
                mb: 1,
                overflow: 'visible',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <ViewportSwapper
                view3D={
                  <Viewer3D
                    isActive={isActive}
                    forceLoad={true}
                    showStatusTag={true}
                    isOn={isOn}
                    isMoving={isMoving}
                    robotStatus={robotStatus}
                    busyReason={busyReason}
                    hideCameraFeed={true}
                  />
                }
                viewCamera={<CameraFeed width={640} height={480} isLarge={true} />}
              />

              {/* Power Button - top left corner (sleep + disable motors + kill daemon) */}
              <PowerButton onStopDaemon={stopDaemon} isStopping={isStopping} isBusy={isBusyState} />
            </Box>

            {/* Robot Header - Title, version, status, mode */}
            <RobotHeader daemonVersion={daemonVersion} />

            {/* Audio Controls - Stable wrapper to ensure correct sizing */}
            <Box sx={{ width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
              <AudioControls
                volume={volume}
                microphoneVolume={microphoneVolume}
                speakerDevice={speakerDevice}
                microphoneDevice={microphoneDevice}
                speakerPlatform={speakerPlatform}
                microphonePlatform={microphonePlatform}
                onVolumeChange={handleVolumeChange}
                onMicrophoneChange={handleMicrophoneChange}
                onMicrophoneVolumeChange={handleMicrophoneVolumeChange}
                onSpeakerMute={handleSpeakerMute}
                onMicrophoneMute={handleMicrophoneMute}
                disabled={isBusyState && !isAppRunning}
                isSleeping={false}
              />
            </Box>

            {/* Logs Console - grows to fill remaining space, but keeps a usable
                floor (minHeight) so a tall stack above it can't squish the logs to
                a sliver. When the column is short, the outer overflowY scroll
                reveals the full console at the bottom instead of collapsing it. */}
            <Box
              sx={{
                mt: 1,
                width: '100%',
                flex: '1 1 auto',
                minHeight: LOGS_MIN_HEIGHT_PX,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <Box
                sx={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}
              >
                <LogConsole
                  logs={logs}
                  darkMode={palette.isDark}
                  height="100%"
                  compact={true}
                  onExpand={() => setLogsFullscreenOpen(true)}
                />
              </Box>
            </Box>
          </Box>

          {/* Draggable divider - drag to rebalance the two panes */}
          <Box
            onPointerDown={(e: React.PointerEvent) => {
              e.preventDefault();
              setIsDraggingSplit(true);
            }}
            sx={{
              flexShrink: 0,
              width: '12px',
              cursor: 'col-resize',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              zIndex: 3,
              '& .split-line': {
                transition: 'background-color 0.15s ease, width 0.15s ease',
              },
              '&:hover .split-line': {
                backgroundColor: palette.textMuted,
                width: '3px',
              },
            }}
          >
            <Box
              className="split-line"
              sx={{
                width: isDraggingSplit ? '3px' : '2px',
                height: '100%',
                borderRadius: '2px',
                backgroundColor: isDraggingSplit ? palette.textMuted : palette.border,
              }}
            />
          </Box>

          {/* Right column - fluid, absorbs remaining width so the row fills 100% */}
          <Box
            ref={rightColumnRef}
            sx={{
              flex: '1 1 0',
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              position: 'relative',
              zIndex: 2,
              pt: rightPanelView === 'embedded-app' ? 0 : '33px',
              transform: rightPanelView === 'embedded-app' ? 'none' : 'translateY(-8px)',
              bgcolor: 'transparent !important',
              backgroundColor: 'transparent !important',
            }}
          >
            <RightPanel
              showToast={showToast}
              onLoadingChange={handleAppsLoadingChange}
              quickActions={quickActions as unknown as Record<string, unknown>[]}
              handleQuickAction={
                handleQuickAction as unknown as (action: Record<string, unknown>) => void
              }
              isReady={isReadyState}
              isActive={isActive}
              isBusy={isBusyState}
            />
          </Box>
        </Box>

        {/* While dragging the split, this overlay captures the pointer so it keeps
            tracking over the 3D canvas / embedded app iframe. */}
        {isDraggingSplit && (
          <Box sx={{ position: 'fixed', inset: 0, zIndex: 10000001, cursor: 'col-resize' }} />
        )}

        {/* Logs Fullscreen Modal - only mount LogConsole when open */}
        <FullscreenOverlay
          open={logsFullscreenOpen}
          onClose={() => setLogsFullscreenOpen(false)}
          darkMode={palette.isDark}
          debugName="LogsFullscreen"
          showCloseButton={true}
          centeredY={false}
        >
          {logsFullscreenOpen && (
            <Box
              sx={{
                width: 'calc(100vw - 80px)',
                maxWidth: '1200px',
                height: '82vh',
                maxHeight: '800px',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                mt: 'auto',
                mb: 5,
              }}
            >
              <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                <LogConsole logs={logs} darkMode={palette.isDark} height="100%" fullSize={true} />
              </Box>
            </Box>
          )}
        </FullscreenOverlay>
      </Box>
    </WebRTCStreamProvider>
  );
}

export default ActiveRobotView;
