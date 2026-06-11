# Installation et Configuration Linux

Ce document détaille les prérequis et la configuration pour exécuter l'application Reachy Mini Control sur Linux.

> **📖 Pour en savoir plus** : Consultez [LINUX_PACKAGING_STRATEGY.md](./LINUX_PACKAGING_STRATEGY.md) pour comprendre notre approche de distribution Linux et les solutions aux problèmes de packaging.

## Prérequis Système

### Dépendances Requises

Pour **l'exécution** de l'application (utilisateur final) :

```bash
sudo apt install libwebkit2gtk-4.1-0 libportaudio2
```

Pour le **développement et build** (contributeurs) :

```bash
sudo apt install libwebkit2gtk-4.1-dev portaudio19-dev
```

**Détails des dépendances :**

- **libwebkit2gtk-4.1-0** / **-dev** : Requis par Tauri pour le rendu de l'interface (runtime / développement)
- **libportaudio2** : Bibliothèque audio requise par `sounddevice` (dépendance de reachy-mini)
- **portaudio19-dev** : En-têtes de développement pour PortAudio (requis uniquement pour le build)

### Installation via Package .deb

Si vous installez l'application via le package `.deb`, les dépendances runtime (`libwebkit2gtk-4.1-0` et `libportaudio2`) seront automatiquement installées.

Le script post-installation configure également :
- Les règles udev pour l'accès USB au robot
- L'ajout de l'utilisateur au groupe `dialout`

```bash
# Installer le package
sudo dpkg -i reachy-mini-control_*.deb

# Note: Après l'installation, vous devrez peut-être :
# 1. Vous déconnecter et vous reconnecter (pour les changements de groupe)
# 2. Débrancher et rebrancher le câble USB de votre Reachy Mini
```

#### Important : Mises à jour automatiques sur Linux

**Le système d'auto-update de Tauri n'utilise PAS les packages `.deb` pour les mises à jour.**

- **Installation initiale** : Utilisez le package `.deb` pour une installation propre avec gestion des dépendances système
- **Mises à jour** : Le système d'auto-update utilise le format **AppImage**, qui fonctionne de manière autonome

Cela signifie que :
- Les `.deb` sont utilisés pour l'installation initiale et la distribution
- Les mises à jour ultérieures sont téléchargées et appliquées au format AppImage via le système d'auto-update intégré
- Vous n'avez pas besoin de réinstaller un nouveau `.deb` à chaque mise à jour

