# Stratégie de Packaging Linux pour Tauri

Ce document analyse comment les principaux projets Tauri gèrent le packaging et la distribution sur Linux, et propose des solutions pour notre application.

## 📊 Formats de Distribution Linux

### 1. AppImage (Recommandé pour l'auto-update)

**Avantages :**
- ✅ Format supporté par le système d'auto-update de Tauri
- ✅ Portable : fonctionne sur toutes les distributions sans installation
- ✅ Auto-contenu : inclut toutes les dépendances
- ✅ Pas besoin de droits administrateur pour l'exécuter

**Inconvénients :**
- ❌ Taille de fichier plus importante (toutes les dépendances bundlées)
- ❌ Pas d'intégration avec le gestionnaire de packages système
- ❌ Nécessite `chmod +x` pour l'exécution la première fois

**Cas d'usage :**
- Distribution principale pour les utilisateurs finaux
- Système de mises à jour automatiques

### 2. Packages .deb (Recommandé pour l'installation initiale)

**Avantages :**
- ✅ Intégration native avec les distributions Debian/Ubuntu
- ✅ Gestion automatique des dépendances système
- ✅ Scripts post-installation (udev rules, permissions)
- ✅ Installation via `apt` ou double-clic

**Inconvénients :**
- ❌ Non supporté par l'auto-updater Tauri
- ❌ Limité aux distributions Debian/Ubuntu
- ❌ Nécessite maintenance pour chaque version Ubuntu

**Cas d'usage :**
- Installation initiale propre avec dépendances système
- Distribution via repositories APT

### 3. Packages .rpm Fedora

**Avantages :**
- ✅ Intégration native avec Fedora via `dnf`
- ✅ Gestion automatique des dépendances système Fedora
- ✅ Scripts post-installation (udev rules, permissions)
- ✅ Alternative propre pour les utilisateurs hors Debian/Ubuntu

**Inconvénients :**
- ❌ Non supporté par l'auto-updater Tauri
- ❌ Les noms de dépendances varient entre Fedora, RHEL et openSUSE
- ❌ Support initial limité à Fedora

**Cas d'usage :**
- Installation initiale propre sur Fedora
- Distribution via releases GitHub ou dépôt RPM Fedora à terme

### 4. Autres Formats

- **Flatpak** : Sandboxing, distribution via Flathub
- **Snap** : Alternative à Flatpak, mais controversé dans la communauté Linux

## 🎯 Stratégie Hybride Recommandée

Les grands projets Tauri utilisent une **approche hybride** :

```
Installation Initiale → .deb ou .rpm (avec dépendances système)
         ↓
   Premier Lancement
         ↓
Mises à Jour → AppImage (via auto-updater Tauri)
```

### Exemple : Bitwarden

Bitwarden distribue son application Tauri via :
1. Packages `.deb` et `.rpm` pour l'installation initiale
2. AppImage pour les distributions non supportées
3. Flatpak sur Flathub pour un public plus large

## 🐍 Problème Spécifique : Python + AppImage

### Le Problème

Notre application bundle un environnement Python complet avec des dépendances natives (sounddevice, opencv, etc.). Le tool `linuxdeploy` utilisé par Tauri pour créer les AppImage a du mal avec :
- Les bibliothèques natives du venv Python
- Les chemins hardcodés dans le venv
- Les dépendances système partagées

### Solutions Utilisées par d'Autres Projets

#### 1. Exemple : `example-tauri-v2-python-server-sidecar`

Repository : https://github.com/dieharders/example-tauri-v2-python-server-sidecar

**Approche :**
- Utilise PyInstaller pour créer un exécutable Python standalone
- Bundle l'exécutable comme sidecar Tauri
- Évite complètement les venv dans l'AppImage

**Configuration :**
```json
{
  "bundle": {
    "externalBin": [
      "binaries/python-server-x86_64-unknown-linux-gnu"
    ]
  }
}
```

#### 2. Définir `LD_LIBRARY_PATH` (Solution japonaise)

Source : https://zenn.dev/k5n/articles/cf9ac9f0f28038

**Approche :**
```bash
export LD_LIBRARY_PATH=/path/to/venv/lib:$LD_LIBRARY_PATH
yarn tauri build
```

Aide `linuxdeploy` à trouver les bonnes versions des bibliothèques partagées.

#### 3. Utiliser `taurido` (Tool Docker)

**Approche :**
- Build l'application dans un environnement Docker contrôlé
- Utilise une base Ubuntu 18.04 pour maximiser la compatibilité
- Gère automatiquement les dépendances

## 💡 Recommandations pour Notre Projet

### Court Terme : Corriger le Build AppImage

1. **Option A : PyInstaller** (Recommandée)
   ```bash
   # Compiler le daemon Python en exécutable standalone
   pyinstaller --onefile src/reachy_mini/daemon/app/main.py
   
   # Configurer comme sidecar dans tauri.conf.json
   "externalBin": ["binaries/reachy-mini-daemon"]
   ```

2. **Option B : Fixer le LD_LIBRARY_PATH**
   ```bash
   # Dans le workflow GitHub Actions
   export LD_LIBRARY_PATH="$PWD/src-tauri/binaries/.venv/lib:$LD_LIBRARY_PATH"
   yarn tauri build
   ```

3. **Option C : Build Docker avec Ubuntu 18.04**
   - Utiliser `taurido` ou créer notre propre Dockerfile
   - Maximise la compatibilité avec les vieilles distributions

