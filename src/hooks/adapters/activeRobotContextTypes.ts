/**
 * Shared types for the `useActiveRobotAdapter` family.
 *
 * The two adapters (`useActiveRobotAdapter` for Tauri, `useWebActiveRobotAdapter`
 * for web-only mode) both return an object that drives the ActiveRobotModule
 * context. Their shapes overlap except for `windowManager`, which has
 * platform-specific capabilities.
 */

import type { AppState } from '../../types/store';
import type { FullAppState } from '../../store/useStore';

// ============================================================================
// ROBOT STATE (subset of AppState exposed through the adapter)
// ============================================================================

export type AdapterRobotStateKey =
  | 'isActive'
  | 'darkMode'
  | 'robotStatus'
  | 'busyReason'
  | 'safeToShutdown'
  | 'isWakeSleepTransitioning'
  | 'isAppRunning'
  | 'isInstalling'
  | 'isCommandRunning'
  | 'currentAppName'
  | 'robotStateFull'
  | 'activeMoves'
  | 'isDaemonCrashed'
  | 'rightPanelView'
  | 'embeddedAppUrl'
  | 'activeEffect'
  | 'effectTimestamp'
  | 'availableApps'
  | 'installedApps'
  | 'currentApp'
  | 'activeJobs'
  | 'appsLoading'
  | 'appsError'
  | 'appsOfficialMode'
  | 'appsCacheValid'
  | 'installingAppName'
  | 'installJobType'
  | 'installResult'
  | 'installStartTime'
  | 'processedJobs'
  | 'jobSeenOnce'
  | 'logs'
  | 'appLogs';

export type AdapterRobotState = Pick<AppState, AdapterRobotStateKey>;

// ============================================================================
// ACTIONS (subset of AppState methods + cross-slice aliases)
// ============================================================================

type PickStoreAction<K extends keyof FullAppState> = FullAppState[K];

/**
 * Action surface exposed to the ActiveRobotModule.
 *
 * `lockForInstall` / `unlockInstall` alias the cross-slice "with-robot"
 * variants to give consumers a simpler API.
 */
export interface AdapterActions {
  update: PickStoreAction<'update'>;

  transitionTo: PickStoreAction<'transitionTo'>;

  isBusy: PickStoreAction<'isBusy'>;
  isReady: PickStoreAction<'isReady'>;
  getRobotStatusLabel: PickStoreAction<'getRobotStatusLabel'>;

  lockForApp: PickStoreAction<'lockForApp'>;
  unlockApp: PickStoreAction<'unlockApp'>;
  lockForInstall: PickStoreAction<'lockForInstallWithRobot'>;
  unlockInstall: PickStoreAction<'unlockInstallWithRobot'>;

  setRobotStateFull: PickStoreAction<'setRobotStateFull'>;
  setActiveMoves: PickStoreAction<'setActiveMoves'>;
  setIsCommandRunning: PickStoreAction<'setIsCommandRunning'>;

  triggerEffect: PickStoreAction<'triggerEffect'>;
  stopEffect: PickStoreAction<'stopEffect'>;

  resetTimeouts: PickStoreAction<'resetTimeouts'>;
  incrementTimeouts: PickStoreAction<'incrementTimeouts'>;

  setRightPanelView: PickStoreAction<'setRightPanelView'>;
  openEmbeddedApp: PickStoreAction<'openEmbeddedApp'>;
  closeEmbeddedApp: PickStoreAction<'closeEmbeddedApp'>;
  setDarkMode: PickStoreAction<'setDarkMode'>;
  toggleDarkMode: PickStoreAction<'toggleDarkMode'>;

  setAvailableApps: PickStoreAction<'setAvailableApps'>;
  setInstalledApps: PickStoreAction<'setInstalledApps'>;
  setCurrentApp: PickStoreAction<'setCurrentApp'>;
  setActiveJobs: PickStoreAction<'setActiveJobs'>;
  setAppsLoading: PickStoreAction<'setAppsLoading'>;
  setAppsError: PickStoreAction<'setAppsError'>;
  setAppsOfficialMode: PickStoreAction<'setAppsOfficialMode'>;
  invalidateAppsCache: PickStoreAction<'invalidateAppsCache'>;
  clearApps: PickStoreAction<'clearApps'>;
  setInstallResult: PickStoreAction<'setInstallResult'>;
  markJobAsSeen: PickStoreAction<'markJobAsSeen'>;
  markJobAsProcessed: PickStoreAction<'markJobAsProcessed'>;

  setLogs: PickStoreAction<'setLogs'>;
  addAppLog: PickStoreAction<'addAppLog'>;
  clearAppLogs: PickStoreAction<'clearAppLogs'>;
}

// ============================================================================
// API CONFIGURATION
// ============================================================================

/**
 * API surface passed through the adapter. The concrete types for timeouts /
 * intervals / endpoints / config come from the (still-JS) `@config/daemon`
 * module, so we keep them loose here - the adapter code is what anchors the
 * actual shape.
 */
export interface AdapterApiConfig {
  getBaseUrl: () => string;
  timeouts: Record<string, number>;
  intervals: Record<string, number>;
  endpoints: Record<string, string>;
  buildApiUrl: (endpoint: string) => string;
  fetchWithTimeout: (
    url: string,
    options: RequestInit | undefined,
    timeoutMs: number,
    logOptions?: Record<string, unknown>
  ) => Promise<Response>;
  config: Record<string, unknown>;
}

export interface AdapterShellApi {
  open: (url: string) => Promise<void>;
}

// ============================================================================
// WINDOW MANAGERS (platform-specific)
// ============================================================================

/** Tauri window manager surface. */
export interface TauriWindowManager {
  getAppWindow: () => unknown;
  addOpenWindow: (windowLabel: string) => void;
  removeOpenWindow: (windowLabel: string) => void;
  isWindowOpen: (windowLabel: string) => boolean;
}

/**
 * Web-only window manager. Emits console warnings for multi-window ops that
 * aren't supported outside Tauri, and returns a minimal stub app window.
 */
export interface WebWindowManager {
  openExpressionsWindow: () => void;
  closeExpressionsWindow: () => void;
  isExpressionsWindowOpen: () => boolean;
  openDevWindow: () => void;
  closeDevWindow: () => void;
  isDevWindowOpen: () => boolean;
  getAppWindow: () => WebAppWindowStub;
}

export interface WebAppWindowStub {
  label: string;
  setTitle: (title: string) => Promise<void>;
  close: () => Promise<void>;
}

// ============================================================================
// COMPLETE CONTEXT CONFIG
// ============================================================================

export interface ActiveRobotContextConfigBase {
  robotState: AdapterRobotState;
  actions: AdapterActions;
  api: AdapterApiConfig;
  shellApi: AdapterShellApi;
}

export interface ActiveRobotContextConfig extends ActiveRobotContextConfigBase {
  windowManager: TauriWindowManager;
}

export interface WebActiveRobotContextConfig extends ActiveRobotContextConfigBase {
  windowManager: WebWindowManager;
}
