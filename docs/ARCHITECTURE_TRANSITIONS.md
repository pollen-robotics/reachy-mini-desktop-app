# 🏗️ Architecture des Transitions - Documentation

## 📐 Vue d'ensemble

L'application gère plusieurs états de vue avec des transitions fluides et synchronisées avec le daemon backend.

---

## 🔄 États de l'application

### États React (Zustand Store)

```javascript
isStarting       // Démarrage daemon + scan visuel 3D
isTransitioning  // Phase de resize (vue intermédiaire)
isActive         // Daemon actif + robot prêt
isStopping       // Arrêt daemon en cours
```

### Vues correspondantes

```javascript
RobotNotDetectedView   // USB non connecté
ReadyToStartView       // USB connecté, daemon inactif
StartingView           // Scan 3D en cours (animation 6s + success)
TransitionView         // Spinner pendant resize fenêtre
ActiveRobotView        // Interface principale (robot actif)
ClosingView            // Animation d'arrêt
```

---

## ⏱️ Timeline de démarrage (DÉTERMINISTE)

**Timing fixe garanti : EXACTEMENT 9.05 secondes dans tous les cas**

```
T+0s     : Click "Start"
          └─> StartingView s'affiche
          └─> Scan 3D démarre (8 secondes)
          └─> Daemon démarre en parallèle (prêt en ~2s)

T+8.0s   : Dernier mesh flashé en orange

T+8.25s  : (+250ms) Dernier mesh revenu en X-ray
          └─> Barre de progression à 100% ✅

T+9.05s  : (+800ms pause)
          └─> Utilisateur a VU la barre à 100% ✅
          └─> Transition démarre

T+9.15s  : (+100ms VIEW_FADE_DELAY)
          └─> TransitionView s'affiche
          └─> Spinner visible
          └─> Resize 450px → 900px commence

T+9.95s  : (+800ms TRANSITION_DURATION)
          └─> ActiveRobotView
          └─> Interface complète
```

**Total : ~10 secondes (9.95s exactement)**

---

## 🎯 Configuration centralisée

**Fichier : `src/config/daemon.js`**

Toutes les durées sont centralisées dans `DAEMON_CONFIG` :

```javascript
ANIMATIONS: {
  SCAN_DURATION: 8000,           // Durée scan 3D des meshes
  SCAN_INTERNAL_DELAYS: 250,     // Délai retour X-ray dernier mesh
  SCAN_COMPLETE_PAUSE: 800,      // Pause pour VOIR la barre à 100%
  TRANSITION_DURATION: 800,      // Durée du resize + spinner
  VIEW_FADE_DELAY: 100,          // Micro-délai entre vues
  SLEEP_DURATION: 4000,          // goto_sleep avant kill
  STARTUP_MIN_DELAY: 2000,       // Délai minimum au démarrage
}

// Total scan = 8000 + 250 + 800 = 9050ms (garanti)
```

---

## 🔧 Helper DRY : `transitionToActiveView()`

**Problème résolu :** Code dupliqué 2× dans `useDaemon.js`

### Avant (❌ PAS DRY)

```javascript
// Duplication #1 : Daemon déjà running
setTimeout(() => {
  setIsStarting(false);
  setTimeout(() => {
    setIsTransitioning(true);
    setTimeout(() => {
      setIsActive(true);
      setIsTransitioning(false);
    }, 500);
  }, 100);
}, remainingTime);

// Duplication #2 : Daemon lancé
setTimeout(() => {
  setIsStarting(false);
  setTimeout(() => {
    setIsTransitioning(true);
    setTimeout(() => {
      setIsActive(true);
      setIsTransitioning(false);
    }, 500);
  }, 100);
}, remainingTime);
```

### Après (✅ DRY)

**Helper unique :**
```javascript
// src/config/daemon.js
export function transitionToActiveView({ setIsStarting, setIsTransitioning, setIsActive }, remainingTime) {
  setTimeout(() => {
    // Étape 1 : Cacher StartingView
    setIsStarting(false);
    
    setTimeout(() => {
      // Étape 2 : Afficher TransitionView + trigger resize
      setIsTransitioning(true);
      
      setTimeout(() => {
        // Étape 3 : Afficher ActiveRobotView
        setIsActive(true);
        setIsTransitioning(false);
      }, DAEMON_CONFIG.ANIMATIONS.TRANSITION_DURATION);
    }, DAEMON_CONFIG.ANIMATIONS.VIEW_FADE_DELAY);
  }, remainingTime);
}
```

