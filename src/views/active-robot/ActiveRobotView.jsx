import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Button,
  CircularProgress,
  Alert,
  LinearProgress,
  ButtonGroup,
  Switch,
  Tooltip,
} from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import useDaemonLogStream from '../../hooks/useDaemonLogStream';
import { logInfo } from '../../utils/logging';
import FullscreenOverlay from '../../components/FullscreenOverlay';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import Viewer3D from '../../components/viewer3d';
import CameraFeed from './camera/CameraFeed';
import { ViewportSwapper } from './layout';
import LogConsole from '@components/LogConsole';
import { RightPanel } from './right-panel';
import RobotHeader from './RobotHeader';
import { PowerButton } from './controls';
import AudioControls from './audio/AudioControls';
import { useRobotPowerState, useRobotMovementStatus } from './hooks';
import { useAudioControls } from './audio/hooks';
import { useAppLogs, useApps, useAppHandlers } from './application-store/hooks';
import { useActiveRobotContext } from './context';
import { CHOREOGRAPHY_DATASETS, DANCES, QUICK_ACTIONS } from '../../constants/choreographies';
import { WebRTCStreamProvider } from '../../contexts/WebRTCStreamContext';
import { useToast } from '../../hooks/useToast';
import ConnectionLostIllustration from '../../assets/connection-lost.svg';
import useAppStore from '../../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';

function ActiveRobotView({
  isActive,
  isStarting,
  isStopping,
  stopDaemon,
  sendCommand,
  playRecordedMove,
  isCommandRunning,
  logs,
  daemonVersion,
  usbPortName,
}) {
  // Get dependencies from context
  const { robotState, actions, windowManager } = useActiveRobotContext();

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
  const { isOn, isMoving } = useRobotPowerState(isActive); // ✅ Robot power state (motors on/off, movement)

  // ✅ Centralized app logs system - listens to sidecar stdout/stderr and adds to store
  useAppLogs(currentAppName, isAppRunning);

  // ✅ Monitor active movements and update store status (robotStatus: 'busy', busyReason: 'moving')
  useRobotMovementStatus(isActive);

  // Toast notifications (global - rendered in App.jsx)
  const { showToast } = useToast();

  // ✅ Apps hook for deep link installation
  const { availableApps, installApp, fetchAvailableApps, error: appsError } = useApps(isActive);

  // ✅ App handlers for deep link installation
  const { handleInstall } = useAppHandlers({
    currentApp: null,
    activeJobs: new Map(),
    installApp,
    removeApp: () => {},
    startApp: () => {},
    stopCurrentApp: () => {},
    showToast,
  });

  // ✅ Deep link pending install - processed from root App.jsx
  const { pendingDeepLinkInstall, clearPendingDeepLinkInstall } = useAppStore(
    useShallow(state => ({
      pendingDeepLinkInstall: state.pendingDeepLinkInstall,
      clearPendingDeepLinkInstall: state.clearPendingDeepLinkInstall,
    }))
  );

  // Process pending deep link install when it's set
  useEffect(() => {
    if (!pendingDeepLinkInstall) return;

    const processDeepLinkInstall = async () => {
      const appName = pendingDeepLinkInstall;

      // Clear immediately to avoid re-processing
      clearPendingDeepLinkInstall();

      // Find app in available apps
      let app = availableApps.find(
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
        const storeState = useAppStore.getState();
        if (storeState.appsError && storeState.appsError.includes('internet')) {
          showToast?.('No internet connection. Please check your network.', 'error');
          return;
        }

        // Retry after refresh - need to get fresh state
        const freshApps = storeState.availableApps;
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
      handleInstall(app);
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
  const [logsFullscreenOpen, setLogsFullscreenOpen] = useState(false);

  // Remote daemon log stream (WiFi mode only)
  const logMode = useAppStore(s => s.logMode);
  const remoteCategories = useMemo(
    () => (logMode === 'dev' ? ['daemon', 'app', 'api'] : ['daemon']),
    [logMode]
  );
  const remoteLogs = useDaemonLogStream(remoteCategories);

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

  // Apps and robot position are pre-loaded during HardwareScanView + wake-up sequence.
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
  const [passiveJointsGracePeriodExpired, setPassiveJointsGracePeriodExpired] = useState(false);
  useEffect(() => {
    if (hasPassiveJoints || !hasHeadJoints) {
      setPassiveJointsGracePeriodExpired(false);
      return;
    }
    const timer = setTimeout(() => setPassiveJointsGracePeriodExpired(true), 2000);
    return () => clearTimeout(timer);
  }, [hasHeadJoints, hasPassiveJoints]);

  const robotPositionReady = hasHeadJoints && (hasPassiveJoints || passiveJointsGracePeriodExpired);

  const [appsLoading, setAppsLoading] = useState(false);
  const hasLoadedOnceRef = useRef(true);

  const isFullyReady = !appsLoading && robotPositionReady;

  const handleAppsLoadingChange = useCallback(loading => {
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
    action => {
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
      const effectMap = {
        goto_sleep: 'sleep',
        wake_up: null, // No effect for wake up
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

  const handleRestartDaemon = useCallback(async () => {
    resetTimeouts();
    try {
      await stopDaemon();
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch {
      window.location.reload();
    }
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
          onClose={() => {}} // No close on backdrop click for crash
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

            {/* Restart button */}
            <Button
              variant="outlined"
              color="primary"
              onClick={handleRestartDaemon}
              sx={{
                fontWeight: 600,
                fontSize: 13,
                px: 4,
                py: 1.25,
                borderRadius: '12px',
                textTransform: 'none',
              }}
            >
              Restart
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
              zIndex: 9998, // Below crash overlay (9999)
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
              pt: '33px', // Padding top to account for AppTopBar
              overflowY: 'auto',
              overflowX: 'hidden',
              position: 'relative',
              // z-index hierarchy: 1-2 = layout base elements
              zIndex: 1,
              height: '100%',
              // Slightly darker background for left column
              bgcolor: darkMode
                ? 'rgba(20, 20, 20, 0.6)' // Slightly darker than main background
                : 'rgba(245, 245, 247, 0.7)', // Slightly darker than main background
              // Gradient shadow on the right to show separation between columns
              borderRight: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'}`,
              boxShadow: darkMode
                ? '2px 0 8px -2px rgba(0, 0, 0, 0.3)'
                : '2px 0 8px -2px rgba(0, 0, 0, 0.1)',
              // Scrollbar styling
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
              {/* ViewportSwapper: handles swap between 3D and Camera with Portals */}
              {/* ✅ FIX: Don't use useMemo here - it causes complete remounts on prop changes */}
              {/* Instead, let React handle prop updates on the existing component instances */}
              {/* This prevents WebGL context accumulation from repeated Canvas remounts */}
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
                  remoteLogs={remoteLogs}
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
              quickActions={quickActions}
              handleQuickAction={handleQuickAction}
              isReady={isReadyState}
              isActive={isActive}
              isBusy={isBusyState}
              darkMode={darkMode}
            />
          </Box>
        </Box>

        {/* Toast Notifications - handled by global Toast in App.jsx */}

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
                <LogConsole
                  logs={logs}
                  remoteLogs={remoteLogs}
                  darkMode={darkMode}
                  height="100%"
                  fullSize={true}
                />
              </Box>
            </Box>
          )}
        </FullscreenOverlay>
      </Box>
    </WebRTCStreamProvider>
  );
}

export default ActiveRobotView;
