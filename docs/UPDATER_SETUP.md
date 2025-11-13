# Configuration du Système de Mise à Jour Tauri

Ce document explique comment configurer et utiliser le système de mise à jour automatique de l'application.

## Architecture

Le système utilise le plugin officiel `@tauri-apps/plugin-updater` qui permet :
- ✅ Vérification automatique des mises à jour
- ✅ Téléchargement et installation automatiques
- ✅ Signature cryptographique pour la sécurité
- ✅ Redémarrage automatique après installation

## Configuration Initiale

### 1. Générer les clés de signature

**⚠️ IMPORTANT :** Les clés de signature sont essentielles pour la sécurité. La clé privée doit rester secrète.

```bash
# Générer une paire de clés (à faire une seule fois)
yarn tauri signer generate -w ~/.tauri/reachy-mini.key

# Cette commande génère :
# - ~/.tauri/reachy-mini.key (clé privée - À PROTÉGER)
# - ~/.tauri/reachy-mini.key.pub (clé publique - à ajouter dans tauri.conf.json)
```

### 2. Configurer la clé publique

Ajoutez la clé publique dans `src-tauri/tauri.conf.json` :

```json
{
  "plugins": {
    "updater": {
      "active": true,
      "endpoints": [
        "https://votre-serveur.com/releases/{{target}}/{{current_version}}"
      ],
      "dialog": true,
      "pubkey": "VOTRE_CLE_PUBLIQUE_ICI"
    }
  }
}
```

### 3. Configurer le serveur de mises à jour

Le système de mise à jour nécessite un serveur qui expose un endpoint JSON avec les informations de mise à jour.

#### Format de réponse attendu

```json
{
  "version": "0.2.0",
  "notes": "Corrections de bugs et améliorations",
  "pub_date": "2024-01-15T10:00:00Z",
  "platforms": {
    "darwin-x86_64": {
      "signature": "signature_base64",
      "url": "https://votre-serveur.com/releases/reachy-mini-control_0.2.0_x64.app.tar.gz"
    },
    "darwin-aarch64": {
      "signature": "signature_base64",
      "url": "https://votre-serveur.com/releases/reachy-mini-control_0.2.0_aarch64.app.tar.gz"
    },
    "windows-x86_64": {
      "signature": "signature_base64",
      "url": "https://votre-serveur.com/releases/reachy-mini-control_0.2.0_x64-setup.exe"
    },
    "linux-x86_64": {
      "signature": "signature_base64",
      "url": "https://votre-serveur.com/releases/reachy-mini-control_0.2.0_amd64.AppImage"
    }
  }
}
```

#### Variables disponibles dans l'endpoint

- `{{target}}` : Triple cible (ex: `darwin-aarch64`, `windows-x86_64`)
- `{{current_version}}` : Version actuelle de l'application

## Workflow de Publication

### 1. Build de la nouvelle version

```bash
# Build de l'application
yarn tauri:build

# Les fichiers seront dans src-tauri/target/release/bundle/
```

### 2. Signer les fichiers de mise à jour

```bash
# Signer chaque fichier de bundle
yarn tauri signer sign ~/.tauri/reachy-mini.key src-tauri/target/release/bundle/macos/Reachy\ Mini\ Control.app.tar.gz

# Cela génère un fichier .sig avec la signature
```

### 3. Uploader les fichiers

1. Uploader les fichiers signés sur votre serveur
2. Créer le fichier JSON de métadonnées avec les signatures
3. Configurer l'endpoint pour servir ce JSON

### 4. Tester la mise à jour

```bash
# En développement, vous pouvez tester avec une version locale
# Modifier temporairement l'endpoint dans tauri.conf.json
```

## Options de Configuration

### Dans `tauri.conf.json`

```json
{
  "plugins": {
    "updater": {
      "active": true,                    // Activer/désactiver le système
      "endpoints": [                     // URLs de vérification (peut être multiple)
        "https://votre-serveur.com/updates"
      ],
      "dialog": true,                    // Afficher un dialogue natif (ou false pour UI custom)
      "pubkey": "VOTRE_CLE_PUBLIQUE",    // Clé publique pour vérification
      "windows": {
        "installMode": "passive"         // Mode d'installation Windows
      }
    }
  }
}
```

### Dans le hook `useUpdater`

```javascript
const {
  updateAvailable,
  isChecking,
  isDownloading,
  downloadProgress,
  error,
  checkForUpdates,
  installUpdate,
  dismissUpdate,
} = useUpdater({
  autoCheck: true,           // Vérifier automatiquement au démarrage
  checkInterval: 3600000,    // Intervalle de vérification (1h par défaut)
  silent: false,             // Mode silencieux (pas de log si pas de mise à jour)
});
```

## Bonnes Pratiques

### Sécurité

1. **Protégez votre clé privée** : Ne la commitez jamais dans Git
2. **HTTPS obligatoire** : Utilisez toujours HTTPS pour les endpoints
3. **Vérification de signature** : Ne désactivez jamais la vérification de signature
4. **Rate limiting** : Limitez les requêtes sur votre serveur de mises à jour

### Expérience Utilisateur

1. **Notifications discrètes** : Informez l'utilisateur sans être intrusif
2. **Mise à jour en arrière-plan** : Téléchargez pendant que l'utilisateur travaille
3. **Choix de l'utilisateur** : Permettez de reporter la mise à jour
4. **Feedback visuel** : Affichez la progression du téléchargement

### Maintenance

1. **Versioning sémantique** : Utilisez Semantic Versioning (MAJOR.MINOR.PATCH)
2. **Notes de version** : Documentez les changements dans `update.body`
3. **Tests** : Testez les mises à jour sur toutes les plateformes
4. **Rollback** : Gardez les anciennes versions disponibles

## Alternatives de Serveur

### Option 1 : GitHub Releases

Vous pouvez utiliser GitHub Releases comme serveur de mises à jour :

```json
{
  "plugins": {
    "updater": {
      "endpoints": [
        "https://api.github.com/repos/votre-org/votre-repo/releases/latest"
      ]
    }
  }
}
```

### Option 2 : Serveur Custom

Créez votre propre serveur qui :
- Héberge les fichiers de mise à jour
- Génère le JSON de métadonnées
- Gère les signatures

### Option 3 : Service Tiers

Services comme :
- [Updatefy](https://updatefy.com/)
- [Electron Updater](https://www.electron.build/auto-update) (compatible avec Tauri)

## Dépannage

### La mise à jour ne se détecte pas

1. Vérifiez que l'endpoint retourne le bon format JSON
2. Vérifiez que la version dans le JSON est supérieure à la version actuelle
3. Vérifiez les logs de l'application

### Erreur de signature

1. Vérifiez que la clé publique dans `tauri.conf.json` correspond à la clé privée utilisée
2. Vérifiez que les fichiers sont bien signés
3. Vérifiez que les signatures sont correctement encodées en base64

### Le téléchargement échoue

1. Vérifiez que les URLs des fichiers sont accessibles
2. Vérifiez les permissions du serveur
3. Vérifiez l'espace disque disponible

## Exemple Complet

Voir `src/hooks/useUpdater.js` et `src/components/UpdateDialog.jsx` pour une implémentation complète.

