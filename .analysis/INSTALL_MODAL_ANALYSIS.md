# Analyse de la Modale d'Installation

## 📊 Vue d'ensemble des États

### États du Store (Zustand)

| État | Type | Valeurs possibles | Description |
|------|------|-------------------|-------------|
| `installingAppName` | `string \| null` | `null` ou nom de l'app | Nom de l'application en cours d'installation/désinstallation |
| `installJobType` | `string \| null` | `'install'` ou `'remove'` | Type d'opération en cours |
| `installResult` | `string \| null` | `null`, `'success'`, `'failed'` | Résultat final de l'opération |
| `installStartTime` | `number \| null` | Timestamp (ms) ou `null` | Moment où l'installation a commencé |
| `jobSeenOnce` | `boolean` | `true` ou `false` | Flag indiquant si le job a été vu au moins une fois dans `activeJobs` |
| `processedJobs` | `string[]` | Array de clés `"appName_jobType"` | Liste des jobs déjà traités (évite les boucles infinies) |
| `isInstalling` | `boolean` | `true` ou `false` | Flag global (dérivé de `robotStatus === 'busy' && busyReason === 'installing'`) |

### États dérivés dans les composants

| Variable | Calcul | Description |
|----------|--------|-------------|
| `isShowingResult` | `resultState !== null` | Indique si on affiche le résultat final (success/failed) |
| `isInstalling` | `jobType === 'install'` | Distingue installation vs désinstallation dans l'UI |
| `elapsedTime` | `Date.now() - startTime` (mise à jour chaque seconde) | Temps écoulé depuis le début (continue même après success) |

---

## ⏱️ Timings et Délais

### Configuration (`DAEMON_CONFIG`)

```javascript
APP_INSTALLATION: {
  RESULT_DISPLAY_DELAY: 3000,   // 3s - Délai avant fermeture après affichage du résultat
  HANDLER_DELAY: 500,            // 500ms - Délai dans les handlers
  REFRESH_DELAY: 500,            // 500ms - Délai avant refresh de la liste
}

MIN_DISPLAY_TIMES: {
  APP_UNINSTALL: 4000,          // 4s - Temps minimum d'affichage pour uninstall
}
```

### Timings dans `useAppInstallation`

| Timing | Valeur | Contexte |
|--------|--------|----------|
| **Minimum display time (uninstall)** | `4000ms` (4s) | Temps minimum avant de considérer l'uninstall terminé |
| **Minimum display time (install)** | `0ms` | Pas de minimum pour install |
| **Polling interval** | `500ms` | Intervalle entre vérifications si l'app apparaît dans la liste |
| **Max polling attempts** | `30` | Maximum 30 tentatives = 15s max de polling |
| **Refresh interval** | `2000ms` (4 × 500ms) | Refresh de la liste toutes les 2s pendant le polling |
| **Result display delay** | `3000ms` (3s) | Temps d'affichage du résultat (success/failed) avant fermeture |

### Timer dans `InstallOverlay`

| Timer | Fréquence | Comportement |
|-------|-----------|--------------|
| **Elapsed time** | `1000ms` (1s) | Continue de compter même après `resultState === 'success'` |

---

## 🔄 Flux d'États

### 1. Démarrage de l'installation

```
User clicks "Install" 
  → handleInstall(appInfo)
    → lockForInstall(appName, 'install')
      → Store: installingAppName = appName
      → Store: installJobType = 'install'
      → Store: installResult = null
      → Store: installStartTime = Date.now()
      → Store: jobSeenOnce = false
      → Store: processedJobs = [] (cleared for this job)
      → Store: robotStatus = 'busy', busyReason = 'installing'
    → installApp(appInfo) [API call]
      → Returns job_id
```

### 2. Pendant l'installation (Progress)

```
useAppInstallation effect runs:
  → Check if installingAppName exists
  → Find job in activeJobs
  → If job found: markJobAsSeen() → jobSeenOnce = true
  → If job not found AND jobSeenOnce === true: jobWasRemoved = true
  → If job.status === 'completed' || 'failed': jobIsCompleted = true
  
InstallOverlay displays:
  → isShowingResult = false (resultState === null)
  → Icon: App emoji with pulse animation
  → Title: "Installing {appName}"
  → Elapsed time: counting up
  → Steps: "step {logCount}"
  → Logs: last 5 logs from jobInfo
```

### 3. Détection de la fin

```
Condition: jobWasRemoved OR jobIsCompleted

If jobWasRemoved:
  → jobFound === null
  → installStartTime !== null
  → jobSeenOnce === true

If jobIsCompleted:
  → jobFound.status === 'completed' || 'failed'
```

### 4. Détection du résultat (success/failed)

```javascript
// Priorité 1: Status explicite
if (jobFound?.status === 'completed') → wasCompleted = true
if (jobFound?.status === 'failed') → wasFailed = true

// Priorité 2: Analyse des logs
if (logs.includes('Successfully installed')) → wasCompleted = true
if (logs.includes('Failed') || logs.includes('Error:')) → wasFailed = true

// Priorité 3: Par défaut
if (jobWasRemoved && no logs) → wasCompleted = true (succès par défaut)
```

