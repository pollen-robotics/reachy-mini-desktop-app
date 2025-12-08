#!/bin/bash

# Script de nettoyage du projet
# Supprime tous les fichiers de build et artefacts

set -e

echo "🧹 Nettoyage du projet..."

# Répertoires de build à supprimer
DIRS_TO_CLEAN=(
  "dist"                          # Build frontend Vite
  "src-tauri/target"              # Build Rust Tauri
  "src-tauri/gen"                 # Générés Tauri
  "uv-wrapper/target"            # Build Rust uv-wrapper
  "scripts/__pycache__"          # Cache Python
  "test-updates"                  # Fichiers de test updates
)

# Fichiers temporaires à supprimer
FILES_TO_CLEAN=(
  "*.log"                         # Logs
  "daemon-develop-test.log"       # Log spécifique
)

# Supprimer les répertoires
for dir in "${DIRS_TO_CLEAN[@]}"; do
  if [ -d "$dir" ] || [ -f "$dir" ]; then
    echo "  ❌ Suppression de $dir"
    rm -rf "$dir"
  else
    echo "  ⏭️  $dir n'existe pas (déjà propre)"
  fi
done

# Supprimer les fichiers
for pattern in "${FILES_TO_CLEAN[@]}"; do
  if ls $pattern 1> /dev/null 2>&1; then
    echo "  ❌ Suppression de $pattern"
    rm -f $pattern
  fi
done

echo "✅ Nettoyage terminé !"
echo ""
echo "💡 Pour réinstaller les dépendances : yarn install"
echo "💡 Pour reconstruire : yarn build"

