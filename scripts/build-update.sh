#!/bin/bash

# Script pour builder et signer les fichiers de mise à jour
# Usage: ./scripts/build-update.sh [dev|prod] [version]

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

# Configuration
ENV="${1:-dev}"
VERSION="${2:-}"
PRIVATE_KEY="${HOME}/.tauri/reachy-mini.key"
PUBLIC_KEY="${HOME}/.tauri/reachy-mini.key.pub"
RELEASES_DIR="releases"
DEV_RELEASES_DIR="test-updates"

# Vérifier les arguments
if [ "$ENV" != "dev" ] && [ "$ENV" != "prod" ]; then
    echo -e "${RED}❌ Usage: $0 [dev|prod] [version]${NC}"
    exit 1
fi

# Récupérer la version depuis tauri.conf.json si non fournie
if [ -z "$VERSION" ]; then
    VERSION=$(grep -o '"version": "[^"]*"' src-tauri/tauri.conf.json | cut -d'"' -f4)
    if [ -z "$VERSION" ]; then
        echo -e "${RED}❌ Impossible de récupérer la version depuis tauri.conf.json${NC}"
        exit 1
    fi
fi

echo -e "${BLUE}🚀 Building update for ${ENV} environment${NC}"
echo -e "${BLUE}   Version: ${VERSION}${NC}"
echo ""

# Vérifier que la clé privée existe
if [ ! -f "$PRIVATE_KEY" ]; then
    echo -e "${RED}❌ Clé privée non trouvée: ${PRIVATE_KEY}${NC}"
    echo -e "${YELLOW}   Générer avec: yarn tauri signer generate -w ${PRIVATE_KEY}${NC}"
    exit 1
fi

# Vérifier que la clé publique existe
if [ ! -f "$PUBLIC_KEY" ]; then
    echo -e "${RED}❌ Clé publique non trouvée: ${PUBLIC_KEY}${NC}"
    exit 1
fi

# Déterminer le répertoire de sortie
if [ "$ENV" = "dev" ]; then
    OUTPUT_DIR="$DEV_RELEASES_DIR"
else
    OUTPUT_DIR="$RELEASES_DIR"
fi

# Créer le répertoire de sortie
mkdir -p "$OUTPUT_DIR"

# Détecter la plateforme
PLATFORM=""
if [[ "$OSTYPE" == "darwin"* ]]; then
    ARCH=$(uname -m)
    if [ "$ARCH" = "arm64" ]; then
        PLATFORM="darwin-aarch64"
    else
        PLATFORM="darwin-x86_64"
    fi
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    PLATFORM="linux-x86_64"
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
    PLATFORM="windows-x86_64"
else
    echo -e "${RED}❌ Plateforme non supportée: $OSTYPE${NC}"
    exit 1
fi

echo -e "${BLUE}📦 Platform: ${PLATFORM}${NC}"

# 1. Builder l'application
echo ""
echo -e "${BLUE}🔨 Step 1: Building application...${NC}"
if [ "$ENV" = "dev" ]; then
    echo -e "${YELLOW}   Building in debug mode...${NC}"
    yarn tauri build --debug
    BUNDLE_DIR="src-tauri/target/debug/bundle"
else
    echo -e "${YELLOW}   Building in release mode...${NC}"
    yarn tauri build
    BUNDLE_DIR="src-tauri/target/release/bundle"
fi

# 2. Trouver le fichier bundle selon la plateforme
BUNDLE_FILE=""
if [[ "$PLATFORM" == darwin-* ]]; then
    APP_NAME="Reachy Mini Control.app"
    APP_PATH="$BUNDLE_DIR/macos/$APP_NAME"
    if [ ! -d "$APP_PATH" ]; then
        echo -e "${RED}❌ Bundle non trouvé: ${APP_PATH}${NC}"
        exit 1
    fi
    # Créer le tar.gz
    BUNDLE_FILE="$OUTPUT_DIR/reachy-mini-control_${VERSION}_${PLATFORM}.app.tar.gz"
    echo -e "${BLUE}📦 Creating archive: ${BUNDLE_FILE}${NC}"
    
    # Nettoyer les fichiers de métadonnées macOS avant de créer l'archive
    echo -e "${YELLOW}   Cleaning macOS metadata files...${NC}"
    find "$APP_PATH" -name "._*" -type f -delete 2>/dev/null || true
    find "$APP_PATH" -name ".DS_Store" -type f -delete 2>/dev/null || true
    
    cd "$BUNDLE_DIR/macos"
    # Utiliser ditto pour copier dans un répertoire temporaire propre (sans resource forks)
    # puis tar pour créer l'archive finale
    TEMP_DIR=$(mktemp -d -t bundle-clean-XXXXXX)
    ditto --norsrc "$APP_NAME" "$TEMP_DIR/$APP_NAME" 2>/dev/null || {
        # Si ditto échoue, utiliser tar directement avec COPYFILE_DISABLE
        echo -e "${YELLOW}   ditto failed, using tar with COPYFILE_DISABLE...${NC}"
        COPYFILE_DISABLE=1 tar --disable-copyfile -czf "$PROJECT_DIR/$BUNDLE_FILE" --exclude='._*' --exclude='.DS_Store' "$APP_NAME"
        cd "$PROJECT_DIR"
    }
    
    # Si ditto a réussi, créer l'archive tar.gz depuis le répertoire propre
    if [ -d "$TEMP_DIR/$APP_NAME" ]; then
        COPYFILE_DISABLE=1 tar --disable-copyfile -czf "$PROJECT_DIR/$BUNDLE_FILE" -C "$TEMP_DIR" "$APP_NAME"
        rm -rf "$TEMP_DIR"
    fi
    cd "$PROJECT_DIR"
