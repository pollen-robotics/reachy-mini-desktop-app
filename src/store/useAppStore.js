import { create } from 'zustand';
import { DAEMON_CONFIG } from '../config/daemon';
import { windowSyncMiddleware } from './middleware/windowSync';
import { useRobotStore } from './useRobotStore';
import { useLogsStore } from './useLogsStore';
import { useUIStore } from './useUIStore';

// Track last logged state to avoid repeated logs
let lastLoggedStatus = null;

/**
 * Composite store that combines useRobotStore, useLogsStore, and useUIStore
 * while maintaining the same public API for backward compatibility.
 * 
 * This store synchronizes state from specialized stores and provides
 * a unified interface for the rest of the application.
 */
const useAppStore = create(
  windowSyncMiddleware((set, get, api) => {
    // Flag to prevent infinite sync loops
    let isSyncing = false;
    
    // Helper to sync state from specialized stores into this store
    const syncFromSpecializedStores = () => {
      if (isSyncing) return; // Prevent infinite loops
      isSyncing = true;
      
      try {
        const robotState = useRobotStore.getState();
        const logsState = useLogsStore.getState();
        const uiState = useUIStore.getState();
        
        // Sync all state from specialized stores
        set({
        // Robot state
        robotStatus: robotState.robotStatus,
        busyReason: robotState.busyReason,
        isActive: robotState.isActive,
        isStarting: robotState.isStarting,
        isStopping: robotState.isStopping,
        isTransitioning: robotState.isTransitioning,
        daemonVersion: robotState.daemonVersion,
        startupError: robotState.startupError,
        hardwareError: robotState.hardwareError,
        isDaemonCrashed: robotState.isDaemonCrashed,
        consecutiveTimeouts: robotState.consecutiveTimeouts,
        startupTimeoutId: robotState.startupTimeoutId,
        isUsbConnected: robotState.isUsbConnected,
        usbPortName: robotState.usbPortName,
        isFirstCheck: robotState.isFirstCheck,
        connectionMode: robotState.connectionMode,
        remoteHost: robotState.remoteHost,
        robotStateFull: robotState.robotStateFull,
        activeMoves: robotState.activeMoves,
        isCommandRunning: robotState.isCommandRunning,
        isAppRunning: robotState.isAppRunning,
        isInstalling: robotState.isInstalling,
        currentAppName: robotState.currentAppName,
        activeEffect: robotState.activeEffect,
        effectTimestamp: robotState.effectTimestamp,
        
        // Logs state
        logs: logsState.logs,
        frontendLogs: logsState.frontendLogs,
        appLogs: logsState.appLogs,
        
        // UI state
        darkMode: uiState.darkMode,
        openWindows: uiState.openWindows,
        rightPanelView: uiState.rightPanelView,
        });
      } finally {
        isSyncing = false;
      }
    };
    
    // Initial sync
    syncFromSpecializedStores();
    
    // Subscribe to specialized stores to keep this store in sync
    useRobotStore.subscribe(() => {
      syncFromSpecializedStores();
    });
    
    useLogsStore.subscribe(() => {
      syncFromSpecializedStores();
    });
    
    useUIStore.subscribe(() => {
      syncFromSpecializedStores();
    });
    
    // Apps Management state (stays in useAppStore)
    return {
      // Initial state will be synced from specialized stores above
      availableApps: [],
      installedApps: [],
      currentApp: null,
      activeJobs: {},
      appsLoading: false,
      appsError: null,
      appsLastFetch: null,
      appsOfficialMode: true,
      appsCacheValid: false,
      installingAppName: null,
      installJobType: null,
      installResult: null,
      installStartTime: null,
      processedJobs: [],
      jobSeenOnce: false,
      
      // Generic update action
      update: (updates) => {
        // Split updates by store
        const robotUpdates = {};
        const logsUpdates = {};
        const uiUpdates = {};
        const appUpdates = {};
        
        const appKeys = [
          'availableApps', 'installedApps', 'currentApp', 'activeJobs',
          'appsLoading', 'appsError', 'appsLastFetch', 'appsOfficialMode', 'appsCacheValid',
          'installingAppName', 'installJobType', 'installResult', 'installStartTime',
          'processedJobs', 'jobSeenOnce'
        ];
        
        Object.keys(updates).forEach(key => {
          if (appKeys.includes(key)) {
            appUpdates[key] = updates[key];
          } else if (key in useRobotStore.getState()) {
            robotUpdates[key] = updates[key];
          } else if (key in useLogsStore.getState()) {
            logsUpdates[key] = updates[key];
          } else if (key in useUIStore.getState()) {
            uiUpdates[key] = updates[key];
          } else {
            appUpdates[key] = updates[key];
          }
        });
        
        // Update each store
        if (Object.keys(robotUpdates).length > 0) {
          useRobotStore.setState(robotUpdates);
        }
        if (Object.keys(logsUpdates).length > 0) {
          useLogsStore.setState(logsUpdates);
        }
        if (Object.keys(uiUpdates).length > 0) {
          useUIStore.setState(uiUpdates);
        }
        if (Object.keys(appUpdates).length > 0) {
          set(appUpdates);
        }
      },
      
      // ============================================
      // ROBOT ACTIONS (delegate to useRobotStore)
      // ============================================
      transitionTo: {
        disconnected: () => {
          lastLoggedStatus = 'disconnected';
          useRobotStore.getState().transitionTo.disconnected();
        },
        readyToStart: () => {
          lastLoggedStatus = 'ready-to-start';
          useRobotStore.getState().transitionTo.readyToStart();
        },
        starting: () => {
          lastLoggedStatus = 'starting';
          useRobotStore.getState().transitionTo.starting();
        },
        ready: () => {
          const robotState = useRobotStore.getState();
          if (robotState.hardwareError) {
            console.warn('⚠️ Cannot transition to ready while hardwareError is present');
            return;
          }
          lastLoggedStatus = 'ready';
          robotState.transitionTo.ready();
        },
        busy: (reason) => {
          const newStatus = `busy (${reason})`;
          lastLoggedStatus = newStatus;
          useRobotStore.getState().transitionTo.busy(reason);
        },
        stopping: () => {
          lastLoggedStatus = 'stopping';
          useRobotStore.getState().transitionTo.stopping();
        },
        crashed: () => {
          lastLoggedStatus = 'crashed';
          const robotState = useRobotStore.getState();
          if (robotState.isAppRunning) {
            // unlockApp will be called from useAppStore
            const appState = get();
            if (appState.currentAppName) {
              appState.unlockApp();
            }
          }
          robotState.transitionTo.crashed();
        },
      },
      
      isBusy: () => useRobotStore.getState().isBusy(),
      isReady: () => useRobotStore.getState().isReady(),
      getRobotStatusLabel: () => useRobotStore.getState().getRobotStatusLabel(),
      
      lockForApp: (appName) => {
        useRobotStore.getState().lockForApp(appName);
      },
      unlockApp: () => {
        useRobotStore.getState().unlockApp();
      },
      
      setIsActive: (value) => useRobotStore.getState().setIsActive(value),
      setIsStarting: (value) => useRobotStore.getState().setIsStarting(value),
      setIsStopping: (value) => useRobotStore.getState().setIsStopping(value),
      setIsTransitioning: (value) => useRobotStore.setState({ isTransitioning: value }),
      setDaemonVersion: (value) => useRobotStore.setState({ daemonVersion: value }),
      setStartupError: (value) => useRobotStore.setState({ startupError: value }),
      setHardwareError: (value) => useRobotStore.setState({ hardwareError: value }),
      setIsUsbConnected: (value) => useRobotStore.getState().setIsUsbConnected(value),
      setUsbPortName: (value) => useRobotStore.setState({ usbPortName: value }),
      setIsFirstCheck: (value) => useRobotStore.setState({ isFirstCheck: value }),
      setConnectionMode: (mode) => useRobotStore.getState().setConnectionMode(mode),
      setRemoteHost: (host) => useRobotStore.getState().setRemoteHost(host),
      isWifiMode: () => useRobotStore.getState().isWifiMode(),
      isLocalDaemon: () => useRobotStore.getState().isLocalDaemon(),
      resetConnection: () => useRobotStore.getState().resetConnection(),
      startConnection: (mode, options) => useRobotStore.getState().startConnection(mode, options),
      setRobotStateFull: (value) => useRobotStore.getState().setRobotStateFull(value),
      setActiveMoves: (value) => useRobotStore.setState({ activeMoves: value }),
      setIsCommandRunning: (value) => useRobotStore.getState().setIsCommandRunning(value),
      
      incrementTimeouts: () => useRobotStore.getState().incrementTimeouts(),
      resetTimeouts: () => useRobotStore.getState().resetTimeouts(),
      markDaemonCrashed: () => useRobotStore.getState().markDaemonCrashed(),
      setStartupTimeout: (timeoutId) => useRobotStore.setState({ startupTimeoutId: timeoutId }),
      clearStartupTimeout: () => useRobotStore.getState().clearStartupTimeout(),
      triggerEffect: (effectType) => useRobotStore.getState().triggerEffect(effectType),
      stopEffect: () => useRobotStore.getState().stopEffect(),
      
      // ============================================
      // LOGS ACTIONS (delegate to useLogsStore)
      // ============================================
      // Note: addFrontendLog removed - use logger functions from utils/logging instead
      setLogs: (newLogs) => useLogsStore.getState().setLogs(newLogs),
      addAppLog: (message, appName, level) => useLogsStore.getState().addAppLog(message, appName, level),
      clearAppLogs: (appName) => useLogsStore.getState().clearAppLogs(appName),
      
      // ============================================
      // UI ACTIONS (delegate to useUIStore)
      // ============================================
      addOpenWindow: (windowLabel) => useUIStore.getState().addOpenWindow(windowLabel),
      removeOpenWindow: (windowLabel) => useUIStore.getState().removeOpenWindow(windowLabel),
      isWindowOpen: (windowLabel) => useUIStore.getState().isWindowOpen(windowLabel),
      setRightPanelView: (view) => useUIStore.getState().setRightPanelView(view),
      setDarkMode: (value) => useUIStore.getState().setDarkMode(value),
      toggleDarkMode: () => useUIStore.getState().toggleDarkMode(),
      resetDarkMode: () => useUIStore.getState().resetDarkMode(),
      
      // ============================================
      // APPS MANAGEMENT ACTIONS
      // ============================================
      setAvailableApps: (apps) => set({ 
        availableApps: apps,
        appsLastFetch: Date.now(),
        appsCacheValid: true,
        appsError: null,
      }),
      setInstalledApps: (apps) => set({ installedApps: apps }),
      setCurrentApp: (app) => set({ currentApp: app }),
      setActiveJobs: (jobs) => {
        if (typeof jobs === 'function') {
          set((state) => {
            const currentJobs = state.activeJobs instanceof Map 
              ? Object.fromEntries(state.activeJobs) 
              : (state.activeJobs || {});
            const newJobs = jobs(new Map(Object.entries(currentJobs)));
            const jobsObj = newJobs instanceof Map 
              ? Object.fromEntries(newJobs) 
              : newJobs;
            return { activeJobs: jobsObj };
          });
        } else {
          const jobsObj = jobs instanceof Map 
            ? Object.fromEntries(jobs) 
            : jobs;
          set({ activeJobs: jobsObj || {} });
        }
      },
      setAppsLoading: (loading) => set({ appsLoading: loading }),
      setAppsError: (error) => set({ appsError: error }),
      setAppsOfficialMode: (mode) => set({ 
        appsOfficialMode: mode,
        appsCacheValid: false,
      }),
      invalidateAppsCache: () => set({ appsCacheValid: false }),
      clearApps: () => set({
        availableApps: [],
        installedApps: [],
        currentApp: null,
        activeJobs: {},
        appsLoading: false,
        appsError: null,
        appsLastFetch: null,
        appsCacheValid: false,
      }),
      
      // ============================================
      // INSTALLATION MANAGEMENT
      // ============================================
      lockForInstall: (appName, jobType = 'install') => {
        useRobotStore.getState().transitionTo.busy('installing');
        set({
          installingAppName: appName,
          installJobType: jobType,
          installResult: null,
          installStartTime: Date.now(),
          jobSeenOnce: false,
        });
        const jobKey = `${appName}_${jobType}`;
        const currentState = get();
        const processedJobs = currentState.processedJobs.filter(key => key !== jobKey);
        set({ processedJobs });
      },
      unlockInstall: () => {
        useRobotStore.getState().transitionTo.ready();
        set({
          installingAppName: null,
          installJobType: null,
          installResult: null,
          installStartTime: null,
          jobSeenOnce: false,
          processedJobs: [],
        });
      },
      setInstallResult: (result) => set({ installResult: result }),
      markJobAsSeen: () => set({ jobSeenOnce: true }),
      markJobAsProcessed: (appName, jobType) => {
        const state = get();
        const jobKey = `${appName}_${jobType}`;
        const processedJobs = state.processedJobs.includes(jobKey) 
          ? state.processedJobs 
          : [...state.processedJobs, jobKey];
        set({ processedJobs });
      },
    };
  })
);

// Listen to system preference changes (delegate to useUIStore)
if (typeof window !== 'undefined') {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  
  const handleSystemPreferenceChange = (e) => {
    const storedPreference = useUIStore.getState().darkMode;
    // useUIStore already handles this, but we sync with useAppStore for compatibility
    useAppStore.setState({ darkMode: e.matches });
  };
  
  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener('change', handleSystemPreferenceChange);
  } else {
    mediaQuery.addListener(handleSystemPreferenceChange);
  }
}

export default useAppStore;
