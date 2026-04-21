/**
 * Robot Slice - Manages robot connection, status, and state machine
 *
 * This slice handles:
 * - Connection state (USB, WiFi, Simulation)
 * - Robot status (disconnected, starting, ready, busy, stopping, crashed)
 * - Robot state polling data
 * - Visual effects
 *
 * 🎯 STATE MACHINE: robotStatus is the SINGLE SOURCE OF TRUTH
 * All boolean states (isActive, isStarting, etc.) are DERIVED from robotStatus
 */
import type { StateCreator } from 'zustand';
import { logConnect, logDisconnect } from '../storeLogger';
import {
  ROBOT_STATUS,
  BUSY_REASON,
  validateTransition,
  buildDerivedState,
} from '../../constants/robotStatus';
import type {
  BusyReason,
  ConnectionMode,
  RobotStateFull,
  RobotStatus,
  StartConnectionOptions,
} from '../../types/robot';
import type { HealthFailureReason } from '../../types/daemon';
import type { AppState, RobotSlice, RobotSliceState } from '../../types/store';

// ============================================================================
// SELECTORS - Derive boolean states from robotStatus
// ============================================================================

/**
 * Note: sleeping with safeToShutdown=true is NOT busy (allows Settings access for shutdown)
 */
export const selectIsBusy = (state: AppState): boolean => {
  return (
    (state.robotStatus === ROBOT_STATUS.SLEEPING && !state.safeToShutdown) ||
    state.robotStatus === ROBOT_STATUS.BUSY ||
    state.isCommandRunning ||
    state.isAppRunning ||
    state.isInstalling ||
    state.isStoppingApp ||
    state.isWakeSleepTransitioning
  );
};

export const selectIsReady = (state: AppState): boolean =>
  state.robotStatus === ROBOT_STATUS.READY &&
  !state.isCommandRunning &&
  !state.isAppRunning &&
  !state.isInstalling &&
  !state.isStoppingApp;

// ============================================================================
// INITIAL STATE
// ============================================================================

/**
 * Initial state for robot slice
 *
 * 🎯 robotStatus is the SINGLE SOURCE OF TRUTH
 * The boolean states (isActive, isStarting, etc.) are kept in sync automatically
 * by the transitionTo functions. They exist for backwards compatibility.
 *
 * ⚠️ DO NOT use setIsActive/setIsStarting/setIsStopping - use transitionTo instead!
 */
export const robotInitialState: RobotSliceState = {
  robotStatus: ROBOT_STATUS.DISCONNECTED,

  busyReason: null,

  isActive: false,
  isStarting: false,
  isStopping: false,
  isDaemonCrashed: false,

  safeToShutdown: false,
  isWakeSleepTransitioning: false,

  daemonVersion: null,
  startupError: null,
  hardwareError: null,
  consecutiveTimeouts: 0,
  healthFailureReasons: [],
  startupTimeoutId: null,

  isUsbConnected: false,
  usbPortName: null,
  isFirstCheck: true,

  connectionMode: null,
  remoteHost: null,

  robotStateFull: {
    data: null,
    lastUpdate: null,
    error: null,
  },

  shouldStreamRobotState: false,

  activeMoves: [],

  isCommandRunning: false,
  isAppRunning: false,
  isInstalling: false,
  currentAppName: null,

  activeEffect: null,
  effectTimestamp: 0,
};

// ============================================================================
// SLICE CREATOR
// ============================================================================

type Locks = Pick<RobotSliceState, 'isCommandRunning' | 'isAppRunning' | 'isInstalling'>;

const CLEAR_LOCKS: Locks = {
  isCommandRunning: false,
  isAppRunning: false,
  isInstalling: false,
};

