/**
 * Zustand store types.
 *
 * Describes the public shape of the combined store used throughout the
 * app via `useAppStore` / `useStore`. These types are consumed as soon as
 * a hook or component is migrated to TypeScript - the slice JS files
 * themselves will be migrated in Phase 2.
 *
 * Runtime source of truth:
 * - [src/store/slices/robotSlice.js](../store/slices/robotSlice.js)
 * - [src/store/slices/appsSlice.js](../store/slices/appsSlice.js)
 * - [src/store/slices/uiSlice.js](../store/slices/uiSlice.js)
 * - [src/store/slices/logsSlice.js](../store/slices/logsSlice.js)
 */
import type {
  RobotStatus,
  BusyReason,
  ConnectionMode,
  RobotStateFull,
  StartConnectionOptions,
  HardwareError,
  StartupError,
} from './robot';
import type { HealthFailureReason } from './daemon';
import type { LogLevel } from './api';

// ============================================================================
// ROBOT SLICE
// ============================================================================

export interface RobotSliceState {
  robotStatus: RobotStatus;
  busyReason: BusyReason | null;

  // Derived booleans (kept in sync by transitionTo - read-only)
  isActive: boolean;
  isStarting: boolean;
  isStopping: boolean;
  isDaemonCrashed: boolean;

  safeToShutdown: boolean;
  isWakeSleepTransitioning: boolean;

  daemonVersion: string | null;
  startupError: StartupError | null;
  hardwareError: HardwareError | null;
  consecutiveTimeouts: number;
  healthFailureReasons: HealthFailureReason[];
  startupTimeoutId: ReturnType<typeof setTimeout> | null;

  isUsbConnected: boolean;
  usbPortName: string | null;
  isFirstCheck: boolean;

  connectionMode: ConnectionMode | null;
  remoteHost: string | null;

  robotStateFull: RobotStateFull;
  shouldStreamRobotState: boolean;

  activeMoves: unknown[];

  isCommandRunning: boolean;
  isAppRunning: boolean;
  isInstalling: boolean;
  currentAppName: string | null;

  activeEffect: string | null;
  effectTimestamp: number;
}

export interface RobotSliceActions {
  transitionTo: {
    disconnected: () => boolean;
    readyToStart: () => boolean;
    starting: () => boolean;
    sleeping: (options?: { safeToShutdown?: boolean }) => void;
    ready: () => void;
    busy: (reason: BusyReason) => void;
    stopping: () => boolean;
    crashed: () => boolean;
  };

  isBusy: () => boolean;
  isReady: () => boolean;

  setWakeSleepTransitioning: (isTransitioning: boolean) => void;
  getRobotStatusLabel: () => string;

  lockForApp: (appName: string) => void;
  unlockApp: () => void;

  setDaemonVersion: (value: string | null) => void;
  setStartupError: (value: StartupError | null) => void;
  setHardwareError: (value: HardwareError | null) => void;
  setIsUsbConnected: (value: boolean) => void;
  setUsbPortName: (value: string | null) => void;
  setIsFirstCheck: (value: boolean) => void;

  setConnectionMode: (mode: ConnectionMode | null) => void;
  setRemoteHost: (host: string | null) => void;
  isWifiMode: () => boolean;
  isLocalDaemon: () => boolean;

  resetConnection: () => void;
  startConnection: (mode: ConnectionMode, options?: StartConnectionOptions) => void;

  setRobotStateFull: (value: RobotStateFull | ((prev: RobotStateFull) => RobotStateFull)) => void;
  setActiveMoves: (value: unknown[] | ((prev: unknown[]) => unknown[])) => void;
  setShouldStreamRobotState: (value: boolean) => void;
  setIsCommandRunning: (value: boolean) => void;

  incrementTimeouts: (failureType?: HealthFailureReason) => void;
  resetTimeouts: () => void;
  markDaemonCrashed: () => void;

  setStartupTimeout: (timeoutId: ReturnType<typeof setTimeout> | null) => void;
  clearStartupTimeout: () => void;

  triggerEffect: (effectType: string) => void;
  stopEffect: () => void;
}

export type RobotSlice = RobotSliceState & RobotSliceActions;

// ============================================================================
// APPS SLICE (loose for now - refined when migrated)
// ============================================================================

export interface AppsSliceState {
  availableApps: unknown[];
  installedApps: unknown[];
  currentApp: unknown | null;
  activeJobs: Record<string, unknown>;
  appsLoading: boolean;
  appsError: string | null;
  appsLastFetch: number | null;
  appsOfficialMode: boolean;
  appsCacheValid: boolean;
  installingAppName: string | null;
  installJobType: string | null;
  installResult: 'success' | 'error' | null;
  installStartTime: number | null;
  processedJobs: string[];
  jobSeenOnce: boolean;
  isStoppingApp: boolean;
  pendingDeepLinkInstall: string | null;
}

