/**
 * Web-only adapter for ActiveRobotModule.
 *
 * Simplified version of `useActiveRobotAdapter` that uses `fetch()` and
 * browser APIs instead of Tauri IPC. Used when the app runs in web-only
 * mode (dashboard-v2).
 */

import { useMemo } from 'react';
import useAppStore from '../store/useAppStore';
import { DAEMON_CONFIG, buildApiUrl, fetchWithTimeout, getBaseUrl } from '@config/daemon';
import { openUrl } from '@utils/tauriCompat';
import type { AppState } from '../types/store';
import type { FullAppState } from '../store/useStore';
import type {
  WebActiveRobotContextConfig,
  WebAppWindowStub,
} from './adapters/activeRobotContextTypes';

export function useWebActiveRobotAdapter(): WebActiveRobotContextConfig {
  // ============================================
  // ROBOT STATE - Read from useAppStore
  // ============================================

  const isActive = useAppStore((state: AppState) => state.isActive);
  const darkMode = useAppStore((state: AppState) => state.darkMode);
  const robotStatus = useAppStore((state: AppState) => state.robotStatus);
  const busyReason = useAppStore((state: AppState) => state.busyReason);
  const safeToShutdown = useAppStore((state: AppState) => state.safeToShutdown);
  const isWakeSleepTransitioning = useAppStore((state: AppState) => state.isWakeSleepTransitioning);
  const isAppRunning = useAppStore((state: AppState) => state.isAppRunning);
  const isInstalling = useAppStore((state: AppState) => state.isInstalling);
  const isCommandRunning = useAppStore((state: AppState) => state.isCommandRunning);
  const currentAppName = useAppStore((state: AppState) => state.currentAppName);
  const robotStateFull = useAppStore((state: AppState) => state.robotStateFull);
  const activeMoves = useAppStore((state: AppState) => state.activeMoves);
  const isDaemonCrashed = useAppStore((state: AppState) => state.isDaemonCrashed);
  const rightPanelView = useAppStore((state: AppState) => state.rightPanelView);
  const embeddedAppUrl = useAppStore((state: AppState) => state.embeddedAppUrl);
  const activeEffect = useAppStore((state: AppState) => state.activeEffect);
  const effectTimestamp = useAppStore((state: AppState) => state.effectTimestamp);

  // Apps state
  const availableApps = useAppStore((state: AppState) => state.availableApps);
  const installedApps = useAppStore((state: AppState) => state.installedApps);
  const currentApp = useAppStore((state: AppState) => state.currentApp);
  const activeJobs = useAppStore((state: AppState) => state.activeJobs);
  const appsLoading = useAppStore((state: AppState) => state.appsLoading);
  const appsError = useAppStore((state: AppState) => state.appsError);
  const appsOfficialMode = useAppStore((state: AppState) => state.appsOfficialMode);
  const appsCacheValid = useAppStore((state: AppState) => state.appsCacheValid);
  const installingAppName = useAppStore((state: AppState) => state.installingAppName);
  const installJobType = useAppStore((state: AppState) => state.installJobType);
  const installResult = useAppStore((state: AppState) => state.installResult);
  const installStartTime = useAppStore((state: AppState) => state.installStartTime);
  const processedJobs = useAppStore((state: AppState) => state.processedJobs);
  const jobSeenOnce = useAppStore((state: AppState) => state.jobSeenOnce);

  // Logs
  const logs = useAppStore((state: AppState) => state.logs);
  const appLogs = useAppStore((state: AppState) => state.appLogs);

  // ============================================
  // MEMOIZED ROBOT STATE
  // ============================================

  const robotState = useMemo(
    () => ({
      isActive,
      darkMode,
      robotStatus,
      busyReason,
      safeToShutdown,
      isWakeSleepTransitioning,
      isAppRunning,
      isInstalling,
      isCommandRunning,
      currentAppName,
      robotStateFull,
      activeMoves,
      isDaemonCrashed,
      rightPanelView,
      embeddedAppUrl,
      activeEffect,
      effectTimestamp,
      availableApps,
      installedApps,
      currentApp,
      activeJobs,
      appsLoading,
      appsError,
      appsOfficialMode,
      appsCacheValid,
      installingAppName,
      installJobType,
      installResult,
      installStartTime,
      processedJobs,
      jobSeenOnce,
      logs,
      appLogs,
    }),
    [
      isActive,
      darkMode,
      robotStatus,
      busyReason,
      safeToShutdown,
      isWakeSleepTransitioning,
      isAppRunning,
      isInstalling,
      isCommandRunning,
      currentAppName,
      robotStateFull,
      activeMoves,
      isDaemonCrashed,
      rightPanelView,
      embeddedAppUrl,
      activeEffect,
      effectTimestamp,
      availableApps,
      installedApps,
      currentApp,
      activeJobs,
      appsLoading,
      appsError,
      appsOfficialMode,
      appsCacheValid,
      installingAppName,
      installJobType,
      installResult,
      installStartTime,
      processedJobs,
      jobSeenOnce,
      logs,
      appLogs,
    ]
  );

  // ============================================
  // ACTIONS
  // ============================================

  const actions = useMemo(() => {
    const store = useAppStore.getState() as FullAppState;

    return {
      update: store.update,
      transitionTo: store.transitionTo,
      isBusy: store.isBusy,
      isReady: store.isReady,
      getRobotStatusLabel: store.getRobotStatusLabel,
      lockForApp: store.lockForApp,
      unlockApp: store.unlockApp,
      lockForInstall: store.lockForInstallWithRobot,
      unlockInstall: store.unlockInstallWithRobot,
      setRobotStateFull: store.setRobotStateFull,
      setActiveMoves: store.setActiveMoves,
      setIsCommandRunning: store.setIsCommandRunning,
      triggerEffect: store.triggerEffect,
      stopEffect: store.stopEffect,
      resetTimeouts: store.resetTimeouts,
      incrementTimeouts: store.incrementTimeouts,
      setRightPanelView: store.setRightPanelView,
      openEmbeddedApp: store.openEmbeddedApp,
      closeEmbeddedApp: store.closeEmbeddedApp,
      setDarkMode: store.setDarkMode,
      toggleDarkMode: store.toggleDarkMode,
      setAvailableApps: store.setAvailableApps,
      setInstalledApps: store.setInstalledApps,
      setCurrentApp: store.setCurrentApp,
      setActiveJobs: store.setActiveJobs,
      setAppsLoading: store.setAppsLoading,
      setAppsError: store.setAppsError,
      setAppsOfficialMode: store.setAppsOfficialMode,
      invalidateAppsCache: store.invalidateAppsCache,
      clearApps: store.clearApps,
      setInstallResult: store.setInstallResult,
      markJobAsSeen: store.markJobAsSeen,
      markJobAsProcessed: store.markJobAsProcessed,
      setLogs: store.setLogs,
      addAppLog: store.addAppLog,
      clearAppLogs: store.clearAppLogs,
    };
  }, []);

  // ============================================
  // API CONFIG
  // ============================================

  const api = useMemo(
    () => ({
      getBaseUrl, // 🌐 Dynamic base URL based on connection mode
      timeouts: DAEMON_CONFIG.TIMEOUTS,
      intervals: DAEMON_CONFIG.INTERVALS,
      endpoints: DAEMON_CONFIG.ENDPOINTS,
      buildApiUrl,
      fetchWithTimeout,
      config: DAEMON_CONFIG,
    }),
    []
  );

  // ============================================
  // SHELL API (web mode - uses openUrl shim which falls back to window.open)
  // ============================================

  const shellApi = useMemo(
    () => ({
      open: openUrl,
    }),
    []
  );

  // ============================================
  // WINDOW MANAGER (mock for web mode - multi-window ops not supported)
  // ============================================

  const windowManager = useMemo(() => {
    const appWindowStub: WebAppWindowStub = {
      label: 'web',
      setTitle: async () => {},
      close: async () => {},
    };

    return {
      openExpressionsWindow: (): void => {
        console.log('[WebMode] openExpressionsWindow - not available in web mode');
      },
      closeExpressionsWindow: (): void => {
        console.log('[WebMode] closeExpressionsWindow - not available in web mode');
      },
      isExpressionsWindowOpen: (): boolean => false,
      openDevWindow: (): void => {
        console.log('[WebMode] openDevWindow - not available in web mode');
      },
      closeDevWindow: (): void => {
        console.log('[WebMode] closeDevWindow - not available in web mode');
      },
      isDevWindowOpen: (): boolean => false,
      getAppWindow: (): WebAppWindowStub => appWindowStub,
    };
  }, []);

  return useMemo(
    () => ({
      robotState,
      actions,
      api,
      shellApi,
      windowManager,
    }),
    [robotState, actions, api, shellApi, windowManager]
  );
}

export default useWebActiveRobotAdapter;
