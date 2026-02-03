# Guide de test - Améliorations du système de diagnostic

## 🎯 Objectif

Valider que les améliorations du système de diagnostic fonctionnent correctement :
- Plugin OS de Tauri actif et fournit les bonnes informations
- Système de toast unifié fonctionne pour les notifications
- Rapports de diagnostic contiennent les bonnes informations

## 🛠️ Prérequis

1. Build de l'application Tauri
2. **Application lancée en MODE TAURI** (pas en mode web !)

### ⚠️ CRITIQUE : Mode Tauri requis

Le plugin OS de Tauri **ne fonctionne PAS en mode web** (`yarn dev`).

```bash
# ✅ CORRECT - Plugin OS actif
source ~/.nvm/nvm.sh && nvm use --lts
yarn tauri:dev

# ❌ INCORRECT - Plugin OS inactif (fallback)
yarn dev
```

Si vous testez en mode web, vous obtiendrez :
- `OS Type: unknown`
- `OS Version: N/A`  
- `Architecture: N/A`

**C'est le comportement de fallback attendu !** Le plugin n'est disponible qu'en mode Tauri.

## 📋 Tests à effectuer

### Test 1 : Raccourci clavier (Cmd+Shift+D / Ctrl+Shift+D)

**Étapes :**
1. Lancer l'application
2. Appuyer sur `Cmd+Shift+D` (macOS) ou `Ctrl+Shift+D` (Windows/Linux)

**Résultat attendu :**
- ✅ Un toast apparaît en bas de l'écran : "📋 Generating diagnostic report..."
- ✅ Le fichier `reachy-mini-diagnostic-YYYY-MM-DDTHH-MM-SS.txt` est téléchargé
- ✅ Un toast de succès apparaît : "✅ Downloaded: reachy-mini-diagnostic-YYYY-MM-DDTHH-MM-SS.txt"
- ✅ Le toast utilise le style unifié de l'app (glassmorphism, couleurs cohérentes)
- ❌ AUCUNE notification DOM manuelle ne doit apparaître

**Comparaison avant/après :**
- **Avant** : Notification noire en bas à droite avec style inline
- **Après** : Toast unifié au centre en bas, avec design cohérent

### Test 2 : Console développeur

**Étapes :**
1. Ouvrir la console développeur (F12)
2. Taper : `await window.reachyDiagnostic.generate()`

**Résultat attendu :**
```javascript
{
  _meta: { version: '1.0', ... },
  system: {
    timestamp: "2026-02-03T...",
    appVersion: "0.9.19",
    os: {
      type: "macos",        // ✅ Pas "Mac OS X 10_15_7" du userAgent
      version: "14.1.0",    // ✅ Version réelle de l'OS
      arch: "aarch64",      // ✅ Architecture réelle
      platform: "darwin",   // ✅ Plateforme réelle
      locale: "fr-FR",      // ✅ Locale système
      hostname: "..."       // ✅ Nom de l'hôte (si disponible)
    },
    browser: {              // ✅ Gardé pour debug legacy
      userAgent: "...",
      platform: "..."
    }
  },
  robot: { ... },
  apps: { ... },
  logs: { ... }
}
```

### Test 3 : Vérifier les informations système

**Étapes :**
1. Télécharger un rapport de diagnostic (Cmd+Shift+D)
2. Ouvrir le fichier `.txt` téléchargé
3. Vérifier la section "📍 SYSTEM INFO"

**Résultat attendu :**
```
📍 SYSTEM INFO
───────────────────────────────────────────────────────────────────
  Generated: 2/3/2026, 10:30:45 AM
  Timezone: Europe/Paris
  App Version: 0.9.19
  OS Type: macos                    ✅ 'macos' | 'windows' | 'linux'
  OS Version: 14.1.0                ✅ Version réelle de macOS Sonoma
  Architecture: aarch64             ✅ ARM64 (Apple Silicon)
  Platform: darwin                  ✅ Plateforme réelle
  Locale: fr-FR                     ✅ Locale système
  Hostname: MacBook-Pro.local       ✅ Nom de l'hôte (si disponible)
  Screen: 1920x1080
  Window: 1440x900
  User Agent: Mozilla/5.0...        ✅ Gardé pour debug
```

**Vérifications spécifiques :**
- ✅ OS Type doit être `macos`, `windows`, ou `linux` (pas de parsing manuel de userAgent)
- ✅ OS Version doit être la version réelle (pas `10.0` pour Windows 11)
- ✅ Architecture doit être `aarch64` (Apple Silicon) ou `x86_64` (Intel)
- ✅ Locale doit correspondre à la locale système (pas du navigateur)

