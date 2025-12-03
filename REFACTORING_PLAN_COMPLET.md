# 🏗️ Plan de Refactoring Complet : Centralisation des Appels API

## 🎯 Objectif Global

Centraliser **tous** les appels API dans la fenêtre principale. Les fenêtres secondaires deviennent de simples interfaces UI qui communiquent via événements Tauri.

**Avantages :**
- ✅ Tous les logs centralisés automatiquement
- ✅ Architecture claire et prévisible
- ✅ Facile à déboguer et maintenir
- ✅ Évolutif (facile d'ajouter de nouvelles fenêtres)
- ✅ Séparation claire : UI vs API

---

## 📊 Architecture Cible

```
┌─────────────────────────────────────────────────────────────┐
│                    FENÊTRE PRINCIPALE                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  App.jsx                                              │  │
│  │  └─ useCommandListener()                              │  │
│  │     └─ Écoute événements Tauri                        │  │
│  │        └─ Exécute commandes via hooks                │  │
│  │           └─ fetchWithTimeout() → Logs automatiques  │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                          ▲
                          │ Événements Tauri
                          │
┌─────────────────────────┴─────────────────────────────────┐
│              FENÊTRES SECONDAIRES                          │
│  ┌──────────────────┐  ┌──────────────────┐              │
│  │ ExpressionsWindow│  │ ControllerWindow │              │
│  │                  │  │                  │              │
│  │ emit('robot-    │  │ emit('robot-     │              │
│  │  command', ...)  │  │  command', ...)  │              │
│  └──────────────────┘  └──────────────────┘              │
└────────────────────────────────────────────────────────────┘
```

---

## 📁 Fichiers à Modifier / Créer

### 🆕 FICHIERS À CRÉER (3 fichiers)

#### 1. `src/utils/windowDetection.js` (NOUVEAU)
**Objectif :** Utilitaire pour détecter la fenêtre actuelle

```javascript
import { getCurrentWindow } from '@tauri-apps/api/window';

let isMainWindowCache = null;
let windowDetectionPromise = null;

/**
 * Détecte si on est dans la fenêtre principale
 * @returns {Promise<boolean>}
 */
export async function isMainWindow() {
  if (isMainWindowCache !== null) {
    return isMainWindowCache;
  }
  
  if (!windowDetectionPromise) {
    windowDetectionPromise = (async () => {
      try {
        const currentWindow = await getCurrentWindow();
        isMainWindowCache = currentWindow.label === 'main';
        return isMainWindowCache;
      } catch (error) {
        // Fallback: assume main window if detection fails
        console.warn('Window detection failed, assuming main window:', error);
        return true;
      }
    })();
  }
  
  return windowDetectionPromise;
}

/**
 * Reset cache (useful for testing)
 */
export function resetWindowDetectionCache() {
  isMainWindowCache = null;
  windowDetectionPromise = null;
}
```

#### 2. `src/utils/commandProxy.js` (NOUVEAU)
**Objectif :** Proxy intelligent qui route les commandes (événement ou appel direct)

```javascript
import { isMainWindow } from './windowDetection';
import { buildApiUrl, fetchWithTimeout, DAEMON_CONFIG } from '../config/daemon';

/**
 * Types de commandes supportées
 */
export const COMMAND_TYPES = {
  // Commandes simples (expressions, dances, actions)
  SIMPLE: 'simple',
  // Commandes continues (Controller - 30fps)
  CONTINUOUS: 'continuous',
  // Commandes audio
  AUDIO: 'audio',
  // Commandes apps
  APP: 'app',
};

/**
 * Proxy pour les commandes simples (expressions, dances, actions)
 * Détecte automatiquement la fenêtre et route vers événement ou appel direct
 */
export async function sendCommandProxy(endpoint, label, options = {}) {
  const isMain = await isMainWindow();
  
  if (isMain) {
    // Fenêtre principale : appel direct
    return fetchWithTimeout(
      buildApiUrl(endpoint),
      { method: 'POST', ...options },
      options.timeout || DAEMON_CONFIG.TIMEOUTS.COMMAND,
      { label, silent: options.silent }
    );
  } else {
    // Fenêtre secondaire : émettre événement
    const { emit } = await import('@tauri-apps/api/event');
    await emit('robot-command', {
      type: COMMAND_TYPES.SIMPLE,
      endpoint,
      label,
      options,
    });
    // Retourner une promesse résolue (fire and forget)
    return Promise.resolve();
  }
}

/**
 * Proxy pour les commandes continues (Controller)
 * Utilise un système de batching pour réduire le nombre d'événements
 */
export function createContinuousCommandProxy() {
  let batchQueue = [];
  let batchTimeout = null;
  const BATCH_DELAY_MS = 33; // ~30fps
  
  const flushBatch = async () => {
    if (batchQueue.length === 0) return;
    
    const isMain = await isMainWindow();
    const commands = [...batchQueue];
    batchQueue = [];
    
    if (isMain) {
      // Fenêtre principale : envoyer toutes les commandes directement
      commands.forEach(({ endpoint, body, options }) => {
        fetchWithTimeout(
          buildApiUrl(endpoint),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            ...options,
          },
          options.timeout || DAEMON_CONFIG.MOVEMENT.CONTINUOUS_MOVE_TIMEOUT,
          { label: 'Continuous move', silent: true }
        ).catch(error => {
          console.error('❌ Continuous command error:', error);
        });
      });
    } else {
      // Fenêtre secondaire : émettre événement avec batch
      const { emit } = await import('@tauri-apps/api/event');
      await emit('robot-command-batch', {
        type: COMMAND_TYPES.CONTINUOUS,
        commands: commands.map(cmd => ({
          endpoint: cmd.endpoint,
          body: cmd.body,
        })),
      });
    }
  };
  
  return {
    addCommand: (endpoint, body, options = {}) => {
      batchQueue.push({ endpoint, body, options });
      
      if (!batchTimeout) {
        batchTimeout = setTimeout(() => {
          flushBatch();
          batchTimeout = null;
        }, BATCH_DELAY_MS);
      }
    },
    flush: () => {
      if (batchTimeout) {
        clearTimeout(batchTimeout);
        batchTimeout = null;
      }
      flushBatch();
    },
  };
}
```

#### 3. `src/hooks/window/useCommandListener.js` (NOUVEAU)
**Objectif :** Hook pour écouter les événements de commandes dans la fenêtre principale

```javascript
import { useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useRobotCommands } from '@hooks/robot';
import { buildApiUrl, fetchWithTimeout, DAEMON_CONFIG } from '@config/daemon';
import { COMMAND_TYPES } from '@utils/commandProxy';

/**
 * Hook pour écouter les événements de commandes depuis les fenêtres secondaires
 * UNIQUEMENT dans la fenêtre principale
 */
export function useCommandListener() {
  const { sendCommand, playRecordedMove } = useRobotCommands();
  
  useEffect(() => {
    let unlistenFunctions = [];
    let isMounted = true;
    
    const setupListeners = async () => {
      try {
        const currentWindow = await getCurrentWindow();
        
        // Seulement dans la fenêtre principale
        if (currentWindow.label !== 'main') {
          return;
        }
        
        const { listen } = await import('@tauri-apps/api/event');
        
        // Écouter les commandes simples (expressions, dances, actions)
        const unlistenSimple = await listen('robot-command', async (event) => {
          if (!isMounted) return;
          
          const { type, endpoint, label, options } = event.payload;
          
          if (type === COMMAND_TYPES.SIMPLE) {
            try {
              await fetchWithTimeout(
                buildApiUrl(endpoint),
                { method: 'POST', ...options },
                options.timeout || DAEMON_CONFIG.TIMEOUTS.COMMAND,
                { label, silent: options.silent }
              );
            } catch (error) {
              console.error(`❌ Command ${label} failed:`, error);
            }
          }
        });
        unlistenFunctions.push(unlistenSimple);
        
        // Écouter les commandes continues (Controller - batch)
        const unlistenBatch = await listen('robot-command-batch', async (event) => {
          if (!isMounted) return;
          
          const { commands } = event.payload;
          
          // Envoyer toutes les commandes du batch
          commands.forEach(({ endpoint, body }) => {
            fetchWithTimeout(
              buildApiUrl(endpoint),
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
              },
              DAEMON_CONFIG.MOVEMENT.CONTINUOUS_MOVE_TIMEOUT,
              { label: 'Continuous move', silent: true }
            ).catch(error => {
              console.error('❌ Continuous command batch error:', error);
            });
          });
        });
        unlistenFunctions.push(unlistenBatch);
        
      } catch (error) {
        console.error('❌ Failed to setup command listeners:', error);
      }
    };
    
    setupListeners();
    
    return () => {
      isMounted = false;
      unlistenFunctions.forEach(unlisten => {
        if (typeof unlisten === 'function') {
          unlisten();
        }
      });
    };
  }, [sendCommand, playRecordedMove]);
}
```

---

### ✏️ FICHIERS À MODIFIER (8 fichiers)

#### 1. `src/components/App.jsx`
**Changements :**
- ✅ Ajouter `useCommandListener()` dans la fenêtre principale uniquement

```javascript
// Dans App.jsx, après les autres hooks
import { useCommandListener } from '@hooks/window';

function App() {
  // ... existing code ...
  
  // Écouter les commandes depuis les fenêtres secondaires (uniquement dans main)
  useCommandListener();
  
  // ... rest of component ...
}
```

---

#### 2. `src/views/windows/ExpressionsWindow.jsx`
**Changements :**
- ❌ Supprimer : `import { useRobotCommands } from '@hooks/robot'`
- ❌ Supprimer : `const { sendCommand, playRecordedMove } = useRobotCommands()`
- ✅ Ajouter : `import { sendCommandProxy } from '@utils/commandProxy'`
- ✅ Modifier : `handleQuickAction` pour utiliser le proxy

```javascript
// AVANT
const { sendCommand, playRecordedMove } = useRobotCommands();

const handleQuickAction = useCallback((action) => {
  if (action.type === 'action') {
    sendCommand(`/api/move/play/${action.name}`, action.label);
  } else if (action.type === 'dance') {
    playRecordedMove(CHOREOGRAPHY_DATASETS.DANCES, action.name);
  } else {
    playRecordedMove(CHOREOGRAPHY_DATASETS.EMOTIONS, action.name);
  }
  // ... effects ...
}, [sendCommand, playRecordedMove]);

// APRÈS
import { sendCommandProxy } from '@utils/commandProxy';

const handleQuickAction = useCallback(async (action) => {
  if (action.type === 'action') {
    await sendCommandProxy(`/api/move/play/${action.name}`, action.label);
  } else if (action.type === 'dance') {
    await sendCommandProxy(
      `/api/move/play/recorded-move-dataset/${CHOREOGRAPHY_DATASETS.DANCES}/${action.name}`,
      action.name,
      { timeout: DAEMON_CONFIG.MOVEMENT.RECORDED_MOVE_LOCK_DURATION }
    );
  } else {
    await sendCommandProxy(
      `/api/move/play/recorded-move-dataset/${CHOREOGRAPHY_DATASETS.EMOTIONS}/${action.name}`,
      action.name,
      { timeout: DAEMON_CONFIG.MOVEMENT.RECORDED_MOVE_LOCK_DURATION }
    );
  }
  // ... effects (unchanged) ...
}, []);
```

---

#### 3. `src/hooks/robot/useRobotCommands.js`
**Changements :**
- ✅ Modifier `sendCommand` pour utiliser `sendCommandProxy` au lieu de `fetchWithTimeout` direct
- ✅ Garder toute la logique de verrouillage (isBusy, setIsCommandRunning, etc.)

```javascript
// AVANT
import { DAEMON_CONFIG, fetchWithTimeout, buildApiUrl } from '../../config/daemon';

const sendCommand = useCallback(async (endpoint, label, lockDuration = ...) => {
  // ... validation ...
  
  fetchWithTimeout(
    buildApiUrl(endpoint),
    { method: 'POST' },
    DAEMON_CONFIG.TIMEOUTS.COMMAND,
    { label }
  )
  // ...
}, [isActive, isCommandRunning]);

// APRÈS
import { sendCommandProxy } from '@utils/commandProxy';

const sendCommand = useCallback(async (endpoint, label, lockDuration = ...) => {
  // ... validation (unchanged) ...
  
  // Utiliser le proxy qui route automatiquement
  await sendCommandProxy(endpoint, label, {
    timeout: DAEMON_CONFIG.TIMEOUTS.COMMAND,
  });
  
  // ... unlock logic (unchanged) ...
}, [isActive, isCommandRunning]);
```

---

#### 4. `src/views/active-robot/controller/hooks/useRobotAPI.js`
**Changements :**
- ✅ Créer une instance de `createContinuousCommandProxy()` au début du hook
- ✅ Modifier `sendCommand` pour utiliser le proxy continu
- ✅ Modifier `sendSingleCommand` pour utiliser `sendCommandProxy`
- ✅ Appeler `flush()` quand le drag se termine

```javascript
// AVANT
import { buildApiUrl, fetchWithTimeout, DAEMON_CONFIG } from '../../../../config/daemon';

export function useRobotAPI(isActive, robotState, isDraggingRef) {
  const sendCommand = useCallback((headPose, antennas, bodyYaw) => {
    // ... validation ...
    fetchWithTimeout(
      buildApiUrl('/api/move/set_target'),
      { method: 'POST', headers: {...}, body: JSON.stringify(requestBody) },
      DAEMON_CONFIG.MOVEMENT.CONTINUOUS_MOVE_TIMEOUT,
      { label: 'Set target (smoothed)', silent: true }
    );
  }, [isActive, robotState.bodyYaw]);

// APRÈS
import { createContinuousCommandProxy, sendCommandProxy } from '@utils/commandProxy';
import { DAEMON_CONFIG } from '../../../../config/daemon';

export function useRobotAPI(isActive, robotState, isDraggingRef) {
  // Créer le proxy continu une seule fois
  const continuousProxyRef = useRef(null);
  if (!continuousProxyRef.current) {
    continuousProxyRef.current = createContinuousCommandProxy();
  }
  
  const sendCommand = useCallback((headPose, antennas, bodyYaw) => {
    if (!isActive) return;
    const validBodyYaw = typeof bodyYaw === 'number' ? bodyYaw : (robotState.bodyYaw || 0);
    
    const requestBody = {
      target_head_pose: headPose,
      target_antennas: antennas,
      target_body_yaw: validBodyYaw,
    };
    
    // Utiliser le proxy continu (batching automatique)
    continuousProxyRef.current.addCommand(
      '/api/move/set_target',
      requestBody,
      { timeout: DAEMON_CONFIG.MOVEMENT.CONTINUOUS_MOVE_TIMEOUT }
    );
  }, [isActive, robotState.bodyYaw]);
  
  const sendSingleCommand = useCallback(async (headPose, antennas, bodyYaw) => {
    if (!isActive) return;
    // ... validation ...
    
    // Pour les commandes uniques, utiliser le proxy simple
    await sendCommandProxy(
      '/api/move/set_target',
      'Set target',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        timeout: DAEMON_CONFIG.MOVEMENT.CONTINUOUS_MOVE_TIMEOUT,
        silent: true,
      }
    );
  }, [isActive, robotState]);
  
  // Flush le batch quand le drag se termine
  const stopContinuousUpdates = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    pendingPoseRef.current = null;
    
    // Flush les commandes en attente
    if (continuousProxyRef.current) {
      continuousProxyRef.current.flush();
    }
  }, []);
  
  // ... rest unchanged ...
}
```

---

#### 5. `src/views/active-robot/controller/hooks/useRobotPosition.js`
**Changements :**
- ✅ Aucun changement nécessaire (utilise déjà `useRobotAPI` qui sera modifié)

---

#### 6. `src/views/active-robot/controller/Controller.jsx`
**Changements :**
- ✅ Aucun changement nécessaire (utilise déjà `useRobotPosition` qui utilise `useRobotAPI`)

---

#### 7. `src/config/daemon.js`
**Changements :**
- ✅ Supprimer `appStoreInstance` et `setAppStoreInstance` (plus nécessaire)
- ✅ Modifier `fetchWithTimeout` pour toujours utiliser le store de la fenêtre principale

```javascript
// AVANT
let appStoreInstance = null;
export function setAppStoreInstance(store) {
  appStoreInstance = store;
}

export async function fetchWithTimeout(url, options = {}, timeoutMs, logOptions = {}) {
  // ...
  if (!shouldBeSilent && appStoreInstance) {
    const store = appStoreInstance.getState();
    const addLog = store?.addFrontendLog;
    // ...
  }
}

// APRÈS
// Supprimer appStoreInstance complètement

export async function fetchWithTimeout(url, options = {}, timeoutMs, logOptions = {}) {
  // ...
  if (!shouldBeSilent) {
    // Toujours utiliser le store de la fenêtre principale
    // Si on est dans une fenêtre secondaire, les logs sont déjà gérés par le proxy
    const { isMainWindow } = await import('@utils/windowDetection');
    const isMain = await isMainWindow();
    
    if (isMain) {
      // Seulement dans la fenêtre principale, ajouter le log
      const useAppStore = (await import('@store/useAppStore')).default;
      const store = useAppStore.getState();
      const addLog = store?.addFrontendLog;
      if (typeof addLog === 'function') {
        // ... add log ...
      }
    }
    // Si fenêtre secondaire, le log sera ajouté dans la fenêtre principale via le proxy
  }
}
```

---

#### 8. `src/components/App.jsx` (supplémentaire)
**Changements :**
- ❌ Supprimer : `setAppStoreInstance(useAppStore)` (plus nécessaire)

```javascript
// AVANT
useEffect(() => {
  setAppStoreInstance(useAppStore);
}, []);

// APRÈS
// Supprimer complètement
```

---

#### 9. `src/views/windows/ExpressionsWindow.jsx` (supplémentaire)
**Changements :**
- ❌ Supprimer : `setAppStoreInstance(useAppStore)` (plus nécessaire)

```javascript
// AVANT
import { setAppStoreInstance } from '@config/daemon';

useEffect(() => {
  setAppStoreInstance(useAppStore);
}, []);

// APRÈS
// Supprimer complètement
```

---

## 🔄 Ordre d'Implémentation (Phases)

### Phase 1 : Infrastructure de Base
1. ✅ Créer `src/utils/windowDetection.js`
2. ✅ Créer `src/utils/commandProxy.js` (version simple pour commandes simples)
3. ✅ Créer `src/hooks/window/useCommandListener.js`
4. ✅ Modifier `src/components/App.jsx` pour ajouter le listener

**Tests :** Vérifier que la détection de fenêtre fonctionne

---

### Phase 2 : ExpressionsWindow (Simple)
1. ✅ Modifier `src/views/windows/ExpressionsWindow.jsx`
2. ✅ Modifier `src/hooks/robot/useRobotCommands.js` pour utiliser le proxy

**Tests :** 
- Déclencher une action depuis ExpressionsWindow
- Vérifier que le log apparaît dans la fenêtre principale
- Vérifier que l'action est bien exécutée

---

### Phase 3 : Commandes Continues (Complexe)
1. ✅ Compléter `src/utils/commandProxy.js` avec `createContinuousCommandProxy`
2. ✅ Modifier `src/hooks/window/useCommandListener.js` pour gérer les batches
3. ✅ Modifier `src/views/active-robot/controller/hooks/useRobotAPI.js`

**Tests :**
- Utiliser le Controller dans la fenêtre principale (doit fonctionner comme avant)
- Utiliser le Controller dans ControllerWindow (doit émettre des événements)
- Vérifier que les commandes sont bien exécutées
- Vérifier la latence (ne doit pas être trop élevée)

---

### Phase 4 : Nettoyage
1. ✅ Supprimer `appStoreInstance` de `src/config/daemon.js`
2. ✅ Supprimer `setAppStoreInstance` de `src/components/App.jsx`
3. ✅ Supprimer `setAppStoreInstance` de `src/views/windows/ExpressionsWindow.jsx`
4. ✅ Modifier `fetchWithTimeout` pour ne plus utiliser `appStoreInstance`

**Tests :** Vérifier que tout fonctionne encore

---

### Phase 5 : Validation Finale
1. ✅ Tester toutes les fonctionnalités
2. ✅ Vérifier les logs dans tous les scénarios
3. ✅ Vérifier les performances (surtout pour les commandes continues)
4. ✅ Documenter les changements

---

## ⚠️ Points d'Attention

### 1. **Commandes Continues (30fps)**
- **Problème :** Envoyer 30 événements/seconde serait trop lourd
- **Solution :** Système de batching (grouper plusieurs commandes dans un seul événement)
- **Implémentation :** `createContinuousCommandProxy` avec queue et flush périodique

### 2. **Latence**
- **Problème :** Les événements Tauri ajoutent une petite latence
- **Impact :** Pour les commandes continues, cela peut être problématique
- **Solution :** 
  - Batching pour réduire le nombre d'événements
  - Garder les commandes continues en direct dans la fenêtre principale (pas d'événement)

### 3. **Gestion des Erreurs**
- **Problème :** Les erreurs doivent être propagées depuis la fenêtre principale
- **Solution :** 
  - Les erreurs sont loggées dans la fenêtre principale (via `fetchWithTimeout`)
  - Les fenêtres secondaires peuvent écouter un événement `command-error` si nécessaire

### 4. **État de Verrouillage (isCommandRunning)**
- **Problème :** Le verrouillage doit être géré dans la fenêtre principale
- **Solution :** 
  - Le verrouillage est déjà géré dans `useRobotCommands`
  - Quand une fenêtre secondaire émet un événement, la fenêtre principale vérifie le verrouillage avant d'exécuter

### 5. **Synchronisation de l'État**
- **Problème :** `isCommandRunning` doit être synchronisé entre fenêtres
- **Solution :** 
  - Déjà en place via `windowSyncMiddleware`
  - `isCommandRunning` est dans `relevantKeys`

---

## 📝 Checklist de Validation

### ExpressionsWindow
- [ ] Les actions sont bien déclenchées
- [ ] Les logs apparaissent dans la fenêtre principale
- [ ] Les effets 3D sont déclenchés (si disponibles)
- [ ] Le verrouillage fonctionne (pas de double exécution)

### ControllerWindow
- [ ] Les commandes continues sont bien exécutées
- [ ] La latence est acceptable (< 50ms)
- [ ] Les logs apparaissent dans la fenêtre principale
- [ ] Le smoothing fonctionne correctement

### Fenêtre Principale
- [ ] Les commandes depuis la fenêtre principale fonctionnent comme avant
- [ ] Les logs sont bien créés
- [ ] Le listener fonctionne correctement

### Synchronisation
- [ ] `isCommandRunning` est bien synchronisé
- [ ] `robotStatus` est bien synchronisé
- [ ] Les logs sont bien synchronisés

---

## 🎯 Résultat Final

Après ce refactoring :
- ✅ Tous les appels API sont centralisés dans la fenêtre principale
- ✅ Tous les logs sont automatiquement dans la fenêtre principale
- ✅ Architecture claire et maintenable
- ✅ Facile d'ajouter de nouvelles fenêtres secondaires
- ✅ Pas de problème de synchronisation des logs

---

## 📚 Fichiers Résumés

### Créer (3)
1. `src/utils/windowDetection.js`
2. `src/utils/commandProxy.js`
3. `src/hooks/window/useCommandListener.js`

### Modifier (8)
1. `src/components/App.jsx`
2. `src/views/windows/ExpressionsWindow.jsx`
3. `src/hooks/robot/useRobotCommands.js`
4. `src/views/active-robot/controller/hooks/useRobotAPI.js`
5. `src/config/daemon.js`
6. `src/views/active-robot/controller/hooks/useRobotPosition.js` (aucun changement, mais vérifier)
7. `src/views/active-robot/controller/Controller.jsx` (aucun changement, mais vérifier)
8. `src-tauri/capabilities/secondary-windows.json` (vérifier permissions)

### Supprimer
- `appStoreInstance` de `src/config/daemon.js`
- `setAppStoreInstance` de `src/components/App.jsx`
- `setAppStoreInstance` de `src/views/windows/ExpressionsWindow.jsx`

---

## 🚀 Prêt à Implémenter

Ce plan est complet et détaillé. Chaque étape peut être implémentée et testée indépendamment.

