# 📋 Plan de Refactoring : Centralisation des Appels API

## 🎯 Objectif
Centraliser tous les appels API dans la fenêtre principale. Les fenêtres secondaires deviennent de simples interfaces UI qui émettent des événements Tauri vers la fenêtre principale.

## 📁 Fichiers à Modifier

### 1. **Fenêtres Secondaires** (2 fichiers)

#### `src/views/windows/ExpressionsWindow.jsx`
**Changements :**
- ❌ Supprimer : `import { useRobotCommands } from '@hooks/robot'`
- ❌ Supprimer : `const { sendCommand, playRecordedMove } = useRobotCommands()`
- ✅ Ajouter : Système d'émission d'événements Tauri
- ✅ Modifier : `handleQuickAction` pour émettre des événements au lieu d'appeler directement

**Nouveau code :**
```javascript
const handleQuickAction = useCallback(async (action) => {
  const { emit } = await import('@tauri-apps/api/event');
  await emit('robot-command', {
    type: action.type,
    name: action.name,
    label: action.label,
    dataset: action.type === 'dance' ? CHOREOGRAPHY_DATASETS.DANCES : CHOREOGRAPHY_DATASETS.EMOTIONS,
  });
}, []);
```

#### `src/views/windows/ControllerWindow.jsx`
**Changements :**
- ✅ Modifier : Le composant `Controller` pour qu'il émette des événements au lieu d'appels API directs
- ⚠️ **Note** : Le Controller utilise `useRobotAPI` qui fait des appels fréquents (30fps), donc il faudra un système spécial pour les commandes continues

### 2. **Composant Controller** (1 fichier)

#### `src/views/active-robot/controller/Controller.jsx`
**Changements :**
- ✅ Détecter si on est dans une fenêtre secondaire
- ✅ Si oui, émettre des événements au lieu d'utiliser `useRobotAPI` directement
- ✅ Si non (fenêtre principale), utiliser le système actuel

### 3. **Hooks de Commande** (3 fichiers)

#### `src/hooks/robot/useRobotCommands.js`
**Changements :**
- ✅ Ajouter une fonction `emitCommand` qui détecte la fenêtre
- ✅ Si fenêtre secondaire : émettre événement Tauri
- ✅ Si fenêtre principale : appeler API directement
- ✅ Garder la logique actuelle pour la fenêtre principale

#### `src/views/active-robot/controller/hooks/useRobotAPI.js`
**Changements :**
- ✅ Détecter si on est dans une fenêtre secondaire
- ✅ Si oui, émettre des événements pour chaque `sendCommand`
- ✅ Si non, garder le comportement actuel
- ⚠️ **Important** : Les commandes continues (30fps) nécessitent un système de batching/throttling des événements

#### `src/views/active-robot/controller/hooks/useRobotPosition.js`
**Changements :**
- ✅ Utiliser le nouveau système de `useRobotAPI` (qui détecte automatiquement la fenêtre)
- ✅ Pas de changement majeur, juste utiliser la nouvelle version de `useRobotAPI`

### 4. **Fenêtre Principale - Listener** (1 fichier)

#### `src/components/App.jsx` (ou nouveau fichier `src/hooks/window/useCommandListener.js`)
**Changements :**
- ✅ Créer un hook `useCommandListener` qui écoute les événements `robot-command`
- ✅ Exécuter les commandes dans la fenêtre principale
- ✅ Ajouter les logs automatiquement (via `fetchWithTimeout` qui utilise le store de la fenêtre principale)

**Nouveau hook :**
```javascript
// src/hooks/window/useCommandListener.js
export function useCommandListener() {
  useEffect(() => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const { listen } = await import('@tauri-apps/api/event');
    const currentWindow = await getCurrentWindow();
    
    // Seulement dans la fenêtre principale
    if (currentWindow.label !== 'main') return;
    
    const unlisten = await listen('robot-command', async (event) => {
      const { type, name, label, dataset } = event.payload;
      const { sendCommand, playRecordedMove } = useRobotCommands();
      
      if (type === 'action') {
        await sendCommand(`/api/move/play/${name}`, label);
      } else if (type === 'dance') {
        await playRecordedMove(CHOREOGRAPHY_DATASETS.DANCES, name);
      } else {
        await playRecordedMove(CHOREOGRAPHY_DATASETS.EMOTIONS, name);
      }
    });
    
    return () => unlisten();
  }, []);
}
```

