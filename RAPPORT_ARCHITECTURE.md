# 🏗️ Rapport d'Architecture - Application Reachy Mini

## 📐 Vue d'Ensemble

Application **Tauri** (React + Rust) pour contrôler un robot Reachy Mini. Architecture modulaire avec séparation claire des responsabilités.

### Stack Technique
- **Frontend**: React 18 + Vite
- **State Management**: Zustand (store centralisé)
- **UI**: Material-UI (MUI)
- **3D**: React Three Fiber + Three.js
- **Backend**: Rust (Tauri)
- **Communication**: WebSocket (robot) + Tauri Events (fenêtres)

---

## 📁 Structure des Dossiers

```
src/
├── assets/                    # Ressources statiques (100+ fichiers)
│   ├── reachies/             # Images de personnages
│   └── robot-3d/             # Modèles 3D (.stl, .urdf)
│
├── components/                # Composants réutilisables (8 fichiers + 2 sous-dossiers)
│   ├── viewer3d/             # Système de visualisation 3D (11 fichiers)
│   │   ├── effects/          # Effets visuels (scan, particules, erreurs)
│   │   └── hooks/            # Hooks spécifiques 3D
│   └── wheel/                # Roue d'expressions (7 fichiers)
│       ├── hooks/            # Hooks de la roue
│       └── Counter/          # Composant compteur (non utilisé)
│
├── config/                    # Configuration centralisée
│   └── daemon.js             # Config daemon (timeouts, intervalles, etc.)
│
├── constants/                 # Constantes partagées
│   └── choreographies.js     # Actions rapides, émotions, danses
│
├── hooks/                     # Hooks globaux (12 hooks)
│   ├── daemon/               # Gestion du daemon (3 hooks)
│   ├── robot/                # Commandes robot (3 hooks)
│   └── system/               # Utilitaires système (6 hooks)
│
├── store/                     # State management
│   └── useAppStore.js        # Store Zustand centralisé (784 lignes)
│
├── utils/                     # Utilitaires (24 fichiers)
│   ├── viewer3d/             # Utils spécifiques 3D (2 fichiers)
│   └── wheel/                # Utils spécifiques roue (4 fichiers)
│
└── views/                     # Vues de l'application (8 vues principales)
    ├── active-robot/         # Vue principale (40+ fichiers) ⚠️ Le plus volumineux
    │   ├── application-store/ # Store d'applications (40 fichiers)
    │   ├── audio/            # Contrôles audio (4 fichiers)
    │   ├── camera/           # Flux caméra (3 fichiers)
    │   ├── controller/       # Contrôleur robot (16 fichiers)
    │   ├── controls/         # Contrôles (2 fichiers)
    │   ├── hooks/            # Hooks spécifiques (3 fichiers)
    │   ├── layout/           # Layout (2 fichiers)
    │   └── right-panel/      # Panneau droit (11 fichiers)
    ├── starting/             # Vue de démarrage (3 fichiers)
    ├── ready-to-start/       # Prêt à démarrer (2 fichiers)
    ├── robot-not-detected/   # Robot non détecté (2 fichiers)
    ├── closing/              # Vue de fermeture (2 fichiers)
    ├── transition/           # Vue de transition (2 fichiers)
    └── update/               # Vue de mise à jour (4 fichiers)
```

---

## 🎯 Architecture par Couches

### 1. **Couche Présentation (Views)**

**Principe**: Une vue par état de l'application

```
App.jsx (Point d'entrée)
  ├── UpdateView          # Vérification des mises à jour
  ├── RobotNotDetectedView # Robot non connecté
  ├── StartingView        # Scan matériel
  ├── ReadyToStartView    # Prêt à démarrer
  ├── TransitionView      # Transition (redimensionnement)
  ├── ActiveRobotView     # Vue principale (contrôle robot)
  └── ClosingView         # Arrêt du daemon
```

**Caractéristiques**:
- ✅ Navigation conditionnelle basée sur l'état du robot
- ✅ Gestion des durées minimales d'affichage
- ✅ Séparation claire des responsabilités

### 2. **Couche Composants (Components)**

**Organisation par domaine**:

