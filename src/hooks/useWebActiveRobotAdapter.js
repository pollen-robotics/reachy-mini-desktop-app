/**
 * @fileoverview Web-only adapter for ActiveRobotModule
 * 
 * Simplified version of useActiveRobotAdapter that uses fetch() instead of Tauri APIs.
 * Used when the app is running in web-only mode (dashboard-v2).
 */

import { useMemo, useCallback } from 'react';
import useAppStore from '../store/useAppStore';
import { DAEMON_CONFIG, buildApiUrl, fetchWithTimeout, getBaseUrl } from '../config/daemon';
import { openUrl } from '../utils/tauriCompat';

/**
 * Web-only adapter hook for ActiveRobotModule
 * Uses REST API instead of Tauri IPC
 */
export function useWebActiveRobotAdapter() {
  // ============================================
  // ROBOT STATE - Read from useAppStore
  // ============================================
  
  const isActive = useAppStore(state => state.isActive);
  const darkMode = useAppStore(state => state.darkMode);
  const robotStatus = useAppStore(state => state.robotStatus);
  const busyReason = useAppStore(state => state.busyReason);
  const isAppRunning = useAppStore(state => state.isAppRunning);
  const isInstalling = useAppStore(state => state.isInstalling);
  const isCommandRunning = useAppStore(state => state.isCommandRunning);
  const currentAppName = useAppStore(state => state.currentAppName);
  const robotStateFull = useAppStore(state => state.robotStateFull);
  const activeMoves = useAppStore(state => state.activeMoves);
  const isDaemonCrashed = useAppStore(state => state.isDaemonCrashed);
  const rightPanelView = useAppStore(state => state.rightPanelView);
  const activeEffect = useAppStore(state => state.activeEffect);
  const effectTimestamp = useAppStore(state => state.effectTimestamp);
  
  // Apps state
  const availableApps = useAppStore(state => state.availableApps);
  const installedApps = useAppStore(state => state.installedApps);
  const currentApp = useAppStore(state => state.currentApp);
  const activeJobs = useAppStore(state => state.activeJobs);
  const appsLoading = useAppStore(state => state.appsLoading);
  const appsError = useAppStore(state => state.appsError);
  const appsOfficialMode = useAppStore(state => state.appsOfficialMode);
  const appsCacheValid = useAppStore(state => state.appsCacheValid);
  const installingAppName = useAppStore(state => state.installingAppName);
  const installJobType = useAppStore(state => state.installJobType);
  const installResult = useAppStore(state => state.installResult);
  const installStartTime = useAppStore(state => state.installStartTime);
  const processedJobs = useAppStore(state => state.processedJobs);
  const jobSeenOnce = useAppStore(state => state.jobSeenOnce);
  
  // Logs
  const logs = useAppStore(state => state.logs);
  const appLogs = useAppStore(state => state.appLogs);
  
  // ============================================
  // MEMOIZED ROBOT STATE
  // ============================================
  
  const robotState = useMemo(() => ({
    isActive,
    darkMode,
    robotStatus,
    busyReason,
    isAppRunning,
    isInstalling,
    isCommandRunning,
    currentAppName,
    robotStateFull,
    activeMoves,
    isDaemonCrashed,
    rightPanelView,
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
  }), [
    isActive, darkMode, robotStatus, busyReason, isAppRunning, isInstalling, isCommandRunning,
    currentAppName, robotStateFull, activeMoves, isDaemonCrashed, rightPanelView,
    activeEffect, effectTimestamp,
    availableApps, installedApps, currentApp, activeJobs, appsLoading,
    appsError, appsOfficialMode, appsCacheValid, installingAppName,
    installJobType, installResult, installStartTime, processedJobs, jobSeenOnce,
    logs, appLogs,
  ]);
  
  // ============================================
  // ACTIONS
  // ============================================
  
  const actions = useMemo(() => {
    const store = useAppStore.getState();
    
    return {
      update: store.update,
      transitionTo: store.transitionTo,
      isBusy: store.isBusy,
      isReady: store.isReady,
      getRobotStatusLabel: store.getRobotStatusLabel,
      lockForApp: store.lockForApp,
      unlockApp: store.unlockApp,
      lockForInstall: store.lockForInstall,
      unlockInstall: store.unlockInstall,
      setIsActive: store.setIsActive,
      setIsStarting: store.setIsStarting,
      setIsStopping: store.setIsStopping,
      setRobotStateFull: store.setRobotStateFull,
      setActiveMoves: store.setActiveMoves,
      setIsCommandRunning: store.setIsCommandRunning,
      triggerEffect: store.triggerEffect,
      stopEffect: store.stopEffect,
      resetTimeouts: store.resetTimeouts,
      incrementTimeouts: store.incrementTimeouts,
      setRightPanelView: store.setRightPanelView,
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
  
  const api = useMemo(() => ({
    getBaseUrl, // 🌐 Dynamic base URL based on connection mode
    timeouts: DAEMON_CONFIG.TIMEOUTS,
    intervals: DAEMON_CONFIG.INTERVALS,
    endpoints: DAEMON_CONFIG.ENDPOINTS,
    buildApiUrl,
    fetchWithTimeout,
    config: DAEMON_CONFIG,
  }), []);
  
  // ============================================
  // SHELL API (Web mode - uses window.open)
  // ============================================
  
  const shellApi = useMemo(() => ({
    open: openUrl,
  }), []);
  
  // ============================================
  // WINDOW MANAGER (Mock for web mode)
  // ============================================
  
  const windowManager = useMemo(() => ({
    openExpressionsWindow: () => {
      console.log('[WebMode] openExpressionsWindow - not available in web mode');
    },
    closeExpressionsWindow: () => {
      console.log('[WebMode] closeExpressionsWindow - not available in web mode');
    },
    isExpressionsWindowOpen: () => false,
    openDevWindow: () => {
      console.log('[WebMode] openDevWindow - not available in web mode');
    },
    closeDevWindow: () => {
      console.log('[WebMode] closeDevWindow - not available in web mode');
    },
    isDevWindowOpen: () => false,
    getAppWindow: () => ({
      label: 'web',
      setTitle: async () => {},
      close: async () => {},
    }),
  }), []);
  
  // ============================================
  // RETURN CONFIG
  // ============================================
  
  return useMemo(() => ({
    robotState,
    actions,
    api,
    shellApi,
    windowManager,
  }), [robotState, actions, api, shellApi, windowManager]);
}

