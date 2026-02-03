# Améliorations du système de diagnostic

## 🎯 Objectifs

Cette PR améliore le système de génération de rapports de diagnostic en :
1. Utilisant le plugin OS de Tauri pour obtenir de vraies informations système
2. Passant sur le système de toast unifié existant pour les notifications

## ✨ Changements apportés

### 1. Ajout du plugin OS de Tauri

**Dépendances ajoutées :**
- `@tauri-apps/plugin-os` (npm)
- `tauri-plugin-os` (Cargo)

**Configuration :**
- Mise à jour de `src-tauri/Cargo.toml` pour ajouter la dépendance Rust
- Mise à jour de `src-tauri/src/lib.rs` pour initialiser le plugin
- Mise à jour de `package.json` avec la dépendance npm

### 2. Amélioration de la collecte d'informations système

**Avant :**
```javascript
// Utilisation de navigator.userAgent et navigator.platform
// Ces valeurs sont souvent cachées/faussées par les navigateurs
userAgent: navigator.userAgent,
platform: navigator.platform,
```

**Après :**
```javascript
// Utilisation du plugin OS de Tauri pour des informations fiables
info.os = {
  type: await os.type(),        // 'macos' | 'windows' | 'linux'
  version: await os.version(),  // Version réelle de l'OS
  arch: await os.arch(),        // Architecture CPU (aarch64, x86_64, etc.)
  platform: await os.platform(), // Informations de plateforme
  locale: await os.locale(),    // Locale système
  hostname: await os.hostname(), // Nom de l'hôte (si disponible)
};
```

### 3. Migration vers le système de toast unifié

**Avant :**
```javascript
// Notifications DOM créées manuellement
const notification = document.createElement('div');
notification.textContent = '📋 Generating diagnostic report...';
notification.style.cssText = `...`;
document.body.appendChild(notification);
```

**Après :**
```javascript
// Utilisation du système de toast global Zustand
const store = useAppStore.getState();
const showToast = store.showToast;
showToast('📋 Generating diagnostic report...', 'info');
showToast(`✅ Downloaded: ${result.filename}`, 'success');
```

## 🔍 Avantages

### Informations système fiables
- **Avant** : Le navigateur peut masquer ou falsifier les informations système (userAgent spoofing)
- **Après** : Tauri OS plugin accède directement aux APIs système pour des informations authentiques

### Cohérence de l'UI
- **Avant** : Notifications DOM custom avec style inline, z-index élevé
- **Après** : Utilisation du composant Toast unifié avec :
  - Glassmorphism design cohérent
  - Support dark/light mode
  - Animation de progression
  - Gestion centralisée via Zustand

### Maintenance simplifiée
- Code plus maintenable et consistant
- Pas de duplication de logique de notification
- Meilleure intégration avec l'architecture existante

## 📋 Format du rapport amélioré

Le rapport de diagnostic affiche maintenant :

```
📍 SYSTEM INFO
───────────────────────────────────────────────────────────────────
  Generated: 2/3/2026, 10:30:45 AM
  Timezone: Europe/Paris
  App Version: 0.9.19
  OS Type: macos
  OS Version: 14.1.0
  Architecture: aarch64
  Platform: darwin
  Locale: fr-FR
  Hostname: MacBook-Pro.local
  Screen: 1920x1080
  Window: 1440x900
  User Agent: Mozilla/5.0... (pour débogage legacy)
```

## 🧪 Tests

### Raccourci clavier (Cmd+Shift+D / Ctrl+Shift+D)
1. Appuyer sur le raccourci
2. Un toast "Generating diagnostic report..." apparaît
3. Le fichier `.txt` est téléchargé
4. Un toast de succès apparaît avec le nom du fichier

### Console développeur
```javascript
// Ces fonctions sont toujours disponibles
window.reachyDiagnostic.generate()     // Générer le rapport
window.reachyDiagnostic.download()     // Télécharger JSON
window.reachyDiagnostic.downloadText() // Télécharger TXT
window.reachyDiagnostic.copy()         // Copier dans le presse-papiers
```

## 🔄 Compatibilité

- ✅ **Mode Tauri** : Utilise le plugin OS pour les vraies informations
- ✅ **Mode Web** : Fallback gracieux vers navigator (avec warning dans la console)
- ✅ **Mode Développement** : Toutes les fonctionnalités fonctionnent
- ✅ **Cross-platform** : macOS, Windows, Linux

## 📝 Fichiers modifiés

- `package.json` - Ajout de `@tauri-apps/plugin-os`
- `src-tauri/Cargo.toml` - Ajout de `tauri-plugin-os`
- `src-tauri/src/lib.rs` - Initialisation du plugin
- `src/utils/diagnosticExport.js` - Refactoring complet
  - Utilisation du plugin OS
  - Migration vers le système de toast
  - Amélioration du formatage des rapports

## 🚀 Prochaines étapes possibles

- [ ] Ajouter plus d'informations système (mémoire, CPU, etc.)
- [ ] Exporter les rapports au format Markdown
- [ ] Intégrer avec un système de support/ticketing
- [ ] Ajouter des statistiques d'utilisation de l'app

---

**Note** : Ces améliorations rendent le système de diagnostic plus robuste et cohérent avec l'architecture existante de l'application.
