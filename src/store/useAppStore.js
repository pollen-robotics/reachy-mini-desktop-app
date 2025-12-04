import { create } from 'zustand';
import { DAEMON_CONFIG } from '../config/daemon';

// ✅ OPTIMIZED: Fast comparison functions (replaces JSON.stringify)
// These are much faster than JSON.stringify for frequent comparisons

/**
 * Compare robotStateFull objects efficiently
 * Structure: { data: any, lastUpdate: number|null, error: string|null }
 */
const compareRobotStateFull = (prev, next) => {
  if (prev === next) return true;
  if (!prev || !next) return prev === next;
  
  // Compare timestamps first (fastest check)
  if (prev.lastUpdate !== next.lastUpdate) return false;
  
  // Compare error strings
  if (prev.error !== next.error) return false;
  
  // Compare data - if both are null/undefined, they're equal
  if (!prev.data && !next.data) return true;
  if (!prev.data || !next.data) return false;
  
  // For data, do a shallow comparison of keys (most data is nested objects)
  // This is much faster than deep serialization
  const prevKeys = Object.keys(prev.data);
  const nextKeys = Object.keys(next.data);
  if (prevKeys.length !== nextKeys.length) return false;
  
  // Quick check: if keys match, assume equal (data structure is usually stable)
  // For exact comparison, we'd need to recurse, but this is a good balance
  return prevKeys.every(key => prev.data[key] === next.data[key]);
};

/**
 * Compare arrays of strings (activeMoves: string[])
 * Much faster than JSON.stringify for simple string arrays
 */
const compareStringArray = (prev, next) => {
  if (prev === next) return true;
  if (!prev || !next) return prev === next;
  if (prev.length !== next.length) return false;
  
  // For small arrays, direct comparison is fastest
  for (let i = 0; i < prev.length; i++) {
    if (prev[i] !== next[i]) return false;
  }
  return true;
};

/**
 * Compare frontendLogs arrays
 * Structure: Array<{ timestamp: string, message: string, source: string }>
 */
const compareFrontendLogs = (prev, next) => {
  if (prev === next) return true;
  if (!prev || !next) return prev === next;
  if (prev.length !== next.length) return false;
  
  // Compare last log entry first (most likely to change)
  if (prev.length > 0 && next.length > 0) {
    const lastPrev = prev[prev.length - 1];
    const lastNext = next[next.length - 1];
    if (lastPrev.timestamp !== lastNext.timestamp || 
        lastPrev.message !== lastNext.message ||
        lastPrev.source !== lastNext.source) {
      return false;
    }
  }
  
  // If last entry matches and length is same, assume equal
  // (logs are append-only, so if last entry and length match, arrays are equal)
  return true;
};

/**
 * Deep equality comparison for objects
 * Used for other object types that need deep comparison
 */
const deepEqual = (a, b) => {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  
  // For arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, idx) => deepEqual(val, b[idx]));
  }
  
  // For objects
  if (Array.isArray(a) || Array.isArray(b)) return false;
  
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  
  return keysA.every(key => deepEqual(a[key], b[key]));
};

/**
 * Compare state values and extract changed keys
 * ✅ OPTIMIZED: Uses fast comparison functions instead of JSON.stringify
 */
const extractChangedUpdates = (prevState, newState, relevantKeys) => {
  const changedUpdates = {};
  
  relevantKeys.forEach(key => {
    const prevValue = prevState[key];
    const newValue = newState[key];
    
    // Fast path: reference equality
    if (prevValue === newValue) return;
    
    // Specialized comparisons for frequently updated objects
    if (key === 'robotStateFull') {
      if (!compareRobotStateFull(prevValue, newValue)) {
        changedUpdates[key] = newValue;
      }
    } else if (key === 'activeMoves') {
      if (!compareStringArray(prevValue, newValue)) {
        changedUpdates[key] = newValue;
      }
    } else if (key === 'frontendLogs') {
      if (!compareFrontendLogs(prevValue, newValue)) {
        changedUpdates[key] = newValue;
      }
    } else if (typeof prevValue === 'object' && typeof newValue === 'object' && prevValue !== null && newValue !== null) {
      // For other objects, use deep comparison
      if (!deepEqual(prevValue, newValue)) {
        changedUpdates[key] = newValue;
      }
    } else {
      // For primitives, simple comparison
      if (prevValue !== newValue) {
        changedUpdates[key] = newValue;
      }
    }
  });
  
  return changedUpdates;
};