- **`viewer3d/`**: Système 3D complet
  - `Viewer3D.jsx`: Composant principal
  - `Scene.jsx`: Scène 3D avec éclairage
  - `URDFRobot.jsx`: Modèle robot
  - `effects/`: Effets visuels (scan, particules, erreurs)
  - `hooks/`: WebSocket pour données robot en temps réel

- **`wheel/`**: Roue d'expressions
  - `SpinningWheel.jsx`: Composant principal (737 lignes)
  - `WheelIndicator.jsx`: Indicateur triangle
  - `WheelItem.jsx`: Item de la roue
  - `hooks/`: Logique métier (virtualisation, animations, actions)

**Conventions**:
- Composants réutilisables uniquement
- Composants spécifiques dans `views/`
- Hooks proches de leur usage

### 3. **Couche Logique Métier (Hooks)**

**Organisation par domaine**:

```
hooks/
├── daemon/              # Cycle de vie du daemon
│   ├── useDaemon.js              # Démarrage/arrêt
│   └── useDaemonHealthCheck.js   # Détection de crash
│
├── robot/               # Commandes robot
│   ├── useRobotCommands.js       # Envoi de commandes
│   └── useRobotState.js          # Polling état robot (500ms)
│
└── system/              # Utilitaires système
    ├── useLogs.js                # Récupération logs
    ├── useUpdater.js              # Système de mise à jour
    ├── useUsbDetection.js        # Détection USB
    └── useWindowResize.js        # Redimensionnement fenêtre
```

**Hooks spécifiques** (près de leur usage):
- `views/active-robot/controller/hooks/`: Logique contrôleur
- `views/active-robot/application-store/hooks/`: Logique store apps
- `components/viewer3d/hooks/`: WebSocket robot
- `components/wheel/hooks/`: Logique roue

**Principe**: Hooks globaux dans `hooks/`, hooks spécifiques près de leur usage.

### 4. **Couche État (Store)**

**Store unique**: `useAppStore.js` (Zustand)

**Structure**:
```javascript
{
  // État machine robot
  robotStatus: 'disconnected' | 'ready-to-start' | 'starting' | 'ready' | 'busy' | 'stopping' | 'crashed',
  busyReason: null | 'moving' | 'command' | 'app-running' | 'installing',
  
  // État robot centralisé
  robotStateFull: { data, lastUpdate, error },
  activeMoves: [],
  
  // Logs centralisés
  logs: [],              // Logs daemon
  frontendLogs: [],      // Logs actions frontend
  appLogs: [],           // Logs applications
  
  // Verrous d'activité
  isCommandRunning: boolean,
  isAppRunning: boolean,
  isInstalling: boolean,
  
  // ... autres états
}
```

**Middleware**: `windowSyncMiddleware`
- Synchronise l'état entre fenêtres Tauri
- Émet uniquement depuis la fenêtre principale
- Comparaisons optimisées (pas de JSON.stringify)

### 5. **Couche Utilitaires (Utils)**

**Organisation**:
- **Utils généraux**: `utils/*.js` (18 fichiers)
- **Utils spécifiques**: `utils/viewer3d/`, `utils/wheel/`

**Catégories**:
- **Input**: `InputManager.js`, `inputMappings.js`, `inputSmoothing.js`
- **3D**: `robotModelCache.js`, `scanParts.js`
- **Wheel**: `wheel/geometry.js`, `wheel/normalization.js`
- **Window**: `windowManager.js`, `windowUtils.js` (⚠️ Ne pas toucher)
- **Autres**: `errorUtils.js`, `hardwareErrors.js`, etc.

---

## 🔄 Flux de Données

### 1. **Communication Robot**

```
useRobotState (polling 500ms)
  └── /api/state/full
      └── robotStateFull (store)
          └── Composants consommateurs

useRobotWebSocket (temps réel)
  └── ws://localhost:8080/ws
      └── robotState (local)
          └── Viewer3D (affichage 3D)
```

### 2. **Synchronisation Fenêtres**

```
Fenêtre Principale
  └── useAppStore (mise à jour)
      └── windowSyncMiddleware
          └── emit('store-update', updates)
              └── Fenêtres Secondaires
                  └── useWindowSync (écoute)
                      └── useAppStore.setState(updates)
```

