# Build avec Daemon Python Embarqué

Ce projet utilise un daemon Python embarqué pour fonctionner de manière autonome, sans nécessiter une installation Python préalable sur le système.

## Architecture

L'application utilise :
- **uv** : Gestionnaire de packages Python moderne
- **Python 3.12** : Embarqué dans le bundle
- **uv-trampoline** : Wrapper Rust qui configure l'environnement Python embarqué
- **reachy-mini-daemon** : Pré-installé dans un venv embarqué

## Processus de Build

### 1. Build du Sidecar (une seule fois, ou quand les dépendances changent)

```bash
# Pour macOS
yarn build:sidecar-macos

# Pour Linux
yarn build:sidecar-linux
```

Ce script :
- Installe `uv` dans `src-tauri/binaries/`
- Installe Python 3.12 via `uv`
- Crée un venv avec `reachy-mini-daemon` pré-installé
- Build le wrapper `uv-trampoline`

### 2. Build de l'Application

```bash
# Mode développement
yarn tauri:dev

# Build production
yarn tauri:build
```

## Structure du Bundle

```
Reachy Mini Control.app/
├── Contents/
│   ├── MacOS/
│   │   └── reachy-mini-control (binaire Rust)
│   └── Resources/
│       ├── uv-trampoline (sidecar)
│       ├── uv (binaire)
│       ├── cpython-3.12.12-macos-aarch64-none/ (Python embarqué)
│       └── .venv/ (environnement virtuel avec reachy-mini-daemon)
```

## Notes

- Le sidecar doit être rebuild si les dépendances Python changent
- Le bundle final fait environ 100-300 MB (vs ~10-20 MB sans Python)
- Le daemon est lancé automatiquement au démarrage de l'app via le sidecar
- Les logs du sidecar sont émis vers le frontend via les événements `sidecar-stdout` et `sidecar-stderr`

