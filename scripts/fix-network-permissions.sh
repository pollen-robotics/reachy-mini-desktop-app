#!/bin/bash

# Script pour autoriser l'app dans le Firewall macOS et corriger les permissions réseau

APP_NAME="Reachy Mini Control"
RELEASE_APP="src-tauri/target/release/bundle/macos/${APP_NAME}.app"
DEBUG_APP="src-tauri/target/debug/bundle/macos/${APP_NAME}.app"

echo "🔧 Correction des permissions réseau pour ${APP_NAME}"

# Trouver l'app (release en priorité)
if [ -d "$RELEASE_APP" ]; then
    APP_PATH="$RELEASE_APP"
    echo "📦 Utilisation de l'app RELEASE"
elif [ -d "$DEBUG_APP" ]; then
    APP_PATH="$DEBUG_APP"
    echo "🔧 Utilisation de l'app DEBUG"
else
    echo "❌ Application non trouvée. Lancez d'abord: yarn tauri:build"
    exit 1
fi

echo "📍 Chemin: $APP_PATH"

# Vérifier l'état du Firewall
FIREWALL_STATE=$(/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate | grep -o "enabled\|disabled")
echo "🔥 État du Firewall: $FIREWALL_STATE"

# Ajouter l'app au Firewall si pas déjà présente
echo "➕ Ajout de l'app au Firewall..."
/usr/libexec/ApplicationFirewall/socketfilterfw --add "$APP_PATH" 2>/dev/null || echo "   (déjà présente)"

# Autoriser l'app dans le Firewall
echo "✅ Autorisation de l'app dans le Firewall..."
/usr/libexec/ApplicationFirewall/socketfilterfw --unblockapp "$APP_PATH" 2>/dev/null || echo "   (déjà autorisée)"

# Vérifier le statut
echo ""
echo "📊 Statut de l'app dans le Firewall:"
/usr/libexec/ApplicationFirewall/socketfilterfw --listapps | grep -i "reachy\|Reachy" || echo "   (non trouvée dans la liste)"

echo ""
echo "✅ Permissions réseau configurées !"
echo ""
echo "💡 Note: Si l'app n'a toujours pas accès à internet:"
echo "   1. Ouvrez Réglages Système > Réseau > Pare-feu"
echo "   2. Cliquez sur 'Options'"
echo "   3. Vérifiez que '${APP_NAME}' est autorisée"
echo "   4. Relancez l'app"

