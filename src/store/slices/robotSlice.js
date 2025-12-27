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
import { logConnect, logDisconnect, logReset, logReady, logBusy, logCrash } from '../storeLogger';
import { telemetry } from '../../utils/telemetry';

// ============================================================================
// SELECTORS - Derive boolean states from robotStatus
// ============================================================================

/**
 * @param {Object} state - Store state
 * @returns {boolean} True if robot is active (ready or busy)
 */
export const selectIsActive = state =>
  state.robotStatus === 'ready' || state.robotStatus === 'busy';

/**
 * @param {Object} state - Store state
 * @returns {boolean} True if daemon is starting
 */
export const selectIsStarting = state => state.robotStatus === 'starting';

/**
 * @param {Object} state - Store state
 * @returns {boolean} True if daemon is stopping
 */
export const selectIsStopping = state => state.robotStatus === 'stopping';

/**
 * @param {Object} state - Store state
 * @returns {boolean} True if daemon has crashed
 */
export const selectIsDaemonCrashed = state => state.robotStatus === 'crashed';

/**
 * @param {Object} state - Store state
 * @returns {boolean} True if robot is busy (cannot accept new interactions)
 *
 * Note: sleeping with safeToShutdown=true is NOT busy (allows Settings access for shutdown)
 */
export const selectIsBusy = state => {
  return (
    (state.robotStatus === 'sleeping' && !state.safeToShutdown) ||
    state.robotStatus === 'busy' ||
    state.isCommandRunning ||
    state.isAppRunning ||
    state.isInstalling ||
    state.isStoppingApp ||
    state.isWakeSleepTransitioning
  );
};

/**
 * @param {Object} state - Store state
 * @returns {boolean} True if robot is ready (not busy with any action)
 */
export const selectIsReady = state =>
  state.robotStatus === 'ready' &&
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
export const robotInitialState = {
  // ✨ Main robot state (State Machine) - SINGLE SOURCE OF TRUTH
  // Possible states: 'disconnected', 'ready-to-start', 'starting', 'ready', 'busy', 'stopping', 'crashed'
  robotStatus: 'disconnected',

  // ✨ Reason if status === 'busy'
  // Possible values: null, 'moving', 'command', 'app-running', 'installing'
  busyReason: null,

  // 🔄 Derived states (kept in sync by transitionTo - DO NOT SET DIRECTLY)
  isActive: false, // true when robotStatus is 'ready' or 'busy'
  isStarting: false, // true when robotStatus is 'starting'
  isStopping: false, // true when robotStatus is 'stopping'
  isDaemonCrashed: false, // true when robotStatus is 'crashed'

  // 🛡️ Safety state for power off
  safeToShutdown: false, // true only when sleeping AND sleep sequence is complete
  isWakeSleepTransitioning: false, // true during wake/sleep animations

  // Daemon metadata
  daemonVersion: null,
  startupError: null,
  hardwareError: null,
  consecutiveTimeouts: 0,
  startupTimeoutId: null,

  // Robot connection state
  isUsbConnected: false,
  usbPortName: null,
  isFirstCheck: true,

  // 🌐 Connection mode (USB vs WiFi vs Simulation)
  connectionMode: null,
  remoteHost: null,

  // 🚀 Centralized robot state (streamed by useRobotStateWebSocket at 20Hz)
  // Contains: head_pose, head_joints, body_yaw, antennas_position, passive_joints, control_mode, doa
  robotStateFull: {
    data: null,
    lastUpdate: null,
    error: null,
  },

  // 🎯 Flag to start WebSocket streaming early (during HardwareScanView)
  // Set to true when daemon is ready and movements detected, before transitioning to ActiveRobotView
  shouldStreamRobotState: false,

  // 🎯 Centralized active moves
  activeMoves: [],

  // Activity Lock
  isCommandRunning: false,
  isAppRunning: false,
  isInstalling: false,
  currentAppName: null,

  // Visual Effects (3D particles)
  activeEffect: null,
  effectTimestamp: 0,

  // 🚫 Blacklist for robots temporarily hidden (e.g., after clearing WiFi networks)
  robotBlacklist: {}, // { 'reachy-mini.local': expiryTimestamp }
};

// ============================================================================
// SLICE CREATOR
// ============================================================================

/**
 * Create robot slice
 * @param {Function} set - Zustand set function
 * @param {Function} get - Zustand get function
 * @returns {Object} Robot slice state and actions
 */
