/**
 * Apps Slice - Manages application data and installation state
 *
 * This slice handles:
 * - Available apps (from HF store)
 * - Installed apps (from daemon)
 * - Current running app
 * - Installation jobs
 * - Cache management
 */
import { logInstallStart, logInstallEnd, logAppStart, logAppStop } from '../storeLogger';

/**
 * Initial state for apps slice
 */
export const appsInitialState = {
  // Apps data
  availableApps: [],
  installedApps: [],
  currentApp: null,

  // Jobs management
  activeJobs: {},

  // Loading/error states
  appsLoading: false,
  appsError: null,

  // Cache management
  appsLastFetch: null,
  appsOfficialMode: true,
  appsCacheValid: false,

  // Installation state
  installingAppName: null,
  installJobType: null,
  installResult: null,
  installStartTime: null,
  processedJobs: [],
  jobSeenOnce: false,

  // App stopping state (for UI feedback during stop request)
  isStoppingApp: false,

  // Deep link pending install (set by root App, processed by ActiveRobotView)
  pendingDeepLinkInstall: null,
};

/**
 * Create apps slice
 * @param {Function} set - Zustand set function
 * @param {Function} get - Zustand get function
 * @returns {Object} Apps slice state and actions
 */
export const createAppsSlice = (set, get) => ({
  ...appsInitialState,

  // ============================================
  // APPS DATA ACTIONS
  // ============================================

  setAvailableApps: apps =>
    set({
      availableApps: apps,
      appsLastFetch: Date.now(),
      appsCacheValid: true,
      appsError: null,
    }),

  setInstalledApps: apps => set({ installedApps: apps }),

  setCurrentApp: app => {
    const prevApp = get().currentApp;
    // Log app transitions
    if (app && !prevApp) {
      logAppStart(app.name || app);
    } else if (!app && prevApp) {
      logAppStop(prevApp.name || prevApp);
    }
    set({ currentApp: app });
  },

  setActiveJobs: jobs => {
    if (typeof jobs === 'function') {
      set(state => {
        const currentJobs =
          state.activeJobs instanceof Map
            ? Object.fromEntries(state.activeJobs)
            : state.activeJobs || {};
        const newJobs = jobs(new Map(Object.entries(currentJobs)));
        const jobsObj = newJobs instanceof Map ? Object.fromEntries(newJobs) : newJobs;
        return { activeJobs: jobsObj };
      });
    } else {
      const jobsObj = jobs instanceof Map ? Object.fromEntries(jobs) : jobs;
      set({ activeJobs: jobsObj || {} });
    }
  },

  setAppsLoading: loading => set({ appsLoading: loading }),

  setAppsError: error => set({ appsError: error }),

  setIsStoppingApp: isStopping => set({ isStoppingApp: isStopping }),

  setAppsOfficialMode: mode =>
    set({
      appsOfficialMode: mode,
      appsCacheValid: false,
    }),

  invalidateAppsCache: () => set({ appsCacheValid: false }),

  // ✅ CRITICAL: Clear all apps data (called on disconnect)
  clearApps: () =>
    set({
      availableApps: [],
      installedApps: [],
      currentApp: null,
      activeJobs: {},
      appsLoading: false,
      appsError: null,
      appsLastFetch: null,
      appsCacheValid: false,
      isStoppingApp: false,
      pendingDeepLinkInstall: null,
    }),

  // ============================================
  // DEEP LINK PENDING INSTALL
  // ============================================

  setPendingDeepLinkInstall: appName => set({ pendingDeepLinkInstall: appName }),
  clearPendingDeepLinkInstall: () => set({ pendingDeepLinkInstall: null }),

  // ============================================
  // INSTALLATION MANAGEMENT
  // ============================================

  lockForInstall: (appName, jobType = 'install') => {
    logInstallStart(appName, jobType);
    // Note: transitionTo.busy('installing') is called from the caller
    // because it needs access to the robot slice
    set({
      installingAppName: appName,
      installJobType: jobType,
      installResult: null,
      installStartTime: Date.now(),
      jobSeenOnce: false,
    });

    const state = get();
    const jobKey = `${appName}_${jobType}`;
    const processedJobs = state.processedJobs.filter(key => key !== jobKey);
    set({ processedJobs });
  },

  unlockInstall: () => {
    const state = get();
    const success = state.installResult === 'success';
    const durationSec = state.installStartTime
      ? Math.round((Date.now() - state.installStartTime) / 1000)
      : null;

    if (state.installingAppName) {
      logInstallEnd(state.installingAppName, success, durationSec, state.installJobType);
    }
    // Note: transitionTo.ready() is called from the caller
    // because it needs access to the robot slice
    set({
      installingAppName: null,
      installJobType: null,
      installResult: null,
      installStartTime: null,
      jobSeenOnce: false,
      processedJobs: [],
    });
  },

  setInstallResult: result => set({ installResult: result }),

  markJobAsSeen: () => set({ jobSeenOnce: true }),

  markJobAsProcessed: (appName, jobType) => {
    const state = get();
    const jobKey = `${appName}_${jobType}`;
    const processedJobs = state.processedJobs.includes(jobKey)
      ? state.processedJobs
      : [...state.processedJobs, jobKey];
    set({ processedJobs });
  },
});
