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
  rightPanelView: null, // null | 'controller' | 'expressions'
  showFirstTimeWifiSetup: false, // true when showing first time WiFi setup view
  showBluetoothSupportView: false, // true when showing Bluetooth support/reset view
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
    const state = get();
    return state.openWindows.includes(windowLabel);
  },
  
  // Right panel view management
  setRightPanelView: (view) => set({ rightPanelView: view }),
  
  // First time WiFi setup view management
  setShowFirstTimeWifiSetup: (value) => set({ showFirstTimeWifiSetup: value }),
  
  // Bluetooth support view management
  setShowBluetoothSupportView: (value) => set({ showBluetoothSupportView: value }),
  
  // Dark mode management
  setDarkMode: (value) => {
    localStorage.setItem('darkMode', JSON.stringify(value));
    set({ darkMode: value });
  },
  
  toggleDarkMode: () => set((state) => {
    const newValue = !state.darkMode;
    localStorage.setItem('darkMode', JSON.stringify(newValue));
    return { darkMode: newValue };
  }),
  
  resetDarkMode: () => {
    localStorage.removeItem('darkMode');
    const systemPreference = getSystemPreference();
    set({ darkMode: systemPreference });
  },
});

/**
 * Setup system preference listener
 * Call this once when the store is created
 */
export const setupSystemPreferenceListener = (getState, setState) => {
  if (typeof window === 'undefined') return;
  
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  
  const handleSystemPreferenceChange = (e) => {
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
};

