#!/bin/bash

# Script pour préparer les valeurs des secrets GitHub Actions
# Usage: bash scripts/prepare-github-secrets.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

CERT_FILE="developerID_application.cer"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}🔐 Préparation des secrets GitHub Actions${NC}"
echo ""

# Vérifier que le fichier .cer existe
if [ ! -f "$CERT_FILE" ]; then
    echo -e "${RED}❌ Fichier certificat non trouvé: ${CERT_FILE}${NC}"
    exit 1
fi

# Encoder le certificat en base64
echo -e "${BLUE}📦 Encodage du certificat en base64...${NC}"
APPLE_CERTIFICATE=$(base64 -i "$CERT_FILE" | tr -d '\n')

# Détecter l'identité et le Team ID
CERT_SUBJECT=$(openssl x509 -inform DER -in "$CERT_FILE" -noout -subject 2>/dev/null)
DETECTED_IDENTITY=$(echo "$CERT_SUBJECT" | grep -oE 'CN=Developer ID Application:[^,)]*[^,)]*\)' | sed 's/CN=//')
DETECTED_TEAM_ID=$(echo "$CERT_SUBJECT" | grep -oE '\([A-Z0-9]{10}\)' | tr -d '()' | head -1)

echo ""
echo -e "${GREEN}====================================${NC}"
echo -e "${GREEN}📋 Valeurs pour GitHub Secrets${NC}"
echo -e "${GREEN}====================================${NC}"
echo ""
echo -e "${YELLOW}1. Allez dans GitHub → Settings → Secrets and variables → Actions${NC}"
echo -e "${YELLOW}2. Ajoutez ces 4 secrets:${NC}"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Secret: APPLE_CERTIFICATE${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "$APPLE_CERTIFICATE"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Secret: APPLE_CERTIFICATE_PASSWORD (OPTIONNEL)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "⚠️  Si votre certificat n'a pas de mot de passe (cas des .cer),"
echo "   NE CRÉEZ PAS ce secret sur GitHub (GitHub ne permet pas les secrets vides)"
echo "   Le workflow fonctionnera sans ce secret."
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Secret: APPLE_SIGNING_IDENTITY${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "$DETECTED_IDENTITY"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Secret: APPLE_TEAM_ID${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "$DETECTED_TEAM_ID"
echo ""
echo -e "${GREEN}✅ Une fois ces secrets ajoutés, GitHub Actions signera automatiquement !${NC}"
echo ""

