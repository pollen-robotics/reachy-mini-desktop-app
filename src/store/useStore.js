import { create } from 'zustand';
import { windowSyncMiddleware } from './middleware/windowSync';
import {
  createRobotSlice,
  createLogsSlice,
  createUISlice,
  createAppsSlice,
  setupSystemPreferenceListener,
} from './slices';
import { logReset, logInstallStart, logInstallEnd } from './storeLogger';

/**
 * ✨ Unified Store with Slices Architecture
 * 
 * This store combines all domain slices into a single Zustand store:
 * - Robot: Connection, status, state machine
 * - Logs: Daemon, frontend, app logs
 * - UI: Theme, windows, panel views
 * - Apps: Application data, installation
 * 
 * Benefits:
 * - Single store = no subscription sync overhead
 * - Atomic cross-slice actions (resetAll)
 * - Modular code organization
 * - Full backwards compatibility via proxy
 */
export const useStore = create(
  windowSyncMiddleware((set, get, api) => ({
    // ============================================
    // SLICES
    // ============================================
    ...createRobotSlice(set, get),
    ...createLogsSlice(set, get),
    ...createUISlice(set, get),
    ...createAppsSlice(set, get),
    
    // ============================================
    // CROSS-SLICE ACTIONS
    // ============================================
    
    /**
     * ✅ CRITICAL: Reset all state on disconnect
     * This is an atomic action that resets robot AND apps state together
     * Solving the issue where apps weren't cleared on mode switch
     */
    resetAll: () => {
      logReset('all');
      
      set({
        // Robot state reset (robotStatus is the source of truth)
        robotStatus: 'disconnected',
        busyReason: null,
        // Derived booleans (kept in sync)
        isActive: false,
        isStarting: false,
        isStopping: false,
        isDaemonCrashed: false,
        // Connection
        connectionMode: null,
        remoteHost: null,
        isUsbConnected: false,
        usbPortName: null,
        isFirstCheck: true,
        daemonVersion: null,
        robotStateFull: { data: null, lastUpdate: null, error: null },
        activeMoves: [],
        consecutiveTimeouts: 0,
        hardwareError: null,
        startupError: null,
        isCommandRunning: false,
        isAppRunning: false,
        isInstalling: false,
        currentAppName: null,
        activeEffect: null,
        
        // Apps state reset
        availableApps: [],
        installedApps: [],
        currentApp: null,
        activeJobs: {},
        appsLoading: false,
        appsError: null,
        appsLastFetch: null,
        appsCacheValid: false,
        installingAppName: null,
        installJobType: null,
        installResult: null,
        installStartTime: null,
        processedJobs: [],
        jobSeenOnce: false,
        isStoppingApp: false,
        
        // Logs reset (optional - can be preserved)
        appLogs: [],
        daemonOutputLogs: [], // Clear daemon output logs on disconnect
        // frontendLogs: [], // Keep frontend logs for debugging
        // logs: [], // Keep daemon lifecycle logs for debugging
      });
    },
    
    // ============================================
    // INSTALLATION WITH ROBOT STATE
    // ============================================
    
    /**
     * Lock for install with robot state transition
     * Combines appsSlice.lockForInstall with robotSlice.transitionTo.busy
     */
    lockForInstallWithRobot: (appName, jobType = 'install') => {
      const state = get();
      state.transitionTo.busy('installing');
      state.lockForInstall(appName, jobType);
    },
    
    /**
     * Unlock install with robot state transition
     * Combines appsSlice.unlockInstall with robotSlice.transitionTo.ready
     */
    unlockInstallWithRobot: () => {
      const state = get();
      state.transitionTo.ready();
      state.unlockInstall();
    },
    
    // ============================================
    // GENERIC UPDATE ACTION (backwards compat)
    // ============================================
    
    /**
     * Generic update for backwards compatibility
     * Accepts any state updates
     */
    update: (updates) => set(updates),
  }))
);

// Setup system preference listener for dark mode
if (typeof window !== 'undefined') {
  setupSystemPreferenceListener(
    useStore.getState,
    useStore.setState
  );
}

export default useStore;

