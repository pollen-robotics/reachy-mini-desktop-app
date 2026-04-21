/**
 * Adapter hook that reads from the Zustand store and builds the context
 * config consumed by the ActiveRobotModule.
 *
 * Bridges the global app state and the ActiveRobot context, exposing a
 * stable, bundled interface.
 */

import { useMemo } from 'react';
import useAppStore from '../store/useAppStore';
import { buildApiUrl, fetchWithTimeout, getBaseUrl, DAEMON_CONFIG } from '@config/daemon';
import { getAppWindow } from '../utils/windowUtils';
import { openUrl } from '@utils/tauriCompat';
import type { AppState } from '../types/store';
import type { FullAppState } from '../store/useStore';
import type { ActiveRobotContextConfig } from './adapters/activeRobotContextTypes';

export function useActiveRobotAdapter(): ActiveRobotContextConfig {
  // ============================================
  // ROBOT STATE - Read from useAppStore
  // ============================================
  // Use individual selectors so Zustand can skip renders on unrelated updates.

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

  // Logs state
  const logs = useAppStore((state: AppState) => state.logs);
  const appLogs = useAppStore((state: AppState) => state.appLogs);

  // ============================================
  // MEMOIZED ROBOT STATE OBJECT
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
  // ACTIONS - Wrapped store actions (stable references from Zustand)
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

      // Legacy setters (use transitionTo instead of setIsActive / setIsStarting / setIsStopping).
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
  // API CONFIGURATION
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
  // SHELL API (cross-platform URL opening via tauriCompat)
  // ============================================
  const shellApi = useMemo(
    () => ({
      open: openUrl,
    }),
    []
  );

  // ============================================
  // WINDOW MANAGER (Tauri)
  // ============================================
  const windowManager = useMemo(() => {
    const store = useAppStore.getState();

    return {
      getAppWindow: () => getAppWindow(),
      addOpenWindow: store.addOpenWindow,
      removeOpenWindow: store.removeOpenWindow,
      isWindowOpen: store.isWindowOpen,
    };
  }, []);

  const contextConfig = useMemo(
    () => ({
      robotState,
      actions,
      api,
      shellApi,
      windowManager,
    }),
    [robotState, actions, api, shellApi, windowManager]
  );

  return contextConfig;
}

export default useActiveRobotAdapter;
