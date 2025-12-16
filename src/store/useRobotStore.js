import { create } from 'zustand';

/**
 * Robot state store - Manages robot connection, status, and state machine
 */
export const useRobotStore = create((set, get) => ({
  // ✨ Main robot state (State Machine)
  // Possible states: 'disconnected', 'ready-to-start', 'starting', 'ready', 'busy', 'stopping', 'crashed'
  robotStatus: 'disconnected',
  
  // ✨ Reason if status === 'busy'
  // Possible values: null, 'moving', 'command', 'app-running', 'installing'
  busyReason: null,
  
  // Legacy states (for backwards compatibility, but will be derived)
  isActive: false,
  isStarting: false,
  isStopping: false,
  isTransitioning: false, // Transition between scan and active view (window resize)
  
  // Daemon metadata
  daemonVersion: null,
  startupError: null, // Error during startup
  hardwareError: null, // Hardware error detected during scan
  isDaemonCrashed: false, // Daemon crashed/stuck detected
  consecutiveTimeouts: 0, // Counter of consecutive timeouts
  startupTimeoutId: null, // Timeout ID for startup timeout (30s)
  
  // Robot connection state
  isUsbConnected: false,
  usbPortName: null,
  isFirstCheck: true,
  
  // 🌐 Connection mode (USB vs WiFi vs Simulation)
  // - 'usb': Robot connected via USB, daemon runs locally
  // - 'wifi': Robot on network, daemon runs on remote host (Pi)
  // - 'simulation': No physical robot, daemon runs locally with MuJoCo
  // - null: No connection selected yet
  connectionMode: null,
  remoteHost: null, // e.g. 'reachy-mini.home' for WiFi mode
  
  // 🎯 Centralized robot state (polled by useRobotState)
  // All components should consume this instead of polling separately
  robotStateFull: {
    data: null,        // Full state data from /api/state/full
    lastUpdate: null,  // Timestamp of last successful update
    error: null,       // Error message if any
  },
  
  // 🎯 Centralized active moves (polled by useRobotState)
  activeMoves: [],     // Array of active move UUIDs from /api/move/running
  
  // Activity Lock - Global lock for all actions
  // isCommandRunning: quick actions in progress
  // isAppRunning: app running
  // isInstalling: installation/uninstallation in progress
  isCommandRunning: false,
  isAppRunning: false,
  isInstalling: false,
  currentAppName: null, // Name of currently running app
  
  // Visual Effects (3D particles)
  activeEffect: null, // Active effect type ('sleep', 'love', etc.)
  effectTimestamp: 0, // Timestamp to force re-render
  
  // ✨ Transition actions (State Machine)
  // Update robotStatus + busyReason + legacy states (backwards compat)
  transitionTo: {
    disconnected: () => {
      set({
        robotStatus: 'disconnected',
        busyReason: null,
        isActive: false,
        isStarting: false,
        isStopping: false,
        isCommandRunning: false,
        isAppRunning: false,
        isInstalling: false,
      });
    },
    
    readyToStart: () => {
      set({
        robotStatus: 'ready-to-start',
        busyReason: null,
        isActive: false,
        isStarting: false,
        isStopping: false,
      });
    },
    
    starting: () => {
      set({
        robotStatus: 'starting',
        busyReason: null,
        isActive: false,
        isStarting: true,
        isStopping: false,
      });
    },
    
    ready: () => {
      const state = get();
      // ✅ CRITICAL: Don't transition to ready if there's a hardware error
      // This prevents bypassing the error state in scan view
      if (state.hardwareError) {
        console.warn('⚠️ Cannot transition to ready while hardwareError is present');
        return; // Don't transition, stay in error state
      }
      
      set({
        robotStatus: 'ready',
        busyReason: null,
        isActive: true,
        isStarting: false,
        isStopping: false,
        isCommandRunning: false,
        isAppRunning: false,
        isInstalling: false,
      });
    },
    
    busy: (reason) => {
      set((state) => {
        const updates = {
          robotStatus: 'busy',
          busyReason: reason,
          isActive: true,
        };
        
        // Update legacy flags based on reason
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
        isActive: false,
        isStopping: true,
      });
    },
    
    crashed: () => {
      const state = get();
      
      // ✅ Cleanup: If daemon crashes, all apps are stopped too
      if (state.isAppRunning) {
        // Note: unlockApp is in useAppStore, will be called from there
      }
      
      set({
        robotStatus: 'crashed',
        busyReason: null,
        isActive: false,
        isDaemonCrashed: true,
      });
    },
  },
  
  // Helper to check if robot is busy (fine granularity)
  isBusy: () => {
    const state = get();
    return state.robotStatus === 'busy' || state.isCommandRunning || state.isAppRunning || state.isInstalling;
  },
  
  // Global helper: is the robot ready to receive commands?
  // Used everywhere in UI to lock interactions
  isReady: () => {
    const state = get();
    return state.robotStatus === 'ready';
  },
  
  // ✨ Helper to get readable status (debug & UI)
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
  
  // App locking management
  lockForApp: (appName) => {
    get().transitionTo.busy('app-running');
    set({ currentAppName: appName });
  },
  
  unlockApp: () => {
    get().transitionTo.ready();
    set({ currentAppName: null });
  },
  
  // Legacy setters (backwards compatible, sync with robotStatus)
  setIsActive: (value) => {
    const state = get();
    
    // ✅ CRITICAL: Don't allow becoming active if there's a hardware error
    // This prevents bypassing the error state in scan view
    if (value && state.hardwareError) {
      console.warn('⚠️ Cannot set isActive=true while hardwareError is present');
      return; // Early return, don't update state
    }
    
    if (value && !state.isStarting && !state.isStopping) {
      // Daemon becomes active → ready (unless already busy)
      if (state.robotStatus !== 'busy') {
        state.transitionTo.ready();
      }
    } else if (!value && state.robotStatus !== 'starting' && state.robotStatus !== 'stopping') {
      // Daemon becomes inactive → ready-to-start
      state.transitionTo.readyToStart();
    }
    set({ isActive: value });
  },
  
  setIsStarting: (value) => {
    const state = get();
    if (value) {
      state.transitionTo.starting();
    }
    set({ isStarting: value });
  },
  
  setIsStopping: (value) => {
    const state = get();
    if (value) {
      state.transitionTo.stopping();
    } else {
      state.transitionTo.readyToStart();
    }
    set({ isStopping: value });
  },
  
  setIsTransitioning: (value) => set({ isTransitioning: value }),
  setDaemonVersion: (value) => set({ daemonVersion: value }),
  setStartupError: (value) => set({ startupError: value }),
  setHardwareError: (value) => set({ hardwareError: value }),
  
  setIsUsbConnected: (value) => {
    const state = get();
    if (!value) {
      state.transitionTo.disconnected();
    } else if (state.robotStatus === 'disconnected') {
      state.transitionTo.readyToStart();
    }
    set({ isUsbConnected: value });
  },
  
  setUsbPortName: (value) => set({ usbPortName: value }),
  setIsFirstCheck: (value) => set({ isFirstCheck: value }),
  
  // 🌐 Connection mode setters
  setConnectionMode: (mode) => set({ connectionMode: mode }),
  setRemoteHost: (host) => set({ remoteHost: host }),
  
  // 🌐 Helper to check if we're in WiFi mode (daemon is remote, not local)
  isWifiMode: () => get().connectionMode === 'wifi',
  
  // 🌐 Helper to check if daemon is managed locally (USB or simulation)
  isLocalDaemon: () => {
    const mode = get().connectionMode;
    return mode === 'usb' || mode === 'simulation';
  },
  
  // 🌐 Reset connection state (return to FindingRobotView)
  // Used when disconnecting from any mode (USB/WiFi/Simulation)
  resetConnection: () => {
    set({
      robotStatus: 'disconnected',
      busyReason: null,
      isActive: false,
      isStarting: false,
      isStopping: false,
      connectionMode: null,
      remoteHost: null,
      isUsbConnected: false,
      usbPortName: null,
      isFirstCheck: true,
      daemonVersion: null, // Reset version for clean state
    });
  },
  
  // 🌐 Start connection - atomic action to avoid state cascade
  // Sets all necessary state at once without triggering intermediate transitions
  startConnection: (mode, options = {}) => {
    const { portName, remoteHost } = options;
    set({
      connectionMode: mode,
      remoteHost: remoteHost || null,
      isUsbConnected: mode !== 'wifi', // USB and simulation need this
      usbPortName: portName || null,
      robotStatus: 'starting',
      isStarting: true,
      isActive: false,
      isStopping: false,
      hardwareError: null,
      startupError: null,
    });
  },
  setRobotStateFull: (value) => set((state) => {
    // If value is a function, call it with previous state
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
  
  // Timeout/crash management
  incrementTimeouts: () => {
    const state = get();
    const newCount = state.consecutiveTimeouts + 1;
    const isCrashed = newCount >= 3; // ⚡ Crash after 3 timeouts over 4s (~1.33s × 3)
    
    if (isCrashed && !state.isDaemonCrashed) {
      state.transitionTo.crashed();
    }
    
    set({ consecutiveTimeouts: newCount });
  },
  
  resetTimeouts: () => set({ 
    consecutiveTimeouts: 0, 
    isDaemonCrashed: false 
  }),
  
  markDaemonCrashed: () => {
    const state = get();
    state.transitionTo.crashed();
  },
  
  // Startup timeout management
  setStartupTimeout: (timeoutId) => set({ startupTimeoutId: timeoutId }),
  clearStartupTimeout: () => {
    const state = get();
    if (state.startupTimeoutId !== null) {
      clearTimeout(state.startupTimeoutId);
      set({ startupTimeoutId: null });
    }
  },
  
  // Trigger 3D visual effect
  triggerEffect: (effectType) => set({ 
    activeEffect: effectType, 
    effectTimestamp: Date.now() 
  }),
  
  // Stop active effect
  stopEffect: () => set({ activeEffect: null }),
}));

