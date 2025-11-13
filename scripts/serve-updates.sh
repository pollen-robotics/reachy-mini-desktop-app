#!/bin/bash

# Script pour servir les mises à jour en local pour les tests dev
# Usage: ./scripts/serve-updates.sh [port]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

PORT="${1:-8080}"
UPDATES_DIR="test-updates"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🌐 Starting update server on port ${PORT}${NC}"
echo -e "${BLUE}   Serving from: ${UPDATES_DIR}${NC}"
echo ""

# Vérifier que le répertoire existe
if [ ! -d "$UPDATES_DIR" ]; then
    echo -e "${YELLOW}⚠️  Directory ${UPDATES_DIR} does not exist, creating...${NC}"
    mkdir -p "$UPDATES_DIR"
fi

# Vérifier que Python est disponible
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ python3 non trouvé${NC}"
    exit 1
fi

# Vérifier que le port est libre
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo -e "${YELLOW}⚠️  Port ${PORT} is already in use${NC}"
    echo -e "${YELLOW}   Kill existing process or use a different port${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Starting HTTP server...${NC}"
echo -e "${BLUE}   Access updates at: http://localhost:${PORT}/${NC}"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
echo ""

# Démarrer le serveur
cd "$UPDATES_DIR"
python3 -m http.server "$PORT"

