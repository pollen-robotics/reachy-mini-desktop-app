# 🔴 Diagnostic : Blocage sur "Looking for updates" (macOS)

**Date**: 2024  
**Problème**: L'app reste bloquée sur "Looking for updates" indéfiniment, même si l'indicateur montre "Online"

---

## 🔍 Analyse du Problème

### Symptômes Observés

1. ✅ Indicateur "Online" visible (pastille verte en bas)
2. ❌ Vue "Looking for updates" reste affichée indéfiniment
3. ❌ Spinner tourne en continu
4. ❌ L'app ne passe jamais à l'écran suivant

### Cause Racine Identifiée

**PROBLÈME CRITIQUE** : La fonction `check()` de `@tauri-apps/plugin-updater` **n'a pas de timeout** et peut rester bloquée indéfiniment.

#### Code Problématique (ligne 71 de `useUpdater.js`)

```70:84:src/hooks/system/useUpdater.js
    try {
      const update = await check();
      
      // Reset retry count on success
      retryCountRef.current = 0;
      lastCheckTimeRef.current = Date.now();
      isCheckingRef.current = false;
      
      if (update) {
        setUpdateAvailable(update);
        return update;
      } else {
        setUpdateAvailable(null);
        return null;
      }
    }
```

**Problème** :
- ❌ `await check()` peut rester bloqué **indéfiniment** si :
  - L'endpoint GitHub ne répond pas
  - La connexion réseau est lente ou instable
  - Il y a un problème de DNS
  - Le serveur GitHub est surchargé
  - Un firewall bloque la requête silencieusement

- ❌ Si `check()` ne se résout jamais :
  - `isChecking` reste à `true` → Vue reste affichée
  - `isCheckingRef.current` reste à `true` → Aucune nouvelle vérification possible
  - L'app est bloquée indéfiniment

---

## 🔬 Scénarios de Blocage Possibles

### Scénario 1 : Endpoint GitHub Inaccessible

**URL configurée** :
```
https://github.com/pollen-robotics/reachy-mini-desktop-app/releases/latest/download/latest.json
```

**Causes possibles** :
- GitHub API rate limit
- Problème de certificat SSL
- Firewall d'entreprise bloquant GitHub
- Problème DNS local

### Scénario 2 : Requête HTTP qui Ne Se Résout Jamais

- Timeout réseau non configuré dans Tauri
- Connexion qui reste en attente
- Pas de mécanisme d'annulation

### Scénario 3 : Erreur Silencieuse

- Erreur qui ne déclenche pas le `catch`
- Promesse qui reste en attente
- Pas de timeout pour forcer la résolution

---

## 📊 Flux Actuel (Problématique)

```
1. App démarre
   ↓
2. useUpdater initialisé (autoCheck = true)
   ↓
3. Délai de 2s (STARTUP_DELAY)
   ↓
4. checkForUpdates() appelé
   ↓
5. isChecking = true
   isCheckingRef.current = true
   ↓
6. await check() ← BLOQUÉ ICI INDÉFINIMENT
   ↓
7. ❌ isChecking reste à true
   ❌ Vue reste affichée
   ❌ App bloquée
```

---

## ✅ Solution Proposée

### Solution 1 : Ajouter un Timeout sur `check()`

**Implémentation** : Wrapper `check()` avec `Promise.race()` et un timeout

```javascript
const checkForUpdates = useCallback(async (retryCount = 0) => {
  // ... code existant ...
  
  isCheckingRef.current = true;
  setIsChecking(true);
  setError(null);

  // ✅ AJOUT : Timeout de 30 secondes pour check()
  const CHECK_TIMEOUT = 30000; // 30 secondes
  
  try {
    const update = await Promise.race([
      check(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Update check timeout after 30s')), CHECK_TIMEOUT)
      )
    ]);
    
    // ... reste du code ...
  } catch (err) {
    // Gérer le timeout comme une erreur récupérable
    // ... code existant ...
  }
}, [maxRetries, retryDelay, isRecoverableError, sleep]);
```

### Solution 2 : Timeout Configurable

Ajouter dans `DAEMON_CONFIG` :

```javascript
UPDATE_CHECK: {
  INTERVAL: 3600000,
  STARTUP_DELAY: 2000,
  RETRY_DELAY: 1000,
  CHECK_TIMEOUT: 30000, // ✅ NOUVEAU : Timeout de 30s pour check()
},
```

### Solution 3 : Fallback avec Timeout Progressif

Si le timeout est atteint, afficher un message d'erreur et permettre de continuer :

```javascript
// Après timeout, permettre à l'utilisateur de continuer
if (error && error.message.includes('timeout')) {
  // Afficher message : "Update check is taking longer than expected. Continue anyway?"
  // Option pour continuer sans mise à jour
}
```

---

## 🔧 Code de Correction Recommandé

### Modification de `useUpdater.js`

