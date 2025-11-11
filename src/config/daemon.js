/**
 * Configuration centralisée pour les timeouts et la gestion du daemon
 */

export const DAEMON_CONFIG = {
  // Timeouts API (en millisecondes)
  TIMEOUTS: {
    HEALTHCHECK: 2000,      // Ping rapide pour détecter crash vite
    STATE_FULL: 5000,       // Lecture état complet avec tous les moteurs
    COMMAND: 10000,         // Commandes de mouvement (peuvent être longues)
    STARTUP_CHECK: 2000,    // Par tentative de démarrage
    VERSION: 3000,          // Info daemon (endpoint léger)
    EMOTIONS_CHECK: 3000,   // Vérification librairie émotions
    APPS_LIST: 5000,        // Liste des apps disponibles
    APP_INSTALL: 30000,     // Lancer une installation
    APP_REMOVE: 60000,      // Désinstaller une app
    APP_START: 30000,       // Démarrer une app
    APP_STOP: 30000,        // Arrêter une app
    JOB_STATUS: 120000,     // Polling job status (installations longues)
  },
  
  // Polling intervals (en millisecondes)
  INTERVALS: {
    STATUS_CHECK: 3000,       // Check daemon status toutes les 3s
    LOGS_FETCH: 1000,         // Logs toutes les 1s
    USB_CHECK: 1000,          // USB toutes les 1s
    VERSION_FETCH: 10000,     // Version toutes les 10s
    ROBOT_STATE: 300,         // État robot (position, moteurs) toutes les 300ms
    APP_STATUS: 2000,         // Status app en cours toutes les 2s
    JOB_POLLING: 500,         // Polling job install/remove toutes les 500ms
    CURRENT_APP_REFRESH: 300, // Délai avant refresh après stop app
  },
  
  // Détection de crash
  CRASH_DETECTION: {
    MAX_TIMEOUTS: 3,           // Crash après 3 timeouts (au lieu de 5)
    STARTUP_MAX_ATTEMPTS: 15,  // 15 tentatives de 1s = 15s max au démarrage
    STARTUP_RETRY_DELAY: 1000, // Attendre 1s entre chaque tentative
    JOB_MAX_FAILS: 20,         // 20 échecs de polling = job failed
    JOB_CLEANUP_DELAY: 10000,  // 10s avant de nettoyer un job failed
  },
  
  // Durées d'animation/transition
  ANIMATIONS: {
    MODEL_LOAD_TIME: 1000,       // ⚡ Temps de chargement du modèle 3D (marge)
    SCAN_DURATION: 8000,         // Durée du scan 3D des meshes (+2s de marge)
    SCAN_INTERNAL_DELAYS: 250,   // Délai retour X-ray du dernier mesh
    SCAN_COMPLETE_PAUSE: 800,    // ⚡ Pause pour VOIR la barre à 100% avant transition
    TRANSITION_DURATION: 800,    // Durée de la TransitionView (resize + spinner visible)
    VIEW_FADE_DELAY: 100,        // Délai entre hide StartingView et show TransitionView
    SLEEP_DURATION: 4000,        // Durée du goto_sleep avant kill
    STARTUP_MIN_DELAY: 2000,     // Délai avant première vérification au démarrage
  },
  
  // API endpoints
  ENDPOINTS: {
    BASE_URL: 'http://localhost:8000',
    STATE_FULL: '/api/state/full',
    DAEMON_STATUS: '/api/daemon/status',
    EMOTIONS_LIST: '/api/move/recorded-move-datasets/list/pollen-robotics/reachy-mini-emotions-library',
  },
  
  // Endpoints à NE PAS logger (polling fréquent)
  SILENT_ENDPOINTS: [
    '/api/state/full',      // Poll toutes les 3s
    '/api/daemon/status',   // Poll toutes les 10s
  ],
};

/**
 * Instance du store (lazy loaded pour éviter circular dependency)
 */
let appStoreInstance = null;
export function setAppStoreInstance(store) {
  appStoreInstance = store;
}