elif [[ "$PLATFORM" == windows-* ]]; then
    BUNDLE_FILE=$(find "$BUNDLE_DIR/msi" -name "*.msi" | head -1)
    if [ -z "$BUNDLE_FILE" ]; then
        echo -e "${RED}❌ Bundle MSI non trouvé${NC}"
        exit 1
    fi
    cp "$BUNDLE_FILE" "$OUTPUT_DIR/"
    BUNDLE_FILE="$OUTPUT_DIR/$(basename "$BUNDLE_FILE")"
elif [[ "$PLATFORM" == linux-* ]]; then
    BUNDLE_FILE=$(find "$BUNDLE_DIR/appimage" -name "*.AppImage" | head -1)
    if [ -z "$BUNDLE_FILE" ]; then
        echo -e "${RED}❌ Bundle AppImage non trouvé${NC}"
        exit 1
    fi
    cp "$BUNDLE_FILE" "$OUTPUT_DIR/"
    BUNDLE_FILE="$OUTPUT_DIR/$(basename "$BUNDLE_FILE")"
fi

if [ ! -f "$BUNDLE_FILE" ]; then
    echo -e "${RED}❌ Fichier bundle non créé: ${BUNDLE_FILE}${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Bundle créé: ${BUNDLE_FILE}${NC}"

# 3. Signer le fichier
echo ""
echo -e "${BLUE}🔐 Step 2: Signing bundle...${NC}"
SIGNATURE_FILE="${BUNDLE_FILE}.sig"

# Vérifier si tauri CLI est disponible
if ! command -v yarn &> /dev/null; then
    echo -e "${RED}❌ yarn non trouvé${NC}"
    exit 1
fi

# Signer avec tauri signer
echo -e "${YELLOW}   Signing with tauri signer...${NC}"

# Convertir le chemin relatif en absolu si nécessaire
if [[ "$PRIVATE_KEY" == ~* ]]; then
    PRIVATE_KEY="${PRIVATE_KEY/#\~/$HOME}"
fi

# Utiliser le mot de passe si fourni via variable d'environnement
if [ -n "$TAURI_SIGNING_KEY_PASSWORD" ]; then
    yarn tauri signer sign -f "$PRIVATE_KEY" -p "$TAURI_SIGNING_KEY_PASSWORD" "$BUNDLE_FILE" || {
        echo -e "${RED}❌ Erreur lors de la signature${NC}"
        exit 1
    }
    else
        # Essayer sans mot de passe (pour clés générées avec --ci)
        if yarn tauri signer sign -f "$PRIVATE_KEY" "$BUNDLE_FILE" 2>/dev/null; then
            echo -e "${GREEN}✅ Signature réussie avec tauri signer${NC}"
        else
            # Si tauri signer échoue, essayer minisign directement (si disponible)
            if command -v minisign &> /dev/null && [ -f ~/.minisign/minisign-dev.key ]; then
                echo -e "${YELLOW}⚠️  tauri signer échoué, utilisation de minisign directement...${NC}"
                if minisign -S -s ~/.minisign/minisign-dev.key -m "$BUNDLE_FILE" -x "$SIGNATURE_FILE" 2>/dev/null; then
                    echo -e "${GREEN}✅ Signature réussie avec minisign${NC}"
                else
                    if [ "$ENV" = "dev" ]; then
                        echo -e "${RED}❌ Erreur lors de la signature avec minisign${NC}"
                        exit 1
                    else
                        echo -e "${RED}❌ Erreur lors de la signature (requis en prod)${NC}"
                        exit 1
                    fi
                fi
            else
                if [ "$ENV" = "dev" ]; then
                    echo -e "${RED}❌ minisign non disponible et tauri signer échoué${NC}"
                    echo -e "${YELLOW}   Installer minisign: brew install minisign${NC}"
                    echo -e "${YELLOW}   Puis générer une clé: minisign -G -s ~/.minisign/minisign-dev.key -p ~/.minisign/minisign-dev.key.pub -W${NC}"
                    exit 1
                else
                    echo -e "${RED}❌ Erreur lors de la signature (requis en prod)${NC}"
                    exit 1
                fi
            fi
        fi
    fi

