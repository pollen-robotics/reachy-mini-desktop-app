#!/bin/bash

# Script pour configurer les variables d'environnement Apple Code Signing
# Usage: source scripts/setup-apple-signing.sh
#
# ⚠️ SÉCURITÉ : Ce script ne logge PAS les secrets dans l'historique
# Les variables sont exportées uniquement dans la session courante

set -e

# Désactiver l'historique pour cette session (évite de sauvegarder les secrets)
set +H

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

CERT_FILE="developerID_application.cer"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔐 Configuration Apple Code Signing${NC}"
echo ""

# Vérifier que le fichier .cer existe
if [ ! -f "$CERT_FILE" ]; then
    echo -e "${RED}❌ Fichier certificat non trouvé: ${CERT_FILE}${NC}"
    echo -e "${YELLOW}   Placez votre fichier .cer à la racine du projet${NC}"
    return 1 2>/dev/null || exit 1
fi

echo -e "${GREEN}✅ Certificat trouvé: ${CERT_FILE}${NC}"

# Encoder le certificat en base64
echo -e "${BLUE}📦 Encodage du certificat en base64...${NC}"
APPLE_CERTIFICATE=$(base64 -i "$CERT_FILE" | tr -d '\n')

if [ -z "$APPLE_CERTIFICATE" ]; then
    echo -e "${RED}❌ Erreur lors de l'encodage du certificat${NC}"
    return 1 2>/dev/null || exit 1
fi

echo -e "${GREEN}✅ Certificat encodé${NC}"
echo ""

# Détecter automatiquement l'identité de signature et le Team ID depuis le certificat
echo -e "${BLUE}🔍 Détection automatique des informations...${NC}"

# Extraire l'identité depuis le certificat .cer
# Format: CN=Developer ID Application: Name (TEAM_ID), OU=...
CERT_SUBJECT=$(openssl x509 -inform DER -in "$CERT_FILE" -noout -subject 2>/dev/null)
DETECTED_IDENTITY=$(echo "$CERT_SUBJECT" | grep -oE 'CN=Developer ID Application:[^,)]*[^,)]*\)' | sed 's/CN=//')

# Extraire le Team ID depuis le certificat (format: CN=Developer ID Application: Name (TEAM_ID))
DETECTED_TEAM_ID=$(openssl x509 -inform DER -in "$CERT_FILE" -noout -subject 2>/dev/null | grep -oE '\([A-Z0-9]{10}\)' | tr -d '()' | head -1)

# Si pas trouvé, essayer depuis Keychain Access
if [ -z "$DETECTED_IDENTITY" ]; then
    DETECTED_IDENTITY=$(security find-certificate -a -c "Developer ID Application" 2>/dev/null | grep -oE '"alis"<blob>="Developer ID Application:[^"]*"' | head -1 | sed 's/.*"alis"<blob>="\(.*\)"/\1/')
fi

if [ -z "$DETECTED_TEAM_ID" ] && [ -n "$DETECTED_IDENTITY" ]; then
    # Extraire le Team ID depuis l'identité (format: Name (TEAM_ID))
    DETECTED_TEAM_ID=$(echo "$DETECTED_IDENTITY" | grep -oE '\([A-Z0-9]{10}\)' | tr -d '()')
fi

# Afficher les valeurs détectées
if [ -n "$DETECTED_IDENTITY" ]; then
    echo -e "${GREEN}✅ Identité détectée: ${DETECTED_IDENTITY}${NC}"
else
    echo -e "${YELLOW}⚠️  Identité non détectée automatiquement${NC}"
fi

if [ -n "$DETECTED_TEAM_ID" ]; then
    echo -e "${GREEN}✅ Team ID détecté: ${DETECTED_TEAM_ID}${NC}"
else
    echo -e "${YELLOW}⚠️  Team ID non détecté automatiquement${NC}"
fi

echo ""

# Demander les autres informations nécessaires
echo -e "${YELLOW}📝 Veuillez confirmer ou fournir les informations suivantes:${NC}"
echo ""

# APPLE_CERTIFICATE_PASSWORD (peut être vide pour .cer)
# Utiliser read -sp pour mode silencieux (ne pas afficher le mot de passe)
read -sp "Mot de passe du certificat (peut être vide pour .cer, appuyez sur Entrée pour ignorer): " APPLE_CERTIFICATE_PASSWORD
echo ""
# Ne pas logger le mot de passe dans l'historique
unset HISTFILE 2>/dev/null || true

