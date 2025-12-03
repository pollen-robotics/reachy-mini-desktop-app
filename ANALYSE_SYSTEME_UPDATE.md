# 🔍 Analyse du Système de Mise à Jour Automatique

**Date**: 2024  
**Fichiers analysés**:
- `src/views/update/UpdateView.jsx` - Vue principale "Looking for updates"
- `src/hooks/system/useUpdater.js` - Hook de gestion des mises à jour
- `src/components/App.jsx` - Orchestration de l'affichage
- `src/views/update/hooks/useInternetHealthcheck.js` - Vérification de connectivité

---

## 📋 Vue d'Ensemble

Le système de mise à jour automatique fonctionne en **3 phases principales** :

1. **Vérification automatique au démarrage** (priorité absolue)
2. **Affichage de la vue "Looking for updates"** (minimum 2.5s)
3. **Installation automatique** si une mise à jour est disponible

---

## 🎯 Flux d'Exécution Détaillé

### Phase 1 : Initialisation au Démarrage

#### Dans `App.jsx` (lignes 24-41)

```24:41:src/components/App.jsx
  // 🔄 Automatic update system
  // Tries to fetch latest.json directly - if it works, we have internet + we know if there's an update
  // In dev mode, skip automatic check but still show the view for minimum time
  const isDev = isDevMode();
  const {
    updateAvailable,
    isChecking,
    isDownloading,
    downloadProgress,
    error: updateError,
    checkForUpdates,
    installUpdate,
    dismissUpdate,
  } = useUpdater({
    autoCheck: !isDev, // Disable auto check in dev mode
    checkInterval: DAEMON_CONFIG.UPDATE_CHECK.INTERVAL,
    silent: false,
  });
```

**Comportement** :
- ✅ En **production** : `autoCheck = true` → vérification automatique activée
- ❌ En **dev mode** : `autoCheck = false` → pas de vérification réelle
- ⏱️ Délai avant première vérification : `DAEMON_CONFIG.UPDATE_CHECK.STARTUP_DELAY = 2000ms` (2 secondes)

---

### Phase 2 : Vérification des Mises à Jour

#### Dans `useUpdater.js` (lignes 366-376)

```366:376:src/hooks/system/useUpdater.js
  // Automatic check on startup (with delay to avoid blocking startup)
  useEffect(() => {
    if (autoCheck && !isCheckingRef.current) {
      // Wait for app to be fully loaded before checking
      const timeout = setTimeout(() => {
        checkForUpdates();
      }, DAEMON_CONFIG.UPDATE_CHECK.STARTUP_DELAY);
      
      return () => clearTimeout(timeout);
    }
  }, [autoCheck, checkForUpdates]);
```

**Fonction `checkForUpdates()`** (lignes 49-137) :

1. **Prévention des vérifications multiples** :
   ```javascript
   if (isCheckingRef.current && retryCount === 0) {
     console.warn('⚠️ Update check already in progress, skipping');
     return null;
   }
   ```

2. **Appel à l'API Tauri** :
   ```javascript
   const update = await check(); // @tauri-apps/plugin-updater
   ```

3. **Gestion des erreurs avec retry** :
   - **Max retries** : 3 tentatives
   - **Exponential backoff** : délai = `retryDelay * 2^retryCount`
   - **Erreurs récupérables** : network, timeout, connection
   - **Erreurs non-récupérables** : erreurs serveur, 404 (dev mode)

4. **Détection du mode dev** :
   ```javascript
   if (isDev && isMissingUpdateServer) {
     console.log('ℹ️ Update server not available (dev mode - this is normal)');
     // Pas d'erreur affichée en dev mode
   }
   ```

---

### Phase 3 : Affichage de la Vue "Looking for updates"

#### Priorité dans `App.jsx` (lignes 122-135, 281-298)

```122:135:src/components/App.jsx
  // Determine if UpdateView should be shown (ALWAYS FIRST, before USB)
  // Must be defined before useEffects that use it
  const shouldShowUpdateView = useMemo(() => {
    // Don't show if daemon is active/starting/stopping
    if (isActive || isStarting || isStopping) return false;
    
    // Show if checking, downloading, update available, or error
    if (isChecking || updateAvailable || isDownloading || updateError) return true;
    
    // Show if forced (minimum display time not elapsed yet)
    if (showUpdateViewForced) return true;
    
    return false;
  }, [isActive, isStarting, isStopping, isChecking, updateAvailable, isDownloading, updateError, showUpdateViewForced]);
```

**Conditions d'affichage** :
1. ✅ **PRIORITÉ ABSOLUE** : Toujours affichée en premier, avant la détection USB
2. ✅ Si `isChecking = true` → Affiche "Looking for updates..."
3. ✅ Si `updateAvailable` → Affiche les détails de la mise à jour
4. ✅ Si `isDownloading` → Affiche la barre de progression
5. ✅ Si `updateError` → Affiche le message d'erreur
6. ✅ Si `showUpdateViewForced = true` → Force l'affichage (temps minimum)