# Vérifier que la signature a été créée
if [ ! -f "$SIGNATURE_FILE" ]; then
    if [ "$ENV" = "dev" ]; then
        echo -e "${YELLOW}⚠️  Pas de signature, utilisation d'une signature de test${NC}"
        SIGNATURE="test-signature-placeholder"
    else
        echo -e "${RED}❌ Fichier de signature non créé${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✅ Bundle signé: ${SIGNATURE_FILE}${NC}"
    
    # 4. Lire la signature en base64
    # Compatible macOS et Linux
    if [[ "$OSTYPE" == "darwin"* ]]; then
        SIGNATURE=$(base64 -i "$SIGNATURE_FILE" | tr -d '\n')
    else
        SIGNATURE=$(base64 -w 0 "$SIGNATURE_FILE")
    fi
    if [ -z "$SIGNATURE" ]; then
        if [ "$ENV" = "dev" ]; then
            echo -e "${YELLOW}⚠️  Signature vide, utilisation d'une signature de test${NC}"
            SIGNATURE="test-signature-placeholder"
        else
            echo -e "${RED}❌ Impossible de lire la signature${NC}"
            exit 1
        fi
    fi
fi

# 5. Générer le JSON de métadonnées
echo ""
echo -e "${BLUE}📄 Step 3: Generating update metadata...${NC}"

# Créer le répertoire pour le JSON
JSON_DIR="$OUTPUT_DIR/$PLATFORM/$VERSION"
mkdir -p "$JSON_DIR"

# Nom du fichier selon la plateforme
if [[ "$PLATFORM" == darwin-* ]]; then
    FILE_NAME="reachy-mini-control_${VERSION}_${PLATFORM}.app.tar.gz"
elif [[ "$PLATFORM" == windows-* ]]; then
    FILE_NAME="reachy-mini-control_${VERSION}_${PLATFORM}-setup.msi"
elif [[ "$PLATFORM" == linux-* ]]; then
    FILE_NAME="reachy-mini-control_${VERSION}_${PLATFORM}.AppImage"
fi

# URL du fichier (dev = localhost, prod = à configurer)
if [ "$ENV" = "dev" ]; then
    FILE_URL="http://localhost:8080/${FILE_NAME}"
else
    # Pour prod, utiliser une variable d'environnement ou une valeur par défaut
    if [ -n "$RELEASE_URL_BASE" ]; then
        FILE_URL="${RELEASE_URL_BASE}/${FILE_NAME}"
    else
        FILE_URL="https://releases.example.com/${FILE_NAME}"
        echo -e "${YELLOW}⚠️  URL de production à configurer via RELEASE_URL_BASE ou dans le script${NC}"
    fi
fi

# Générer le JSON
UPDATE_JSON="$JSON_DIR/update.json"
cat > "$UPDATE_JSON" <<EOF
{
  "version": "${VERSION}",
  "notes": "Update for version ${VERSION}",
  "pub_date": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "platforms": {
    "${PLATFORM}": {
      "signature": "${SIGNATURE}",
      "url": "${FILE_URL}"
    }
  }
}
EOF

echo -e "${GREEN}✅ Metadata créée: ${UPDATE_JSON}${NC}"

# Résumé
echo ""
echo -e "${GREEN}====================================${NC}"
echo -e "${GREEN}✅ Update build completed!${NC}"
echo -e "${GREEN}====================================${NC}"
echo ""
echo -e "${BLUE}Files created:${NC}"
echo "  - Bundle: ${BUNDLE_FILE}"
echo "  - Signature: ${SIGNATURE_FILE}"
echo "  - Metadata: ${UPDATE_JSON}"
echo ""
if [ "$ENV" = "dev" ]; then
    echo -e "${BLUE}To test locally:${NC}"
    echo "  1. Start server: cd ${OUTPUT_DIR} && python3 -m http.server 8080"
    echo "  2. Update endpoint in tauri.conf.json to:"
    echo "     http://localhost:8080/${PLATFORM}/${VERSION}/update.json"
    echo "  3. Run app: yarn tauri:dev"
fi