export const createRobotSlice = (set, get) => ({
  ...robotInitialState,

  // ============================================================================
  // STATE MACHINE TRANSITIONS
  // These are the ONLY way to change robot state. They keep booleans in sync.
  // ============================================================================

  transitionTo: {
    disconnected: () => {
      set({
        robotStatus: 'disconnected',
        busyReason: null,
        safeToShutdown: false,
        isWakeSleepTransitioning: false,
        // Derived booleans (kept in sync)
        isActive: false,
        isStarting: false,
        isStopping: false,
        isDaemonCrashed: false,
        isCommandRunning: false,
        isAppRunning: false,
        isInstalling: false,
      });
    },

    readyToStart: () => {
      set({
        robotStatus: 'ready-to-start',
        busyReason: null,
        safeToShutdown: false,
        isWakeSleepTransitioning: false,
        // Derived booleans
        isActive: false,
        isStarting: false,
        isStopping: false,
        isDaemonCrashed: false,
      });
    },

    starting: () => {
      set({
        robotStatus: 'starting',
        busyReason: null,
        safeToShutdown: false,
        isWakeSleepTransitioning: false,
        // Derived booleans
        isActive: false,
        isStarting: true,
        isStopping: false,
        isDaemonCrashed: false,
      });
    },

    sleeping: (options = {}) => {
      const state = get();
      const { safeToShutdown = false } = options;

      // 🛡️ Guard: Don't transition if stopping (prevents chaos during shutdown)
      if (state.robotStatus === 'stopping') {
        console.warn('[Store] ⚠️ sleeping BLOCKED: robotStatus is stopping');
        return;
      }

      // 🛡️ Guard: Don't transition if no connection (prevents crash after resetAll)
      if (!state.connectionMode) {
        console.warn('[Store] ⚠️ sleeping BLOCKED: connectionMode is null/undefined');
        return;
      }

      // 📊 Telemetry - Track successful connection (only when coming from 'starting')
      // This ensures we only count ACTUAL successful connections, not reconnects
      if (state.robotStatus === 'starting') {
        telemetry.robotConnected({ mode: state.connectionMode });
      }

      set({
        robotStatus: 'sleeping',
        busyReason: null,
        safeToShutdown,
        isWakeSleepTransitioning: false,
        // Derived booleans
        isActive: true, // Still active (connected), but sleeping
        isStarting: false,
        isStopping: false,
        isDaemonCrashed: false,
        isCommandRunning: false,
        isAppRunning: false,
        isInstalling: false,
      });
    },

    ready: () => {
      const state = get();

      // Don't transition to ready if there's a hardware error
      if (state.hardwareError) {
        console.warn('[Store] ⚠️ BLOCKED: hardware error present');
        return;
      }

      // 🛡️ Guard: Don't transition if stopping (prevents chaos during shutdown)
      if (state.robotStatus === 'stopping') {
        console.warn('[Store] ⚠️ BLOCKED: robotStatus is stopping');
        return;
      }

      // 🛡️ Guard: Don't transition if no connection (prevents crash after resetAll)
      if (!state.connectionMode) {
        console.warn('[Store] ⚠️ BLOCKED: connectionMode is null/undefined');
        return;
      }

      // 🛡️ Guard: Don't log/transition if already ready (prevents flicker)
      if (state.robotStatus === 'ready') {
        console.warn('[Store] ⚠️ BLOCKED: already ready');
        return;
      }

      // 📊 Telemetry - Track successful connection (only when coming from 'starting')
      // This ensures we only count ACTUAL successful connections, not wake-ups
      if (state.robotStatus === 'starting') {
        telemetry.robotConnected({ mode: state.connectionMode });
      }

      logReady();
      set({
        robotStatus: 'ready',
        busyReason: null,
        safeToShutdown: false,
        isWakeSleepTransitioning: false,
        // Derived booleans
        isActive: true,
        isStarting: false,
        isStopping: false,
        isDaemonCrashed: false,
        isCommandRunning: false,
        isAppRunning: false,
        isInstalling: false,
      });
    },

    busy: reason => {
      const state = get();

      // 🛡️ Guard: Don't transition if stopping (prevents chaos during shutdown)
      if (state.robotStatus === 'stopping') {
        console.warn('[Store] ⚠️ busy BLOCKED: robotStatus is stopping');
        return; // Silently ignore during shutdown
      }

      // 🛡️ Guard: Don't transition if no connection (prevents issues after resetAll)
      if (!state.connectionMode) {
        console.warn('[Store] ⚠️ busy BLOCKED: connectionMode is null');
        return; // Silently ignore after disconnect
      }

      logBusy(reason);
      set(() => {
        const updates = {
          robotStatus: 'busy',
          busyReason: reason,
          safeToShutdown: false,
          isWakeSleepTransitioning: false,
          // Derived booleans
          isActive: true,
          isStarting: false,
          isStopping: false,
          isDaemonCrashed: false,
        };

        if (reason === 'command') updates.isCommandRunning = true;
        if (reason === 'app-running') updates.isAppRunning = true;
        if (reason === 'installing') updates.isInstalling = true;

        return updates;
      });
    },

    stopping: () => {
      set({
        robotStatus: 'stopping',
        busyReason: null,
        safeToShutdown: false,
        isWakeSleepTransitioning: false,
        // Derived booleans
        isActive: false,
        isStarting: false,
        isStopping: true,
        isDaemonCrashed: false,
        // 🛡️ Reset timeouts to prevent false crash detection during intentional stop
        consecutiveTimeouts: 0,
      });
    },

    crashed: () => {
      logCrash();
      set({
        robotStatus: 'crashed',
        busyReason: null,
        safeToShutdown: false,
        isWakeSleepTransitioning: false,
        // Derived booleans
        isActive: false,
        isStarting: false,
        isStopping: false,
        isDaemonCrashed: true,
      });
    },
  },

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  isBusy: () => selectIsBusy(get()),

  isReady: () => selectIsReady(get()),

  // Wake/Sleep transition management
  setWakeSleepTransitioning: isTransitioning => {
    set({ isWakeSleepTransitioning: isTransitioning });
  },

  getRobotStatusLabel: () => {
    const state = get();
    const { robotStatus, busyReason } = state;

    if (robotStatus === 'busy' && busyReason) {
      const reasonLabels = {
        moving: 'Moving',
        command: 'Executing Command',
        'app-running': 'Running App',
        installing: 'Installing',
      };
      return reasonLabels[busyReason] || 'Busy';
    }

    const statusLabels = {
      disconnected: 'Disconnected',
      'ready-to-start': 'Ready to Start',
      starting: 'Starting',
      ready: 'Ready',
      busy: 'Busy',
      stopping: 'Stopping',
      crashed: 'Crashed',
    };

    return statusLabels[robotStatus] || 'Unknown';
  },

  // ============================================================================
  // APP LOCKING MANAGEMENT
  // ============================================================================

  lockForApp: appName => {
    get().transitionTo.busy('app-running');
    set({ currentAppName: appName });
  },

  unlockApp: () => {
    get().transitionTo.ready();
    set({ currentAppName: null });
  },

  // ============================================================================
  // SETTERS
  // ============================================================================

  setDaemonVersion: value => set({ daemonVersion: value }),
  setStartupError: value => set({ startupError: value }),
  setHardwareError: value => set({ hardwareError: value }),

  // ✅ Pure setter - NO side effects
  // USB polling only runs when !connectionMode (searching for robot)
  // Once connected, USB detection is not used (daemon health check handles disconnection)
  setIsUsbConnected: value => set({ isUsbConnected: value }),

  setUsbPortName: value => set({ usbPortName: value }),
  setIsFirstCheck: value => set({ isFirstCheck: value }),

  // 🌐 Connection mode setters
  setConnectionMode: mode => set({ connectionMode: mode }),
  setRemoteHost: host => set({ remoteHost: host }),

  isWifiMode: () => get().connectionMode === 'wifi',

  isLocalDaemon: () => {
    const mode = get().connectionMode;
    return mode === 'usb' || mode === 'simulation';
  },

  // ============================================================================
  // CONNECTION LIFECYCLE
  // ============================================================================

  resetConnection: () => {
    const prevState = get();
    logDisconnect(prevState.connectionMode);

    set({
      robotStatus: 'disconnected',
      busyReason: null,
      // Derived booleans
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
      shouldStreamRobotState: false, // 🎯 Reset WebSocket streaming flag
      activeMoves: [],
      consecutiveTimeouts: 0,
    });
  },

  startConnection: (mode, options = {}) => {
    const { portName, remoteHost } = options;
    logConnect(mode, options);

    set({
      connectionMode: mode,
      remoteHost: remoteHost || null,
      isUsbConnected: mode !== 'wifi',
      usbPortName: portName || null,
      robotStatus: 'starting',
      busyReason: null,
      // Derived booleans
      isActive: false,
      isStarting: true,
      isStopping: false,
      isDaemonCrashed: false,
      // Metadata
      hardwareError: null,
      startupError: null,
      consecutiveTimeouts: 0,
      robotStateFull: { data: null, lastUpdate: null, error: null },
      shouldStreamRobotState: false, // 🎯 Reset WebSocket streaming flag
      activeMoves: [],
      daemonVersion: null,
      isCommandRunning: false,
      isAppRunning: false,
      isInstalling: false,
      currentAppName: null,
    });
  },

  // ============================================================================
  // ROBOT STATE POLLING
  // ============================================================================

  setRobotStateFull: value =>
    set(state => {
      if (typeof value === 'function') {
        return { robotStateFull: value(state.robotStateFull) };
      }
      return { robotStateFull: value };
    }),

  setActiveMoves: value => set({ activeMoves: value }),

  // 🎯 Start WebSocket streaming early (called by HardwareScanView when daemon is ready)
  setShouldStreamRobotState: value => set({ shouldStreamRobotState: value }),

  setIsCommandRunning: value => {
    const state = get();
    if (value) {
      state.transitionTo.busy('command');
    } else if (state.busyReason === 'command') {
      state.transitionTo.ready();
    }
    set({ isCommandRunning: value });
  },

  // ============================================================================
  // TIMEOUT/CRASH MANAGEMENT
  // ============================================================================

  incrementTimeouts: () => {
    const state = get();
    const newCount = state.consecutiveTimeouts + 1;
    const shouldCrash = newCount >= 3;

    if (shouldCrash && state.robotStatus !== 'crashed') {
      state.transitionTo.crashed();
    }

    set({ consecutiveTimeouts: newCount });
  },

  resetTimeouts: () => set({ consecutiveTimeouts: 0, isDaemonCrashed: false }),

  markDaemonCrashed: () => {
    get().transitionTo.crashed();
  },

  // ============================================================================
  // STARTUP TIMEOUT MANAGEMENT
  // ============================================================================

  setStartupTimeout: timeoutId => set({ startupTimeoutId: timeoutId }),

  clearStartupTimeout: () => {
    const state = get();
    if (state.startupTimeoutId !== null) {
      clearTimeout(state.startupTimeoutId);
      set({ startupTimeoutId: null });
    }
  },

  // ============================================================================
  // VISUAL EFFECTS
  // ============================================================================

  triggerEffect: effectType => set({ activeEffect: effectType, effectTimestamp: Date.now() }),
  stopEffect: () => set({ activeEffect: null }),

  // ============================================================================
  // ROBOT BLACKLIST (temporary hiding after network operations)
  // ============================================================================

  /**
   * Add a robot to the blacklist for a specified duration
   * @param {string} host - Robot host (e.g., 'reachy-mini.local')
   * @param {number} durationMs - How long to blacklist (default 10 seconds)
   */
  blacklistRobot: (host, durationMs = 10000) => {
    const expiryTime = Date.now() + durationMs;
    set(state => ({
      robotBlacklist: {
        ...state.robotBlacklist,
        [host]: expiryTime,
      },
    }));
  },

  /**
   * Check if a robot is currently blacklisted
   * @param {string} host - Robot host to check
   * @returns {boolean} True if blacklisted and not expired
   */
  isRobotBlacklisted: host => {
    const state = get();
    const expiryTime = state.robotBlacklist[host];
    if (!expiryTime) return false;

    const now = Date.now();
    return now < expiryTime; // Still blacklisted if not expired
  },

  /**
   * Remove expired entries from blacklist
   * Called periodically by useRobotDiscovery
   */
  cleanupBlacklist: () => {
    const now = Date.now();
    set(state => {
      const cleaned = Object.entries(state.robotBlacklist)
        .filter(([_, expiryTime]) => now < expiryTime)
        .reduce((acc, [host, expiryTime]) => ({ ...acc, [host]: expiryTime }), {});

      // Only update if something changed
      if (Object.keys(cleaned).length !== Object.keys(state.robotBlacklist).length) {
        return { robotBlacklist: cleaned };
      }
      return state;
    });
  },

  /**
   * Clear all blacklisted robots
   */
  clearBlacklist: () => set({ robotBlacklist: {} }),
});