export const createRobotSlice: StateCreator<AppState, [], [], RobotSlice> = (set, get) => {
  const apply = (target: RobotStatus, extras: Partial<RobotSliceState> = {}): boolean => {
    const state = get();
    if (!validateTransition(state.robotStatus, target)) {
      console.warn(`[Store] BLOCKED: ${state.robotStatus} -> ${target}`);
      return false;
    }
    set({
      robotStatus: target,
      busyReason: null,
      safeToShutdown: false,
      isWakeSleepTransitioning: false,
      ...buildDerivedState(target),
      ...extras,
    } as Partial<AppState>);
    return true;
  };

  const requireConnection = (state: AppState, target: string): boolean => {
    if (!state.connectionMode) {
      console.warn(`[Store] BLOCKED ${target}: connectionMode is null`);
      return false;
    }
    return true;
  };

  return {
    ...robotInitialState,

    // ========================================================================
    // STATE MACHINE TRANSITIONS
    // These are the ONLY way to change robot state. They keep booleans in sync.
    // ========================================================================

    transitionTo: {
      disconnected: () => apply(ROBOT_STATUS.DISCONNECTED, CLEAR_LOCKS),
      readyToStart: () => apply(ROBOT_STATUS.READY_TO_START),
      starting: () => apply(ROBOT_STATUS.STARTING),

      sleeping: (options: { safeToShutdown?: boolean } = {}) => {
        if (!requireConnection(get(), ROBOT_STATUS.SLEEPING)) return;
        apply(ROBOT_STATUS.SLEEPING, {
          safeToShutdown: options.safeToShutdown ?? false,
          ...CLEAR_LOCKS,
        });
      },

      ready: () => {
        const state = get();
        if (state.hardwareError) {
          console.warn('[Store] BLOCKED ready: hardware error present');
          return;
        }
        if (!requireConnection(state, ROBOT_STATUS.READY)) return;
        apply(ROBOT_STATUS.READY, CLEAR_LOCKS);
      },

      busy: (reason: BusyReason) => {
        if (!requireConnection(get(), ROBOT_STATUS.BUSY)) return;
        const locks: Partial<Locks> = {};
        if (reason === BUSY_REASON.COMMAND) locks.isCommandRunning = true;
        if (reason === BUSY_REASON.APP_RUNNING) locks.isAppRunning = true;
        if (reason === BUSY_REASON.INSTALLING) locks.isInstalling = true;
        apply(ROBOT_STATUS.BUSY, { busyReason: reason, ...locks });
      },

      stopping: () => apply(ROBOT_STATUS.STOPPING, { consecutiveTimeouts: 0 }),
      crashed: () => apply(ROBOT_STATUS.CRASHED),
    },

    // ========================================================================
    // HELPER METHODS
    // ========================================================================

    isBusy: () => selectIsBusy(get()),
    isReady: () => selectIsReady(get()),

    setWakeSleepTransitioning: (isTransitioning: boolean) => {
      set({ isWakeSleepTransitioning: isTransitioning });
    },

    getRobotStatusLabel: (): string => {
      const state = get();
      const { robotStatus, busyReason } = state;

      if (robotStatus === ROBOT_STATUS.BUSY && busyReason) {
        const reasonLabels: Record<BusyReason, string> = {
          [BUSY_REASON.MOVING]: 'Moving',
          [BUSY_REASON.COMMAND]: 'Executing Command',
          [BUSY_REASON.APP_RUNNING]: 'Running App',
          [BUSY_REASON.INSTALLING]: 'Installing',
        };
        return reasonLabels[busyReason] || 'Busy';
      }

      const statusLabels: Record<RobotStatus, string> = {
        [ROBOT_STATUS.DISCONNECTED]: 'Disconnected',
        [ROBOT_STATUS.READY_TO_START]: 'Ready to Start',
        [ROBOT_STATUS.STARTING]: 'Starting',
        [ROBOT_STATUS.SLEEPING]: 'Sleeping',
        [ROBOT_STATUS.READY]: 'Ready',
        [ROBOT_STATUS.BUSY]: 'Busy',
        [ROBOT_STATUS.STOPPING]: 'Stopping',
        [ROBOT_STATUS.CRASHED]: 'Crashed',
      };

      return statusLabels[robotStatus] || 'Unknown';
    },

    // ========================================================================
    // APP LOCKING MANAGEMENT
    // ========================================================================

    lockForApp: (appName: string) => {
      get().transitionTo.busy(BUSY_REASON.APP_RUNNING);
      set({ currentAppName: appName });
    },

    unlockApp: () => {
      get().transitionTo.ready();
      set({ currentAppName: null });
    },

    // ========================================================================
    // SETTERS
    // ========================================================================

    setDaemonVersion: value => set({ daemonVersion: value }),
    setStartupError: value => set({ startupError: value }),
    setHardwareError: value => set({ hardwareError: value }),
    // ✅ Pure setter - NO side effects
    // USB polling only runs when !connectionMode (searching for robot)
    // Once connected, USB detection is not used (daemon health check handles disconnection)
    setIsUsbConnected: value => set({ isUsbConnected: value }),

    setUsbPortName: value => set({ usbPortName: value }),
    setIsFirstCheck: value => set({ isFirstCheck: value }),

    setConnectionMode: (mode: ConnectionMode | null) => set({ connectionMode: mode }),
    setRemoteHost: (host: string | null) => set({ remoteHost: host }),

    isWifiMode: () => get().connectionMode === 'wifi',

    isLocalDaemon: () => {
      const mode = get().connectionMode;
      return mode === 'usb' || mode === 'simulation';
    },

    // ========================================================================
    // CONNECTION LIFECYCLE
    // ========================================================================

    resetConnection: () => {
      const prevState = get();
      logDisconnect(prevState.connectionMode);

      set({
        robotStatus: ROBOT_STATUS.DISCONNECTED,
        busyReason: null,
        ...buildDerivedState(ROBOT_STATUS.DISCONNECTED),
        connectionMode: null,
        remoteHost: null,
        isUsbConnected: false,
        usbPortName: null,
        isFirstCheck: true,
        daemonVersion: null,
        robotStateFull: { data: null, lastUpdate: null, error: null },
        shouldStreamRobotState: false,
        activeMoves: [],
        consecutiveTimeouts: 0,
        healthFailureReasons: [],
      } as Partial<AppState>);
    },

    startConnection: (mode: ConnectionMode, options: StartConnectionOptions = {}) => {
      const { portName, remoteHost } = options;
      logConnect(mode, options);

      set({
        connectionMode: mode,
        remoteHost: remoteHost || null,
        isUsbConnected: mode !== 'wifi',
        usbPortName: portName || null,
        robotStatus: ROBOT_STATUS.STARTING,
        busyReason: null,
        ...buildDerivedState(ROBOT_STATUS.STARTING),
        hardwareError: null,
        startupError: null,
        consecutiveTimeouts: 0,
        healthFailureReasons: [],
        robotStateFull: { data: null, lastUpdate: null, error: null },
        shouldStreamRobotState: false,
        activeMoves: [],
        daemonVersion: null,
        isCommandRunning: false,
        isAppRunning: false,
        isInstalling: false,
        currentAppName: null,
      } as Partial<AppState>);
    },

    // ========================================================================
    // ROBOT STATE POLLING
    // ========================================================================

    setRobotStateFull: (value: RobotStateFull | ((prev: RobotStateFull) => RobotStateFull)) =>
      set(state => {
        if (typeof value === 'function') {
          return { robotStateFull: value(state.robotStateFull) };
        }
        return { robotStateFull: value };
      }),

    setActiveMoves: value =>
      set(state => {
        if (typeof value === 'function') {
          return { activeMoves: value(state.activeMoves) };
        }
        return { activeMoves: value };
      }),

    setShouldStreamRobotState: value => set({ shouldStreamRobotState: value }),

    setIsCommandRunning: (value: boolean) => {
      const state = get();
      if (value) {
        state.transitionTo.busy(BUSY_REASON.COMMAND);
      } else if (state.busyReason === BUSY_REASON.COMMAND) {
        state.transitionTo.ready();
      }
      set({ isCommandRunning: value });
    },

    // ========================================================================
    // TIMEOUT/CRASH MANAGEMENT
    // ========================================================================

    incrementTimeouts: (failureType: HealthFailureReason = 'unknown') => {
      const state = get();
      const newCount = state.consecutiveTimeouts + 1;
      const newReasons = [...state.healthFailureReasons, failureType];
      const maxTimeouts = 4;
      const shouldCrash = newCount >= maxTimeouts;

      set({ consecutiveTimeouts: newCount, healthFailureReasons: newReasons });

      if (shouldCrash && state.robotStatus !== ROBOT_STATUS.CRASHED) {
        state.transitionTo.crashed();
      }
    },

    resetTimeouts: () => {
      // Only reset consecutiveTimeouts counter.
      // isDaemonCrashed is derived from robotStatus via transitionTo - don't set it directly
      // to avoid state desync between isDaemonCrashed and robotStatus.
      const state = get();
      if (state.robotStatus === ROBOT_STATUS.CRASHED) {
        return;
      }
      set({ consecutiveTimeouts: 0, healthFailureReasons: [] });
    },

    markDaemonCrashed: () => {
      get().transitionTo.crashed();
    },

    // ========================================================================
    // STARTUP TIMEOUT MANAGEMENT
    // ========================================================================

    setStartupTimeout: timeoutId => set({ startupTimeoutId: timeoutId }),

    clearStartupTimeout: () => {
      const state = get();
      if (state.startupTimeoutId !== null) {
        clearTimeout(state.startupTimeoutId);
        set({ startupTimeoutId: null });
      }
    },

    // ========================================================================
    // VISUAL EFFECTS
    // ========================================================================

    triggerEffect: (effectType: string) =>
      set({ activeEffect: effectType, effectTimestamp: Date.now() }),
    stopEffect: () => set({ activeEffect: null }),
  };
};
