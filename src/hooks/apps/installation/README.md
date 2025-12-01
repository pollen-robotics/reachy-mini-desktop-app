# Installation Module Architecture

## 📁 Structure

```
installation/
├── constants.js              # Configuration et constantes
├── helpers.js                # Fonctions utilitaires pures
├── useInstallationPolling.js # Hook pour le polling
├── useInstallationLifecycle.js # Hook principal du cycle de vie
└── README.md                 # Cette documentation
```

## 🎯 Architecture

### Séparation des responsabilités

1. **constants.js** - Configuration centralisée
   - Types de jobs (`install`, `remove`)
   - États de résultat (`success`, `failed`, `in_progress`)
   - Timings et délais
   - Patterns de logs (success/error)

2. **helpers.js** - Fonctions pures et testables
   - Recherche de jobs
   - Détection de statut
   - Analyse de logs
   - Calculs de timing
   - Vérification de présence dans la liste

3. **useInstallationPolling.js** - Logique de polling
   - Gestion du polling pour attendre l'apparition de l'app
   - Contrôle du polling (start/stop)
   - Gestion des timeouts

4. **useInstallationLifecycle.js** - Orchestration principale
   - Suivi du progrès du job
   - Détection de la fin
   - Détermination du résultat
   - Gestion des timings minimums
   - Affichage du résultat et fermeture

## 🔄 Flux d'exécution

### 1. Démarrage
```
User clicks "Install"
  → handleInstall() [useAppHandlers]
    → lockForInstall() [store]
      → installingAppName = appName
      → installJobType = 'install'
      → installStartTime = Date.now()
    → installApp() [API call]
      → Returns job_id
```

### 2. Suivi du progrès
```
useInstallationLifecycle effect:
  → Find job in activeJobs
  → Mark job as seen (first time)
  → Check if job is finished:
    - job.status === 'completed' || 'failed'
    - OR job removed from activeJobs (after being seen)
```

### 3. Détection du résultat
```
Priority order:
  1. Explicit status (high confidence)
     - job.status === 'completed' → success
     - job.status === 'failed' → failed
  
  2. Log analysis (medium confidence)
     - Success patterns in logs → success
     - Error patterns in logs → failed
  
  3. Default assumption (low confidence)
     - Job disappeared cleanly → success (with warning)
```

### 4. Gestion des timings
```
Calculate remaining minimum display time:
  - Install: 0ms (no minimum)
  - Remove: 4000ms (4s minimum)
  
Wait remaining time if > 0
```

### 5. Polling (install only)
```
For successful install:
  → Start polling (500ms interval, max 30 attempts = 15s)
  → Check if app appears in installedApps list
  → Refresh apps list every 2s (4 attempts)
  
  If app found:
    → Show success → Close after 3s
  
  If timeout:
    → Show success anyway (with warning) → Close after 3s
```

### 6. Affichage du résultat
```
Show result state:
  → setInstallResult('success' | 'failed')
  → Wait RESULT_DISPLAY_DELAY (3s)
  → unlockInstall() → Close overlay
  → Show toast notification
  → Close discover modal (if install success)
```

## 📊 États et transitions

### États du store
- `installingAppName` - Nom de l'app en cours
- `installJobType` - Type: 'install' ou 'remove'
- `installResult` - Résultat: null, 'success', 'failed'
- `installStartTime` - Timestamp de début
- `jobSeenOnce` - Flag: job vu au moins une fois
- `processedJobs` - Array des jobs déjà traités

### Transitions
```
IDLE → INSTALLING → COMPLETED/FAILED → IDLE
```

## ⚙️ Configuration

### Timings (constants.js)
```javascript
TIMINGS = {
  MIN_DISPLAY_TIME: {
    INSTALL: 0,        // No minimum
    REMOVE: 4000,     // 4s minimum
  },
  RESULT_DISPLAY_DELAY: 3000,  // 3s before closing
  POLLING: {
    INTERVAL: 500,              // Check every 500ms
    MAX_ATTEMPTS: 30,           // 30 attempts = 15s max
    REFRESH_INTERVAL: 4,        // Refresh every 4 attempts (2s)
  },
}
```

## 🧪 Testabilité

### Helpers (fonctions pures)
Toutes les fonctions dans `helpers.js` sont pures et testables :
- Pas de dépendances externes
- Pas d'effets de bord
- Input/Output clairs

### Exemple de test
```javascript
import { determineInstallationResult } from './helpers';

test('should detect success from explicit status', () => {
  const job = { status: 'completed' };
  const result = determineInstallationResult(job);
  expect(result.wasCompleted).toBe(true);
  expect(result.confidence).toBe('high');
});
```

## 🔍 Points d'attention

### 1. Protection contre les boucles infinies
- `processedJobs` array pour éviter de re-traiter le même job
- `jobSeenOnce` flag pour éviter les faux positifs

### 2. Gestion des timeouts
- Polling timeout: 15s max
- Si timeout, on affiche success quand même (avec warning)
- Cela évite de bloquer l'UX en cas de délai réseau

### 3. Confiance dans le résultat
- **High**: Status explicite
- **Medium**: Analyse de logs
- **Low**: Assumption par défaut (avec warning)

### 4. Cleanup
- Tous les timeouts sont nettoyés au unmount
- Polling arrêté si installation annulée
- Pas de memory leaks

## 📝 Améliorations futures

1. **Meilleur feedback utilisateur**
   - Afficher le statut du polling ("Waiting for app to appear...")
   - Indiquer le nombre de tentatives restantes

2. **Gestion d'erreurs améliorée**
   - Ne pas assumer success par défaut
   - Logger plus d'informations pour debug

3. **Configuration dynamique**
   - Permettre d'ajuster les timings selon le contexte
   - A/B testing des délais

4. **Métriques**
   - Tracker le temps moyen d'installation
   - Tracker les taux de succès/échec

