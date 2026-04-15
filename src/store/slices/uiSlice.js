/**
 * UI Slice - Manages theme, windows, and UI state
 */

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
  if (storedPreference !== null) {
    return storedPreference;
  }
  return getSystemPreference();
};

/**
 * Initial state for UI slice
 */
export const uiInitialState = {
  darkMode: getInitialDarkMode(),
  openWindows: [],
  rightPanelView: null, // null | 'controller' | 'expressions' | 'embedded-app'
  embeddedAppUrl: null, // URL to display in the right panel iframe when rightPanelView === 'embedded-app'
  embeddedAppDismissed: false, // true when user manually closed the embedded view (prevents auto-reopen)
  showFirstTimeWifiSetup: false, // true when showing first time WiFi setup view
  showBluetoothSupportView: false, // true when showing Bluetooth support/reset view
  showSetupChoice: false, // true when showing setup choice overlay (WiFi vs Bluetooth)
  // BLE state
  bleStatus: 'disconnected', // 'disconnected' | 'scanning' | 'connecting' | 'connected'
  bleDevices: [],
  bleDeviceAddress: null,
  blePin: '', // per-device PIN, loaded when device connects via bleDeviceAddress
  // 🔄 Update view state - user can skip proposed updates
  updateSkipped: false, // true when user clicks "Skip" on update view
  // 🍞 Global toast notification state
  toast: {
    open: false,
    message: '',
    severity: 'info', // 'success' | 'error' | 'warning' | 'info'
  },
};

/**
 * Create UI slice
 * @param {Function} set - Zustand set function
 * @param {Function} get - Zustand get function
 * @returns {Object} UI slice state and actions
 */
export const createUISlice = (set, get) => ({
  ...uiInitialState,

  // Window management
  addOpenWindow: windowLabel =>
    set(state => {
      if (!state.openWindows.includes(windowLabel)) {
        return { openWindows: [...state.openWindows, windowLabel] };
      }
      return state;
    }),

  removeOpenWindow: windowLabel =>
    set(state => ({
      openWindows: state.openWindows.filter(label => label !== windowLabel),
    })),

  isWindowOpen: windowLabel => {
    const state = get();
    return state.openWindows.includes(windowLabel);
  },

  // Right panel view management
  setRightPanelView: view => set({ rightPanelView: view }),

  // Embedded app management
  setEmbeddedAppUrl: url => set({ embeddedAppUrl: url }),
  openEmbeddedApp: url =>
    set({ rightPanelView: 'embedded-app', embeddedAppUrl: url, embeddedAppDismissed: false }),
  closeEmbeddedApp: () => set({ rightPanelView: null, embeddedAppUrl: null }),
  dismissEmbeddedApp: () =>
    set({ rightPanelView: null, embeddedAppUrl: null, embeddedAppDismissed: true }),
  resetEmbeddedAppDismissed: () => set({ embeddedAppDismissed: false }),

  // First time WiFi setup view management
  setShowFirstTimeWifiSetup: value => set({ showFirstTimeWifiSetup: value }),

  // Bluetooth support view management
  setShowBluetoothSupportView: value => set({ showBluetoothSupportView: value }),

  // Setup choice overlay management
  setShowSetupChoice: value => set({ showSetupChoice: value }),

  // BLE state management
  setBleStatus: value => set({ bleStatus: value }),
  setBleDevices: value => set({ bleDevices: value }),
  setBleDeviceAddress: value => set({ bleDeviceAddress: value }),
  setBlePin: value => {
    // Store PIN keyed by connected device MAC address
    const addr = get().bleDeviceAddress;
    if (addr) {
      try {
        const pins = JSON.parse(localStorage.getItem('blePins') || '{}');
        pins[addr] = value;
        localStorage.setItem('blePins', JSON.stringify(pins));
      } catch {
        // ignore
      }
    }
    set({ blePin: value });
  },
  // Load cached PIN for the given device address
  loadBlePinForDevice: addr => {
    try {
      const pins = JSON.parse(localStorage.getItem('blePins') || '{}');
      const pin = pins[addr] || '';
      set({ blePin: pin });
    } catch {
      set({ blePin: '' });
    }
  },

  // Update skip management
  skipUpdate: () => set({ updateSkipped: true }),
  resetUpdateSkipped: () => set({ updateSkipped: false }),

  // Dark mode management
  setDarkMode: value => {
    localStorage.setItem('darkMode', JSON.stringify(value));
    set({ darkMode: value });
  },

  toggleDarkMode: () =>
    set(state => {
      const newValue = !state.darkMode;
      localStorage.setItem('darkMode', JSON.stringify(newValue));
      return { darkMode: newValue };
    }),

  resetDarkMode: () => {
    localStorage.removeItem('darkMode');
    const systemPreference = getSystemPreference();
    set({ darkMode: systemPreference });
  },

  // 🍞 Global toast actions
  showToast: (message, severity = 'info') =>
    set({
      toast: { open: true, message, severity },
    }),

  hideToast: () =>
    set(state => ({
      toast: { ...state.toast, open: false },
    })),
});

/**
 * Setup system preference listener
 * Call this once when the store is created
 */
export const setupSystemPreferenceListener = (getState, setState) => {
  if (typeof window === 'undefined') return () => {};

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  const handleSystemPreferenceChange = e => {
    const storedPreference = getStoredPreference();
    if (storedPreference === null) {
      setState({ darkMode: e.matches });
    }
  };

  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener('change', handleSystemPreferenceChange);
  } else {
    mediaQuery.addListener(handleSystemPreferenceChange);
  }

  return () => {
    if (mediaQuery.removeEventListener) {
      mediaQuery.removeEventListener('change', handleSystemPreferenceChange);
    } else {
      mediaQuery.removeListener(handleSystemPreferenceChange);
    }
  };
};
