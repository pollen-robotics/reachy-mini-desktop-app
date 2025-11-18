# 📚 Rapport sur les Bibliothèques et Bonnes Pratiques de Logging
## Application React + Zustand + React Three Fiber + Tauri

**Date:** 2024  
**Contexte:** Recherche approfondie sur les solutions de logging modernes pour notre stack technologique

---

## 🎯 Stack Technologique

- **Frontend:** React 18+
- **State Management:** Zustand
- **3D Rendering:** React Three Fiber (R3F)
- **Desktop Framework:** Tauri (Rust + Web)
- **Backend:** Python Daemon

---

## 📦 Bibliothèques de Logging Recommandées

### 1. **Loglevel** ⭐ RECOMMANDÉ POUR NOTRE CAS

**Caractéristiques:**
- ✅ **Ultra-léger:** ~1.4KB minifié
- ✅ **Compatible navigateur:** Conçu pour le frontend
- ✅ **Niveaux de log:** DEBUG, INFO, WARN, ERROR
- ✅ **API simple:** `log.debug()`, `log.info()`, etc.
- ✅ **Activation/désactivation dynamique:** Par niveau
- ✅ **Pas de dépendances:** Zero dependencies
- ✅ **TypeScript:** Support natif

**Installation:**
```bash
npm install loglevel
# ou
yarn add loglevel
```

**Exemple d'utilisation:**
```javascript
import log from 'loglevel';

// Configuration selon l'environnement
if (import.meta.env.PROD) {
  log.setLevel('warn'); // Production: seulement warnings et erreurs
} else {
  log.setLevel('debug'); // Dev: tout
}

// Utilisation
log.debug('Debug message');
log.info('Info message');
log.warn('Warning message');
log.error('Error message');
```

**Avantages pour notre projet:**
- Parfait pour Tauri (pas de Node.js requis)
- Légèreté importante pour une app desktop
- Facile à intégrer avec Zustand
- Compatible avec React Three Fiber

**Limitations:**
- Pas de format structuré JSON par défaut (mais facile à ajouter)
- Pas de transports multiples (console uniquement)

---

### 2. **Winston**

**Caractéristiques:**
- ✅ **Puissant:** Transports multiples (console, fichier, HTTP, etc.)
- ✅ **Format personnalisable:** JSON, texte, etc.
- ✅ **Niveaux de log:** Personnalisables
- ⚠️ **Taille:** ~50KB+ (plus lourd)
- ⚠️ **Node.js:** Principalement conçu pour Node.js
- ⚠️ **Complexité:** Configuration plus complexe

**Verdict:** Trop lourd et complexe pour notre cas d'usage frontend.

---

### 3. **Pino**

**Caractéristiques:**
- ✅ **Performance:** Très rapide
- ✅ **Format JSON:** Structuré par défaut
- ✅ **Léger:** ~10KB
- ⚠️ **Node.js:** Principalement pour Node.js
- ⚠️ **Browser:** Support limité côté navigateur

**Verdict:** Meilleur pour le backend Python/Node.js que pour le frontend React.

---

### 4. **React-Logger**

**Caractéristiques:**
- ✅ **Spécifique React:** Conçu pour React
- ✅ **Hooks:** Intégration avec les hooks React
- ⚠️ **Maintenance:** Moins maintenu que Loglevel
- ⚠️ **Spécificité:** Trop spécifique, moins flexible

**Verdict:** Intéressant mais Loglevel est plus universel.

---

## 🏆 Recommandation Finale: **Loglevel + Wrapper Personnalisé**

**Pourquoi Loglevel:**
1. **Léger:** Parfait pour une app desktop Tauri
2. **Simple:** API intuitive, facile à adopter
3. **Flexible:** Peut être étendu avec un wrapper personnalisé
4. **Compatible:** Fonctionne parfaitement avec React/Zustand/R3F
5. **Mature:** Bibliothèque stable et maintenue

**Architecture proposée:**
```
loglevel (base)
  ↓
Logger wrapper personnalisé (niveaux + format structuré)
  ↓
Intégration Zustand (logs dans le store)
  ↓
LogConsole (affichage UI)
```

---

## 🎨 Bonnes Pratiques Spécifiques par Technologie

### React

#### 1. **Error Boundaries avec Logging**

```javascript
import { Component } from 'react';
import { logger } from '../utils/logger';

class ErrorBoundary extends Component {
  componentDidCatch(error, errorInfo) {
    logger.error('React Error Boundary caught error', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      component: this.props.componentName || 'Unknown',
    });
  }
  
  render() {
    // ...
  }
}
```

#### 2. **Logging dans les Hooks**