// Middleware to sync store state to other windows via Tauri events
const windowSyncMiddleware = (config) => (set, get, api) => {
  let isMainWindow = false;
  let emitStoreUpdate = null;
  let initPromise = null;
  
  // Initialize window check and emit function
  const initWindowSync = async () => {
    if (initPromise) return initPromise;
    
    initPromise = (async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const { emit } = await import('@tauri-apps/api/event');
        const currentWindow = await getCurrentWindow();
        isMainWindow = currentWindow.label === 'main';
        
        if (isMainWindow) {
          emitStoreUpdate = async (updates) => {
            try {
              // Only emit relevant state that secondary windows need
              const relevantUpdates = {};
              const relevantKeys = [
                'darkMode',
                'isActive',
                'robotStatus',
                'busyReason',
                'isCommandRunning',
                'isAppRunning',
                'isInstalling',
                'robotStateFull',
                'activeMoves',
                'frontendLogs', // Synchronize logs so they appear in main window
              ];
              
              // Extract only relevant keys from updates
              relevantKeys.forEach(key => {
                if (key in updates) {
                  relevantUpdates[key] = updates[key];
                }
              });
              
              // Always include darkMode in updates (it's needed for UI consistency)
              // Get current state to ensure darkMode is always present
              const currentState = get();
              if (!('darkMode' in relevantUpdates)) {
                relevantUpdates.darkMode = currentState.darkMode;
              }
              
              // Only emit if there are actual changes
              if (Object.keys(relevantUpdates).length > 0) {
                await emit('store-update', relevantUpdates);
              }
            } catch (error) {
              // Silently fail if not in Tauri or event system not available
            }
          };
        }
      } catch (error) {
        // Not in Tauri environment, skip sync
      }
    })();
    
    return initPromise;
  };
  
  // Initialize immediately (fire and forget)
  initWindowSync();
  
  // ✅ FACTORIZED: Single function to handle state comparison and emission
  const processStateUpdate = (prevState) => {
        const newState = get();
        const relevantKeys = [
          'darkMode',
          'isActive',
          'robotStatus',
          'busyReason',
          'isCommandRunning',
          'isAppRunning',
          'isInstalling',
          'robotStateFull',
          'activeMoves',
          'frontendLogs', // Synchronize logs so they appear in main window
        ];
        
    // ✅ OPTIMIZED: Use fast comparison functions instead of JSON.stringify
    const changedUpdates = extractChangedUpdates(prevState, newState, relevantKeys);
        
        // Always include critical UI state for consistency (even if it didn't change)
        // This ensures secondary windows always have the latest values
        const currentState = get();
        if (!('darkMode' in changedUpdates)) {
          changedUpdates.darkMode = currentState.darkMode;
        }
        if (!('isActive' in changedUpdates)) {
          changedUpdates.isActive = currentState.isActive;
        }
        if (!('robotStatus' in changedUpdates)) {
          changedUpdates.robotStatus = currentState.robotStatus;
        }
        
        // Emit if there are changes (or if we added critical state)
        if (Object.keys(changedUpdates).length > 0) {
          emitStoreUpdate(changedUpdates);
        }
  };
  
  return config(
    (updates, replace) => {
      // Capture state before update
      const prevState = get();
      
      // Apply the update
      const result = set(updates, replace);
      
      // Emit updates from main window only (wait for init if needed)
      if (emitStoreUpdate) {
        processStateUpdate(prevState);
      } else if (initPromise) {
        // Wait for init to complete, then emit
        initPromise.then(() => {
          if (emitStoreUpdate) {
            processStateUpdate(prevState);
          }
        });
      }
      
      return result;
    },
    get,
    api
  );
};

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
    return storedPreference;
  }
  // Otherwise, use system preference
  return getSystemPreference();
};

