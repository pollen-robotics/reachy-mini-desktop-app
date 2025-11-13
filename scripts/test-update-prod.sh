#!/bin/bash

# Script pour tester la mise à jour en mode production
# Ce script build l'app, crée une mise à jour, et lance le serveur de test

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🧪 Test de mise à jour en mode production${NC}"
echo -e "${BLUE}===========================================${NC}"
echo ""

# Étape 1: Vérifier que nous sommes prêts
echo -e "${YELLOW}📋 Étape 1: Vérification des prérequis...${NC}"

# Vérifier que la clé de signature existe
PRIVATE_KEY="${HOME}/.tauri/reachy-mini.key"
if [ ! -f "$PRIVATE_KEY" ]; then
    echo -e "${RED}❌ Clé privée non trouvée: ${PRIVATE_KEY}${NC}"
    echo -e "${YELLOW}   Générer avec: yarn tauri signer generate -w ${PRIVATE_KEY} --ci${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Clé de signature trouvée${NC}"

# Vérifier la version actuelle
CURRENT_VERSION=$(grep -o '"version": "[^"]*"' src-tauri/tauri.conf.json | cut -d'"' -f4)
echo -e "${GREEN}✅ Version actuelle: ${CURRENT_VERSION}${NC}"

# Calculer la version de mise à jour (incrémenter le patch)
IFS='.' read -ra VERSION_PARTS <<< "$CURRENT_VERSION"
MAJOR="${VERSION_PARTS[0]}"
MINOR="${VERSION_PARTS[1]}"
PATCH="${VERSION_PARTS[2]}"
UPDATE_VERSION="${MAJOR}.${MINOR}.$((PATCH + 1))"
echo -e "${BLUE}   Version de mise à jour: ${UPDATE_VERSION}${NC}"
echo ""

# Étape 2: Build de l'app en mode production
echo -e "${YELLOW}📦 Étape 2: Build de l'application en mode production...${NC}"
echo -e "${BLUE}   Cela peut prendre plusieurs minutes...${NC}"

if ! yarn tauri:build; then
    echo -e "${RED}❌ Erreur lors du build${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Build terminé${NC}"
echo ""

# Trouver le bundle créé
BUNDLE_PATH=""
BUNDLE_DIR="src-tauri/target/release/bundle"

if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    BUNDLE_PATH="${BUNDLE_DIR}/macos/Reachy Mini Control.app"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux - trouver le premier AppImage
    BUNDLE_PATH=$(find "${BUNDLE_DIR}/appimage" -name "*.AppImage" 2>/dev/null | head -1)
    if [ -z "$BUNDLE_PATH" ]; then
        echo -e "${RED}❌ Aucun AppImage trouvé dans ${BUNDLE_DIR}/appimage${NC}"
        exit 1
    fi
else
    # Windows - trouver le premier MSI
    BUNDLE_PATH=$(find "${BUNDLE_DIR}/msi" -name "*.msi" 2>/dev/null | head -1)
    if [ -z "$BUNDLE_PATH" ]; then
        echo -e "${RED}❌ Aucun MSI trouvé dans ${BUNDLE_DIR}/msi${NC}"
        exit 1
    fi
fi

if [ ! -e "$BUNDLE_PATH" ]; then
    echo -e "${RED}❌ Bundle non trouvé: ${BUNDLE_PATH}${NC}"
    echo -e "${YELLOW}   Vérifiez que le build s'est bien terminé${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Bundle trouvé: ${BUNDLE_PATH}${NC}"
echo ""

# Étape 3: Mettre à jour la version dans tauri.conf.json pour la mise à jour
echo -e "${YELLOW}📝 Étape 3: Préparation de la mise à jour...${NC}"

# Sauvegarder la version actuelle
BACKUP_FILE="src-tauri/tauri.conf.json.backup"
cp src-tauri/tauri.conf.json "$BACKUP_FILE"
echo -e "${BLUE}   Backup créé: ${BACKUP_FILE}${NC}"

# Mettre à jour la version dans tauri.conf.json temporairement
if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/\"version\": \"${CURRENT_VERSION}\"/\"version\": \"${UPDATE_VERSION}\"/" src-tauri/tauri.conf.json
else
    sed -i "s/\"version\": \"${CURRENT_VERSION}\"/\"version\": \"${UPDATE_VERSION}\"/" src-tauri/tauri.conf.json