```javascript
const checkForUpdates = useCallback(async (retryCount = 0) => {
  // ... code existant jusqu'à ligne 68 ...
  
  isCheckingRef.current = true;
  setIsChecking(true);
  setError(null);

  // ✅ AJOUT : Timeout pour éviter le blocage indéfini
  const CHECK_TIMEOUT = DAEMON_CONFIG.UPDATE_CHECK.CHECK_TIMEOUT || 30000;
  let timeoutId = null;

  try {
    // Wrapper check() avec timeout
    const checkPromise = check();
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('Update check timeout: The update server did not respond within 30 seconds. Please check your internet connection.'));
      }, CHECK_TIMEOUT);
    });

    const update = await Promise.race([checkPromise, timeoutPromise]);
    
    // Clear timeout si succès
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    
    // Reset retry count on success
    retryCountRef.current = 0;
    lastCheckTimeRef.current = Date.now();
    isCheckingRef.current = false;
    
    if (update) {
      setUpdateAvailable(update);
      return update;
    } else {
      setUpdateAvailable(null);
      setIsChecking(false); // ✅ IMPORTANT : S'assurer que isChecking est false
      return null;
    }
  } catch (err) {
    // Clear timeout en cas d'erreur
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    
    // Extract error message
    const errorMessage = extractErrorMessage(err);
    const errorString = errorMessage.toLowerCase();
    
    // ✅ Détecter les timeouts comme erreurs récupérables
    const isTimeout = errorString.includes('timeout') || 
                      errorString.includes('did not respond');
    
    // ... reste du code de gestion d'erreur ...
    
    // ✅ IMPORTANT : Toujours remettre isChecking à false
    isCheckingRef.current = false;
    setIsChecking(false);
    
    // Si timeout, traiter comme erreur récupérable
    if (isTimeout && retryCount < maxRetries) {
      const delay = retryDelay * Math.pow(2, retryCount);
      console.log(`🔄 Retrying after timeout in ${delay}ms... (${retryCount + 1}/${maxRetries})`);
      await sleep(delay);
      retryCountRef.current = retryCount + 1;
      return checkForUpdates(retryCount + 1);
    }
    
    // ... reste du code ...
  }
}, [maxRetries, retryDelay, isRecoverableError, sleep]);
```

### Modification de `daemon.js`

```javascript
UPDATE_CHECK: {
  INTERVAL: 3600000,            // Check for updates every hour (1h)
  STARTUP_DELAY: 2000,          // Delay before first check on startup (2s)
  RETRY_DELAY: 1000,            // Delay between retry attempts (1s)
  CHECK_TIMEOUT: 30000,         // ✅ NOUVEAU : Timeout for check() call (30s)
},
```

---

## 🧪 Tests à Effectuer

### Test 1 : Timeout Normal
1. Simuler un timeout (désactiver internet temporairement)
2. Vérifier que l'erreur est affichée après 30s
3. Vérifier que `isChecking` passe à `false`
4. Vérifier que la vue se masque après le temps minimum

### Test 2 : Retry après Timeout
1. Simuler un timeout
2. Vérifier que le retry se déclenche
3. Vérifier que le nombre de retries est respecté

### Test 3 : Succès Rapide
1. Avec internet fonctionnel
2. Vérifier que la vérification se termine rapidement
3. Vérifier que le timeout n'interfère pas

### Test 4 : Blocage Résolu
1. Installer l'app sur macOS
2. Vérifier que la vue ne reste plus bloquée
3. Vérifier que l'app continue même si la vérification échoue

---

## 📋 Checklist de Correction

- [ ] Ajouter `CHECK_TIMEOUT` dans `DAEMON_CONFIG`
- [ ] Wrapper `check()` avec `Promise.race()` et timeout
- [ ] Gérer les timeouts comme erreurs récupérables
- [ ] S'assurer que `isChecking` est toujours remis à `false`
- [ ] Tester sur macOS avec différentes conditions réseau
- [ ] Ajouter des logs pour diagnostiquer les timeouts
- [ ] Vérifier que les retries fonctionnent après timeout

---

## 🎯 Points Critiques à Vérifier

1. **Toujours remettre `isChecking` à `false`** :
   - En cas de succès
   - En cas d'erreur
   - En cas de timeout
   - Dans le `finally` si possible

2. **Gérer les timeouts proprement** :
   - Nettoyer les timeouts
   - Ne pas laisser de timers actifs
   - Gérer les AbortError correctement

3. **Permettre la continuation** :
   - Même si la vérification échoue
   - Après le temps minimum d'affichage
   - Avec un message d'erreur clair

---

## 🔍 Debugging Additionnel

### Logs à Ajouter

```javascript
console.log('🔄 Starting update check...');
console.log('⏱️ Timeout set to:', CHECK_TIMEOUT, 'ms');
console.log('✅ Update check completed');
console.log('❌ Update check failed:', errorMessage);
console.log('⏱️ Update check timeout');
```

### Vérifications à Faire

1. **Console du navigateur** : Vérifier les logs de `checkForUpdates()`
2. **Network tab** : Vérifier si la requête vers GitHub est envoyée
3. **État React** : Vérifier que `isChecking` change bien
4. **Timers actifs** : Vérifier qu'il n'y a pas de timers qui restent actifs

---

## 📝 Notes Supplémentaires

### Pourquoi l'Indicateur "Online" Fonctionne

L'indicateur "Online" utilise `useInternetHealthcheck` qui :
- ✅ A un timeout de 5 secondes
- ✅ Utilise `fetchExternal` avec timeout
- ✅ Gère les erreurs proprement
- ✅ Ne bloque pas l'app

**Conclusion** : L'indicateur peut être "Online" alors que `check()` de Tauri reste bloqué car ce sont deux mécanismes différents.

### Différence entre les Deux Vérifications

1. **`useInternetHealthcheck`** :
   - Vérifie `https://httpbin.org/status/200`
   - Timeout de 5s
   - Fonctionne correctement

2. **`check()` de Tauri** :
   - Vérifie `https://github.com/.../latest.json`
   - **PAS de timeout** ← PROBLÈME
   - Peut rester bloqué indéfiniment

---

**Rapport généré le**: 2024  
**Priorité**: 🔴 CRITIQUE - Bloque l'utilisation de l'app sur macOS