**Temps minimum d'affichage** (lignes 72-102) :
```javascript
// Minimum display time: 2.5 secondes
DAEMON_CONFIG.MIN_DISPLAY_TIMES.UPDATE_CHECK = 2500ms
```

---

### Phase 4 : États de la Vue UpdateView

#### État 1 : "Looking for updates..." (lignes 105-135)

```105:135:src/views/update/UpdateView.jsx
        {isChecking && !updateAvailable ? (
          // State: Checking in progress - subtle and centered design
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CircularProgress
              size={28}
              thickness={2.5}
              sx={{
                color: darkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.12)',
                mb: 1.5,
              }}
            />

            <Typography
              sx={{
                fontSize: 12,
                fontWeight: 400,
                color: darkMode ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.35)',
                textAlign: 'center',
                letterSpacing: '0.2px',
              }}
            >
              Looking for updates...
            </Typography>
          </Box>
```

**Caractéristiques** :
- 🔄 Spinner discret (28px, épaisseur 2.5)
- 📝 Texte "Looking for updates..." en gris clair
- ⏱️ Affiché minimum 2.5 secondes (même si la vérification est rapide)

#### État 2 : "Update Available" (lignes 136-240)

Affiché quand `updateAvailable !== null` :
- 📦 Image SVG de la boîte de mise à jour
- 📋 Version et date de la mise à jour
- 📊 Barre de progression (si téléchargement en cours)
- ⚠️ Message d'erreur (si erreur)
- 🔄 Installation automatique après 300ms

**Installation automatique** (lignes 38-47) :
```javascript
useEffect(() => {
  if (updateAvailable && !isDownloading && !updateError && minDisplayTimeElapsed && onInstallUpdate) {
    // Small delay to let UI update
    const installTimer = setTimeout(() => {
      onInstallUpdate();
    }, 300);
    return () => clearTimeout(installTimer);
  }
}, [updateAvailable, isDownloading, updateError, minDisplayTimeElapsed, onInstallUpdate]);
```

#### État 3 : Erreur (lignes 241-306)

Affiché quand `updateError !== null` :
- ⚠️ Icône d'avertissement
- 📝 Message d'erreur adapté (réseau vs autre)
- 🔍 Détection automatique des erreurs réseau

**Détection d'erreur réseau** (lignes 62-82) :
```javascript
const isNetworkError = (error) => {
  const networkKeywords = [
    'network', 'connection', 'internet', 'timeout',
    'fetch', 'could not fetch', 'failed to fetch',
    'unable to check', 'check your internet',
    'no internet', 'offline',
  ];
  return networkKeywords.some(keyword => errorLower.includes(keyword));
};
```

---

## 🌐 Vérification de Connectivité Internet

### Hook `useInternetHealthcheck` (lignes 18-136)

**Approche hybride** :
1. **Détection rapide** : `navigator.onLine` (événements `online`/`offline`)
2. **Vérification fiable** : Requête HTTP vers `https://httpbin.org/status/200`

**Configuration** :
```javascript
{
  interval: 5000,  // Vérification toutes les 5 secondes
  timeout: 3000,   // Timeout de 3 secondes
  endpoint: 'https://httpbin.org/status/200'
}
```

**Logique de détection** :
- ✅ **2 échecs consécutifs** → Marqué comme offline (évite les faux négatifs)
- ✅ **Première vérification** → Marque `hasChecked = true` même en cas d'échec
- ✅ **Mode no-cors** → Évite les problèmes CORS, détecte juste la connectivité

**Indicateur visuel** (lignes 309-352) :
- 🟢 Point vert + "Online" si connecté
- 🔴 Point rouge + "Offline" si déconnecté
- 📍 Position : Bas de l'écran, centré

---

## ⚙️ Configuration Centralisée

### Dans `daemon.js` (lignes 74-79)

```74:79:src/config/daemon.js
  // Update check intervals
  UPDATE_CHECK: {
    INTERVAL: 3600000,            // Check for updates every hour (1h)
    STARTUP_DELAY: 2000,          // Delay before first check on startup (2s)
    RETRY_DELAY: 1000,            // Delay between retry attempts (1s)
  },
```

```67:72:src/config/daemon.js
  // Minimum display times for views (UX smoothness)
  MIN_DISPLAY_TIMES: {
    UPDATE_CHECK: 2500,          // Minimum time to show update check (2.5s)
    USB_CHECK: 2000,              // Minimum time to show USB check (2s)
    USB_CHECK_FIRST: 1500,        // Minimum delay for first USB check (1.5s)
    APP_UNINSTALL: 4000,         // Minimum display time for uninstall result (4s)
  },
```

---

## 🔄 Vérifications Périodiques

