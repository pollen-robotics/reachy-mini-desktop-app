import { create } from 'zustand';

// Détecter la préférence système
const getSystemPreference = () => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

// Lire la préférence stockée
const getStoredPreference = () => {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem('darkMode');
  return stored ? JSON.parse(stored) : null;
};

// Déterminer le dark mode initial
const getInitialDarkMode = () => {
  const storedPreference = getStoredPreference();
  // Si l'utilisateur a une préférence stockée, l'utiliser
  if (storedPreference !== null) {
    console.log('🎨 Using stored dark mode preference:', storedPreference);
    return storedPreference;
  }
  // Sinon, utiliser la préférence système
  const systemPreference = getSystemPreference();
  console.log('🎨 Using system dark mode preference:', systemPreference);
  return systemPreference;
};

const useAppStore = create((set) => ({
  // Daemon state
  isActive: false,
  isStarting: false,
  isStopping: false,
  isTransitioning: false, // Transition entre scan et vue active (resize fenêtre)
  daemonVersion: null,
  startupError: null, // Erreur pendant le démarrage
  hardwareError: null, // Erreur hardware détectée pendant le scan
  isDaemonCrashed: false, // Daemon crashé/bloqué détecté
  consecutiveTimeouts: 0, // Compteur de timeouts consécutifs
  
  // Robot state
  isUsbConnected: false,
  usbPortName: null,
  isFirstCheck: true,
  
  // Logs
  logs: [],
  frontendLogs: [],
  
  // Activity Lock - Verrouillage global pour toutes les actions
  // isCommandRunning : quick actions en cours
  // isAppRunning : app en cours d'exécution
  // isInstalling : installation/désinstallation en cours
  // isBusy : helper computed (quick action OU app en cours OU installation)
  isCommandRunning: false,
  isAppRunning: false,
  isInstalling: false,
  currentAppName: null, // Nom de l'app en cours
  installingAppName: null, // Nom de l'app en cours d'installation
  installJobType: null, // Type de job : 'install' ou 'remove'
  installResult: null, // Résultat de l'installation : 'success', 'failed', null
  
  // Visual Effects (particules 3D)
  activeEffect: null, // Type d'effet actif ('sleep', 'love', etc.)
  effectTimestamp: 0, // Timestamp pour forcer le re-render
  
  // Theme (initialisé avec préférence système ou stockée)
  darkMode: getInitialDarkMode(),
  
  // Actions - Setter générique DRY
  update: (updates) => set(updates),
  
  // Helper pour vérifier si le robot est occupé (granularité fine)
  isBusy: () => {
    const state = useAppStore.getState();
    return state.isCommandRunning || state.isAppRunning || state.isInstalling;
  },
  
  // Helper global : le robot est-il prêt à recevoir des commandes ?
  // Utilisé partout dans l'UI pour verrouiller les interactions
  isReady: () => {
    const state = useAppStore.getState();
    return state.isActive && !state.isStarting && !state.isStopping && !state.isCommandRunning && !state.isAppRunning && !state.isInstalling;
  },
  
  // Gestion du verrouillage pour les apps
  lockForApp: (appName) => set({ 
    isAppRunning: true, 
    currentAppName: appName 
  }),
  unlockApp: () => set({ 
    isAppRunning: false, 
    currentAppName: null 
  }),
  
  // Gestion du verrouillage pour les installations
  lockForInstall: (appName, jobType = 'install') => set({
    isInstalling: true,
    installingAppName: appName,
    installJobType: jobType, // 'install' ou 'remove'
    installResult: null,
  }),
  unlockInstall: () => set({
    isInstalling: false,
    installingAppName: null,
    installJobType: null,
    installResult: null,
  }),
  setInstallResult: (result) => set({
    installResult: result, // 'success', 'failed' ou null
  }),
  
  // Helpers spécifiques pour les logs (logique métier)
  addFrontendLog: (message) => set((state) => ({ 
    frontendLogs: [
      ...state.frontendLogs.slice(-50), // Garder max 50 logs
      {
        timestamp: new Date().toLocaleTimeString('fr-FR', { 
          hour: '2-digit', 
          minute: '2-digit', 
          second: '2-digit' 
        }),
        message,
        source: 'frontend', // Pour distinguer visuellement
      }
    ]
  })),
  
  // Legacy setters (pour compatibilité, mais utilisent update() en interne)
  setIsActive: (value) => set({ isActive: value }),
  setIsStarting: (value) => set({ isStarting: value }),
  setIsStopping: (value) => set({ isStopping: value }),
  setIsTransitioning: (value) => set({ isTransitioning: value }),
  setDaemonVersion: (value) => set({ daemonVersion: value }),
  setStartupError: (value) => set({ startupError: value }),
  setHardwareError: (value) => set({ hardwareError: value }),
  setIsUsbConnected: (value) => set({ isUsbConnected: value }),
  setUsbPortName: (value) => set({ usbPortName: value }),
  setIsFirstCheck: (value) => set({ isFirstCheck: value }),
  setLogs: (logs) => set({ logs }),
  setIsCommandRunning: (value) => set({ isCommandRunning: value }),
  
  // Gestion des timeouts/crashes
  incrementTimeouts: () => set((state) => {
    const newCount = state.consecutiveTimeouts + 1;
    const isCrashed = newCount >= 3; // ⚡ Crash après 3 timeouts (6s au lieu de 25s)
    
    if (isCrashed && !state.isDaemonCrashed) {
      console.error(`💥 DAEMON CRASHED - ${newCount} timeouts consécutifs`);
    }
    
    return {
      consecutiveTimeouts: newCount,
      isDaemonCrashed: isCrashed,
    };
  }),
  resetTimeouts: () => set({ consecutiveTimeouts: 0, isDaemonCrashed: false }),
  markDaemonCrashed: () => set({ isDaemonCrashed: true, isActive: false }),
  
  // Déclencher un effet visuel 3D
  triggerEffect: (effectType) => set({ 
    activeEffect: effectType, 
    effectTimestamp: Date.now() 
  }),
  
  // Arrêter l'effet actif
  stopEffect: () => set({ activeEffect: null }),
  
  // Toggle dark mode (avec persistance)
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
  
  // Reset à la préférence système
  resetDarkMode: () => {
    console.log('🎨 Resetting to system preference');
    localStorage.removeItem('darkMode');
    const systemPreference = getSystemPreference();
    set({ darkMode: systemPreference });
  },
}));

// Écouter les changements de préférence système
if (typeof window !== 'undefined') {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  
  const handleSystemPreferenceChange = (e) => {
    // Ne mettre à jour que si l'utilisateur n'a pas de préférence stockée
    const storedPreference = getStoredPreference();
    if (storedPreference === null) {
      console.log('🎨 System preference changed:', e.matches);
      useAppStore.setState({ darkMode: e.matches });
    }
  };
  
  // Méthode moderne
  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener('change', handleSystemPreferenceChange);
  } else {
    // Fallback pour anciens navigateurs
    mediaQuery.addListener(handleSystemPreferenceChange);
  }
}

export default useAppStore;

