#!/bin/bash

# Script de test du système de mise à jour

set -e

echo "🧪 Test du Système de Mise à Jour"
echo "==================================="

cd "$(dirname "$0")/.."

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 1. Vérifier la configuration
echo ""
echo "🔍 Étape 1: Vérification de la configuration..."
CONFIG_FILE="src-tauri/tauri.conf.json"

if ! grep -q '"updater"' "$CONFIG_FILE"; then
    echo -e "${RED}❌ Configuration updater non trouvée dans tauri.conf.json${NC}"
    exit 1
fi

if grep -q '"active": false' "$CONFIG_FILE"; then
    echo -e "${YELLOW}⚠️  Le système de mise à jour est désactivé${NC}"
    echo "   Activez-le dans tauri.conf.json pour tester"
fi

echo -e "${GREEN}✅ Configuration trouvée${NC}"

# 2. Vérifier les dépendances
echo ""
echo "📦 Étape 2: Vérification des dépendances..."
if grep -q "@tauri-apps/plugin-updater" package.json; then
    echo -e "${GREEN}✅ Plugin updater installé${NC}"
else
    echo -e "${RED}❌ Plugin updater non installé${NC}"
    echo "   Exécutez: yarn install"
    exit 1
fi

# 3. Vérifier les clés de signature
echo ""
echo "🔐 Étape 3: Vérification des clés de signature..."
if [ -f ~/.tauri/reachy-mini.key.pub ]; then
    PUBKEY=$(cat ~/.tauri/reachy-mini.key.pub)
    echo -e "${GREEN}✅ Clé publique trouvée${NC}"
    echo "   Clé: ${PUBKEY:0:50}..."
else
    echo -e "${YELLOW}⚠️  Clé publique non trouvée${NC}"
    echo "   Générer avec: yarn tauri signer generate -w ~/.tauri/reachy-mini.key"
fi

# 4. Créer un serveur mock pour test (optionnel)
echo ""
echo "🌐 Étape 4: Serveur mock pour test..."
MOCK_DIR="test-updates"
if [ ! -d "$MOCK_DIR" ]; then
    echo "   Création d'un serveur mock..."
    mkdir -p "$MOCK_DIR/darwin-aarch64/0.1.0"
    cat > "$MOCK_DIR/darwin-aarch64/0.1.0/update.json" <<EOF
{
  "version": "0.2.0",
  "notes": "Version de test pour développement",
  "pub_date": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "platforms": {
    "darwin-aarch64": {
      "signature": "test-signature-placeholder",
      "url": "http://localhost:8080/test-update.tar.gz"
    }
  }
}
EOF
    echo -e "${GREEN}✅ Serveur mock créé dans $MOCK_DIR${NC}"
else
    echo -e "${BLUE}ℹ️  Serveur mock existe déjà${NC}"
fi

# 5. Instructions
echo ""
echo -e "${BLUE}====================================${NC}"
echo -e "${BLUE}📋 Instructions de test:${NC}"
echo -e "${BLUE}====================================${NC}"
echo ""
echo "1. Démarrer un serveur HTTP mock:"
echo -e "   ${YELLOW}cd $MOCK_DIR && python3 -m http.server 8080${NC}"
echo ""
echo "2. Configurer l'endpoint dans tauri.conf.json:"
echo -e "   ${YELLOW}\"endpoints\": [\"http://localhost:8080/{{target}}/{{current_version}}/update.json\"]${NC}"
echo ""
echo "3. Lancer l'app en mode dev:"
echo -e "   ${YELLOW}yarn tauri:dev${NC}"
echo ""
echo "4. Vérifier dans la console du navigateur:"
echo "   - Les logs de vérification de mise à jour"
echo "   - Que le hook useUpdater fonctionne"
echo ""
echo -e "${GREEN}✅ Configuration de test prête !${NC}"