export interface AppsSliceActions {
  setAvailableApps: (apps: unknown[]) => void;
  setInstalledApps: (apps: unknown[]) => void;
  setCurrentApp: (app: unknown | null) => void;
  setActiveJobs: (
    jobs:
      | Record<string, unknown>
      | Map<string, unknown>
      | ((current: Map<string, unknown>) => Map<string, unknown> | Record<string, unknown>)
  ) => void;
  setAppsLoading: (loading: boolean) => void;
  setAppsError: (error: string | null) => void;
  setIsStoppingApp: (isStopping: boolean) => void;
  setAppsOfficialMode: (mode: boolean) => void;
  invalidateAppsCache: () => void;
  clearApps: () => void;
  setPendingDeepLinkInstall: (appName: string | null) => void;
  clearPendingDeepLinkInstall: () => void;
  lockForInstall: (appName: string, jobType?: string) => void;
  unlockInstall: () => void;
  setInstallResult: (result: 'success' | 'error' | null) => void;
  markJobAsSeen: () => void;
  markJobAsProcessed: (appName: string, jobType: string) => void;
}

export type AppsSlice = AppsSliceState & AppsSliceActions;

// ============================================================================
// UI SLICE
// ============================================================================

export type ToastSeverity = 'success' | 'error' | 'warning' | 'info';
export type BleStatus = 'disconnected' | 'scanning' | 'connecting' | 'connected';
export type RightPanelView = 'controller' | 'expressions' | 'embedded-app' | null;

export interface ToastState {
  open: boolean;
  message: string;
  severity: ToastSeverity;
}

export interface UiSliceState {
  darkMode: boolean;
  openWindows: string[];
  rightPanelView: RightPanelView;
  embeddedAppUrl: string | null;
  embeddedAppDismissed: boolean;
  showFirstTimeWifiSetup: boolean;
  showBluetoothSupportView: boolean;
  showSetupChoice: boolean;
  bleStatus: BleStatus;
  bleDevices: unknown[];
  bleDeviceAddress: string | null;
  blePin: string;
  updateSkipped: boolean;
  toast: ToastState;
}

export interface UiSliceActions {
  addOpenWindow: (windowLabel: string) => void;
  removeOpenWindow: (windowLabel: string) => void;
  isWindowOpen: (windowLabel: string) => boolean;

  setRightPanelView: (view: RightPanelView) => void;
  setEmbeddedAppUrl: (url: string | null) => void;
  openEmbeddedApp: (url: string) => void;
  closeEmbeddedApp: () => void;
  dismissEmbeddedApp: () => void;
  resetEmbeddedAppDismissed: () => void;

  setShowFirstTimeWifiSetup: (value: boolean) => void;
  setShowBluetoothSupportView: (value: boolean) => void;
  setShowSetupChoice: (value: boolean) => void;

  setBleStatus: (value: BleStatus) => void;
  setBleDevices: (value: unknown[]) => void;
  setBleDeviceAddress: (value: string | null) => void;
  setBlePin: (value: string) => void;
  loadBlePinForDevice: (addr: string) => void;

  skipUpdate: () => void;
  resetUpdateSkipped: () => void;

  setDarkMode: (value: boolean) => void;
  toggleDarkMode: () => void;
  resetDarkMode: () => void;

  showToast: (message: string, severity?: ToastSeverity) => void;
  hideToast: () => void;
}

export type UiSlice = UiSliceState & UiSliceActions;

// ============================================================================
// LOGS SLICE
// ============================================================================

export type LogCategory = 'daemon' | 'app' | 'frontend';
export type LogMode = 'simple' | 'dev';

export interface LogEntry {
  timestamp: string;
  timestampNumeric: number;
  message: string;
  source: 'frontend' | 'app' | 'daemon';
  category?: LogCategory;
  level: LogLevel;
  appName?: string;
  /**
   * Optional hint: when true, the entry is considered user-facing and bypasses
   * the simple-mode allowlist in `LogConsole`. Emitted via `logger.event()` or
   * `useLogger().event()`. The legacy pattern-based allowlist remains in place
   * as a fallback for entries that don't carry this flag.
   */
  userFacing?: boolean;
}

export interface LogsSliceState {
  logs: LogEntry[];
  frontendLogs: LogEntry[];
  appLogs: LogEntry[];
  logMode: LogMode;
  logSearch: string;
  logCategoryFilters: LogCategory[];
}

export interface AddFrontendLogOptions {
  /** If true, the entry is flagged as user-facing (visible in simple mode). */
  userFacing?: boolean;
}

export interface LogsSliceActions {
  setLogs: (newLogs: LogEntry[]) => void;
  /**
   * Append daemon entries (produced by streaming sources like the remote WS
   * streamer). Consumers that replace the full buffer (e.g. Rust ring-buffer
   * polling) should use {@link setLogs} instead.
   */
  appendLogs: (entries: LogEntry[]) => void;
  addFrontendLog: (
    message: string,
    level?: LogLevel,
    category?: LogCategory,
    options?: AddFrontendLogOptions
  ) => void;
  addAppLog: (message: string, appName?: string, level?: LogLevel) => void;
  clearAppLogs: (appName?: string) => void;
  clearAllLogs: () => void;
  setLogMode: (mode: LogMode) => void;
  setLogSearch: (search: string) => void;
  toggleLogCategory: (category: LogCategory) => void;
}

export type LogsSlice = LogsSliceState & LogsSliceActions;

// ============================================================================
// COMBINED STORE
// ============================================================================

export type AppState = RobotSlice & AppsSlice & UiSlice & LogsSlice;
