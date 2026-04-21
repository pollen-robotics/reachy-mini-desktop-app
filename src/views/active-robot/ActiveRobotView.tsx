import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Box, Typography, Button, CircularProgress } from '@mui/material';
import useDaemonLogStream from '../../hooks/useDaemonLogStream';
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
  type QuickAction,
} from '../../constants/choreographies';
import { WebRTCStreamProvider } from '../../contexts/WebRTCStreamContext';
import { useToast } from '../../hooks/useToast';
import ConnectionLostIllustration from '../../assets/connection-lost.svg';
import useAppStore from '../../store/useAppStore';
import type { FullAppState } from '../../store/useStore';
import type { DaemonLogSource } from '../../hooks/useDaemonLogStream';
import { useShallow } from 'zustand/react/shallow';

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
  // Get dependencies from context
  const { robotState, actions } = useActiveRobotContext();

  // Extract state from context
  const {
    darkMode,
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
        playRecordedMove(CHOREOGRAPHY_DATASETS.DANCES, action.name);
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
          background: darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(250, 250, 252, 0.85)',
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Error overlay if daemon crashed - Modern design with FullscreenOverlay */}
        <FullscreenOverlay
          open={isDaemonCrashed}
          onClose={() => {}}
          darkMode={darkMode}
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
                opacity: darkMode ? 0.9 : 1,
              }}
            />

            {/* Title */}
            <Typography
              sx={{
                fontSize: 18,
                fontWeight: 700,
                color: darkMode ? '#f5f5f5' : '#1a1a1a',
                mb: 1,
                letterSpacing: '0.2px',
              }}
            >
              Something went wrong
            </Typography>

            {/* Description */}
            <Typography
              sx={{
                fontSize: 12,
                color: darkMode ? '#999' : '#666',
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
                fontWeight: 600,
                fontSize: 13,
                px: 4,
                py: 1.25,
                borderRadius: '12px',
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
              bgcolor: darkMode ? 'rgba(26, 26, 26, 0.98)' : 'rgba(250, 250, 252, 0.98)',
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
                color: darkMode ? '#fff' : '#1a1a1a',
                opacity: 0.7,
              }}
            />
            <Typography
              sx={{
                fontSize: 13,
                color: darkMode ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)',
                fontWeight: 500,
                letterSpacing: '0.3px',
              }}
            >
              Preparing robot...
            </Typography>
          </Box>
        )}

        {/* Content - 2 columns */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'row',
            height: '100%',
            gap: 0,
            position: 'relative',
            bgcolor: 'transparent',
          }}
        >
          {/* Left column (450px) - Current content */}
          <Box
            sx={{
              width: '450px',
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              px: 3,
              pt: '33px',
              overflowY: 'auto',
              overflowX: 'hidden',
              position: 'relative',
              zIndex: 1,
              height: '100%',
              bgcolor: darkMode ? 'rgba(20, 20, 20, 0.6)' : 'rgba(245, 245, 247, 0.7)',
              borderRight: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'}`,
              boxShadow: darkMode
                ? '2px 0 8px -2px rgba(0, 0, 0, 0.3)'
                : '2px 0 8px -2px rgba(0, 0, 0, 0.1)',
              '&::-webkit-scrollbar': {
                width: '6px',
              },
              '&::-webkit-scrollbar-track': {
                background: 'transparent',
              },
              '&::-webkit-scrollbar-thumb': {
                background: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
                borderRadius: '3px',
              },
              '&:hover::-webkit-scrollbar-thumb': {
                background: darkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
              },
            }}
          >
            {/* Main viewer block - Both components are always mounted */}
            <Box
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
              <PowerButton
                onStopDaemon={stopDaemon}
                isStopping={isStopping}
                isBusy={isBusyState}
                darkMode={darkMode}
              />
            </Box>

            {/* Robot Header - Title, version, status, mode */}
            <RobotHeader daemonVersion={daemonVersion} darkMode={darkMode} />

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
                darkMode={darkMode}
                disabled={isBusyState && !isAppRunning}
                isSleeping={false}
              />
            </Box>

            {/* Logs Console - Use flex to take remaining space and prevent height issues */}
            <Box
              sx={{
                mt: 1,
                width: '100%',
                flex: '1 1 auto',
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <Box
                sx={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}
              >
                <LogConsole
                  logs={logs}
                  darkMode={darkMode}
                  maxHeight={120}
                  compact={true}
                  onExpand={() => setLogsFullscreenOpen(true)}
                />
              </Box>
            </Box>
          </Box>

          {/* Right column (450px) - Application Store */}
          <Box
            sx={{
              width: '450px',
              flexShrink: 0,
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
              darkMode={darkMode}
            />
          </Box>
        </Box>

        {/* Logs Fullscreen Modal - only mount LogConsole when open */}
        <FullscreenOverlay
          open={logsFullscreenOpen}
          onClose={() => setLogsFullscreenOpen(false)}
          darkMode={darkMode}
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
                <LogConsole logs={logs} darkMode={darkMode} height="100%" fullSize={true} />
              </Box>
            </Box>
          )}
        </FullscreenOverlay>
      </Box>
    </WebRTCStreamProvider>
  );
}

export default ActiveRobotView;