### Test 4 : Toasts multiples (debouncing)

**Étapes :**
1. Appuyer plusieurs fois rapidement sur `Cmd+Shift+D`

**Résultat attendu :**
- ✅ Les toasts s'enchaînent correctement sans se superposer
- ✅ Chaque toast apparaît avec une animation fluide
- ✅ Le système de toast gère correctement les messages multiples

### Test 5 : Mode Web (fallback)

**Étapes :**
1. Ouvrir l'application en mode web (si possible, via `npm run dev`)
2. Essayer de générer un rapport : `await window.reachyDiagnostic.generate()`

**Résultat attendu :**
- ✅ Un warning apparaît dans la console : "⚠️ Tauri OS plugin not available..."
- ✅ Le rapport est quand même généré avec des données de fallback
- ✅ `os.type` = 'unknown', `os.version` = 'N/A', etc.
- ✅ Les informations du navigateur sont utilisées en fallback

### Test 6 : Copie dans le presse-papiers

**Étapes :**
1. Console développeur : `await window.reachyDiagnostic.copy()`
2. Coller le contenu du presse-papiers (Cmd+V / Ctrl+V)

**Résultat attendu :**
- ✅ Le rapport JSON complet est copié dans le presse-papiers
- ✅ Le JSON est valide et formaté correctement

## 🔍 Comparaison avant/après

### Informations système

| Aspect | Avant (navigator) | Après (Tauri OS) |
|--------|-------------------|------------------|
| OS Type | "Mac OS X" (parsing UA) | "macos" (API système) |
| OS Version | "10_15_7" (parsing UA) | "14.1.0" (API système) |
| Architecture | Non disponible | "aarch64" (API système) |
| Locale | Langue navigateur | Locale système réelle |
| Hostname | Non disponible | "MacBook-Pro.local" |
| Fiabilité | ⚠️ Peut être falsifié | ✅ Authentique |

### Système de notifications

| Aspect | Avant | Après |
|--------|-------|-------|
| Style | DOM manuel, style inline | Toast unifié Zustand |
| Position | Bas droite (hardcodé) | Bas centre (cohérent) |
| Design | Noir simple | Glassmorphism, couleurs |
| Dark mode | Non supporté | ✅ Supporté |
| Animation | Fade simple | Progress bar + fade |
| Cohérence | ❌ Différent du reste | ✅ Unifié avec l'app |

## ✅ Checklist de validation

- [ ] Build réussi (JavaScript)
- [ ] Build réussi (Rust)
- [ ] Raccourci clavier fonctionne
- [ ] Toast apparaît avec le bon style
- [ ] Fichier téléchargé contient les bonnes infos OS
- [ ] OS Type est correct (`macos` / `windows` / `linux`)
- [ ] OS Version est la version réelle de l'OS
- [ ] Architecture est correcte (`aarch64` / `x86_64`)
- [ ] Locale système est correcte
- [ ] Mode Web (fallback) fonctionne
- [ ] Copie dans le presse-papiers fonctionne
- [ ] Pas de notifications DOM manuelles

## 🐛 Problèmes connus potentiels

### macOS
- ✅ Plugin OS fonctionne nativement
- ⚠️ Hostname peut être `N/A` selon les permissions

### Windows
- ✅ Plugin OS fonctionne
- ⚠️ Vérifier que la version Windows est correcte (pas `10.0` pour Windows 11)

### Linux
- ✅ Plugin OS fonctionne
- ⚠️ Hostname peut nécessiter des permissions spéciales

## 📝 Notes

- Le fichier `diagnosticExport.js` est auto-importé dans `App.jsx`
- Le raccourci clavier est automatiquement configuré au chargement de l'app
- Les fonctions sont exposées dans `window.reachyDiagnostic` pour accès manuel

## 🚀 Commandes utiles

```bash
# Build de l'application
npm run build

# Vérification Rust
cd src-tauri && cargo check

# Lancer en dev
npm run tauri:dev

# Tester dans la console
await window.reachyDiagnostic.generate()       # Voir le rapport
await window.reachyDiagnostic.downloadText()   # Télécharger TXT
await window.reachyDiagnostic.downloadJson()   # Télécharger JSON
await window.reachyDiagnostic.copy()           # Copier dans presse-papiers
```

---

**Note** : Si tous les tests passent, la PR est prête à être mergée ! 🎉