**⚠️ Important**: Ne pas modifier les fichiers liés aux windows/sync.

### 3. **Commandes Robot**

```
Composant UI
  └── useRobotCommands.sendCommand()
      └── fetchWithTimeout('/api/command', ...)
          └── addFrontendLog() (store)
              └── Affichage dans LogConsole
```

---

## 📊 Statistiques

### Taille des Modules

| Module | Fichiers | Lignes (est.) | Complexité |
|--------|----------|---------------|------------|
| `views/active-robot/` | 40+ | ~8000 | ⚠️ Élevée |
| `components/viewer3d/` | 11 | ~3000 | ⚠️ Élevée |
| `components/wheel/` | 7 | ~2000 | Modérée |
| `store/useAppStore.js` | 1 | 784 | ⚠️ Élevée |
| `hooks/` | 12 | ~2000 | Modérée |
| `utils/` | 24 | ~3000 | Modérée |

### Points d'Attention

1. **`views/active-robot/`**: 40+ fichiers, structure profonde
2. **`SpinningWheel.jsx`**: 737 lignes (composant volumineux)
3. **`useAppStore.js`**: 784 lignes (store centralisé mais volumineux)

---

## 🎨 Conventions de Nommage

### ✅ Conventions Respectées

- **Composants**: PascalCase (`SpinningWheel`, `WheelIndicator`)
- **Hooks**: Préfixe `use` (`useRobotState`, `useAppStore`)
- **Utils**: camelCase (`inputMappings`, `robotModelCache`)
- **Constantes**: UPPER_SNAKE_CASE dans fichiers constants
- **Dossiers vues**: kebab-case (`active-robot`, `ready-to-start`)

### ⚠️ Inconsistances

- **Dossiers composants**: Mélange (`viewer3d` vs `wheel`)
  - `viewer3d`: pas de séparateur
  - `wheel`: tout minuscule
  - **Recommandation**: Standardiser en kebab-case (`viewer-3d`, `wheel`)

---

## 🔧 Points d'Amélioration

### Priorité 1: Structure

1. **Réorganiser `views/active-robot/`**
   - Dossier très volumineux (40+ fichiers)
   - Considérer une structure plus plate ou extraire des modules

2. **Standardiser les noms de dossiers**
   - Choisir kebab-case pour tous les dossiers
   - Renommer `viewer3d` → `viewer-3d` (optionnel)

### Priorité 2: Code

1. **Réduire la taille des composants**
   - `SpinningWheel.jsx`: 737 lignes → Extraire en sous-composants
   - `useAppStore.js`: 784 lignes → Considérer la séparation (mais garder la cohérence)

2. **Documentation**
   - Ajouter JSDoc aux fonctions complexes
   - Documenter les flux de données critiques

### Priorité 3: Maintenance

1. **Tests**
   - Aucun fichier de test trouvé
   - Considérer l'ajout de tests unitaires pour les hooks critiques

2. **Linting**
   - Vérifier les imports inutilisés régulièrement
   - Standardiser le formatage

---

## 🚀 Points Forts de l'Architecture

1. ✅ **Séparation claire des responsabilités**
   - Views / Components / Hooks / Utils bien séparés

2. ✅ **Store centralisé**
   - Un seul store Zustand
   - Middleware pour synchronisation fenêtres

3. ✅ **Hooks bien organisés**
   - Par domaine (daemon, robot, system)
   - Hooks spécifiques près de leur usage

4. ✅ **Configuration centralisée**
   - `config/daemon.js` pour tous les timeouts/intervalles

5. ✅ **Barrel exports**
   - `index.js` pour exports propres
   - Facilite les imports

---

## 📝 Recommandations Futures

1. **TypeScript**
   - Migration progressive pour type safety
   - Commencer par les hooks et utils

2. **Tests**
   - Tests unitaires pour hooks critiques
   - Tests d'intégration pour flux principaux

3. **Documentation**
   - README.md dans chaque module important
   - Diagrammes de flux pour les interactions complexes

4. **Performance**
   - Monitoring des re-renders
   - Profiling des composants 3D

---

*Rapport généré le : $(date)*
*Basé sur l'analyse de ~150 fichiers principaux*

