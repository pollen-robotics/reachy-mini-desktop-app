# Proposition : Gestion des Flux Asynchrones

## 🔍 Analyse du Problème Actuel

### Sources d'Événements Multiples

Le cycle de vie du daemon est géré par **4 sources d'événements asynchrones** qui peuvent modifier l'état simultanément :

1. **`invoke('start_daemon')`** → `.then()` / `.catch()`
2. **`sidecar-terminated` listener** → Crash détection
3. **`sidecar-stderr` listener** → Erreurs hardware
4. **`useRobotState` polling** → Santé du daemon + nettoyage d'erreur
5. **Timeout 30s** → Timeout de démarrage

### Problèmes Identifiés

1. **Race Conditions** : Plusieurs sources peuvent modifier `hardwareError` / `isActive` simultanément
2. **Ordre d'exécution non garanti** : Les événements arrivent dans un ordre imprévisible
3. **Logique dispersée** : La logique de gestion d'erreur est éparpillée dans plusieurs endroits
4. **Difficile à déboguer** : Pas de trace claire de qui a modifié l'état et quand

---

## 🎯 Solution Proposée : Event Bus + State Machine

### Architecture Recommandée

```
┌─────────────────────────────────────────────────────────┐
│              Daemon Lifecycle Manager                    │
│  (Single source of truth for daemon state)               │
└─────────────────────────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
        ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Event Bus    │ │ State        │ │ Error        │
│ (Events)     │ │ Machine      │ │ Handler      │
└──────────────┘ └──────────────┘ └──────────────┘
        │               │               │
        └───────────────┼───────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
        ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Listeners    │ │ Polling      │ │ Timeouts     │
│ (Tauri)      │ │ (useRobot)   │ │ (30s)        │
└──────────────┘ └──────────────┘ └──────────────┘
```

### 1. Event Bus Centralisé

**Concept** : Tous les événements passent par un bus centralisé qui les traite dans l'ordre.

```javascript
// hooks/daemon/useDaemonLifecycle.js
import { useCallback, useRef, useEffect } from 'react';
import { EventEmitter } from 'events';

class DaemonEventBus extends EventEmitter {
  constructor() {
    super();
    this.eventQueue = [];
    this.processing = false;
  }

  // Enqueue event and process sequentially
  emit(event, ...args) {
    this.eventQueue.push({ event, args, timestamp: Date.now() });
    this.processQueue();
  }

  async processQueue() {
    if (this.processing || this.eventQueue.length === 0) return;
    
    this.processing = true;
    while (this.eventQueue.length > 0) {
      const { event, args } = this.eventQueue.shift();
      await this.handleEvent(event, ...args);
    }
    this.processing = false;
  }

  async handleEvent(event, ...args) {
    // Log for debugging
    console.log(`[DaemonEventBus] ${event}`, args);
    
    // Emit to listeners
    super.emit(event, ...args);
  }
}

export const useDaemonLifecycle = () => {
  const eventBusRef = useRef(new DaemonEventBus());
  const { setHardwareError, setIsStarting, setIsActive } = useAppStore();

  // Register event handlers
  useEffect(() => {
    const bus = eventBusRef.current;

    // Handle daemon start attempt
    bus.on('daemon:start:attempt', () => {
      setHardwareError(null);
      setIsStarting(true);
    });

    // Handle daemon start success
    bus.on('daemon:start:success', () => {
      // Don't set isActive yet - wait for health check
    });

    // Handle daemon start error
    bus.on('daemon:start:error', (error) => {
      setHardwareError(createDaemonError('daemon_startup', error.message));
      setIsStarting(true); // Keep in scan view
    });

    // Handle hardware error from stderr
    bus.on('daemon:hardware:error', (errorConfig, errorLine) => {
      const errorObject = createErrorFromConfig(errorConfig, errorLine);
      setHardwareError(errorObject);
      setIsStarting(true);
    });

    // Handle daemon crash
    bus.on('daemon:crash', (status) => {
      setHardwareError({
        type: 'daemon_crash',
        message: `Daemon process terminated (status: ${status})`,
        // ...
      });
      setIsStarting(true);
    });

    // Handle daemon health check success
    bus.on('daemon:health:success', () => {
      const state = useAppStore.getState();
      if (state.isStarting && !state.hardwareError) {
        // Startup completed successfully
        setIsStarting(false);
        setIsActive(true);
      } else if (!state.isStarting && state.hardwareError) {
        // Daemon responding after error - increment recovery counter
        handleErrorRecovery();
      }
    });

    // Handle daemon health check failure
    bus.on('daemon:health:failure', (error) => {
      // Increment timeout counter, etc.
    });

    return () => {
      bus.removeAllListeners();
    };
  }, []);

  return {
    eventBus: eventBusRef.current,
  };
};
```

### 2. State Machine Explicite

**Concept** : Utiliser une state machine pour gérer les transitions d'état de manière prévisible.

