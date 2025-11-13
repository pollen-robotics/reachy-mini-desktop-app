# Update Pipelines - Dev & Prod

Ce document décrit les pipelines de développement et de production pour les mises à jour automatiques.

## 🏗️ Architecture

### Pipeline de Développement

```
Build App → Sign Bundle → Generate Metadata → Serve Locally → Test
```

### Pipeline de Production

```
Git Tag → CI/CD → Build → Sign → Generate Metadata → Upload → Release
```

## 🚀 Utilisation

### Développement Local

#### 1. Builder une mise à jour de test

```bash
cd tauri-app

# Builder et signer une mise à jour pour dev
yarn build:update:dev

# Ou avec une version spécifique
bash ./scripts/build-update.sh dev 0.2.0
```

Cela va :
- Builder l'app en mode debug
- Créer un archive `.tar.gz` (macOS) ou `.msi` (Windows) ou `.AppImage` (Linux)
- Signer le fichier avec votre clé privée
- Générer le JSON de métadonnées dans `test-updates/`

#### 2. Servir les mises à jour localement

```bash
# Démarrer un serveur HTTP local sur le port 8080
yarn serve:updates

# Ou sur un port personnalisé
bash ./scripts/serve-updates.sh 9000
```

#### 3. Configurer l'app pour utiliser le serveur local

Dans `src-tauri/tauri.conf.json`, configurer l'endpoint :

```json
{
  "plugins": {
    "updater": {
      "endpoints": [
        "http://localhost:8080/darwin-aarch64/0.1.0/update.json"
      ],
      "dangerousInsecureTransportProtocol": true
    }
  }
}
```

#### 4. Tester la mise à jour

```bash
# Lancer l'app en mode dev
yarn tauri:dev

# L'app devrait détecter la mise à jour disponible
```

### Production

#### 1. Préparer la release

```bash
# Mettre à jour la version dans src-tauri/tauri.conf.json
# Puis builder et signer
yarn build:update:prod

# Ou avec une version spécifique
bash ./scripts/build-update.sh prod 0.2.0
```

#### 2. Vérifier les fichiers générés

Les fichiers seront dans `releases/` :
```
releases/
├── darwin-aarch64/
│   └── 0.2.0/
│       └── update.json
├── reachy-mini-control_0.2.0_darwin-aarch64.app.tar.gz
└── reachy-mini-control_0.2.0_darwin-aarch64.app.tar.gz.sig
```

#### 3. Uploader sur le serveur de production

Les fichiers doivent être uploadés sur votre serveur de mises à jour avec la structure :
```
https://releases.example.com/
├── darwin-aarch64/
│   └── 0.1.0/
│       └── update.json
├── darwin-aarch64/
│   └── 0.2.0/
│       └── update.json
├── reachy-mini-control_0.2.0_darwin-aarch64.app.tar.gz
└── ...
```

#### 4. Configurer l'endpoint de production

Dans `src-tauri/tauri.conf.json` :

```json
{
  "plugins": {
    "updater": {
      "endpoints": [
        "https://releases.example.com/{{target}}/{{current_version}}/update.json"
      ],
      "dangerousInsecureTransportProtocol": false
    }
  }
}
```

## 🔄 CI/CD avec GitHub Actions

### Déclencher une release

#### Option 1 : Via un tag Git

```bash
# Créer un tag
git tag v0.2.0
git push origin v0.2.0
```

Le workflow `.github/workflows/release.yml` va automatiquement :
1. Builder l'app pour toutes les plateformes
2. Signer les bundles
3. Générer les métadonnées
4. Créer une release GitHub avec les artefacts

#### Option 2 : Via GitHub Actions UI

1. Aller dans Actions → Release
2. Cliquer sur "Run workflow"
3. Entrer la version (ex: `0.2.0`)
4. Le workflow va builder et créer la release

### Configuration des secrets GitHub

Pour signer les mises à jour en CI, ajouter le secret suivant dans GitHub :

1. Aller dans Settings → Secrets and variables → Actions
2. Ajouter un secret `TAURI_SIGNING_KEY`
3. Y mettre le contenu de votre clé privée (`~/.tauri/reachy-mini.key`)

