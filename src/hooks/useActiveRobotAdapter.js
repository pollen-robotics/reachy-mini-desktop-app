/**
 * @fileoverview Adapter hook that reads from Zustand stores and builds the context config
 * This is the bridge between the global app state and the ActiveRobot module
 */

import { useMemo, useCallback } from 'react';
import useAppStore from '../store/useAppStore';
import { buildApiUrl, fetchWithTimeout, DAEMON_CONFIG } from '../config/daemon';
import { getAppWindow } from '../utils/windowUtils';

// Import openUrl from tauriCompat for cross-platform URL opening
import { openUrl } from '../utils/tauriCompat';

/**
 * Adapter hook that creates the context configuration for ActiveRobotModule
 * Reads from Zustand stores and provides a unified interface
 * 
 * @returns {import('../views/active-robot/context/types').ActiveRobotContextConfig}
 */
export function useActiveRobotAdapter() {
  // ============================================
  // ROBOT STATE - Read from useAppStore
  // ============================================
  
  // Use individual selectors for better performance (Zustand optimizes these)
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
  
  // Logs state
  const logs = useAppStore(state => state.logs);
  const appLogs = useAppStore(state => state.appLogs);
  
  // ============================================
  // MEMOIZED ROBOT STATE OBJECT
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
    
    // Apps state
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
    
    // Logs
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
  // ACTIONS - Wrapped store actions
  // ============================================
  const actions = useMemo(() => {
    // Get actions from store (these are stable references)
    const store = useAppStore.getState();
    
    return {
      // Generic update
      update: store.update,
      
      // State transitions
      transitionTo: store.transitionTo,
      
      // Status helpers
      isBusy: store.isBusy,
      isReady: store.isReady,
      getRobotStatusLabel: store.getRobotStatusLabel,
      
      // App locking
      lockForApp: store.lockForApp,
      unlockApp: store.unlockApp,
      lockForInstall: store.lockForInstall,
      unlockInstall: store.unlockInstall,
      
      // Robot state setters
      setIsActive: store.setIsActive,
      setIsStarting: store.setIsStarting,
      setIsStopping: store.setIsStopping,
      setRobotStateFull: store.setRobotStateFull,
      setActiveMoves: store.setActiveMoves,
      setIsCommandRunning: store.setIsCommandRunning,
      
      // Effects
      triggerEffect: store.triggerEffect,
      stopEffect: store.stopEffect,
      
      // Timeout management
      resetTimeouts: store.resetTimeouts,
      incrementTimeouts: store.incrementTimeouts,
      
      // UI
      setRightPanelView: store.setRightPanelView,
      setDarkMode: store.setDarkMode,
      toggleDarkMode: store.toggleDarkMode,
      
      // Apps management
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
      
      // Logs
      setLogs: store.setLogs,
      addAppLog: store.addAppLog,
      clearAppLogs: store.clearAppLogs,
    };
  }, []); // Actions are stable, no deps needed
  
  // ============================================
  // API CONFIGURATION
  // ============================================
  const api = useMemo(() => ({
    baseUrl: DAEMON_CONFIG.ENDPOINTS.BASE_URL,
    timeouts: DAEMON_CONFIG.TIMEOUTS,
    intervals: DAEMON_CONFIG.INTERVALS,
    endpoints: DAEMON_CONFIG.ENDPOINTS,
    buildApiUrl,
    fetchWithTimeout,
    config: DAEMON_CONFIG,
  }), []);
  
  // ============================================
  // SHELL API (Uses tauriCompat for cross-platform support)
  // ============================================
  const shellApi = useMemo(() => ({
    open: openUrl,
  }), []);
  
  // ============================================
  // WINDOW MANAGER (Abstracted from Tauri)
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
  
  // ============================================
  // COMPLETE CONTEXT CONFIG
  // ============================================
  const contextConfig = useMemo(() => ({
    robotState,
    actions,
    api,
    shellApi,
    windowManager,
  }), [robotState, actions, api, shellApi, windowManager]);
  
  return contextConfig;
}

export default useActiveRobotAdapter;