```javascript
import { useEffect } from 'react';
import { logger } from '../utils/logger';

function useComponentMount(componentName) {
  useEffect(() => {
    logger.debug(`Component ${componentName} mounted`);
    return () => {
      logger.debug(`Component ${componentName} unmounted`);
    };
  }, [componentName]);
}
```

#### 3. **Lazy Evaluation pour les Logs de Debug**

```javascript
// ❌ MAUVAIS: Évalue toujours, même si DEBUG désactivé
logger.debug(`Expensive calculation: ${expensiveFunction()}`);

// ✅ BON: Évalue seulement si DEBUG activé
logger.debug(() => `Expensive calculation: ${expensiveFunction()}`);
```

---

### Zustand

#### 1. **Middleware de Logging**

```javascript
import { create } from 'zustand';
import { logger } from '../utils/logger';

const logMiddleware = (config) => (set, get, api) =>
  config(
    (...args) => {
      const prevState = get();
      set(...args);
      const nextState = get();
      
      logger.debug('Zustand state changed', {
        prevState,
        nextState,
        action: args[0]?.type || 'unknown',
      });
      
      return nextState;
    },
    get,
    api
  );

const useStore = create(
  logMiddleware((set) => ({
    count: 0,
    increment: () => set((state) => ({ count: state.count + 1 })),
  }))
);
```

#### 2. **Logging des Actions Critiques**

```javascript
// Dans useAppStore.js
transitionTo: {
  ready: () => {
    logger.info('Robot state transition: ready');
    set({ robotStatus: 'ready', /* ... */ });
  },
  busy: (reason) => {
    logger.warn('Robot state transition: busy', { reason });
    set({ robotStatus: 'busy', busyReason: reason, /* ... */ });
  },
}
```

#### 3. **Intégration avec le Système de Logs Frontend**

```javascript
// Wrapper pour logger dans Zustand
const addFrontendLog = (message, level = 'info') => {
  // Log dans la console
  logger[level](message);
  
  // Ajouter au store Zustand pour l'UI
  useAppStore.getState().addFrontendLog({
    message,
    level,
    timestamp: new Date().toISOString(),
  });
};
```

---

### React Three Fiber (R3F)

#### 1. **Logging des Erreurs de Rendu 3D**

```javascript
import { ErrorBoundary } from '@react-three/drei';
import { logger } from '../utils/logger';

<ErrorBoundary
  fallback={<ErrorFallback />}
  onError={(error, errorInfo) => {
    logger.error('R3F render error', {
      error: error.message,
      stack: error.stack,
      component: errorInfo.componentStack,
      scene: 'robot-viewer',
    });
  }}
>
  <URDFRobot />
</ErrorBoundary>
```

#### 2. **Performance Monitoring**

```javascript
import { useFrame } from '@react-three/fiber';
import { logger } from '../utils/logger';

function PerformanceMonitor() {
  const frameCount = useRef(0);
  const lastTime = useRef(Date.now());
  
  useFrame(() => {
    frameCount.current++;
    const now = Date.now();
    
    if (now - lastTime.current > 1000) {
      const fps = frameCount.current;
      frameCount.current = 0;
      lastTime.current = now;
      
      if (fps < 30) {
        logger.warn('Low FPS detected', { fps, scene: 'robot-viewer' });
      }
    }
  });
  
  return null;
}
```

#### 3. **Logging des Événements 3D**

```javascript
// Dans URDFRobot.jsx
const handleMeshClick = (event) => {
  logger.debug('Mesh clicked', {
    meshName: event.object.name,
    position: event.point,
    component: 'URDFRobot',
  });
};

<mesh onClick={handleMeshClick}>
  {/* ... */}
</mesh>
```

---

### Tauri

#### 1. **Logging Frontend → Backend**

```javascript
// Frontend (React)
import { invoke } from '@tauri-apps/api/core';
import { logger } from '../utils/logger';

// Logger côté frontend ET envoyer au backend Rust si nécessaire
logger.error('Critical error', { details: '...' });

// Optionnel: Envoyer au backend pour logging système
await invoke('log_to_file', {
  level: 'error',
  message: 'Critical error',
  details: '...',
});
```

```rust
// Backend (Rust - src-tauri/src/lib.rs)
#[tauri::command]
fn log_to_file(level: String, message: String, details: String) {
    use std::fs::OpenOptions;
    use std::io::Write;
    
    let log_entry = format!("[{}] {}: {}\n", level, message, details);
    
    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open("app.log")
    {
        let _ = file.write_all(log_entry.as_bytes());
    }
}
```

#### 2. **Configuration selon l'Environnement**