### Dans `useUpdater.js` (lignes 378-394)

```378:394:src/hooks/system/useUpdater.js
  // Periodic check (only if no recent check)
  useEffect(() => {
    if (!autoCheck || checkInterval <= 0) return;

    const interval = setInterval(() => {
      // Don't check if a check was done recently (< 5 min)
      const timeSinceLastCheck = lastCheckTimeRef.current 
        ? Date.now() - lastCheckTimeRef.current 
        : Infinity;
      
      if (timeSinceLastCheck > 5 * 60 * 1000) { // 5 minutes
        checkForUpdates();
      }
    }, checkInterval);

    return () => clearInterval(interval);
  }, [autoCheck, checkInterval, checkForUpdates]);
```

**Comportement** :
- ⏰ Vérification toutes les **1 heure** (`checkInterval = 3600000ms`)
- 🚫 **Pas de vérification** si une vérification a eu lieu il y a moins de 5 minutes
- ✅ **Vérification automatique** si la connexion revient (événement `online`)

---

## 📥 Téléchargement et Installation

### Fonction `downloadAndInstall()` (lignes 142-307)

**Étapes** :
1. **Démarrage** : `setIsDownloading(true)`, `setDownloadProgress(0)`
2. **Suivi de progression** :
   - Animation fluide avec `requestAnimationFrame`
   - Mise à jour toutes les 100ms ou si changement ≥ 0.5%
   - Timeout de 60s si pas de progression
3. **Installation** : Appel à `update.downloadAndInstall()`
4. **Redémarrage** : Appel à `relaunch()` après installation

**Gestion d'erreurs** :
- ✅ Retry automatique pour erreurs réseau (max 3 tentatives)
- ✅ Timeout de 60s si téléchargement bloqué
- ✅ Messages d'erreur utilisateur-friendly

---

## 🎨 Interface Utilisateur

### Design de la Vue "Looking for updates"

**Style minimaliste** :
- 🎨 Fond : `rgba(26, 26, 26, 0.95)` (dark) / `rgba(253, 252, 250, 0.85)` (light)
- 🌫️ Backdrop blur : `blur(40px)`
- 🔄 Spinner : 28px, épaisseur 2.5, couleur très discrète
- 📝 Texte : 12px, poids 400, couleur 35% opacity

**Indicateur de connectivité** :
- 📍 Position : Bas de l'écran, centré
- 🟢 Vert : `rgba(34, 197, 94, 0.6)` si online
- 🔴 Rouge : `rgba(239, 68, 68, 0.6)` si offline
- 📝 Texte : "Online" / "Offline" en 12px

---

## 🔍 Points d'Attention et Améliorations Possibles

### ✅ Points Forts

1. **Priorité absolue** : La vérification de mise à jour est toujours en premier
2. **Temps minimum d'affichage** : Évite le "flash" de la vue
3. **Gestion d'erreurs robuste** : Retry avec exponential backoff
4. **Détection de connectivité** : Indicateur visuel clair
5. **Installation automatique** : UX fluide sans intervention utilisateur

### ⚠️ Points à Surveiller

1. **Délai de démarrage** : 2 secondes peuvent sembler long si la connexion est rapide
2. **Vérification périodique** : 1 heure peut être long pour certaines mises à jour critiques
3. **Mode dev** : Pas de vérification réelle, mais la vue s'affiche quand même
4. **Timeout de téléchargement** : 60s peut être court pour des connexions lentes

### 💡 Suggestions d'Amélioration

1. **Vérification plus fréquente** : Option pour vérifier toutes les 15-30 minutes
2. **Notification discrète** : Toast si mise à jour disponible en arrière-plan
3. **Choix utilisateur** : Option pour désactiver l'installation automatique
4. **Progression détaillée** : Afficher la vitesse de téléchargement
5. **Retry intelligent** : Augmenter le timeout pour connexions lentes

---

## 📊 Résumé du Flux Complet

```
1. App démarre
   ↓
2. useUpdater initialisé (autoCheck = true en prod)
   ↓
3. Délai de 2s (STARTUP_DELAY)
   ↓
4. checkForUpdates() appelé
   ↓
5. isChecking = true → UpdateView affichée
   ↓
6. "Looking for updates..." affiché (minimum 2.5s)
   ↓
7. Vérification via @tauri-apps/plugin-updater
   ↓
8a. Si update disponible:
    → updateAvailable = update
    → Affichage "Update Available"
    → Installation automatique après 300ms
    ↓
8b. Si erreur:
    → updateError = message
    → Affichage message d'erreur
    → Retry automatique (max 3 fois)
    ↓
8c. Si pas d'update:
    → updateAvailable = null
    → isChecking = false
    → Masquage après temps minimum (2.5s)
    ↓
9. Vérification périodique (toutes les heures)
```

---

**Rapport généré le**: 2024  
**Version analysée**: 0.2.26

