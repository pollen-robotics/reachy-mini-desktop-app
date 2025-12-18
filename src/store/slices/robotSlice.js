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

// ============================================================================
// SELECTORS - Derive boolean states from robotStatus
// ============================================================================

/**
 * @param {Object} state - Store state
 * @returns {boolean} True if robot is active (ready or busy)
 */
export const selectIsActive = (state) => 
  state.robotStatus === 'ready' || state.robotStatus === 'busy';

/**
 * @param {Object} state - Store state
 * @returns {boolean} True if daemon is starting
 */
export const selectIsStarting = (state) => 
  state.robotStatus === 'starting';

/**
 * @param {Object} state - Store state
 * @returns {boolean} True if daemon is stopping
 */
export const selectIsStopping = (state) => 
  state.robotStatus === 'stopping';

/**
 * @param {Object} state - Store state
 * @returns {boolean} True if daemon has crashed
 */
export const selectIsDaemonCrashed = (state) => 
  state.robotStatus === 'crashed';

/**
 * @param {Object} state - Store state
 * @returns {boolean} True if robot is busy
 */
export const selectIsBusy = (state) => 
  state.robotStatus === 'busy' || state.isCommandRunning || state.isAppRunning || state.isInstalling || state.isStoppingApp;

/**
 * @param {Object} state - Store state
 * @returns {boolean} True if robot is ready (not busy with any action)
 */
export const selectIsReady = (state) => 
  state.robotStatus === 'ready' && !state.isCommandRunning && !state.isAppRunning && !state.isInstalling && !state.isStoppingApp;

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
  isActive: false,      // true when robotStatus is 'ready' or 'busy'
  isStarting: false,    // true when robotStatus is 'starting'
  isStopping: false,    // true when robotStatus is 'stopping'
  isDaemonCrashed: false, // true when robotStatus is 'crashed'
  
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
  
  // 🎯 Centralized robot state (polled by useRobotState)
  robotStateFull: {
    data: null,
    lastUpdate: null,
    error: null,
  },
  
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
      console.log('[Store] 🔴 transitionTo.disconnected() called');
      set({
        robotStatus: 'disconnected',
        busyReason: null,
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
      console.log('[Store] 🟡 transitionTo.readyToStart() called');
      set({
        robotStatus: 'ready-to-start',
        busyReason: null,
        // Derived booleans
        isActive: false,
        isStarting: false,
        isStopping: false,
        isDaemonCrashed: false,
      });
    },
    
    starting: () => {
      console.log('[Store] 🟠 transitionTo.starting() called');
      set({
        robotStatus: 'starting',
        busyReason: null,
        // Derived booleans
        isActive: false,
        isStarting: true,
        isStopping: false,
        isDaemonCrashed: false,
      });
    },
    
    ready: () => {
      const state = get();
      
      // 🔍 DEBUG: Log state when transitionTo.ready() is called
      console.log('[Store] 🎯 transitionTo.ready() called', {
        hardwareError: state.hardwareError,
        robotStatus: state.robotStatus,
        connectionMode: state.connectionMode,
        isActive: state.isActive,
      });
      
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
      
      console.log('[Store] ✅ Transitioning to ready - window should resize now');
      logReady();
      set({
        robotStatus: 'ready',
        busyReason: null,
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
    
    busy: (reason) => {
      console.log('[Store] 🟣 transitionTo.busy() called', { reason });
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
      console.log('[Store] 🔵 transitionTo.stopping() called');
      set({
        robotStatus: 'stopping',
        busyReason: null,
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
      console.log('[Store] 💀 transitionTo.crashed() called');
      logCrash();
      set({
        robotStatus: 'crashed',
        busyReason: null,
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
  
  getRobotStatusLabel: () => {
    const state = get();
    const { robotStatus, busyReason } = state;
    
    if (robotStatus === 'busy' && busyReason) {
      const reasonLabels = {
        'moving': 'Moving',
        'command': 'Executing Command',
        'app-running': 'Running App',
        'installing': 'Installing',
      };
      return reasonLabels[busyReason] || 'Busy';
    }
    
    const statusLabels = {
      'disconnected': 'Disconnected',
      'ready-to-start': 'Ready to Start',
      'starting': 'Starting',
      'ready': 'Ready',
      'busy': 'Busy',
      'stopping': 'Stopping',
      'crashed': 'Crashed',
    };
    
    return statusLabels[robotStatus] || 'Unknown';
  },
  
  // ============================================================================
  // APP LOCKING MANAGEMENT
  // ============================================================================
  
  lockForApp: (appName) => {
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
  
  setDaemonVersion: (value) => set({ daemonVersion: value }),
  setStartupError: (value) => set({ startupError: value }),
  setHardwareError: (value) => set({ hardwareError: value }),
  
  // ✅ Pure setter - NO side effects
  // USB polling only runs when !connectionMode (searching for robot)
  // Once connected, USB detection is not used (daemon health check handles disconnection)
  setIsUsbConnected: (value) => set({ isUsbConnected: value }),
  
  setUsbPortName: (value) => set({ usbPortName: value }),
  setIsFirstCheck: (value) => set({ isFirstCheck: value }),
  
  // 🌐 Connection mode setters
  setConnectionMode: (mode) => set({ connectionMode: mode }),
  setRemoteHost: (host) => set({ remoteHost: host }),
  
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
  
  setRobotStateFull: (value) => set((state) => {
    if (typeof value === 'function') {
      return { robotStateFull: value(state.robotStateFull) };
    }
    return { robotStateFull: value };
  }),
  
  setActiveMoves: (value) => set({ activeMoves: value }),
  
  setIsCommandRunning: (value) => {
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
  
  setStartupTimeout: (timeoutId) => set({ startupTimeoutId: timeoutId }),
  
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
  
  triggerEffect: (effectType) => set({ activeEffect: effectType, effectTimestamp: Date.now() }),
  stopEffect: () => set({ activeEffect: null }),
});