```javascript
// Dans main.jsx ou App.jsx
import log from 'loglevel';

// Tauri expose l'environnement
const isDev = !window.__TAURI_INTERNALS__?.__currentWindow__?.label || 
              import.meta.env.DEV;

if (isDev) {
  log.setLevel('debug');
  log.enableAll();
} else {
  log.setLevel('warn'); // Production: seulement warnings et erreurs
  log.disableAll();
  log.enable('warn');
  log.enable('error');
}
```

#### 3. **Logging des Commandes Tauri**

```javascript
import { invoke } from '@tauri-apps/api/core';
import { logger } from '../utils/logger';

async function startDaemon() {
  const correlationId = generateId();
  logger.setContext({ correlationId, action: 'start-daemon' });
  
  try {
    logger.info('Starting daemon...');
    const result = await invoke('start_daemon');
    logger.info('Daemon started successfully', { result });
    return result;
  } catch (error) {
    logger.error('Failed to start daemon', {
      error: error.message,
      correlationId,
    });
    throw error;
  }
}
```

---

## 🏗️ Architecture Proposée

### Structure des Fichiers

```
src/
├── utils/
│   ├── logger.js          # Wrapper Loglevel + intégration Zustand
│   └── loggerConfig.js    # Configuration par environnement
├── store/
│   └── useAppStore.js     # Store Zustand (déjà existant)
├── components/
│   └── views/
│       └── active-robot/
│           └── LogConsole.jsx  # Composant d'affichage (existant)
└── hooks/
    └── useLogs.js         # Hook pour logs (existant, à améliorer)
```

### Logger Wrapper Personnalisé

```javascript
// src/utils/logger.js
import log from 'loglevel';
import useAppStore from '../store/useAppStore';

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

class Logger {
  constructor() {
    this.context = {};
    this.correlationId = null;
    
    // Configuration initiale
    this.configure();
  }
  
  configure() {
    const isDev = import.meta.env.DEV;
    
    if (isDev) {
      log.setLevel('debug');
    } else {
      log.setLevel('warn');
    }
  }
  
  setContext(context) {
    this.context = { ...this.context, ...context };
  }
  
  setCorrelationId(id) {
    this.correlationId = id;
    this.setContext({ correlationId: id });
  }
  
  _createLogEntry(level, message, metadata = {}) {
    return {
      level,
      timestamp: new Date().toISOString(),
      message: typeof message === 'function' ? message() : message,
      context: this.context,
      correlationId: this.correlationId,
      ...metadata,
    };
  }
  
  _logToStore(entry) {
    // Ajouter au store Zustand pour l'UI
    const store = useAppStore.getState();
    if (store && store.addFrontendLog) {
      store.addFrontendLog({
        message: entry.message,
        level: entry.level.toLowerCase(),
        timestamp: entry.timestamp,
        source: 'frontend',
      });
    }
  }
  
  debug(message, metadata = {}) {
    if (log.getLevel() <= LOG_LEVELS.DEBUG) {
      const entry = this._createLogEntry('DEBUG', message, metadata);
      log.debug(entry.message, entry);
    }
  }
  
  info(message, metadata = {}) {
    if (log.getLevel() <= LOG_LEVELS.INFO) {
      const entry = this._createLogEntry('INFO', message, metadata);
      log.info(entry.message, entry);
      this._logToStore(entry);
    }
  }
  
  warn(message, metadata = {}) {
    if (log.getLevel() <= LOG_LEVELS.WARN) {
      const entry = this._createLogEntry('WARN', message, metadata);
      log.warn(entry.message, entry);
      this._logToStore(entry);
    }
  }
  
  error(message, metadata = {}) {
    const entry = this._createLogEntry('ERROR', message, metadata);
    log.error(entry.message, entry);
    this._logToStore(entry);
    
    // Toujours logger les erreurs, même en production
  }
  
  // Méthode pour les logs avec lazy evaluation
  debugLazy(messageFn, metadata = {}) {
    if (log.getLevel() <= LOG_LEVELS.DEBUG) {
      this.debug(messageFn(), metadata);
    }
  }
}

export const logger = new Logger();
export default logger;
```

---

## 📋 Plan de Migration

### Phase 1: Installation et Configuration (1-2h)

1. Installer Loglevel
2. Créer le wrapper `logger.js`
3. Configurer selon l'environnement
4. Tester avec quelques composants

### Phase 2: Migration des Fichiers Critiques (4-6h)

1. **useAppStore.js** - Logs de state machine
2. **useApps.js** - Logs d'applications (très verbeux)
3. **RobotPositionControl.jsx** - Logs de contrôle
4. **ActiveRobotView.jsx** - Logs principaux

