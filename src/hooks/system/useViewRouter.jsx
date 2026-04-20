import React, { useMemo } from 'react';
import { Box } from '@mui/material';
import {
  PermissionsRequiredView,
  FindingRobotView,
  FirstTimeWifiSetupView,
  BluetoothSupportView,
  SetupChoiceView,
  StartingView,
  FirstWakeUpView,
  ClosingView,
  UpdateView,
  ActiveRobotModule,
} from '../../views';
import AppTopBar from '../../components/AppTopBar';
import { useActiveRobotAdapter } from '../useActiveRobotAdapter';
import useAppStore from '../../store/useAppStore';

/**
 * Hook to determine which view to display based on app state.
 * Uses a priority-based system where the first matching condition wins.
 *
 * Priority order:
 * 0.   Permissions (macOS only) - Blocks app until permissions granted
 * 1.   Update view - Check and download updates
 * 2.   Setup choice - WiFi vs Bluetooth choice overlay
 * 2.5. First time WiFi setup - Guided WiFi configuration wizard
 * 2.75. Bluetooth support - Native BLE reset tool
 * 3.   Finding robot - User selects connection (USB/WiFi/Sim) and clicks Start
 * 4.   Starting daemon (visual scan) - Also used for WiFi mode
 * 4.5. First wake-up - Diagnostic wizard (shown once after first daemon startup)
 * 5.   Stopping daemon - Shutdown spinner
 * 6.   Active robot - Full control view (handles its own loading state)
 *
 * @param {object} props - View routing props
 * @returns {object} { viewComponent, viewProps, showTopBar, needsContext }
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
  connectionMode, // 🌐 'usb' | 'wifi' | 'simulation' | null

  // Daemon
  isStarting,
  isStopping,
  isActive,
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
}) {
  const {
    showSetupChoice,
    setShowSetupChoice,
    showFirstTimeWifiSetup,
    setShowFirstTimeWifiSetup,
    showBluetoothSupportView,
    setShowBluetoothSupportView,
    showFirstWakeUp,
    setShowFirstWakeUp,
  } = useAppStore();

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

    // PRIORITY 2: Setup choice view (WiFi vs Bluetooth)
    if (showSetupChoice) {
      return {
        viewComponent: SetupChoiceView,
        viewProps: {},
        showTopBar: false,
      };
    }

    // PRIORITY 2.5: First time WiFi setup view
    if (showFirstTimeWifiSetup) {
      return {
        viewComponent: FirstTimeWifiSetupView,
        viewProps: {
          onBack: () => setShowFirstTimeWifiSetup(false),
        },
        showTopBar: false, // FirstTimeWifiSetupView has its own back button
      };
    }

    // PRIORITY 2.75: Bluetooth support view
    if (showBluetoothSupportView) {
      return {
        viewComponent: BluetoothSupportView,
        viewProps: {
          onBack: () => setShowBluetoothSupportView(false),
        },
        showTopBar: false, // BluetoothSupportView has its own close button
      };
    }

    // PRIORITY 3: Finding robot view
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

    // PRIORITY 4.5: First wake-up diagnostic wizard
    if (showFirstWakeUp) {
      return {
        viewComponent: FirstWakeUpView,
        viewProps: {
          onComplete: () => setShowFirstWakeUp(false),
        },
        showTopBar: true,
      };
    }

    // PRIORITY 5: Stopping daemon
    if (isStopping) {
      return {
        viewComponent: ClosingView,
        viewProps: {},
        showTopBar: false, // ClosingView has its own topbar
      };
    }

    // PRIORITY 6: Active robot
    // ✅ ActiveRobotView handles its own loading state for apps
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
    showSetupChoice,
    setShowSetupChoice,
    showFirstTimeWifiSetup,
    setShowFirstTimeWifiSetup,
    showBluetoothSupportView,
    setShowBluetoothSupportView,
    showFirstWakeUp,
    setShowFirstWakeUp,
    shouldShowUsbCheck,
    isUsbConnected,
    connectionMode,
    isStarting,
    isStopping,
    isActive,
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
  ]);
}

/**
 * Component wrapper that renders the routed view
 * Injects contextConfig for ActiveRobotModule when needsContext is true
 */
export function ViewRouterWrapper({ viewConfig }) {
  const { viewComponent: ViewComponent, viewProps, showTopBar, needsContext } = viewConfig;

  // Get context config from adapter (only used when needsContext is true)
  // This is always called (React hooks rule) but only used when needed
  const contextConfig = useActiveRobotAdapter();

  const propsWithContext = needsContext ? { ...viewProps, contextConfig } : viewProps;

  if (!showTopBar) {
    // View has its own topbar (e.g., ClosingView)
    return <ViewComponent {...propsWithContext} />;
  }

  // Standard view with topbar
  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100vh' }}>
      <AppTopBar />
      <ViewComponent {...propsWithContext} />
    </Box>
  );
}
