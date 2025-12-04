# Daemon Event Bus

## 📋 Vue d'Ensemble

L'Event Bus centralise tous les événements liés au cycle de vie du daemon pour éviter les race conditions et améliorer la traçabilité.

## 🎯 Architecture

```
┌─────────────────────────────────────────┐
│         Sources d'Événements            │
├─────────────────────────────────────────┤
│ • invoke('start_daemon')                │
│ • sidecar-terminated listener           │
│ • sidecar-stderr listener               │
│ • useRobotState polling                 │
│ • Timeout 30s                           │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│         Event Bus (Centralisé)          │
│  • Logging automatique                  │
│  • Traçabilité complète                 │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│         Event Handlers                   │
│  • handleDaemonError()                 │
│  • setHardwareError()                   │
│  • setIsStarting()                      │
└─────────────────────────────────────────┘
```

## 📡 Événements Disponibles

### Démarrage
- `daemon:start:attempt` - Tentative de démarrage initiée
- `daemon:start:success` - Processus daemon démarré avec succès
- `daemon:start:error` - Erreur lors du démarrage
- `daemon:start:timeout` - Timeout de démarrage (30s)

### Crash / Erreurs
- `daemon:crash` - Processus daemon terminé de manière inattendue
- `daemon:hardware:error` - Erreur hardware détectée (stderr)

### Santé
- `daemon:health:success` - Daemon répond avec succès
- `daemon:health:failure` - Daemon ne répond pas (timeout)

## 🔧 Utilisation

### Émettre un événement

```javascript
const eventBus = useDaemonEventBus();

// Émettre un événement
eventBus.emit('daemon:start:attempt');
eventBus.emit('daemon:crash', { status: '1' });
```

### Écouter un événement

```javascript
const eventBus = useDaemonEventBus();

useEffect(() => {
  const unsubscribe = eventBus.on('daemon:crash', (data) => {
    console.log('Daemon crashed:', data.status);
    // Handle crash
  });
  
  return unsubscribe; // Cleanup
}, [eventBus]);
```

## 🎯 Avantages

1. **Traçabilité** : Tous les événements sont loggés automatiquement
2. **Centralisation** : Une seule fonction `handleDaemonError()` pour toutes les erreurs
3. **Débogage** : `eventBus.getEventLog()` pour voir l'historique complet
4. **Pas de race conditions** : Les événements sont traités de manière ordonnée

## 📝 Migration

Les anciens appels directs à `setHardwareError()` sont progressivement remplacés par des émissions d'événements vers le bus.