### 5. **Système d'Événements** (nouveaux fichiers)

#### `src/utils/commandProxy.js` (NOUVEAU)
**Créer un système de proxy pour les commandes :**
```javascript
// Détecte automatiquement la fenêtre et route les commandes
export async function sendCommandProxy(endpoint, label, options) {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const currentWindow = await getCurrentWindow();
  
  if (currentWindow.label === 'main') {
    // Fenêtre principale : appel direct
    return fetchWithTimeout(buildApiUrl(endpoint), options, ...);
  } else {
    // Fenêtre secondaire : émettre événement
    const { emit } = await import('@tauri-apps/api/event');
    await emit('robot-command', { endpoint, label, options });
  }
}
```

### 6. **Configuration Tauri** (1 fichier)

#### `src-tauri/capabilities/secondary-windows.json`
**Vérifier que les permissions d'événements sont correctes :**
- ✅ `event:emit` : Pour émettre des événements depuis les fenêtres secondaires
- ✅ `event:listen` : Pour écouter dans la fenêtre principale

## 📊 Résumé des Modifications

### Fichiers à Modifier (6 fichiers)
1. ✅ `src/views/windows/ExpressionsWindow.jsx`
2. ✅ `src/views/windows/ControllerWindow.jsx` (indirectement via Controller)
3. ✅ `src/views/active-robot/controller/Controller.jsx`
4. ✅ `src/hooks/robot/useRobotCommands.js`
5. ✅ `src/views/active-robot/controller/hooks/useRobotAPI.js`
6. ✅ `src/components/App.jsx` (ajouter le listener)

### Fichiers à Créer (2 fichiers)
1. ✅ `src/hooks/window/useCommandListener.js` (nouveau hook)
2. ✅ `src/utils/commandProxy.js` (nouveau utilitaire)

### Fichiers à Vérifier (1 fichier)
1. ✅ `src-tauri/capabilities/secondary-windows.json`

## ⚠️ Points d'Attention

### 1. **Commandes Continues (Controller)**
Le Controller envoie des commandes à 30fps. Il faut :
- Soit créer un système de batching (grouper plusieurs commandes)
- Soit créer un événement spécial pour les commandes continues
- Soit garder les commandes continues en direct (mais les logs seront dans la fenêtre principale)

### 2. **Latence**
Les événements Tauri ajoutent une petite latence. Pour les commandes continues, cela peut être problématique.

### 3. **Gestion des Erreurs**
Les erreurs doivent être propagées depuis la fenêtre principale vers les fenêtres secondaires.

## 🎯 Avantages de cette Approche

1. ✅ **Centralisation** : Tous les logs dans la fenêtre principale
2. ✅ **Cohérence** : Architecture claire et prévisible
3. ✅ **Maintenabilité** : Plus facile à déboguer
4. ✅ **Évolutivité** : Facile d'ajouter de nouvelles fenêtres
5. ✅ **Séparation des responsabilités** : UI vs API

## 📝 Ordre d'Implémentation Recommandé

1. **Phase 1** : Créer `useCommandListener` et `commandProxy`
2. **Phase 2** : Modifier `ExpressionsWindow` (plus simple, pas de commandes continues)
3. **Phase 3** : Modifier `useRobotCommands` pour utiliser le proxy
4. **Phase 4** : Gérer les commandes continues du Controller (plus complexe)
5. **Phase 5** : Tests et validation

## 🔄 Alternative Plus Simple (Solution Court Terme)

Si le refactoring complet est trop lourd, on peut :
1. Modifier seulement `fetchWithTimeout` pour émettre des événements de logs
2. Garder les appels API dans les fenêtres secondaires
3. Centraliser uniquement les logs

**Avantage** : Changements minimaux
**Inconvénient** : Architecture moins propre