/**
 * Helper pour créer un fetch avec timeout ET logging automatique
 * @param {string} url - URL complète
 * @param {object} options - Options fetch (method, body, etc.)
 * @param {number} timeoutMs - Timeout en ms
 * @param {object} logOptions - Options de logging
 * @param {boolean} logOptions.silent - Ne pas logger cet appel (pour polling)
 * @param {string} logOptions.label - Label custom pour le log
 */
export async function fetchWithTimeout(url, options = {}, timeoutMs, logOptions = {}) {
  const { silent = false, label = null } = logOptions;
  
  // Extraire l'endpoint de l'URL
  const endpoint = url.replace(DAEMON_CONFIG.ENDPOINTS.BASE_URL, '');
  const baseEndpoint = endpoint.split('?')[0]; // Sans query params
  
  // Vérifier si c'est un endpoint silencieux
  const shouldBeSilent = silent || DAEMON_CONFIG.SILENT_ENDPOINTS.some(e => baseEndpoint.startsWith(e));
  
  const method = options.method || 'GET';
  const startTime = Date.now();
  
  // Log début si pas silencieux
  if (!shouldBeSilent && appStoreInstance) {
    const logLabel = label || `${method} ${baseEndpoint}`;
    appStoreInstance.getState().addFrontendLog(`→ ${logLabel}`);
  }
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(timeoutMs),
    });
    
    const duration = Date.now() - startTime;
    
    // Log résultat si pas silencieux
    if (!shouldBeSilent && appStoreInstance) {
      const logLabel = label || `${method} ${baseEndpoint}`;
      if (response.ok) {
        appStoreInstance.getState().addFrontendLog(`✓ ${logLabel} (${duration}ms)`);
      } else {
        appStoreInstance.getState().addFrontendLog(`✗ ${logLabel} (${response.status})`);
      }
    }
    
    return response;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    // Log erreur si pas silencieux
    if (!shouldBeSilent && appStoreInstance) {
      const logLabel = label || `${method} ${baseEndpoint}`;
      const errorMsg = error.name === 'TimeoutError' ? 'timeout' : error.message;
      appStoreInstance.getState().addFrontendLog(`✗ ${logLabel} (${errorMsg})`);
    }
    
    throw error;
  }
}

/**
 * Helper pour construire l'URL complète de l'API
 */
export function buildApiUrl(endpoint) {
  return `${DAEMON_CONFIG.ENDPOINTS.BASE_URL}${endpoint}`;
}

/**
 * ⚡ Helper DRY pour gérer la transition StartingView → TransitionView → ActiveRobotView
 * Évite la duplication du code de transition (utilisé 2× dans useDaemon)
 * 
 * @param {object} callbacks - Fonctions de setState
 * @param {Function} callbacks.setIsStarting - Fonction pour changer isStarting
 * @param {Function} callbacks.setIsTransitioning - Fonction pour changer isTransitioning
 * @param {Function} callbacks.setIsActive - Fonction pour changer isActive
 * @param {number} remainingTime - Temps à attendre avant de démarrer la transition
 */
export function transitionToActiveView({ setIsStarting, setIsTransitioning, setIsActive }, remainingTime) {
  setTimeout(() => {
    console.log('⏱️ Scan animation complete, hiding StartingView');
    // ⚡ Étape 1 : Cacher StartingView
    setIsStarting(false);
    
    // ⚡ Étape 2 : Après un micro-délai, afficher TransitionView et trigger resize
    setTimeout(() => {
      console.log('⏱️ Showing TransitionView and triggering resize');
      setIsTransitioning(true);
      
      // ⚡ Étape 3 : Après le resize, passer en ActiveRobotView
      setTimeout(() => {
        console.log('⏱️ TransitionView complete, showing ActiveRobotView');
        setIsActive(true);
        setIsTransitioning(false);
      }, DAEMON_CONFIG.ANIMATIONS.TRANSITION_DURATION);
    }, DAEMON_CONFIG.ANIMATIONS.VIEW_FADE_DELAY);
  }, remainingTime);
}