### 5. Affichage du résultat

#### Pour UNINSTALL ou INSTALL FAILED:
```
→ setInstallResult('success' ou 'failed')
→ Wait RESULT_DISPLAY_DELAY (3s)
→ unlockInstall() → Ferme la modale
→ Show toast
```

#### Pour INSTALL SUCCESS:
```
→ Calculate remainingTime = max(0, MINIMUM_DISPLAY_TIME - elapsedTime)
  → Uninstall: 4000ms minimum
  → Install: 0ms (pas de minimum)

→ If remainingTime > 0:
  → Wait remainingTime
  → Then: waitForAppThenClose()

→ waitForAppThenClose():
  → Refresh apps list
  → Start polling (500ms interval, max 30 attempts = 15s)
  → Check: isAppInInstalledList(installingAppName)
  
  → If app found in list:
    → setInstallResult('success')
    → Wait RESULT_DISPLAY_DELAY (3s)
    → unlockInstall() → Ferme la modale
    → Show toast
    
  → If timeout (15s):
    → setInstallResult('success') anyway
    → Wait RESULT_DISPLAY_DELAY (3s)
    → unlockInstall() → Ferme la modale
    → Show toast
```

### 6. État final (Success/Failed)

```
InstallOverlay displays:
  → isShowingResult = true (resultState !== null)
  → Icon: CheckCircle (green) ou ErrorOutline (red)
  → Title: "Installation Complete!" ou "Installation Failed"
  → Elapsed time: continue counting (affiche le temps total)
  → Steps: hidden
  → Logs: still visible (last 5 logs)
  → Description: hidden
```

---

## 🎯 Points d'Attention / Complexités

### ⚠️ Problèmes potentiels

1. **Race condition avec `processedJobs`**
   - Un job peut être marqué comme "processed" avant d'être réellement terminé
   - Solution: `markJobAsProcessed()` appelé immédiatement après détection de fin

2. **Polling pour vérifier l'app dans la liste**
   - Peut prendre jusqu'à 15s (30 × 500ms)
   - Si l'app n'apparaît pas, on affiche success quand même (peut être trompeur)

3. **Timer continue après success**
   - `elapsedTime` continue de compter même après `resultState === 'success'`
   - Peut être confus pour l'utilisateur

4. **Minimum display time pour uninstall**
   - 4s minimum même si l'uninstall est instantané
   - Peut ralentir l'UX inutilement

5. **Logique de détection du résultat**
   - 3 niveaux de priorité (status → logs → default)
   - Par défaut = success si job disparaît proprement
   - Peut masquer des erreurs silencieuses

### ✅ Points positifs

1. **Protection contre les boucles infinies**
   - `processedJobs` évite de re-traiter le même job
   - `jobSeenOnce` évite de considérer un job comme "removed" avant de l'avoir vu

2. **UX fluide**
   - Logs visibles même en success state
   - Timer continue pour montrer le temps total
   - Auto-scroll des logs

3. **Gestion des erreurs**
   - Détection multiple (status, logs, default)
   - Toast notifications pour feedback utilisateur

---

## 📝 Recommandations

### Clarté du code

1. **Documenter les timings critiques**
   - Ajouter des commentaires expliquant pourquoi 4s pour uninstall
   - Expliquer la logique de polling (15s max)

2. **Simplifier la détection du résultat**
   - Prioriser le status explicite
   - Logs en fallback uniquement
   - Éviter le "default = success"

3. **Améliorer le feedback utilisateur**
   - Afficher "Waiting for app to appear in list..." pendant le polling
   - Indiquer le nombre de tentatives restantes

4. **Gérer les edge cases**
   - Que faire si l'app apparaît puis disparaît de la liste?
   - Que faire si le job disparaît avant d'être vu (`jobSeenOnce === false`)?

### Améliorations possibles

1. **Réduire le minimum display time pour uninstall**
   - 4s peut être trop long
   - Peut-être 2s serait suffisant

2. **Timeout plus court pour le polling**
   - 15s peut être long
   - Peut-être 10s (20 tentatives) serait suffisant

3. **Meilleure gestion des erreurs silencieuses**
   - Ne pas assumer success par défaut
   - Logger un warning si on assume success sans preuve

---

## 🔍 Checklist de Clarté

- [x] **États bien définis** - Oui, mais nombreux (7 états)
- [x] **Timings documentés** - Oui, dans `DAEMON_CONFIG`
- [x] **Flux d'états clair** - Partiellement, la logique de polling est complexe
- [x] **Gestion d'erreurs** - Oui, mais "default = success" peut masquer des bugs
- [x] **Protection contre les boucles** - Oui, avec `processedJobs`
- [ ] **Feedback utilisateur pendant polling** - Non, pas d'indication
- [ ] **Documentation inline** - Partielle, certains timings manquent d'explication

**Verdict**: Le code fonctionne mais la logique est **complexe** avec plusieurs niveaux de détection et de timing. La modale elle-même est claire, mais la logique sous-jacente dans `useAppInstallation` mériterait d'être simplifiée et mieux documentée.