> **Note** : Les builds Linux sont actuellement désactivés dans le workflow de release en raison de problèmes avec le bundling AppImage et les dépendances natives Python. Voir [issue #35](https://github.com/pollen-robotics/reachy-mini-desktop-app/issues/35).

### Installation via Package .rpm (Fedora)

Le package `.rpm` cible Fedora. Il déclare les dépendances runtime Fedora, installe les règles udev pour l'accès USB au robot et configure l'utilisateur dans le groupe `dialout` quand celui-ci existe.

```bash
# Installer le package
sudo dnf install ./reachy-mini-control-*.rpm

# Note: Après l'installation, vous devrez peut-être :
# 1. Vous déconnecter et vous reconnecter (pour les changements de groupe)
# 2. Débrancher et rebrancher le câble USB de votre Reachy Mini
```

Le support RPM est validé comme cible Fedora en priorité. Les distributions RHEL/openSUSE peuvent avoir des noms de dépendances GStreamer/WebKit différents et ne sont pas encore considérées comme supportées officiellement.

### Build Depuis les Sources

#### Dépendances de Build

```bash
# Installer Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Installer Node.js (version 24.4.0 ou supérieure recommandée)
# Utiliser nvm si disponible
nvm install --lts
nvm use --lts

# Installer Yarn
npm install -g yarn

# Installer les dépendances système
sudo apt install \
    libwebkit2gtk-4.1-dev \
    libportaudio2 \
    portaudio19-dev \
    build-essential \
    curl \
    wget \
    file \
    libxdo-dev \
    libssl-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev
```

#### Compiler l'Application

```bash
# Cloner le dépôt
git clone https://github.com/pollen-robotics/reachy-mini-desktop-app.git
cd reachy-mini-desktop-app/reachy_mini_desktop_app

# Installer les dépendances JavaScript
yarn install

# 1. Compiler le sidecar (requis en premier)
yarn build:sidecar-linux

# 2. Compiler l'application
yarn tauri:build
```

Les packages Linux seront générés dans :
- `.deb` : `src-tauri/target/release/bundle/deb/`
- `.rpm` : `src-tauri/target/release/bundle/rpm/`
- AppImage : `src-tauri/target/release/bundle/appimage/`

Pour compiler uniquement le RPM Fedora :

```bash
yarn tauri:build:rpm
```

## Système de Mises à Jour

### Comment fonctionnent les mises à jour sur Linux

Tauri utilise une approche hybride sur Linux :

1. **Installation initiale** : Package `.deb`
   - Gère les dépendances système automatiquement
   - Installe les règles udev et permissions
   - S'intègre avec le gestionnaire de packages du système

2. **Mises à jour automatiques** : AppImage
   - Le système d'auto-update télécharge les mises à jour au format AppImage
   - Les AppImage sont autonomes et ne nécessitent pas de dépendances système
   - Fonctionne sur toutes les distributions Linux

### État actuel des builds Linux

**⚠️ Les builds Linux sont actuellement désactivés** dans le workflow de release GitHub Actions.

**Raison** : Problèmes avec le bundling des dépendances natives Python dans les AppImage (voir [issue #35](https://github.com/pollen-robotics/reachy-mini-desktop-app/issues/35))

**Alternatives en attendant** :
- Compiler l'application localement depuis les sources
- Suivre l'issue #35 pour les mises à jour sur le support Linux complet

## Problèmes Connus

### Sources APT Manquantes (Ubuntu 22.04 Jammy)

Sur certaines installations Ubuntu, vous pourriez avoir besoin d'ajouter les sources principales si elles ne sont pas configurées :

```bash
# Vérifier si les sources sont configurées
grep "jammy main" /etc/apt/sources.list.d/ubuntu.sources

# Si absent, ajouter les sources
sudo bash -c 'cat >> /etc/apt/sources.list.d/ubuntu.sources << EOF
Types: deb
URIs: http://archive.ubuntu.com/ubuntu
Suites: jammy
Components: main universe
EOF'

# Mettre à jour les sources
sudo apt update
```

### Permissions USB

Si le robot n'est pas détecté via USB :

1. Vérifiez que les règles udev sont installées :
   ```bash
   ls -l /etc/udev/rules.d/99-reachy-mini.rules
   ```

2. Vérifiez que vous êtes dans le groupe `dialout` :
   ```bash
   groups $USER | grep dialout
   ```

3. Si nécessaire, ajoutez-vous manuellement au groupe :
   ```bash
   sudo usermod -aG dialout $USER
   # Déconnectez-vous et reconnectez-vous
   ```

4. Rechargez les règles udev :
   ```bash
   sudo udevadm control --reload-rules
   sudo udevadm trigger
   ```

### Problèmes Audio

Si vous rencontrez des erreurs liées à `sounddevice` :

```bash
# Vérifier que PortAudio est installé
ldconfig -p | grep portaudio

# Réinstaller si nécessaire
sudo apt install --reinstall libportaudio2
```

## Tests

### Tester l'Application en Mode Développement

```bash
yarn tauri:dev
```

### Tester le Build de Production

```bash
# Après avoir compilé l'application
sudo dpkg -i src-tauri/target/release/bundle/deb/reachy-mini-control_*.deb

# Lancer l'application
reachy-mini-control
```

## Support

Pour plus d'informations :
- [Documentation Tauri pour Linux](https://v2.tauri.app/start/prerequisites/#linux)
- [README principal](../README.md)
- [Issues GitHub](https://github.com/pollen-robotics/reachy-mini-desktop-app/issues)
