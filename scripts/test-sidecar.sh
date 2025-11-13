#!/bin/bash

# Script de test du sidecar daemon embarqué

set -e

echo "🧪 Test du Sidecar Daemon Embarqué"
echo "===================================="

cd "$(dirname "$0")/.."

# Couleurs pour les messages
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. Build du sidecar
echo ""
echo "📦 Étape 1: Build du sidecar..."
if yarn build:sidecar-macos; then
    echo -e "${GREEN}✅ Sidecar build réussi${NC}"
else
    echo -e "${RED}❌ Échec du build du sidecar${NC}"
    exit 1
fi

# 2. Vérifier que les fichiers existent
echo ""
echo "🔍 Étape 2: Vérification des fichiers..."
BINARIES_DIR="src-tauri/binaries"

if [ ! -d "$BINARIES_DIR" ]; then
    echo -e "${RED}❌ Dossier binaries/ introuvable${NC}"
    exit 1
fi

# Vérifier les fichiers requis
MISSING_FILES=()

# Vérifier uv
if [ ! -f "$BINARIES_DIR/uv" ]; then
    MISSING_FILES+=("uv")
fi

# Vérifier .venv
if [ ! -d "$BINARIES_DIR/.venv" ]; then
    MISSING_FILES+=(".venv")
fi

# Vérifier uv-trampoline (peut avoir différents noms selon le triplet)
TRAMPOLINE_FOUND=false
for file in "$BINARIES_DIR"/uv-trampoline-*; do
    if [ -f "$file" ]; then
        TRAMPOLINE_FOUND=true
        break
    fi
done

if [ "$TRAMPOLINE_FOUND" = false ]; then
    MISSING_FILES+=("uv-trampoline-*")
fi

if [ ${#MISSING_FILES[@]} -gt 0 ]; then
    echo -e "${RED}❌ Fichiers manquants: ${MISSING_FILES[*]}${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Tous les fichiers requis sont présents${NC}"

# 3. Tester uv
echo ""
echo "🔧 Étape 3: Test de uv..."
cd "$BINARIES_DIR"
if ./uv --version > /dev/null 2>&1; then
    UV_VERSION=$(./uv --version)
    echo -e "${GREEN}✅ uv fonctionne: $UV_VERSION${NC}"
else
    echo -e "${RED}❌ uv ne fonctionne pas${NC}"
    exit 1
fi

# 4. Tester Python
echo ""
echo "🐍 Étape 4: Test de Python embarqué..."
if ./uv python list > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Python embarqué détecté${NC}"
else
    echo -e "${RED}❌ Python embarqué introuvable${NC}"
    exit 1
fi

# 5. Vérifier le venv
echo ""
echo "📦 Étape 5: Vérification du venv..."
if [ -d ".venv" ] && [ -f ".venv/pyvenv.cfg" ]; then
    echo -e "${GREEN}✅ Venv présent${NC}"
else
    echo -e "${RED}❌ Venv introuvable ou invalide${NC}"
    exit 1
fi

# 6. Vérifier reachy-mini
echo ""
echo "🤖 Étape 6: Vérification de reachy-mini..."
if ./uv pip list | grep -q "reachy-mini"; then
    DAEMON_VERSION=$(./uv pip list | grep "^reachy-mini " | awk '{print $2}')
    echo -e "${GREEN}✅ reachy-mini installé: $DAEMON_VERSION${NC}"
else
    echo -e "${RED}❌ reachy-mini non installé${NC}"
    exit 1
fi

# 7. Test du trampoline (optionnel, nécessite le robot)
echo ""
echo "🚀 Étape 7: Test du trampoline..."
TRAMPOLINE=$(ls uv-trampoline-* 2>/dev/null | head -n 1)
if [ -n "$TRAMPOLINE" ] && [ -x "$TRAMPOLINE" ]; then
    echo -e "${GREEN}✅ Trampoline trouvé: $TRAMPOLINE${NC}"
    echo -e "${YELLOW}⚠️  Test complet nécessite un robot connecté${NC}"
else
    echo -e "${RED}❌ Trampoline introuvable ou non exécutable${NC}"
    exit 1
fi

cd - > /dev/null

echo ""
echo -e "${GREEN}====================================${NC}"
echo -e "${GREEN}✅ Tous les tests du sidecar sont passés !${NC}"
echo -e "${GREEN}====================================${NC}"

