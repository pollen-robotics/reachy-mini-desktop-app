#!/bin/bash

# Script pour préparer les valeurs des secrets GitHub Actions
# Usage: bash scripts/prepare-github-secrets.sh [MOT_DE_PASSE]
#        Si le mot de passe n'est pas fourni, il sera demandé interactivement

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

# Chercher un fichier .p12 ou .cer
CERT_FILE=""
if [ -f "Certificates.p12" ]; then
    CERT_FILE="Certificates.p12"
elif [ -f "developerID_application.p12" ]; then
    CERT_FILE="developerID_application.p12"
elif [ -f "developerID_application.cer" ]; then
    CERT_FILE="developerID_application.cer"
else
    echo -e "${RED}❌ Aucun fichier certificat trouvé (.p12 ou .cer)${NC}"
    echo "   Placez Certificates.p12 ou developerID_application.p12 à la racine du projet"
    exit 1
fi

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}🔐 Préparation des secrets GitHub Actions${NC}"
echo ""
echo -e "${BLUE}📁 Fichier trouvé: ${CERT_FILE}${NC}"
echo ""

# Encoder le certificat en base64
echo -e "${BLUE}📦 Encodage du certificat en base64...${NC}"
APPLE_CERTIFICATE=$(base64 -i "$CERT_FILE" | tr -d '\n')

# Détecter l'identité et le Team ID selon le type de fichier
if [[ "$CERT_FILE" == *.p12 ]]; then
    # Pour .p12, extraire le certificat d'abord
    echo -e "${BLUE}🔍 Extraction des informations du certificat .p12...${NC}"
    
    # Prendre le mot de passe en argument ou le demander
    if [ -n "$1" ]; then
        P12_PASSWORD="$1"
    else
        read -sp "Mot de passe du .p12: " P12_PASSWORD
        echo ""
    fi
    
    # Extraire le certificat depuis le .p12 et obtenir le subject en une seule commande
    # Utiliser -legacy pour OpenSSL 3.x qui ne supporte plus les anciens algorithmes (RC2-40-CBC)
    CERT_SUBJECT=$(openssl pkcs12 -in "$CERT_FILE" -clcerts -nokeys -legacy -passin pass:"$P12_PASSWORD" 2>/dev/null | \
        openssl x509 -noout -subject 2>/dev/null)
    
    if [ -z "$CERT_SUBJECT" ]; then
        echo -e "${RED}❌ Erreur lors de l'extraction. Vérifiez le mot de passe.${NC}"
        exit 1
    fi
    
    # Stocker le mot de passe pour l'affichage
    STORED_PASSWORD="$P12_PASSWORD"
else
    # Pour .cer
    CERT_SUBJECT=$(openssl x509 -inform DER -in "$CERT_FILE" -noout -subject 2>/dev/null)
    STORED_PASSWORD=""
fi

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
echo -e "${BLUE}Secret: APPLE_CERTIFICATE_PASSWORD${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
if [[ "$CERT_FILE" == *.p12 ]]; then
    echo "$STORED_PASSWORD"
    echo ""
    echo -e "${YELLOW}⚠️  Copiez le mot de passe ci-dessus${NC}"
else
    echo -e "${YELLOW}⚠️  Pour un .cer, ce secret n'est pas nécessaire${NC}"
    echo "   Mais si vous avez un .p12, vous devez créer ce secret avec le mot de passe"
fi
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