// Track last logged state to avoid repeated logs
let lastLoggedStatus = null;

const useAppStore = create(
  windowSyncMiddleware((set) => ({
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
  
  // Robot state
  isUsbConnected: false,
  usbPortName: null,
  isFirstCheck: true,
  
  // 🎯 Centralized robot state (polled by useRobotState)
  // All components should consume this instead of polling separately
  robotStateFull: {
    data: null,        // Full state data from /api/state/full
    lastUpdate: null,  // Timestamp of last successful update
    error: null,       // Error message if any
  },
  
  // 🎯 Centralized active moves (polled by useRobotState)
  activeMoves: [],     // Array of active move UUIDs from /api/move/running
  
  // Logs - Centralized system
  logs: [],              // Daemon logs (from Tauri IPC)
  frontendLogs: [],      // Frontend action logs (API calls, user actions)
  appLogs: [],           // App logs (from running apps via sidecar stdout/stderr)
  
  // Activity Lock - Global lock for all actions
  // isCommandRunning: quick actions in progress
  // isAppRunning: app running
  // isInstalling: installation/uninstallation in progress
  // isBusy: computed helper (quick action OR app running OR installing)
  isCommandRunning: false,
  isAppRunning: false,
  isInstalling: false,
  currentAppName: null, // Name of currently running app
  
  // ✅ REFACTORED: Installation state (previously scattered in refs)
  installingAppName: null,        // Name of app being installed
  installJobType: null,            // Job type: 'install' or 'remove'
  installResult: null,             // Installation result: 'success', 'failed', null
  installStartTime: null,          // Timestamp when installation started (for minimum display duration)
  processedJobs: [],              // Array of processed job keys to avoid loops (Set not serializable in Zustand)
  jobSeenOnce: false,              // Flag to track if we've seen the job at least once
  
  // Visual Effects (3D particles)
  activeEffect: null, // Active effect type ('sleep', 'love', etc.)
  effectTimestamp: 0, // Timestamp to force re-render
  
  // Theme (initialized with system or stored preference)
  darkMode: getInitialDarkMode(),
  
  // Window management - Track open secondary windows
  openWindows: [], // Array of window labels that are currently open
  
  // Right panel view management - Controls what's displayed in the right column
  // Possible values: null (default/applications), 'controller', 'expressions'
  rightPanelView: null,
  
  // 🎯 Apps Management - Centralized app state
  availableApps: [],              // All available apps (official + installed)
  installedApps: [],              // Only installed apps (subset of availableApps)
  currentApp: null,               // Currently running app: { info: { name, ... }, state: 'running'|'starting'|..., error?: string } | null
  activeJobs: {},                 // Active installation jobs: Object<jobId, { type: 'install'|'remove', appName, status, logs }> (Object instead of Map for Zustand serialization)
  appsLoading: false,             // Loading state for apps fetch
  appsError: null,                // Error state for apps fetch
  appsLastFetch: null,            // Timestamp of last successful fetch (for cache)
  appsOfficialMode: true,         // Current mode: true = official only, false = all apps
  appsCacheValid: false,          // Whether cache is still valid (to avoid unnecessary refetch)
  
  // Actions - Generic DRY setter
  update: (updates) => set(updates),
  
  // Window management actions
  addOpenWindow: (windowLabel) => set((state) => {
    if (!state.openWindows.includes(windowLabel)) {
      return { openWindows: [...state.openWindows, windowLabel] };
    }
    return state;
  }),
  
  removeOpenWindow: (windowLabel) => set((state) => ({
    openWindows: state.openWindows.filter(label => label !== windowLabel),
  })),
  
  isWindowOpen: (windowLabel) => {
    const state = useAppStore.getState();
    return state.openWindows.includes(windowLabel);
  },
  
  // Right panel view management actions
  setRightPanelView: (view) => set({ rightPanelView: view }), // view: null | 'controller' | 'expressions'
  
  // ✨ Transition actions (State Machine)
  // Update robotStatus + busyReason + legacy states (backwards compat)
  transitionTo: {
    disconnected: () => {
        lastLoggedStatus = 'disconnected';
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
        lastLoggedStatus = 'ready-to-start';
      set({
        robotStatus: 'ready-to-start',
        busyReason: null,
        isActive: false,
        isStarting: false,
        isStopping: false,
      });
    },
    
    starting: () => {
        lastLoggedStatus = 'starting';
      set({
        robotStatus: 'starting',
        busyReason: null,
        isActive: false,
        isStarting: true,
        isStopping: false,
      });
    },
    
    ready: () => {
      const state = useAppStore.getState();
      // ✅ CRITICAL: Don't transition to ready if there's a hardware error
      // This prevents bypassing the error state in scan view
      if (state.hardwareError) {
        console.warn('⚠️ Cannot transition to ready while hardwareError is present');
        return; // Don't transition, stay in error state
      }
      
        lastLoggedStatus = 'ready';
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
        lastLoggedStatus = newStatus;
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
        lastLoggedStatus = 'stopping';
      set({
        robotStatus: 'stopping',
        busyReason: null,
        isActive: false,
        isStopping: true,
      });
    },
    
    crashed: () => {
        lastLoggedStatus = 'crashed';
      const state = useAppStore.getState();
      
      // ✅ Cleanup: If daemon crashes, all apps are stopped too
      if (state.isAppRunning) {
        state.unlockApp();
      }
      
      set({
        robotStatus: 'crashed',
        busyReason: null,
        isActive: false,
        isDaemonCrashed: true,
        // isAppRunning already cleaned by unlockApp() above
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
  
  // App locking management
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
  
  // ✅ REFACTORED: Installation management (state + actions)
  lockForInstall: (appName, jobType = 'install') => {
    const state = useAppStore.getState();
    state.transitionTo.busy('installing');
    set({
      installingAppName: appName,
      installJobType: jobType,
      installResult: null,
      installStartTime: Date.now(),
      jobSeenOnce: false,
      // processedJobs: clear the specific job key
    });
    // Clear the processed job for this app
    const jobKey = `${appName}_${jobType}`;
    const processedJobs = state.processedJobs.filter(key => key !== jobKey);
    set({ processedJobs });
  },
  
  unlockInstall: () => {
    const state = useAppStore.getState();
    state.transitionTo.ready();
    set({
      installingAppName: null,
      installJobType: null,
      installResult: null,
      installStartTime: null,
      jobSeenOnce: false,
      processedJobs: [], // Clear all processed jobs
    });
  },
  
  setInstallResult: (result) => set({
    installResult: result, // 'success', 'failed' or null
  }),
  
  markJobAsSeen: () => set({
    jobSeenOnce: true,
  }),
  
  markJobAsProcessed: (appName, jobType) => {
    const state = useAppStore.getState();
    const jobKey = `${appName}_${jobType}`;
    const processedJobs = state.processedJobs.includes(jobKey) 
      ? state.processedJobs 
      : [...state.processedJobs, jobKey];
    set({ processedJobs });
  },
  
  // Specific helpers for logs (business logic)
  addFrontendLog: (message) => set((state) => ({ 
    frontendLogs: [
      ...state.frontendLogs.slice(-DAEMON_CONFIG.LOGS.MAX_FRONTEND), // Keep max logs
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
  
  // Add app log to centralized system
  addAppLog: (message, appName, level = 'info') => {
    const newLog = {
      timestamp: new Date().toLocaleTimeString('en-GB', { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        hour12: false
      }),
      message,
      source: 'app',
      appName,
      level, // 'info', 'warning', 'error'
    };
    
    set((state) => {
      // ✅ Deduplication: Check if the last log is the same (avoid duplicates)
      const lastLog = state.appLogs[state.appLogs.length - 1];
      const isDuplicate = lastLog && 
        lastLog.message === message && 
        lastLog.appName === appName &&
        // Allow same message if timestamp is different (at least 1 second apart)
        lastLog.timestamp === newLog.timestamp;
      
      if (isDuplicate) {
        // Don't add duplicate
        return state;
      }
      
      return {
        appLogs: [
          ...state.appLogs.slice(-DAEMON_CONFIG.LOGS.MAX_APP), // Keep max app logs
          newLog
        ]
      };
    });
  },
  
  // Clear app logs (when app stops)
  clearAppLogs: (appName) => set((state) => ({
    appLogs: appName 
      ? state.appLogs.filter(log => log.appName !== appName)
      : [] // Clear all if no appName provided
  })),
  
  // Legacy setters (backwards compatible, sync with robotStatus)
  setIsActive: (value) => {
    const state = useAppStore.getState();
    
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
      
      // ✅ Cleanup: If daemon stops, all apps are stopped too
      if (state.isAppRunning) {
        state.unlockApp();
      }
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
  setRobotStateFull: (value) => set((state) => {
    // If value is a function, call it with previous state
    if (typeof value === 'function') {
      return { robotStateFull: value(state.robotStateFull) };
    }
    return { robotStateFull: value };
  }),
  setActiveMoves: (value) => set({ activeMoves: value }),
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
  
  // Startup timeout management
  setStartupTimeout: (timeoutId) => set({ startupTimeoutId: timeoutId }),
  clearStartupTimeout: () => {
    const state = useAppStore.getState();
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
  
  // Toggle dark mode (with persistence)
  setDarkMode: (value) => {
    localStorage.setItem('darkMode', JSON.stringify(value));
    set({ darkMode: value });
  },
  toggleDarkMode: () => set((state) => {
    const newValue = !state.darkMode;
    localStorage.setItem('darkMode', JSON.stringify(newValue));
    return { darkMode: newValue };
  }),
  
  // Reset to system preference
  resetDarkMode: () => {
    localStorage.removeItem('darkMode');
    const systemPreference = getSystemPreference();
    set({ darkMode: systemPreference });
  },
  
  // 🎯 Apps Management Actions
  setAvailableApps: (apps) => set({ 
    availableApps: apps,
    appsLastFetch: Date.now(),
    appsCacheValid: true,
    appsError: null,
  }),
  
  setInstalledApps: (apps) => set({ installedApps: apps }),
  
  setCurrentApp: (app) => set({ currentApp: app }),
  
  setActiveJobs: (jobs) => {
    // Handle both Map and Object, and function updaters
    if (typeof jobs === 'function') {
      // Updater function
      set((state) => {
        const currentJobs = state.activeJobs instanceof Map 
          ? Object.fromEntries(state.activeJobs) 
          : (state.activeJobs || {});
        const newJobs = jobs(new Map(Object.entries(currentJobs)));
        // Convert Map to Object for Zustand
        const jobsObj = newJobs instanceof Map 
          ? Object.fromEntries(newJobs) 
          : newJobs;
        return { activeJobs: jobsObj };
      });
    } else {
      // Direct value
      const jobsObj = jobs instanceof Map 
        ? Object.fromEntries(jobs) 
        : jobs;
      set({ activeJobs: jobsObj || {} });
    }
  },
  
  setAppsLoading: (loading) => set({ appsLoading: loading }),
  
  setAppsError: (error) => set({ appsError: error }),
  
  setAppsOfficialMode: (mode) => set({ 
    appsOfficialMode: mode,
    appsCacheValid: false, // Invalidate cache when mode changes
  }),
  
  invalidateAppsCache: () => set({ appsCacheValid: false }),
  
  clearApps: () => set({
    availableApps: [],
    installedApps: [],
    currentApp: null,
    activeJobs: {},
    appsLoading: false,
    appsError: null,
    appsLastFetch: null,
    appsCacheValid: false,
  }),
  }))
);

// Listen to system preference changes
if (typeof window !== 'undefined') {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  
  const handleSystemPreferenceChange = (e) => {
    // Only update if user has no stored preference
    const storedPreference = getStoredPreference();
    if (storedPreference === null) {
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

