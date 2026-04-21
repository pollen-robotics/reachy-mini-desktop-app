import { create } from 'zustand';
import type { StateCreator } from 'zustand';
import { windowSyncMiddleware } from './middleware/windowSync';
import {
  createRobotSlice,
  createLogsSlice,
  createUISlice,
  createAppsSlice,
  setupSystemPreferenceListener,
} from './slices';
import { logReset } from './storeLogger';
import { disableSimulationMode } from '../utils/simulationMode';
import { BUSY_REASON, ROBOT_STATUS, buildDerivedState } from '../constants/robotStatus';
import { subscribeRobotStatus } from './subscribers/robotStatusSubscriber';
import type { AppState } from '../types/store';
import type { BusyReason } from '../types/robot';

// ============================================================================
// CROSS-SLICE ACTIONS
// Declared here (not in the types/store slice interfaces) because they span
// multiple slices. They are merged into AppState through the combined creator.
// ============================================================================

interface CrossSliceActions {
  resetAll: () => void;
  lockForInstallWithRobot: (appName: string, jobType?: string) => void;
  unlockInstallWithRobot: () => void;
  update: (updates: Partial<AppState>) => void;
}

export type FullAppState = AppState & CrossSliceActions;

const PROTECTED_UPDATE_FIELDS: Array<keyof AppState> = [
  'robotStatus',
  'isActive',
  'isStarting',
  'isStopping',
  'isDaemonCrashed',
];

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
const storeCreator: StateCreator<FullAppState, [], [], FullAppState> = (set, get, api) => ({
  // ============================================
  // SLICES
  // ============================================
  ...createRobotSlice(set, get, api),
  ...createLogsSlice(set, get, api),
  ...createUISlice(set, get, api),
  ...createAppsSlice(set, get, api),

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

    // 🧹 Clean up simulation mode flag from localStorage
    // Prevents stale simMode from persisting after crash/force-quit
    disableSimulationMode();

    set({
      robotStatus: ROBOT_STATUS.DISCONNECTED,
      busyReason: null,
      ...buildDerivedState(ROBOT_STATUS.DISCONNECTED),
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

      // Logs reset: when the daemon is killed/disconnected we wipe every log
      // source so the next session starts from a clean console. Keeping them
      // around caused stale lines from a previous (possibly crashed) daemon
      // to bleed into the bootstrap/setup view of the next launch.
      logs: [],
      frontendLogs: [],
      appLogs: [],
    } as Partial<FullAppState>);
  },

  // ============================================
  // INSTALLATION WITH ROBOT STATE
  // ============================================

  /**
   * Lock for install with robot state transition
   * Combines appsSlice.lockForInstall with robotSlice.transitionTo.busy
   */
  lockForInstallWithRobot: (appName: string, jobType: string = 'install') => {
    const state = get();
    state.transitionTo.busy(BUSY_REASON.INSTALLING as BusyReason);
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

    // Safety: if transitionTo.ready() was blocked (hardwareError, connection lost),
    // force-clear isInstalling to prevent permanent UI lockout
    if (get().isInstalling) {
      console.warn(
        '[Store] unlockInstallWithRobot: transition blocked, force-clearing install lock'
      );
      set({ isInstalling: false, busyReason: null });
    }
  },

  // ============================================
  // GENERIC UPDATE ACTION (backwards compat)
  // ============================================

  /**
   * Generic update for backwards compatibility.
   * Protected fields (robotStatus and derived booleans) are stripped
   * to prevent bypassing the state machine. Use transitionTo instead.
   */
  update: (updates: Partial<AppState>) => {
    const safe: Partial<AppState> = { ...updates };
    let stripped = false;
    for (const key of PROTECTED_UPDATE_FIELDS) {
      if (key in safe) {
        delete safe[key];
        stripped = true;
      }
    }
    if (stripped) {
      console.warn(
        '[Store] update() stripped protected fields. Use transitionTo instead.',
        Object.keys(updates).filter(k => (PROTECTED_UPDATE_FIELDS as string[]).includes(k))
      );
    }
    if (Object.keys(safe).length > 0) {
      set(safe as Partial<FullAppState>);
    }
  },
});

export const useStore = create<FullAppState>()(windowSyncMiddleware(storeCreator));

// Side-effect subscriber for robotStatus transitions (telemetry, logging)
const _unsubscribeRobotStatus = subscribeRobotStatus(useStore);

// Setup system preference listener for dark mode
const _cleanupSystemPreference =
  typeof window !== 'undefined'
    ? setupSystemPreferenceListener(useStore.getState, useStore.setState)
    : null;

// ============================================================================
// HMR STATE PRESERVATION (dev only)
// Keeps store data intact across Vite hot-module replacement so the app
// doesn't reset to the connection screen on every code change.
// ============================================================================
const hot = import.meta.hot;
if (hot) {
  const hotData = hot.data as { storeState?: Partial<FullAppState> } | undefined;
  if (hotData?.storeState) {
    const saved = hotData.storeState;
    const dataOnly: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(saved)) {
      if (typeof value !== 'function') {
        dataOnly[key] = value;
      }
    }
    useStore.setState(dataOnly as Partial<FullAppState>);
    console.log('[HMR] Store state restored');
  }

  hot.dispose(data => {
    (data as { storeState?: FullAppState }).storeState = useStore.getState();
    _unsubscribeRobotStatus?.();
    _cleanupSystemPreference?.();
  });

  hot.accept();
}

export default useStore;