⚠️ **IMPORTANT** : Ne jamais commiter la clé privée dans Git !

## 📁 Structure des Répertoires

```
tauri-app/
├── releases/              # Mises à jour de production
│   ├── darwin-aarch64/
│   │   └── 0.2.0/
│   │       └── update.json
│   └── reachy-mini-control_0.2.0_*.tar.gz
│
├── test-updates/          # Mises à jour de dev (gitignored)
│   ├── darwin-aarch64/
│   │   └── 0.1.0/
│   │       └── update.json
│   └── reachy-mini-control_0.2.0_*.tar.gz
│
└── scripts/
    ├── build-update.sh    # Script de build et signature
    └── serve-updates.sh   # Script de serveur local
```

## 🔐 Gestion des Clés

### Générer les clés (une seule fois)

```bash
yarn tauri signer generate -w ~/.tauri/reachy-mini.key
```

Cela génère :
- `~/.tauri/reachy-mini.key` (privée - À PROTÉGER)
- `~/.tauri/reachy-mini.key.pub` (publique - à mettre dans `tauri.conf.json`)

### Sécurité

- ✅ La clé privée est dans `.gitignore` et `.cursorignore`
- ✅ Ne jamais commiter la clé privée
- ✅ Pour CI/CD, utiliser GitHub Secrets
- ✅ La clé publique peut être partagée (déjà dans `tauri.conf.json`)

## 🧪 Tests

### Test complet du pipeline dev

```bash
# 1. Builder une mise à jour
yarn build:update:dev

# 2. Démarrer le serveur (dans un terminal)
yarn serve:updates

# 3. Dans un autre terminal, lancer l'app
yarn tauri:dev

# 4. Vérifier que la mise à jour est détectée
```

### Test du pipeline prod (simulation)

```bash
# Builder comme en prod
yarn build:update:prod

# Vérifier les fichiers générés
ls -la releases/

# Vérifier le JSON
cat releases/darwin-aarch64/0.2.0/update.json
```

## 📝 Format du JSON de Métadonnées

Le script génère automatiquement un JSON au format Tauri :

```json
{
  "version": "0.2.0",
  "notes": "Update for version 0.2.0",
  "pub_date": "2024-01-15T10:00:00Z",
  "platforms": {
    "darwin-aarch64": {
      "signature": "base64_signature_here",
      "url": "https://releases.example.com/reachy-mini-control_0.2.0_darwin-aarch64.app.tar.gz"
    }
  }
}
```

## 🐛 Dépannage

### Erreur "Clé privée non trouvée"

```bash
# Générer les clés
yarn tauri signer generate -w ~/.tauri/reachy-mini.key
```

### Erreur "Port déjà utilisé"

```bash
# Utiliser un autre port
bash ./scripts/serve-updates.sh 9000
```

### Erreur de signature en CI

- Vérifier que le secret `TAURI_SIGNING_KEY` est bien configuré dans GitHub
- Vérifier que le contenu de la clé privée est correct (sans retours à la ligne supplémentaires)

## 🔄 Workflow Recommandé

### Pour une nouvelle version

1. **Développement** :
   ```bash
   # Tester localement
   yarn build:update:dev
   yarn serve:updates
   yarn tauri:dev
   ```

2. **Préparation release** :
   ```bash
   # Mettre à jour la version dans tauri.conf.json
   # Builder pour prod
   yarn build:update:prod
   ```

3. **Release** :
   ```bash
   # Créer un tag
   git tag v0.2.0
   git push origin v0.2.0
   ```

4. **CI/CD** :
   - Le workflow GitHub Actions va automatiquement builder et créer la release
   - Uploader les fichiers sur votre serveur de mises à jour
   - Configurer l'endpoint dans `tauri.conf.json` pour la production

## 📚 Références

- [Tauri Updater Plugin](https://v2.tauri.app/plugin/updater/)
- [Tauri Signer](https://v2.tauri.app/plugin/updater/signing/)
- `UPDATER_SETUP.md` - Configuration détaillée
- `UPDATER_IMPROVEMENTS.md` - Améliorations possibles

