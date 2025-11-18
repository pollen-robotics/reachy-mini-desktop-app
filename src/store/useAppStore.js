import { create } from 'zustand';

// Detect system preference
const getSystemPreference = () => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

// Read stored preference
const getStoredPreference = () => {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem('darkMode');
  return stored ? JSON.parse(stored) : null;
};

// Determine initial dark mode
const getInitialDarkMode = () => {
  const storedPreference = getStoredPreference();
  // If user has stored preference, use it
  if (storedPreference !== null) {
    console.log('🎨 Using stored dark mode preference:', storedPreference);
    return storedPreference;
  }
  // Otherwise, use system preference
  const systemPreference = getSystemPreference();
  console.log('🎨 Using system dark mode preference:', systemPreference);
  return systemPreference;
};

// Track last logged state to avoid repeated logs
let lastLoggedStatus = null;

const useAppStore = create((set) => ({
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
  
  // Robot state
  isUsbConnected: false,
  usbPortName: null,
  isFirstCheck: true,
  
  // Logs
  logs: [],
  frontendLogs: [],
  
  // Activity Lock - Global lock for all actions
  // isCommandRunning: quick actions in progress
  // isAppRunning: app running
  // isInstalling: installation/uninstallation in progress
  // isBusy: computed helper (quick action OR app running OR installing)
  isCommandRunning: false,
  isAppRunning: false,
  isInstalling: false,
  currentAppName: null, // Name of currently running app
  installingAppName: null, // Name of app being installed
  installJobType: null, // Job type: 'install' or 'remove'
  installResult: null, // Installation result: 'success', 'failed', null
  
  // Visual Effects (3D particles)
  activeEffect: null, // Active effect type ('sleep', 'love', etc.)
  effectTimestamp: 0, // Timestamp to force re-render
  
  // Theme (initialized with system or stored preference)
  darkMode: getInitialDarkMode(),
  
  // Actions - Generic DRY setter
  update: (updates) => set(updates),
  
  // ✨ Transition actions (State Machine)
  // Update robotStatus + busyReason + legacy states (backwards compat)
  transitionTo: {
    disconnected: () => {
      if (lastLoggedStatus !== 'disconnected') {
        console.log('🤖 [STATE] → disconnected');
        lastLoggedStatus = 'disconnected';
      }
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
      if (lastLoggedStatus !== 'ready-to-start') {
        console.log('🤖 [STATE] → ready-to-start');
        lastLoggedStatus = 'ready-to-start';
      }
      set({
        robotStatus: 'ready-to-start',
        busyReason: null,
        isActive: false,
        isStarting: false,
        isStopping: false,
      });
    },
    
    starting: () => {
      if (lastLoggedStatus !== 'starting') {
        console.log('🤖 [STATE] → starting');
        lastLoggedStatus = 'starting';
      }
      set({
        robotStatus: 'starting',
        busyReason: null,
        isActive: false,
        isStarting: true,
        isStopping: false,
      });
    },
    
    ready: () => {
      if (lastLoggedStatus !== 'ready') {
        console.log('🤖 [STATE] → ready');
        lastLoggedStatus = 'ready';
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
      const newStatus = `busy (${reason})`;
      if (lastLoggedStatus !== newStatus) {
        console.log(`🤖 [STATE] → ${newStatus}`);
        lastLoggedStatus = newStatus;
      }
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
      if (lastLoggedStatus !== 'stopping') {
        console.log('🤖 [STATE] → stopping');
        lastLoggedStatus = 'stopping';
      }
      set({
        robotStatus: 'stopping',
        busyReason: null,
        isActive: false,
        isStopping: true,
      });
    },
    
    crashed: () => {
      if (lastLoggedStatus !== 'crashed') {
        console.log('🤖 [STATE] → crashed');
        lastLoggedStatus = 'crashed';
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
    const state = useAppStore.getState();
    return state.robotStatus === 'busy' || state.isCommandRunning || state.isAppRunning || state.isInstalling;
  },
  
  // Global helper: is the robot ready to receive commands?
  // Used everywhere in UI to lock interactions
  isReady: () => {
    const state = useAppStore.getState();
    return state.robotStatus === 'ready';
  },
  
  // ✨ Helper to get readable status (debug & UI)
  getRobotStatusLabel: () => {
    const state = useAppStore.getState();
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
  
  // Gestion du verrouillage pour les apps
  lockForApp: (appName) => {
    const state = useAppStore.getState();
    state.transitionTo.busy('app-running');
    set({ currentAppName: appName });
  },
  unlockApp: () => {
    const state = useAppStore.getState();
    state.transitionTo.ready();
    set({ currentAppName: null });
  },
  
  // Gestion du verrouillage pour les installations
  lockForInstall: (appName, jobType = 'install') => {
    const state = useAppStore.getState();
    state.transitionTo.busy('installing');
    set({
      installingAppName: appName,
      installJobType: jobType, // 'install' ou 'remove'
      installResult: null,
    });
  },
  unlockInstall: () => {
    const state = useAppStore.getState();
    state.transitionTo.ready();
    set({
      installingAppName: null,
      installJobType: null,
      installResult: null,
    });
  },
  setInstallResult: (result) => set({
    installResult: result, // 'success', 'failed' or null
  }),
  
  // Specific helpers for logs (business logic)
  addFrontendLog: (message) => set((state) => ({ 
    frontendLogs: [
      ...state.frontendLogs.slice(-50), // Keep max 50 logs
      {
        timestamp: new Date().toLocaleTimeString('en-GB', { 
          hour: '2-digit', 
          minute: '2-digit', 
          second: '2-digit',
          hour12: false // 24-hour format
        }),
        message,
        source: 'frontend', // To visually distinguish
      }
    ]
  })),
  
  // Legacy setters (backwards compatible, sync with robotStatus)
  setIsActive: (value) => {
    const state = useAppStore.getState();
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
    const state = useAppStore.getState();
    if (value) {
      state.transitionTo.starting();
    }
    set({ isStarting: value });
  },
  
  setIsStopping: (value) => {
    const state = useAppStore.getState();
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
    const state = useAppStore.getState();
    if (!value) {
      state.transitionTo.disconnected();
    } else if (state.robotStatus === 'disconnected') {
      state.transitionTo.readyToStart();
    }
    set({ isUsbConnected: value });
  },
  
  setUsbPortName: (value) => set({ usbPortName: value }),
  setIsFirstCheck: (value) => set({ isFirstCheck: value }),
  setLogs: (logs) => set({ logs }),
  
  setIsCommandRunning: (value) => {
    const state = useAppStore.getState();
    if (value) {
      state.transitionTo.busy('command');
    } else if (state.busyReason === 'command') {
      state.transitionTo.ready();
    }
    set({ isCommandRunning: value });
  },
  
  // Timeout/crash management
  incrementTimeouts: () => {
    const state = useAppStore.getState();
    const newCount = state.consecutiveTimeouts + 1;
    const isCrashed = newCount >= 3; // ⚡ Crash after 3 timeouts over 4s (~1.33s × 3)
    
    if (isCrashed && !state.isDaemonCrashed) {
      console.error(`💥 DAEMON CRASHED - ${newCount} consecutive timeouts`);
      state.transitionTo.crashed();
    }
    
    set({ consecutiveTimeouts: newCount });
  },
  
  resetTimeouts: () => set({ 
    consecutiveTimeouts: 0, 
    isDaemonCrashed: false 
  }),
  
  markDaemonCrashed: () => {
    const state = useAppStore.getState();
    state.transitionTo.crashed();
  },
  
  // Trigger 3D visual effect
  triggerEffect: (effectType) => set({ 
    activeEffect: effectType, 
    effectTimestamp: Date.now() 
  }),
  
  // Stop active effect
  stopEffect: () => set({ activeEffect: null }),
  
  // Toggle dark mode (with persistence)
  setDarkMode: (value) => {
    console.log('🎨 Setting dark mode to:', value);
    localStorage.setItem('darkMode', JSON.stringify(value));
    set({ darkMode: value });
  },
  toggleDarkMode: () => set((state) => {
    const newValue = !state.darkMode;
    console.log('🎨 Toggling dark mode to:', newValue);
    localStorage.setItem('darkMode', JSON.stringify(newValue));
    return { darkMode: newValue };
  }),
  
  // Reset to system preference
  resetDarkMode: () => {
    console.log('🎨 Resetting to system preference');
    localStorage.removeItem('darkMode');
    const systemPreference = getSystemPreference();
    set({ darkMode: systemPreference });
  },
}));

// Listen to system preference changes
if (typeof window !== 'undefined') {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  
  const handleSystemPreferenceChange = (e) => {
    // Only update if user has no stored preference
    const storedPreference = getStoredPreference();
    if (storedPreference === null) {
      console.log('🎨 System preference changed:', e.matches);
      useAppStore.setState({ darkMode: e.matches });
    }
  };
  
  // Modern method
  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener('change', handleSystemPreferenceChange);
  } else {
    // Fallback for older browsers
    mediaQuery.addListener(handleSystemPreferenceChange);
  }
}

export default useAppStore;

