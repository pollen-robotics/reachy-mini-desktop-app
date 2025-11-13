# 🤖 Robot State Machine

## États du Robot

Le robot utilise un système de **state machine** pour gérer son état de manière cohérente et sûre.

### États principaux (`robotStatus`)

| État | Description | Daemon | UI |
|------|-------------|--------|-----|
| `disconnected` | Robot USB non connecté | OFF | RobotNotDetectedView |
| `ready-to-start` | USB OK, daemon arrêté | OFF | ReadyToStartView |
| `starting` | Démarrage + scan 3D | Starting | StartingView |
| `ready` | Prêt à recevoir commandes | ON | ActiveRobotView (idle) |
| `busy` | Action en cours | ON | ActiveRobotView (locked) |
| `stopping` | Arrêt en cours | Stopping | ClosingView |
| `crashed` | Daemon crashé | OFF | Error overlay |

### Raisons si busy (`busyReason`)

Quand `robotStatus === 'busy'`, la raison est précisée :

| Raison | Description | Durée |
|--------|-------------|-------|
| `moving` | Robot en mouvement | Variable |
| `command` | Quick action (sleep, wave, etc.) | 2-4s |
| `app-running` | Application active | Indéfinie |
| `installing` | Installation/désinstallation | 10-60s |

---

## Transitions

### Diagramme de transitions

```
disconnected ──[USB connecté]──> ready-to-start
                                       │
                                  [Start daemon]
                                       │
                                       ↓
                                   starting
                                       │
                                  [Scan terminé]
                                       │
                                       ↓
            ┌──────────────────────► ready ◄─────────────────────┐
            │                          │                          │
       [Action terminée]          [Action lancée]          [Action terminée]
            │                          │                          │
            │                          ↓                          │
            └──────────────────────► busy ◄────────────────────── ┘
                                       │
                                  [Power off]
                                       │
                                       ↓
                                   stopping
                                       │
                                  [Daemon arrêté]
                                       │
                                       ↓
                                 ready-to-start

Depuis n'importe quel état : [3 timeouts] → crashed
```

---

## Usage dans le code

### Lire l'état

```javascript
// Simple
const robotStatus = useAppStore(state => state.robotStatus);
const busyReason = useAppStore(state => state.busyReason);

// Avec label lisible
const label = useAppStore.getState().getRobotStatusLabel();
// → "Ready", "Installing", "Executing Command", etc.
```

### Changer l'état

```javascript
// ✅ NOUVEAU (recommandé)
useAppStore.getState().transitionTo.ready();
useAppStore.getState().transitionTo.busy('installing');
useAppStore.getState().transitionTo.crashed();

// ✅ LEGACY (backwards compatible, synchronise automatiquement)
setIsActive(true);         // → transitionTo.ready()
setIsCommandRunning(true); // → transitionTo.busy('command')
lockForInstall(appName);   // → transitionTo.busy('installing')
```

### Conditions dans l'UI

```javascript
// ✅ SIMPLE ET LISIBLE
<Button disabled={robotStatus !== 'ready'}>
  Play
</Button>

<Chip color={robotStatus === 'busy' ? 'warning' : 'success'}>
  {getRobotStatusLabel()}
</Chip>

// Switch sur le status
switch (robotStatus) {
  case 'ready':
    return <PlayButton />;
  case 'busy':
    return <SpinnerWithReason reason={busyReason} />;
  case 'crashed':
    return <ErrorOverlay />;
}
```

### Helpers disponibles

```javascript
// Helpers dérivés (compatibilité)
isReady()  // robotStatus === 'ready'
isBusy()   // robotStatus === 'busy'

// Helper labels
getRobotStatusLabel() // "Ready", "Installing", etc.
```

---

## Avantages

✅ **Pas d'états impossibles** : Un seul état à la fois  
✅ **Debug facile** : `console.log(robotStatus)` suffit  
✅ **UI simple** : `robotStatus === 'ready'` au lieu de 5 conditions  
✅ **Transitions explicites** : `transitionTo.busy('installing')`  
✅ **Backwards compatible** : Ancien code continue de fonctionner  

---

## Migration progressive

### Phase actuelle : Cohabitation

- ✅ `robotStatus` + `busyReason` créés
- ✅ Synchronisation automatique avec états legacy
- ✅ Ancien code fonctionne
- ✅ Nouveau code peut utiliser `robotStatus`

### Phase future (optionnel)

- Remplacer progressivement dans l'UI
- Supprimer les états legacy quand plus utilisés
- Code 100% state machine

