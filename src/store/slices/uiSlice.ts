/**
 * UI Slice - Manages theme, windows, and UI state
 */
import type { StateCreator } from 'zustand';
import type { AppState, UiSlice, UiSliceState } from '../../types/store';

// Detect system preference
const getSystemPreference = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

// Read stored preference
const getStoredPreference = (): boolean | null => {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem('darkMode');
  return stored ? (JSON.parse(stored) as boolean) : null;
};

// Determine initial dark mode
const getInitialDarkMode = (): boolean => {
  const storedPreference = getStoredPreference();
  if (storedPreference !== null) {
    return storedPreference;
  }
  return getSystemPreference();
};

/**
 * Initial state for UI slice
 */
export const uiInitialState: UiSliceState = {
  darkMode: getInitialDarkMode(),
  openWindows: [],
  rightPanelView: null,
  embeddedAppUrl: null,
  embeddedAppDismissed: false,
  showFirstTimeWifiSetup: false,
  showBluetoothSupportView: false,
  showSetupChoice: false,
  bleStatus: 'disconnected',
  bleDevices: [],
  bleDeviceAddress: null,
  blePin: '',
  updateSkipped: false,
  toast: {
    open: false,
    message: '',
    severity: 'info',
  },
};

/**
 * Create UI slice
 */
export const createUISlice: StateCreator<AppState, [], [], UiSlice> = (set, get) => ({
  ...uiInitialState,

  // Window management
  addOpenWindow: (windowLabel: string) =>
    set(state => {
      if (!state.openWindows.includes(windowLabel)) {
        return { openWindows: [...state.openWindows, windowLabel] };
      }
      return state;
    }),

  removeOpenWindow: (windowLabel: string) =>
    set(state => ({
      openWindows: state.openWindows.filter(label => label !== windowLabel),
    })),

  isWindowOpen: (windowLabel: string): boolean => {
    const state = get();
    return state.openWindows.includes(windowLabel);
  },

  // Right panel view management
  setRightPanelView: view => set({ rightPanelView: view }),

  // Embedded app management
  setEmbeddedAppUrl: url => set({ embeddedAppUrl: url }),
  openEmbeddedApp: (url: string) =>
    set({ rightPanelView: 'embedded-app', embeddedAppUrl: url, embeddedAppDismissed: false }),
  closeEmbeddedApp: () => set({ rightPanelView: null, embeddedAppUrl: null }),
  dismissEmbeddedApp: () =>
    set({ rightPanelView: null, embeddedAppUrl: null, embeddedAppDismissed: true }),
  resetEmbeddedAppDismissed: () => set({ embeddedAppDismissed: false }),

  setShowFirstTimeWifiSetup: value => set({ showFirstTimeWifiSetup: value }),
  setShowBluetoothSupportView: value => set({ showBluetoothSupportView: value }),
  setShowSetupChoice: value => set({ showSetupChoice: value }),

  // BLE state management
  setBleStatus: value => set({ bleStatus: value }),
  setBleDevices: value => set({ bleDevices: value }),
  setBleDeviceAddress: value => set({ bleDeviceAddress: value }),
  setBlePin: (value: string) => {
    // Store PIN keyed by connected device MAC address
    const addr = get().bleDeviceAddress;
    if (addr) {
      try {
        const pins = JSON.parse(localStorage.getItem('blePins') || '{}') as Record<string, string>;
        pins[addr] = value;
        localStorage.setItem('blePins', JSON.stringify(pins));
      } catch {
        // ignore
      }
    }
    set({ blePin: value });
  },
  // Load cached PIN for the given device address
  loadBlePinForDevice: (addr: string) => {
    try {
      const pins = JSON.parse(localStorage.getItem('blePins') || '{}') as Record<string, string>;
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
  setDarkMode: (value: boolean) => {
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
  showToast: (message: string, severity = 'info') =>
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
export const setupSystemPreferenceListener = (
  _getState: () => AppState,
  setState: (partial: Partial<AppState>) => void
): (() => void) => {
  if (typeof window === 'undefined') return () => {};

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  const handleSystemPreferenceChange = (e: MediaQueryListEvent): void => {
    const storedPreference = getStoredPreference();
    if (storedPreference === null) {
      setState({ darkMode: e.matches });
    }
  };

  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener('change', handleSystemPreferenceChange);
  } else {
    (mediaQuery as MediaQueryList).addListener(handleSystemPreferenceChange);
  }

  return () => {
    if (mediaQuery.removeEventListener) {
      mediaQuery.removeEventListener('change', handleSystemPreferenceChange);
    } else {
      (mediaQuery as MediaQueryList).removeListener(handleSystemPreferenceChange);
    }
  };
};