```javascript
// utils/daemonStateMachine.js
import { createMachine, interpret } from 'xstate';

export const daemonStateMachine = createMachine({
  id: 'daemon',
  initial: 'idle',
  context: {
    error: null,
    consecutiveSuccess: 0,
  },
  states: {
    idle: {
      on: {
        START: 'starting',
      },
    },
    starting: {
      entry: 'clearError',
      on: {
        START_SUCCESS: 'checking_health',
        START_ERROR: { target: 'error', actions: 'setError' },
        HARDWARE_ERROR: { target: 'error', actions: 'setError' },
        CRASH: { target: 'error', actions: 'setError' },
        TIMEOUT: { target: 'error', actions: 'setError' },
      },
    },
    checking_health: {
      on: {
        HEALTH_SUCCESS: {
          target: 'active',
          actions: 'clearError',
        },
        HEALTH_FAILURE: 'error',
        HARDWARE_ERROR: { target: 'error', actions: 'setError' },
      },
    },
    active: {
      on: {
        HEALTH_FAILURE: 'checking_health',
        HARDWARE_ERROR: { target: 'error', actions: 'setError' },
        STOP: 'stopping',
      },
    },
    error: {
      on: {
        RETRY: 'starting',
        HEALTH_SUCCESS: [
          {
            target: 'active',
            cond: 'errorRecovered',
            actions: 'clearError',
          },
          {
            target: 'error',
            actions: 'incrementRecovery',
          },
        ],
      },
    },
    stopping: {
      on: {
        STOPPED: 'idle',
      },
    },
  },
}, {
  guards: {
    errorRecovered: (context) => context.consecutiveSuccess >= 3,
  },
  actions: {
    setError: (context, event) => {
      context.error = event.error;
    },
    clearError: (context) => {
      context.error = null;
      context.consecutiveSuccess = 0;
    },
    incrementRecovery: (context) => {
      context.consecutiveSuccess += 1;
    },
  },
});
```

### 3. Hook Unifié

**Concept** : Un seul hook qui orchestre tous les événements.

```javascript
// hooks/daemon/useDaemonLifecycle.js (version complète)
export const useDaemonLifecycle = () => {
  const eventBus = useDaemonEventBus();
  const stateMachine = useDaemonStateMachine();
  const { startDaemon, stopDaemon } = useDaemonCommands(eventBus);
  const { setupListeners } = useDaemonListeners(eventBus);
  const { setupPolling } = useDaemonPolling(eventBus);
  const { setupTimeouts } = useDaemonTimeouts(eventBus);

  // Setup all event sources
  useEffect(() => {
    setupListeners();
    setupPolling();
    setupTimeouts();

    // Connect event bus to state machine
    eventBus.on('*', (event, ...args) => {
      stateMachine.send(event, ...args);
    });

    return () => {
      eventBus.removeAllListeners();
    };
  }, []);

  return {
    state: stateMachine.state,
    startDaemon,
    stopDaemon,
  };
};
```

---

## 📋 Implémentation Progressive

### Phase 1 : Event Bus Simple (Sans XState)

**Avantages** :
- ✅ Plus simple à implémenter
- ✅ Pas de nouvelle dépendance
- ✅ Migration progressive possible

**Structure** :
```javascript
// hooks/daemon/useDaemonEventBus.js
export const useDaemonEventBus = () => {
  const eventBusRef = useRef(new EventEmitter());
  const eventLogRef = useRef([]); // Pour debugging

  const emit = useCallback((event, data) => {
    const timestamp = Date.now();
    eventLogRef.current.push({ event, data, timestamp });
    
    // Log pour debugging
    console.log(`[DaemonEventBus] ${event}`, data);
    
    // Emit to all listeners
    eventBusRef.current.emit(event, data);
  }, []);

  const on = useCallback((event, handler) => {
    eventBusRef.current.on(event, handler);
    return () => eventBusRef.current.off(event, handler);
  }, []);

  return { emit, on, eventLog: eventLogRef.current };
};
```

### Phase 2 : Centraliser la Logique d'Erreur

**Concept** : Une seule fonction qui gère toutes les erreurs.

```javascript
// utils/daemonErrorHandler.js
export const handleDaemonError = (type, error, context = {}) => {
  const errorConfig = findErrorConfig(error.message || error);
  
  if (errorConfig) {
    const errorObject = createErrorFromConfig(errorConfig, error.message || error);
    setHardwareError(errorObject);
    setIsStarting(true);
    addFrontendLog(`❌ ${type}: ${errorObject.message}`);
    return errorObject;
  }
  
  // Fallback pour erreurs non configurées
  const fallbackError = {
    type: 'daemon_error',
    message: error.message || String(error),
    messageParts: null,
    code: context.code || null,
    cameraPreset: 'scan',
  };
  
  setHardwareError(fallbackError);
  setIsStarting(true);
  return fallbackError;
};
```

### Phase 3 : Orchestrateur de Démarrage

**Concept** : Une fonction qui orchestre tout le processus de démarrage.