# APPLE_SIGNING_IDENTITY
echo ""
if [ -n "$DETECTED_IDENTITY" ]; then
    echo -e "${BLUE}Identité de signature détectée:${NC}"
    echo "  ${DETECTED_IDENTITY}"
    read -p "Utiliser cette identité? [O/n]: " USE_DETECTED
    if [[ "$USE_DETECTED" =~ ^[Nn]$ ]]; then
        echo -e "${BLUE}Pour trouver votre identité de signature:${NC}"
        echo "  security find-identity -v -p codesigning"
        echo ""
        read -p "Identité de signature: " APPLE_SIGNING_IDENTITY
    else
        APPLE_SIGNING_IDENTITY="$DETECTED_IDENTITY"
        echo -e "${GREEN}✅ Utilisation de l'identité détectée${NC}"
    fi
else
    echo -e "${BLUE}Pour trouver votre identité de signature:${NC}"
    echo "  security find-identity -v -p codesigning"
    echo ""
    read -p "Identité de signature (ex: 'Developer ID Application: Your Name (TEAM_ID)'): " APPLE_SIGNING_IDENTITY
fi

if [ -z "$APPLE_SIGNING_IDENTITY" ]; then
    echo -e "${RED}❌ L'identité de signature est requise${NC}"
    return 1 2>/dev/null || exit 1
fi

# APPLE_TEAM_ID
if [ -n "$DETECTED_TEAM_ID" ]; then
    echo ""
    echo -e "${BLUE}Team ID détecté: ${DETECTED_TEAM_ID}${NC}"
    read -p "Utiliser ce Team ID? [O/n]: " USE_DETECTED_TEAM
    if [[ "$USE_DETECTED_TEAM" =~ ^[Nn]$ ]]; then
        read -p "Apple Team ID (10 caractères): " APPLE_TEAM_ID
    else
        APPLE_TEAM_ID="$DETECTED_TEAM_ID"
        echo -e "${GREEN}✅ Utilisation du Team ID détecté${NC}"
    fi
else
    read -p "Apple Team ID (10 caractères): " APPLE_TEAM_ID
fi

if [ -z "$APPLE_TEAM_ID" ]; then
    echo -e "${RED}❌ Le Team ID est requis${NC}"
    return 1 2>/dev/null || exit 1
fi

# Exporter les variables d'environnement
export APPLE_CERTIFICATE
export APPLE_CERTIFICATE_PASSWORD
export APPLE_SIGNING_IDENTITY
export APPLE_TEAM_ID

echo ""
echo -e "${GREEN}====================================${NC}"
echo -e "${GREEN}✅ Variables d'environnement configurées!${NC}"
echo -e "${GREEN}====================================${NC}"
echo ""
echo -e "${BLUE}Variables exportées (valeurs masquées pour sécurité):${NC}"
echo "  APPLE_CERTIFICATE=${APPLE_CERTIFICATE:0:50}... (${#APPLE_CERTIFICATE} caractères au total)"
echo "  APPLE_CERTIFICATE_PASSWORD=${APPLE_CERTIFICATE_PASSWORD:+***masqué***}"
if [ -n "$APPLE_SIGNING_IDENTITY" ]; then
    # Masquer le Team ID dans l'identité pour la sécurité
    IDENTITY_MASKED=$(echo "$APPLE_SIGNING_IDENTITY" | sed 's/([^)]*)/(***)/')
    echo "  APPLE_SIGNING_IDENTITY=${IDENTITY_MASKED}"
else
    echo "  APPLE_SIGNING_IDENTITY=(non défini)"
fi
echo "  APPLE_TEAM_ID=${APPLE_TEAM_ID}"
echo ""
echo -e "${YELLOW}⚠️  Les valeurs complètes sont dans les variables d'environnement mais ne sont pas affichées ici${NC}"
echo ""
echo -e "${YELLOW}💡 Pour utiliser ces variables dans un autre terminal:${NC}"
echo "  source scripts/setup-apple-signing.sh"
echo ""
echo -e "${YELLOW}💡 Pour build avec signature:${NC}"
echo "  yarn tauri build"
echo ""

