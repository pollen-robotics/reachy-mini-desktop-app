#!/bin/bash

# Script de test de l'application complète

set -e

echo "🧪 Test de l'Application Complète"
echo "=================================="

cd "$(dirname "$0")/.."

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 1. Vérifier que le sidecar est build
echo ""
echo "📦 Étape 1: Vérification du sidecar..."
if [ ! -d "src-tauri/binaries" ] || [ ! -f "src-tauri/binaries/uv" ]; then
    echo -e "${YELLOW}⚠️  Sidecar non build, build en cours...${NC}"
    yarn build:sidecar-macos
fi
echo -e "${GREEN}✅ Sidecar prêt${NC}"

# 2. Build de l'app en mode debug (plus rapide)
echo ""
echo "🔨 Étape 2: Build de l'app (mode debug)..."
if yarn tauri build --debug; then
    echo -e "${GREEN}✅ Build réussi${NC}"
else
    echo -e "${RED}❌ Échec du build${NC}"
    exit 1
fi

# 3. Vérifier que le bundle existe
echo ""
echo "🔍 Étape 3: Vérification du bundle..."
BUNDLE_PATH="src-tauri/target/debug/bundle"

if [ "$(uname)" == "Darwin" ]; then
    APP_PATH="$BUNDLE_PATH/macos/Reachy Mini Control.app"
    if [ ! -d "$APP_PATH" ]; then
        echo -e "${RED}❌ Bundle macOS introuvable${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ Bundle trouvé: $APP_PATH${NC}"
    
    # Vérifier les ressources
    RESOURCES_PATH="$APP_PATH/Contents/Resources"
    if [ -d "$RESOURCES_PATH" ]; then
        echo -e "${BLUE}📁 Ressources dans le bundle:${NC}"
        ls -la "$RESOURCES_PATH" | head -10
    fi
fi

# 4. Instructions pour tester
echo ""
echo -e "${BLUE}====================================${NC}"
echo -e "${BLUE}📋 Instructions de test:${NC}"
echo -e "${BLUE}====================================${NC}"
echo ""
echo "1. Ouvrir l'app:"
echo -e "   ${YELLOW}open \"$APP_PATH\"${NC}"
echo ""
echo "2. Vérifier les logs système:"
echo -e "   ${YELLOW}log stream --predicate 'process == \"reachy-mini-control\"' --level debug${NC}"
echo ""
echo "3. Tester que le daemon répond:"
echo -e "   ${YELLOW}curl http://localhost:8000/api/daemon/status${NC}"
echo ""
echo "4. Checklist de test:"
echo "   [ ] L'app démarre sans erreur"
echo "   [ ] Le daemon démarre automatiquement"
echo "   [ ] La connexion USB est détectée"
echo "   [ ] Le scan 3D fonctionne"
echo "   [ ] Les commandes robot fonctionnent"
echo ""
echo -e "${GREEN}✅ Build terminé, prêt pour les tests !${NC}"