**Utilisation :**
```javascript
// src/hooks/useDaemon.js
transitionToActiveView({ setIsStarting, setIsTransitioning, setIsActive }, remainingTime);
```

---

## 🛡️ Protection contre le resize prématuré

### Logique de resize (`App.jsx`)

```javascript
const currentView = useMemo(() => {
  if (isStopping) return 'compact';
  
  // ⚡ KEY : Le resize n'arrive QUE quand TransitionView est visible
  // (pas pendant StartingView, même si isTransitioning = true)
  if ((isActive || (isTransitioning && !isStarting)) && !hardwareError) {
    return 'expanded';
  }
  
  return 'compact';
}, [isActive, hardwareError, isStopping, isTransitioning, isStarting]);
```

### Ordre de priorité des vues (`App.jsx`)

```javascript
// ⚡ PRIORITÉ : StartingView doit rester visible même si isTransitioning devient true
if (isStarting) return <StartingView />;

// TransitionView n'apparaît QUE quand isStarting = false
if (isTransitioning) return <TransitionView />;

if (isActive) return <ActiveRobotView />;
```

---

## ✅ Garanties architecture

1. **DRY** : Logique de transition centralisée dans 1 seule fonction helper
2. **Config centralisée** : Tous les timings dans `DAEMON_CONFIG`
3. **Séquençage robuste** : Délai de 100ms garantit que StartingView disparaît avant TransitionView
4. **Resize protégé** : Impossible que le resize se fasse pendant StartingView
5. **Logs explicites** : Chaque étape est loggée pour debug facile

---

## 🐛 Debug

### Logs à surveiller (console)

```
⏱️ Daemon ready, waiting Xms for scan animation to complete
⏱️ Scan animation complete, hiding StartingView
⏱️ Showing TransitionView and triggering resize
📐 App - Switching to EXPANDED view
⏱️ TransitionView complete, showing ActiveRobotView
```

### Si le resize arrive trop tôt

- Vérifier que `isStarting` est bien `false` avant `isTransitioning = true`
- Vérifier `VIEW_FADE_DELAY` (doit être > 0)
- Vérifier l'ordre des conditions dans `App.jsx`

---

## 📝 Changelog

**2025-01-10 - Simplification majeure du flow**
- 🎯 **SIMPLIFICATION** : Suppression des délais artificiels
- ❌ Supprimé `SCAN_COMPLETE_DELAY` (800ms inutiles)
- ❌ Supprimé `SCAN_SUCCESS_DISPLAY` (2500ms inutiles)
- ❌ Supprimé message "Hardware detected"
- ❌ Supprimé état `scanCompleted`
- ✅ Ajout `SCAN_INTERNAL_DELAYS` (750ms) pour timing précis
- ✅ Transition IMMÉDIATE après scan terminé
- ✅ Flow direct : Scan → Transition → Vue active
- ⚡ **Gain : -3.3 secondes** (6.75s au lieu de 10.05s)

**2025-01-10 - Fix timing critique**
- 🐛 **BUG RÉSOLU** : Le resize arrivait avant la fin du scan
- ✅ Cas 1 (daemon running) : attendre temps complet
- ✅ Cas 2 (nouveau daemon) : `scanStartTime` enregistré à l'affichage de StartingView
- ✅ Garantie : le scan a TOUJOURS ses 6.75s complètes

**2025-01-10 - Refactoring DRY**
- ✅ Ajout de `transitionToActiveView()` helper dans `daemon.js`
- ✅ Suppression des 2 duplications dans `useDaemon.js`
- ✅ Ajout de `VIEW_FADE_DELAY` à la config
- ✅ Protection du resize avec condition `!isStarting`
- ✅ Ordre de priorité des vues corrigé
- ✅ Logs explicites à chaque étape
- ✅ Suppression de `isSimulation` inutilisé dans App.jsx

**Résultat :** 
- Code plus simple et plus rapide
- Flow direct sans délais artificiels
- Architecture épurée et robuste
- Timing garanti quel que soit le temps de démarrage daemon