### Phase 3: Migration des Composants UI (3-4h)

1. Composants de vues
2. Composants 3D (R3F)
3. Hooks personnalisés

### Phase 4: Migration des Utilitaires (2-3h)

1. Utilitaires de configuration
2. Helpers de logging existants
3. Nettoyage des anciens `console.log`

### Phase 5: Améliorations Avancées (optionnel, 4-6h)

1. Correlation IDs pour les actions critiques
2. Format JSON structuré
3. Intégration avec monitoring (Sentry, etc.)
4. Performance monitoring pour R3F

---

## 🎯 Exemples de Migration

### Avant (useApps.js)

```javascript
console.log('📦 Fetched', daemonApps.length, 'apps from daemon (primary source)');
console.log('📦 Installed apps from daemon:', installedFromDaemon.map(...));
console.warn('⚠️ Failed to fetch apps from daemon:', response.status);
console.error('❌ Failed to fetch apps:', err);
```

### Après (avec logger)

```javascript
import { logger } from '../utils/logger';

logger.setContext({ component: 'useApps', action: 'fetch-apps' });

logger.debug(() => `Fetched ${daemonApps.length} apps from daemon`);
logger.debug(() => `Installed apps: ${JSON.stringify(installedFromDaemon.slice(0, 3))}`);
logger.warn('Failed to fetch apps from daemon', { status: response.status });
logger.error('Failed to fetch apps', { 
  error: err.message, 
  stack: err.stack 
});
```

### Avant (URDFRobot.jsx)

```javascript
console.log(`🎨 Materials applied: ${processedCount} meshes (${antennaCount} antennas)...`);
console.log('📦 Loading URDF model from cache...');
console.error('❌ URDF loading error:', err);
```

### Après (avec logger)

```javascript
import { logger } from '../../utils/logger';

logger.setContext({ component: 'URDFRobot' });

logger.debug(() => `Materials applied: ${processedCount} meshes (${antennaCount} antennas)`);
logger.info('Loading URDF model from cache');
logger.error('URDF loading error', { 
  error: err.message,
  stack: err.stack,
  component: 'URDFRobot',
});
```

---

## 🔒 Sécurité et Performance

### Sécurité

1. **Masquer les données sensibles:**
```javascript
function sanitizeUrl(url) {
  return url.replace(/token=[^&]+/, 'token=***');
}

logger.info('API call', { url: sanitizeUrl(url) });
```

2. **Ne pas logger les mots de passe/secrets:**
```javascript
// ❌ MAUVAIS
logger.debug('User login', { password: userPassword });

// ✅ BON
logger.debug('User login', { username: user.username });
```

### Performance

1. **Lazy Evaluation:**
```javascript
// ❌ MAUVAIS: Crée toujours l'objet
logger.debug(`Apps: ${apps.map(a => a.name).join(', ')}`);

// ✅ BON: Crée seulement si DEBUG activé
logger.debug(() => `Apps: ${apps.map(a => a.name).join(', ')}`);
```

2. **Limiter les logs en production:**
```javascript
// Production: seulement WARN et ERROR
if (import.meta.env.PROD) {
  log.setLevel('warn');
}
```

---

## 📊 Métriques de Succès

- ✅ **Réduction des logs en production:** 80% (seulement WARN/ERROR)
- ✅ **Format structuré:** 100% des nouveaux logs
- ✅ **Performance:** 0 impact mesurable (lazy evaluation)
- ✅ **Maintenabilité:** Code plus propre, logs cohérents
- ✅ **Débogage:** Plus facile avec correlation IDs et contexte

---

## 🔗 Ressources

- [Loglevel Documentation](https://github.com/pimterry/loglevel)
- [Zustand Middleware](https://github.com/pmndrs/zustand#middleware)
- [React Three Fiber Error Handling](https://docs.pmnd.rs/react-three-fiber/advanced/error-handling)
- [Tauri Logging](https://tauri.app/v1/guides/features/logging)

---

## ✅ Checklist de Migration

- [ ] Installer Loglevel
- [ ] Créer le wrapper logger.js
- [ ] Configurer selon l'environnement
- [ ] Migrer useAppStore.js
- [ ] Migrer useApps.js
- [ ] Migrer RobotPositionControl.jsx
- [ ] Migrer les composants R3F
- [ ] Migrer les hooks
- [ ] Nettoyer les anciens console.log
- [ ] Tester en dev et production
- [ ] Documenter les conventions

---

**Conclusion:** Loglevel + wrapper personnalisé est la solution optimale pour notre stack React/Zustand/R3F/Tauri. Elle offre un bon équilibre entre simplicité, performance et fonctionnalités.

