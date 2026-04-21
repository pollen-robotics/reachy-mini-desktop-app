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
import type { StateCreator } from 'zustand';
import { logInstallStart, logInstallEnd, logAppStart, logAppStop } from '../storeLogger';
import type { AppsSlice, AppsSliceState, AppState } from '../../types/store';

/**
 * Initial state for apps slice
 */
export const appsInitialState: AppsSliceState = {
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

  isStoppingApp: false,

  pendingDeepLinkInstall: null,
};

/**
 * Narrow any app-like value to extract its display name.
 * Supports the daemon status shape `{ info: { name }, state }`, the
 * catalog shape `{ name, ... }`, or a bare string.
 */
const getAppName = (a: unknown): string | null => {
  if (a == null) return null;
  if (typeof a === 'string') return a;
  if (typeof a === 'object') {
    const obj = a as { info?: { name?: string }; name?: string };
    if (obj.info?.name) return obj.info.name;
    if (obj.name) return obj.name;
  }
  return null;
};

/**
 * Create apps slice
 */
export const createAppsSlice: StateCreator<AppState, [], [], AppsSlice> = (set, get) => ({
  ...appsInitialState,

  // ============================================
  // APPS DATA ACTIONS
  // ============================================

  setAvailableApps: apps =>
    set({
      availableApps: apps,
      appsLastFetch: Date.now(),
      appsCacheValid: true,
    }),

  setInstalledApps: apps => set({ installedApps: apps }),

  setCurrentApp: (app: unknown) => {
    const prevApp = get().currentApp;
    const prevAppName = getAppName(prevApp);
    const currentAppName = getAppName(app);

    if (app && !prevApp && currentAppName) {
      logAppStart(currentAppName);
    } else if (!app && prevApp) {
      logAppStop(prevAppName);
    } else if (app && prevApp && currentAppName !== prevAppName) {
      logAppStop(prevAppName);
      if (currentAppName) logAppStart(currentAppName);
    }
    set({ currentApp: app });
  },

  setActiveJobs: jobs => {
    if (typeof jobs === 'function') {
      const currentJobsObj = get().activeJobs || {};
      const currentMap = new Map(Object.entries(currentJobsObj));
      const newJobs = jobs(currentMap);

      // Bail out: callback returned same reference, nothing changed
      if (newJobs === currentMap) return;

      const jobsObj: Record<string, unknown> =
        newJobs instanceof Map ? Object.fromEntries(newJobs) : newJobs;
      set({ activeJobs: jobsObj });
    } else {
      const jobsObj: Record<string, unknown> =
        jobs instanceof Map ? Object.fromEntries(jobs) : jobs || {};
      set({ activeJobs: jobsObj });
    }
  },

  setAppsLoading: loading => set({ appsLoading: loading }),
  setAppsError: error => set({ appsError: error }),
  setIsStoppingApp: isStopping => set({ isStoppingApp: isStopping }),

  setAppsOfficialMode: (mode: boolean) =>
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

  lockForInstall: (appName: string, jobType: string = 'install') => {
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
      logInstallEnd(
        state.installingAppName,
        success,
        durationSec,
        state.installJobType ?? 'install'
      );
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

  markJobAsProcessed: (appName: string, jobType: string) => {
    const state = get();
    const jobKey = `${appName}_${jobType}`;
    const processedJobs = state.processedJobs.includes(jobKey)
      ? state.processedJobs
      : [...state.processedJobs, jobKey];
    set({ processedJobs });
  },
});
