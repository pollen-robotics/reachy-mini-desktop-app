# ✨ Refactoring : Robot State Machine

## 🎯 Ce qui a été fait

### 1. **Nouveau système d'état centralisé**

Avant :
```javascript
// États dispersés et risque d'incohérence
isActive: true
isStarting: false
isStopping: false
isCommandRunning: true
isAppRunning: false
isInstalling: false
// → 6 booléens = 2^6 = 64 combinaisons possibles (dont beaucoup invalides)
```

Après :
```javascript
// État unique et cohérent
robotStatus: 'busy'
busyReason: 'command'
// → 7 états × ~4 raisons = combinaisons valides seulement
```

---

## 🏗️ Architecture

### États principaux (`robotStatus`)

| État | Daemon | Affichage | Couleur | Animé |
|------|--------|-----------|---------|-------|
| `disconnected` | OFF | Offline | Gris (#999) | - |
| `ready-to-start` | OFF | Ready to Start | Bleu (#3b82f6) | - |
| `starting` | Starting | Starting | Bleu (#3b82f6) | ✅ |
| `ready` | ON | Ready/Standby | Vert/Orange | - |
| `busy` | ON | Executing/Installing... | Violet/Bleu | ✅ |
| `stopping` | Stopping | Stopping | Rouge (#ef4444) | ✅ |
| `crashed` | OFF | Crashed | Rouge (#ef4444) | - |

### Raisons si busy (`busyReason`)

| Raison | Label UI | Couleur | Durée |
|--------|----------|---------|-------|
| `moving` | Moving | Violet (#a855f7) | Variable |
| `command` | Executing | Violet (#a855f7) | 2-4s |
| `app-running` | App Running | Ambre (#f59e0b) | Indéfinie |
| `installing` | Installing | Bleu (#3b82f6) | 10-60s |

---

## 📦 Fichiers modifiés

### ✅ `useAppStore.js`
- ✨ Ajout de `robotStatus` et `busyReason`
- ✨ Nouveau `transitionTo` avec méthodes explicites
- ✨ Helper `getRobotStatusLabel()` pour l'UI
- ✅ Synchronisation automatique avec états legacy (backwards compatible)
- ✅ Logs des transitions (`console.log` avec emoji 🤖)

### ✅ `RobotViewer3D.jsx`
- ✨ Props `robotStatus` et `busyReason` ajoutées
- ✨ Fonction `getStatusTag()` refactorisée pour utiliser la state machine
- ✅ Support des nouvelles couleurs (ambre #f59e0b, rouge #ef4444, gris #999)
- ✅ Fallback legacy si `robotStatus` non fourni

### ✅ `ActiveRobotView.jsx`
- ✨ Destructuration de `robotStatus` et `busyReason` depuis le store
- ✅ Props passées à `RobotViewer3D`

### ✅ `App.jsx`
- ✨ Hook de debug pour logger les transitions en temps réel
- 📊 Affiche : `🤖 [STATE MACHINE] Status: busy (installing) → "Installing"`

### 📄 Nouveaux fichiers
- ✅ `STATE_MACHINE.md` : Documentation complète
- ✅ `REFACTOR_STATE_MACHINE.md` : Ce fichier (récapitulatif)

---

## 🎨 Affichage dans l'UI

### Tag de status (bas gauche du viewer 3D)

Le tag affiche maintenant l'état en **temps réel** :

```
Offline          [gris, statique]      → robotStatus: 'disconnected'
Ready to Start   [bleu, statique]      → robotStatus: 'ready-to-start'
Starting         [bleu, pulsant]       → robotStatus: 'starting'
Ready            [vert, statique]      → robotStatus: 'ready' + isOn: true
Standby          [orange, statique]    → robotStatus: 'ready' + isOn: false
Moving           [violet, pulsant]     → robotStatus: 'busy', busyReason: 'moving'
Executing        [violet, pulsant]     → robotStatus: 'busy', busyReason: 'command'
App Running      [ambre, pulsant]      → robotStatus: 'busy', busyReason: 'app-running'
Installing       [bleu, pulsant]       → robotStatus: 'busy', busyReason: 'installing'
Stopping         [rouge, pulsant]      → robotStatus: 'stopping'
Crashed          [rouge, statique]     → robotStatus: 'crashed'
```

---

## 🔄 Transitions automatiques

Les anciens setters synchronisent automatiquement :

```javascript
// Ancien code (continue de fonctionner)
setIsActive(true)
// → transitionTo.ready() automatiquement

setIsCommandRunning(true)
// → transitionTo.busy('command') automatiquement

lockForInstall(appName)
// → transitionTo.busy('installing') automatiquement
```

---

## 🚀 Usage recommandé (nouveau code)

### Lire l'état

```javascript
const robotStatus = useAppStore(state => state.robotStatus);
const busyReason = useAppStore(state => state.busyReason);
const label = useAppStore.getState().getRobotStatusLabel();
```

### Changer l'état

```javascript
// ✅ Recommandé (explicite)
useAppStore.getState().transitionTo.ready();
useAppStore.getState().transitionTo.busy('installing');
useAppStore.getState().transitionTo.crashed();

// ✅ Legacy (fonctionne toujours)
setIsActive(true);
lockForInstall(appName);
```

### Conditions dans l'UI

```javascript
// ✅ Simple
<Button disabled={robotStatus !== 'ready'}>Play</Button>

// ✅ Switch clair
switch (robotStatus) {
  case 'ready':
    return <PlayButton />;
  case 'busy':
    return <LoadingSpinner reason={busyReason} />;
  case 'crashed':
    return <ErrorOverlay />;
}
```

---

## ✅ Avantages

| Avant | Après |
|-------|-------|
| 6 booléens dispersés | 1 état + 1 raison |
| 64 combinaisons possibles | ~10 états valides |
| `if (isActive && !isStarting && !isStopping && ...)` | `if (robotStatus === 'ready')` |
| Debug complexe | `console.log(robotStatus)` |
| États incohérents possibles | **Impossible** |
| Pas de labels UI | `getRobotStatusLabel()` |

---

## 🔍 Debug

### Console logs automatiques

```
🤖 [STATE] → starting
🤖 [STATE MACHINE] Status: starting → "Starting"

🤖 [STATE] → ready
🤖 [STATE MACHINE] Status: ready → "Ready"

🤖 [STATE] → busy (command)
🤖 [STATE MACHINE] Status: busy (command) → "Executing Command"
```

### Voir l'état en temps réel

1. Ouvre la console du navigateur
2. Chaque transition affiche un log avec emoji 🤖
3. Le tag en bas à gauche du viewer 3D reflète l'état

---

## 📚 Documentation complète

Voir [`STATE_MACHINE.md`](./STATE_MACHINE.md) pour :
- Diagramme de transitions complet
- Règles de transitions
- Exemples d'usage
- Migration guide

---

## ✨ Prochaines étapes (optionnel)

1. **Phase actuelle** : Cohabitation (✅ fait)
   - State machine implémentée
   - États legacy synchronisés
   - Backwards compatible

2. **Phase future** : Migration progressive
   - Remplacer conditions legacy dans l'UI
   - Utiliser `robotStatus` directement
   - Supprimer états legacy quand plus utilisés

3. **Phase finale** : Pure state machine
   - Code 100% basé sur `robotStatus`
   - Suppression des booléens
   - API ultra-claire

---

## 🎉 Résumé

✅ **State machine complète et fonctionnelle**  
✅ **Tag de status en temps réel dans le viewer 3D**  
✅ **Backwards compatible (rien ne casse)**  
✅ **Logs de debug automatiques**  
✅ **Documentation complète**  
✅ **Code plus lisible et maintenable**

Le robot affiche maintenant son état en temps réel dans le viewer 3D ! 🤖✨