fi

echo -e "${GREEN}✅ Version mise à jour dans tauri.conf.json: ${UPDATE_VERSION}${NC}"
echo ""

# Étape 4: Build de la mise à jour
echo -e "${YELLOW}🔨 Étape 4: Build de la mise à jour...${NC}"

if ! yarn build:update:dev "$UPDATE_VERSION"; then
    # Restaurer la version originale en cas d'erreur
    mv "$BACKUP_FILE" src-tauri/tauri.conf.json
    echo -e "${RED}❌ Erreur lors du build de la mise à jour${NC}"
    exit 1
fi

# Restaurer la version originale
mv "$BACKUP_FILE" src-tauri/tauri.conf.json
echo -e "${GREEN}✅ Version restaurée dans tauri.conf.json: ${CURRENT_VERSION}${NC}"
echo ""

# Étape 5: Vérifier que les fichiers de mise à jour existent
echo -e "${YELLOW}🔍 Étape 5: Vérification des fichiers de mise à jour...${NC}"

UPDATE_DIR="test-updates"
if [ ! -d "$UPDATE_DIR" ]; then
    echo -e "${RED}❌ Répertoire de mise à jour non trouvé: ${UPDATE_DIR}${NC}"
    exit 1
fi

# Trouver le répertoire de la plateforme
PLATFORM=""
if [[ "$OSTYPE" == "darwin"* ]]; then
    ARCH=$(uname -m)
    if [ "$ARCH" == "arm64" ]; then
        PLATFORM="darwin-aarch64"
    else
        PLATFORM="darwin-x86_64"
    fi
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    ARCH=$(uname -m)
    if [ "$ARCH" == "x86_64" ]; then
        PLATFORM="linux-x86_64"
    else
        PLATFORM="linux-aarch64"
    fi
else
    PLATFORM="windows-x86_64"
fi

UPDATE_JSON="${UPDATE_DIR}/${PLATFORM}/${CURRENT_VERSION}/update.json"
if [ ! -f "$UPDATE_JSON" ]; then
    echo -e "${RED}❌ Fichier update.json non trouvé: ${UPDATE_JSON}${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Fichiers de mise à jour trouvés${NC}"
echo -e "${BLUE}   Platform: ${PLATFORM}${NC}"
echo -e "${BLUE}   Update JSON: ${UPDATE_JSON}${NC}"
echo ""

# Étape 6: Instructions pour tester
echo -e "${GREEN}✅ Tout est prêt pour tester !${NC}"
echo ""
echo -e "${BLUE}===========================================${NC}"
echo -e "${BLUE}📋 Instructions de test:${NC}"
echo -e "${BLUE}===========================================${NC}"
echo ""
echo -e "${YELLOW}1.${NC} Ouvrir un nouveau terminal et lancer le serveur de mises à jour:"
echo -e "   ${GREEN}cd ${PROJECT_DIR} && yarn serve:updates${NC}"
echo ""
echo -e "${YELLOW}2.${NC} Lancer l'application construite:"
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo -e "   ${GREEN}open \"${PROJECT_DIR}/${BUNDLE_PATH}\"${NC}"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo -e "   ${GREEN}${PROJECT_DIR}/${BUNDLE_PATH}${NC}"
else
    echo -e "   ${GREEN}${PROJECT_DIR}/${BUNDLE_PATH}${NC}"
fi
echo ""
echo -e "${YELLOW}3.${NC} Dans l'application:"
echo -e "   - L'app devrait détecter automatiquement la mise à jour ${UPDATE_VERSION}"
echo -e "   - Cliquer sur 'Install Update'"
echo -e "   - L'app devrait télécharger, installer et redémarrer automatiquement"
echo ""
echo -e "${YELLOW}4.${NC} Vérifier que l'app a bien été mise à jour:"
echo -e "   - L'app devrait redémarrer avec la version ${UPDATE_VERSION}"
echo ""
echo -e "${BLUE}===========================================${NC}"
echo ""
echo -e "${YELLOW}⚠️  Note:${NC} Le serveur de mises à jour doit rester actif pendant le test"
echo -e "${YELLOW}⚠️  Note:${NC} L'endpoint dans tauri.conf.json doit pointer vers http://localhost:8080"
echo ""

