import React, { useMemo } from 'react';
import { Box } from '@mui/material';
import { PermissionsRequiredView, FindingRobotView, StartingView, TransitionView, ActiveRobotView, ClosingView, UpdateView, ActiveRobotModule } from '../../views';
import AppTopBar from '../../components/AppTopBar';
import { useActiveRobotAdapter } from '../useActiveRobotAdapter';

/**
 * Hook to determine which view to display based on app state
 * 
 * Priority order:
 * 0. Permissions (macOS only) - Blocks app until permissions granted
 * 1. Update view - Always first, before everything else
 * 2. Finding robot view - User selects connection (USB/WiFi/Sim) and clicks Start
 * 3. Starting daemon (visual scan) - USB/Simulation only
 * 4. Transition view - After scan, during resize
 * 5. Stopping daemon - Show spinner
 * 6. Active robot - Full control view
 * 
 * 🌐 WiFi mode: Skips Starting view (daemon already active on remote)
 * 
 * @param {object} props - View routing props
 * @returns {object} { viewComponent, viewProps }
 */
export function useViewRouter({
  // Permissions
  permissionsGranted,
  isRestarting,
  
  // Update
  shouldShowUpdateView,
  isChecking,
  isDownloading,
  downloadProgress,
  updateAvailable,
  updateError,
  onInstallUpdate,
  
  // USB/Connection
  shouldShowUsbCheck,
  isUsbConnected,
  connectionMode, // 🌐 NEW: 'usb' | 'wifi' | 'simulation' | null
  
  // Daemon
  isStarting,
  isStopping,
  isActive,
  isTransitioning,
  hardwareError,
  startupError,
  startDaemon,
  stopDaemon,
  
  // Robot commands
  sendCommand,
  playRecordedMove,
  isCommandRunning,
  
  // Other
  logs,
  daemonVersion,
  usbPortName,
  onAppsReady,
}) {
  return useMemo(() => {
    // PRIORITY 0: Permissions view
    if (!permissionsGranted || isRestarting) {
      return {
        viewComponent: PermissionsRequiredView,
        viewProps: { isRestarting },
        showTopBar: true,
      };
    }

    // PRIORITY 1: Update view
    if (shouldShowUpdateView) {
      return {
        viewComponent: UpdateView,
        viewProps: {
          isChecking,
          isDownloading,
          downloadProgress,
          updateAvailable,
          updateError,
          onInstallUpdate,
        },
        showTopBar: true,
      };
    }

    // PRIORITY 2: Finding robot view
    // 🌐 Show FindingRobotView until user selects a connection mode
    // Don't auto-advance when USB is detected - wait for user selection
    // Note: FindingRobotView uses useConnection hook internally (no props needed)
    if (shouldShowUsbCheck || !connectionMode) {
      return {
        viewComponent: FindingRobotView,
        viewProps: {},
        showTopBar: true,
      };
    }

    // PRIORITY 4: Starting daemon (all modes including WiFi)
    // 🌐 WiFi mode also passes through scan view for consistent UX
    if (isStarting || hardwareError) {
      return {
        viewComponent: StartingView,
        viewProps: {
          startupError: hardwareError || startupError,
          startDaemon,
        },
        showTopBar: true,
      };
    }

    // PRIORITY 5: Transition view
    if (isTransitioning) {
      return {
        viewComponent: TransitionView,
        viewProps: {},
        showTopBar: true,
        backgroundComponent: ActiveRobotModule,
        backgroundProps: {
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
          onAppsReady,
        },
        needsContext: true, // Signal that contextConfig is needed
      };
    }

    // PRIORITY 6: Stopping daemon
    if (isStopping) {
      return {
        viewComponent: ClosingView,
        viewProps: {},
        showTopBar: false, // ClosingView has its own topbar
      };
    }

    // PRIORITY 7: (REMOVED - ReadyToStartView merged into FindingRobotView)
    // User now selects connection AND clicks Start in FindingRobotView

    // PRIORITY 8: Active robot
    return {
      viewComponent: ActiveRobotModule,
      viewProps: {
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
        onAppsReady,
      },
      showTopBar: true,
      needsContext: true, // Signal that contextConfig is needed
    };
  }, [
    permissionsGranted,
    isRestarting,
    shouldShowUpdateView,
    isChecking,
    isDownloading,
    downloadProgress,
    updateAvailable,
    updateError,
    onInstallUpdate,
    shouldShowUsbCheck,
    isUsbConnected,
    connectionMode,
    isStarting,
    isStopping,
    isActive,
    isTransitioning,
    hardwareError,
    startupError,
    startDaemon,
    stopDaemon,
    sendCommand,
    playRecordedMove,
    isCommandRunning,
    logs,
    daemonVersion,
    usbPortName,
    onAppsReady,
  ]);
}

/**
 * Component wrapper that renders the routed view
 * Injects contextConfig for ActiveRobotModule when needsContext is true
 */
export function ViewRouterWrapper({ viewConfig }) {
  const { viewComponent: ViewComponent, viewProps, showTopBar, backgroundComponent: BackgroundComponent, backgroundProps, needsContext } = viewConfig;
  
  // Get context config from adapter (only used when needsContext is true)
  // This is always called (React hooks rule) but only used when needed
  const contextConfig = useActiveRobotAdapter();

  if (BackgroundComponent) {
    // Transition view with background component
    const bgPropsWithContext = needsContext 
      ? { ...backgroundProps, contextConfig } 
      : backgroundProps;
    
    return (
      <Box sx={{ position: 'relative', width: '100%', height: '100vh' }}>
        {showTopBar && <AppTopBar />}
        <Box sx={{ position: 'absolute', opacity: 0, pointerEvents: 'none', zIndex: -1 }}>
          <BackgroundComponent {...bgPropsWithContext} />
        </Box>
        <ViewComponent {...viewProps} />
      </Box>
    );
  }

  if (!showTopBar) {
    // View has its own topbar (e.g., ClosingView)
    const propsWithContext = needsContext 
      ? { ...viewProps, contextConfig } 
      : viewProps;
    return <ViewComponent {...propsWithContext} />;
  }

  // Standard view with topbar
  const propsWithContext = needsContext 
    ? { ...viewProps, contextConfig } 
    : viewProps;
  
  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100vh' }}>
      <AppTopBar />
      <ViewComponent {...propsWithContext} />
    </Box>
  );
}

