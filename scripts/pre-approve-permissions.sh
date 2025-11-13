#!/bin/bash

# Script pour pré-approuver les permissions macOS après le premier lancement
# À exécuter après avoir accepté les popups une première fois

APP_NAME="Reachy Mini Control"
APP_PATH=""

# Trouver le chemin de l'app
if [ -d "src-tauri/target/release/bundle/macos/${APP_NAME}.app" ]; then
    APP_PATH="src-tauri/target/release/bundle/macos/${APP_NAME}.app"
elif [ -d "src-tauri/target/debug/bundle/macos/${APP_NAME}.app" ]; then
    APP_PATH="src-tauri/target/debug/bundle/macos/${APP_NAME}.app"
else
    echo "❌ Application non trouvée. Lancez d'abord: yarn tauri:build"
    exit 1
fi

echo "🔐 Configuration des permissions pour: $APP_PATH"

# Ajouter au Firewall (nécessite sudo)
echo "📡 Ajout au Firewall..."
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add "$APP_PATH" 2>/dev/null || true
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --unblockapp "$APP_PATH" 2>/dev/null || true

echo "✅ Permissions configurées"
echo ""
echo "Note: Les popups peuvent encore apparaître la première fois."
echo "Après acceptation, elles ne réapparaîtront plus."