```javascript
// hooks/daemon/useDaemonStartup.js
export const useDaemonStartup = (eventBus) => {
  const startDaemon = useCallback(async () => {
    // 1. Emit start attempt
    eventBus.emit('daemon:start:attempt');
    
    try {
      // 2. Check if daemon already running
      const existing = await checkExistingDaemon();
      if (existing) {
        eventBus.emit('daemon:start:success', { existing: true });
        return;
      }

      // 3. Launch new daemon
      await invoke('start_daemon', { simMode: isSimulationMode() });
      eventBus.emit('daemon:start:success', { existing: false });
      
      // 4. Setup timeout
      const timeoutId = setTimeout(() => {
        eventBus.emit('daemon:start:timeout');
      }, 30000);
      
      // Store timeout ID for cleanup
      setStartupTimeout(timeoutId);
      
    } catch (error) {
      eventBus.emit('daemon:start:error', error);
    }
  }, [eventBus]);

  return { startDaemon };
};
```

---

## 🎯 Recommandation Finale

### Option A : Event Bus Simple (Recommandé pour court terme)

**Avantages** :
- ✅ Implémentation rapide (1-2 jours)
- ✅ Améliore la traçabilité
- ✅ Centralise la logique
- ✅ Pas de breaking changes

**Structure** :
1. Créer `useDaemonEventBus` hook
2. Migrer tous les événements vers le bus
3. Centraliser la logique d'erreur dans `handleDaemonError`
4. Ajouter logging pour debugging

### Option B : State Machine Complète (Recommandé pour long terme)

**Avantages** :
- ✅ Transitions d'état garanties
- ✅ Impossible d'avoir des états invalides
- ✅ Diagrammes automatiques
- ✅ Tests plus faciles

**Inconvénients** :
- ⚠️ Courbe d'apprentissage
- ⚠️ Nouvelle dépendance (XState)
- ⚠️ Refactoring plus important

---

## 📝 Exemple d'Utilisation (Option A)

```javascript
// hooks/daemon/useDaemon.js (refactorisé)
export const useDaemon = () => {
  const eventBus = useDaemonEventBus();
  const { startDaemon, stopDaemon } = useDaemonStartup(eventBus);
  
  // Setup listeners
  useEffect(() => {
    // Tauri listeners → Event bus
    const unlistenTerminated = listen('sidecar-terminated', (event) => {
      eventBus.emit('daemon:crash', event.payload);
    });
    
    const unlistenStderr = listen('sidecar-stderr', (event) => {
      const errorConfig = findErrorConfig(event.payload);
      if (errorConfig) {
        eventBus.emit('daemon:hardware:error', errorConfig, event.payload);
      }
    });
    
    return () => {
      unlistenTerminated();
      unlistenStderr();
    };
  }, [eventBus]);
  
  // Event handlers
  useEffect(() => {
    const handlers = {
      'daemon:start:error': (error) => {
        handleDaemonError('startup', error);
      },
      'daemon:crash': (status) => {
        handleDaemonError('crash', { message: `Status: ${status}` });
      },
      'daemon:hardware:error': (config, line) => {
        const error = createErrorFromConfig(config, line);
        setHardwareError(error);
        setIsStarting(true);
      },
      'daemon:start:timeout': () => {
        handleDaemonError('timeout', { 
          message: 'Daemon did not become active within 30 seconds' 
        });
      },
    };
    
    Object.entries(handlers).forEach(([event, handler]) => {
      eventBus.on(event, handler);
    });
    
    return () => {
      Object.keys(handlers).forEach(event => {
        eventBus.off(event, handlers[event]);
      });
    };
  }, [eventBus]);
  
  return { startDaemon, stopDaemon };
};
```

---

## 🔄 Migration Progressive

1. **Étape 1** : Créer `useDaemonEventBus` (sans casser l'existant)
2. **Étape 2** : Migrer un listener à la fois vers le bus
3. **Étape 3** : Centraliser `handleDaemonError`
4. **Étape 4** : Ajouter logging et debugging
5. **Étape 5** : (Optionnel) Migrer vers XState si besoin

---

## 📊 Comparaison

| Critère | Actuel | Event Bus | State Machine |
|---------|--------|-----------|---------------|
| **Complexité** | ⚠️ Élevée | ✅ Moyenne | ⚠️ Élevée |
| **Traçabilité** | ❌ Difficile | ✅ Facile | ✅✅ Très facile |
| **Maintenabilité** | ⚠️ Moyenne | ✅ Bonne | ✅✅ Excellente |
| **Temps implémentation** | - | 1-2 jours | 1 semaine |
| **Breaking changes** | - | ❌ Non | ⚠️ Possible |

---

## 🎯 Conclusion

**Recommandation** : Commencer par **Option A (Event Bus Simple)** car :
- ✅ Améliore immédiatement la traçabilité
- ✅ Centralise la logique sans breaking changes
- ✅ Permet migration progressive
- ✅ Facilite le debugging

Ensuite, si la complexité augmente, migrer vers **Option B (State Machine)**.