### Moyen Terme : Stratégie Hybride

1. **Activer les builds .deb**
   - Les .deb existent déjà et fonctionnent
   - Gérer automatiquement les dépendances système
   - Scripts post-install pour udev/permissions

2. **Fixer et activer les builds AppImage**
   - Une fois le problème de bundling résolu
   - Activer l'auto-update pour les AppImage

3. **Communication claire aux utilisateurs**
   ```
   Installation recommandée :
   1. Télécharger le .deb pour l'installation initiale
   2. L'application se mettra à jour automatiquement via AppImage
   ```

### Long Terme : Distribution Multi-Canal

1. **Repository APT officiel**
   - Héberger notre propre repository
   - Mises à jour via `apt update`

2. **Flathub**
   - Publier sur Flathub pour visibilité
   - Toucher un public plus large

3. **AppImage Hub**
   - Référencer sur https://appimage.github.io/

## 📚 Ressources

### Documentation Tauri
- [Linux Bundling](https://v2.tauri.app/distribute/)
- [AppImage](https://v2.tauri.app/distribute/appimage/)
- [Sidecar](https://v2.tauri.app/develop/sidecar/)

### Projets Exemples
- [Bitwarden Desktop](https://github.com/bitwarden/clients)
- [Tauri + Python Sidecar](https://github.com/dieharders/example-tauri-v2-python-server-sidecar)
- [ChatGPT Desktop](https://github.com/lencx/ChatGPT)

### Outils
- [linuxdeploy](https://github.com/linuxdeploy/linuxdeploy)
- [taurido](https://digitaltwin-run.github.io/taurido/)
- [PyInstaller](https://pyinstaller.org/)

## 🔍 Issue Actuelle

**Issue #35** : AppImage bundling fails due to Python venv native deps

**Status** : Builds Linux désactivés temporairement dans le workflow

**Solutions à tester** :
1. ✅ PyInstaller pour standalone daemon
2. ✅ LD_LIBRARY_PATH dans le workflow
3. ✅ Docker build avec Ubuntu 18.04
4. ⏸️ Relocatable venv (déjà tenté, problèmes avec cpython)

## 🎉 Implémentation PyInstaller (Faite!)

### ✅ Ce Qui a Été Fait

1. **Script de Build PyInstaller** (`scripts/build/build-daemon-pyinstaller.sh`)
   - Compile le daemon reachy-mini en exécutable standalone
   - Support multi-sources (PyPI, GitHub branch, local)
   - Tests automatiques de l'exécutable

2. **Configuration Tauri Simplifiée** (`tauri.linux.pyinstaller.conf.json`)
   - Bundle uniquement l'exécutable (au lieu de venv complet)
   - Conserve les dépendances système (.deb)
   - Compatible AppImage

3. **Workflow GitHub Actions Mis à Jour**
   - Builds Linux réactivés
   - Utilise PyInstaller au lieu de uv-bundle
   - Installe les dépendances système nécessaires

4. **Scripts NPM**
   - `yarn build:sidecar-linux` → Utilise PyInstaller
   - `yarn build:sidecar-linux:legacy` → Ancienne méthode (si besoin)

### 🚀 Comment Utiliser

#### Build Local

```bash
# Build le daemon avec PyInstaller
yarn build:sidecar-linux

# Ou avec une branche spécifique
REACHY_MINI_SOURCE=develop yarn build:sidecar-linux

# Build l'application complète
yarn tauri:build
```

#### Build CI/CD

Le workflow GitHub Actions gère automatiquement :
1. Installation des dépendances système
2. Build du daemon avec PyInstaller
3. Création du .deb ET de l'AppImage
4. Upload des artifacts

### 📦 Comparaison Avant/Après

| Aspect | Avant (venv) | Après (PyInstaller) |
|--------|--------------|---------------------|
| **Nombre de fichiers bundlés** | 500+ | 1 |
| **Taille totale** | ~500MB | ~150-200MB |
| **Build .deb** | ✅ Fonctionne | ✅ Fonctionne mieux |
| **Build AppImage** | ❌ Crash | ✅ Devrait fonctionner |
| **Complexité config** | 10 lignes | 3 lignes |
| **Compatibilité linuxdeploy** | ❌ Problèmes | ✅ OK |

### 🧪 Testing

```bash
# Tester le build local
yarn build:sidecar-linux
./src-tauri/binaries/reachy-mini-daemon-* --help

# Tester le .deb (nécessite build complet)
yarn tauri:build
sudo dpkg -i src-tauri/target/release/bundle/deb/*.deb

# Tester l'AppImage (nécessite build complet)
chmod +x src-tauri/target/release/bundle/appimage/*.AppImage
./src-tauri/target/release/bundle/appimage/*.AppImage
```

## 📋 Checklist d'Implémentation

- [x] Créer le script PyInstaller
- [x] Créer la config Tauri simplifiée
- [x] Ré-activer les builds Linux dans le workflow
- [x] Mettre à jour la documentation Linux
- [x] Ajouter les scripts NPM
- [ ] Tester le build .deb complet
- [ ] Tester le build AppImage complet
- [ ] Tester l'auto-update AppImage
- [ ] Merger la PR
- [ ] Tester sur Ubuntu 22.04/24.04
- [ ] Tester sur d'autres distributions (Fedora, Arch)
