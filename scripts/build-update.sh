#!/bin/bash

# Script to build and sign update files
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

# Check arguments
if [ "$ENV" != "dev" ] && [ "$ENV" != "prod" ]; then
    echo -e "${RED}❌ Usage: $0 [dev|prod] [version]${NC}"
    exit 1
fi

# Get version from tauri.conf.json if not provided
if [ -z "$VERSION" ]; then
    VERSION=$(grep -o '"version": "[^"]*"' src-tauri/tauri.conf.json | cut -d'"' -f4)
    if [ -z "$VERSION" ]; then
        echo -e "${RED}❌ Unable to retrieve version from tauri.conf.json${NC}"
        exit 1
    fi
fi

echo -e "${BLUE}🚀 Building update for ${ENV} environment${NC}"
echo -e "${BLUE}   Version: ${VERSION}${NC}"
echo ""

# Check that private key exists
if [ ! -f "$PRIVATE_KEY" ]; then
    echo -e "${RED}❌ Private key not found: ${PRIVATE_KEY}${NC}"
    echo -e "${YELLOW}   Generate with: yarn tauri signer generate -w ${PRIVATE_KEY}${NC}"
    exit 1
fi

# Check that public key exists
if [ ! -f "$PUBLIC_KEY" ]; then
    echo -e "${RED}❌ Public key not found: ${PUBLIC_KEY}${NC}"
    exit 1
fi

# Determine output directory
if [ "$ENV" = "dev" ]; then
    OUTPUT_DIR="$DEV_RELEASES_DIR"
else
    OUTPUT_DIR="$RELEASES_DIR"
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Detect platform
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
    echo -e "${RED}❌ Unsupported platform: $OSTYPE${NC}"
    exit 1
fi

echo -e "${BLUE}📦 Platform: ${PLATFORM}${NC}"

# 1. Build the application
echo ""
echo -e "${BLUE}🔨 Step 1: Building application...${NC}"

# Use TARGET_TRIPLET from environment if provided (for cross-compilation)
TARGET_ARG=""
if [ -n "$TARGET_TRIPLET" ]; then
    TARGET_ARG="--target $TARGET_TRIPLET"
    echo -e "${BLUE}   Target: ${TARGET_TRIPLET}${NC}"
fi

if [ "$ENV" = "dev" ]; then
    echo -e "${YELLOW}   Building in debug mode...${NC}"
    if [ -n "$TARGET_ARG" ]; then
        yarn tauri build --debug $TARGET_ARG
    else
        yarn tauri build --debug
    fi
    BUNDLE_DIR="src-tauri/target/debug/bundle"
else
    echo -e "${YELLOW}   Building in release mode...${NC}"
    if [ -n "$TARGET_ARG" ]; then
        yarn tauri build $TARGET_ARG
    else
        yarn tauri build
    fi
    BUNDLE_DIR="src-tauri/target/release/bundle"
fi

# Adjust BUNDLE_DIR if target was specified
if [ -n "$TARGET_TRIPLET" ]; then
    BUNDLE_DIR="src-tauri/target/$TARGET_TRIPLET/release/bundle"
    if [ "$ENV" = "dev" ]; then
        BUNDLE_DIR="src-tauri/target/$TARGET_TRIPLET/debug/bundle"
    fi
fi

# 2. Find bundle file according to platform
BUNDLE_FILE=""
if [[ "$PLATFORM" == darwin-* ]]; then
    APP_NAME="Reachy Mini Control.app"
    APP_PATH="$BUNDLE_DIR/macos/$APP_NAME"
    if [ ! -d "$APP_PATH" ]; then
        echo -e "${RED}❌ Bundle not found: ${APP_PATH}${NC}"
        exit 1
    fi
    # Create tar.gz
    BUNDLE_FILE="$OUTPUT_DIR/reachy-mini-control_${VERSION}_${PLATFORM}.app.tar.gz"
    echo -e "${BLUE}📦 Creating archive: ${BUNDLE_FILE}${NC}"
    
    # Clean macOS metadata files before creating archive
    echo -e "${YELLOW}   Cleaning macOS metadata files...${NC}"
    find "$APP_PATH" -name "._*" -type f -delete 2>/dev/null || true
    find "$APP_PATH" -name ".DS_Store" -type f -delete 2>/dev/null || true
    
    cd "$BUNDLE_DIR/macos"
    # Use ditto to copy to a clean temporary directory (without resource forks)
    # then tar to create the final archive
    TEMP_DIR=$(mktemp -d -t bundle-clean-XXXXXX)
    ditto --norsrc "$APP_NAME" "$TEMP_DIR/$APP_NAME" 2>/dev/null || {
        # If ditto fails, use tar directly with COPYFILE_DISABLE
        echo -e "${YELLOW}   ditto failed, using tar with COPYFILE_DISABLE...${NC}"
        COPYFILE_DISABLE=1 tar --disable-copyfile -czf "$PROJECT_DIR/$BUNDLE_FILE" --exclude='._*' --exclude='.DS_Store' "$APP_NAME"
        cd "$PROJECT_DIR"
    }
    
    # If ditto succeeded, create tar.gz archive from clean directory
    if [ -d "$TEMP_DIR/$APP_NAME" ]; then
        COPYFILE_DISABLE=1 tar --disable-copyfile -czf "$PROJECT_DIR/$BUNDLE_FILE" -C "$TEMP_DIR" "$APP_NAME"
        rm -rf "$TEMP_DIR"
    fi
    cd "$PROJECT_DIR"
elif [[ "$PLATFORM" == windows-* ]]; then
    BUNDLE_FILE=$(find "$BUNDLE_DIR/msi" -name "*.msi" | head -1)
    if [ -z "$BUNDLE_FILE" ]; then
        echo -e "${RED}❌ MSI bundle not found${NC}"
        exit 1
    fi
    cp "$BUNDLE_FILE" "$OUTPUT_DIR/"
    BUNDLE_FILE="$OUTPUT_DIR/$(basename "$BUNDLE_FILE")"
elif [[ "$PLATFORM" == linux-* ]]; then
    BUNDLE_FILE=$(find "$BUNDLE_DIR/appimage" -name "*.AppImage" | head -1)
    if [ -z "$BUNDLE_FILE" ]; then
        echo -e "${RED}❌ AppImage bundle not found${NC}"
        exit 1
    fi
    cp "$BUNDLE_FILE" "$OUTPUT_DIR/"
    BUNDLE_FILE="$OUTPUT_DIR/$(basename "$BUNDLE_FILE")"
fi

if [ ! -f "$BUNDLE_FILE" ]; then
    echo -e "${RED}❌ Bundle file not created: ${BUNDLE_FILE}${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Bundle created: ${BUNDLE_FILE}${NC}"

# 3. Sign the file
echo ""
echo -e "${BLUE}🔐 Step 2: Signing bundle...${NC}"
SIGNATURE_FILE="${BUNDLE_FILE}.sig"

# Check if tauri CLI is available
if ! command -v yarn &> /dev/null; then
    echo -e "${RED}❌ yarn not found${NC}"
    exit 1
fi

# Sign with tauri signer
echo -e "${YELLOW}   Signing with tauri signer...${NC}"

# Convert relative path to absolute if necessary
if [[ "$PRIVATE_KEY" == ~* ]]; then
    PRIVATE_KEY="${PRIVATE_KEY/#\~/$HOME}"
fi

# Use password if provided via environment variable
if [ -n "$TAURI_SIGNING_KEY_PASSWORD" ]; then
    yarn tauri signer sign -f "$PRIVATE_KEY" -p "$TAURI_SIGNING_KEY_PASSWORD" "$BUNDLE_FILE" || {
        echo -e "${RED}❌ Error during signing${NC}"
        exit 1
    }
else
    # Try without password (for keys generated with --ci)
    echo -e "${YELLOW}   Attempting to sign without password...${NC}"
    
    # Check that private key exists and is readable
    if [ ! -r "$PRIVATE_KEY" ]; then
        echo -e "${RED}❌ Private key not readable: ${PRIVATE_KEY}${NC}"
        exit 1
    fi
    
    # Check that file to sign exists
    if [ ! -f "$BUNDLE_FILE" ]; then
        echo -e "${RED}❌ File to sign not found: ${BUNDLE_FILE}${NC}"
        exit 1
    fi
    
    echo -e "${BLUE}   Private key: ${PRIVATE_KEY}${NC}"
    echo -e "${BLUE}   File to sign: ${BUNDLE_FILE}${NC}"
    echo -e "${BLUE}   Signature will be: ${SIGNATURE_FILE}${NC}"
    
    # Display first lines of private key for debug (without revealing full content)
    if [ -f "$PRIVATE_KEY" ]; then
        KEY_SIZE=$(wc -c < "$PRIVATE_KEY")
        KEY_LINES=$(wc -l < "$PRIVATE_KEY")
        echo -e "${BLUE}   Private key size: ${KEY_SIZE} bytes, ${KEY_LINES} lines${NC}"
        echo -e "${BLUE}   First line of key: $(head -1 "$PRIVATE_KEY" | cut -c1-50)...${NC}"
    fi
    
    # Try with verbose to see more details
    # Execute directly to see output in real time
    # Explicitly pass empty string for password to avoid reading from stdin
    echo -e "${YELLOW}   Running: yarn tauri signer sign -v -f \"$PRIVATE_KEY\" -p \"\" \"$BUNDLE_FILE\"${NC}"
    set +e  # Temporarily disable set -e to capture error
    yarn tauri signer sign -v -f "$PRIVATE_KEY" -p "" "$BUNDLE_FILE" 2>&1
    SIGN_EXIT_CODE=$?
    set -e  # Re-enable set -e
    
    if [ $SIGN_EXIT_CODE -eq 0 ]; then
        echo -e "${GREEN}✅ Signature successful with tauri signer${NC}"
    else
        echo -e "${YELLOW}⚠️  Exit code: $SIGN_EXIT_CODE${NC}"
        
        # Check if signature file exists anyway
        if [ -f "$SIGNATURE_FILE" ]; then
            echo -e "${GREEN}✅ Signature file created despite error code${NC}"
        else
            # If tauri signer fails, try minisign directly (if available)
            if command -v minisign &> /dev/null && [ -f ~/.minisign/minisign-dev.key ]; then
                echo -e "${YELLOW}⚠️  tauri signer failed, using minisign directly...${NC}"
                if minisign -S -s ~/.minisign/minisign-dev.key -m "$BUNDLE_FILE" -x "$SIGNATURE_FILE" 2>/dev/null; then
                    echo -e "${GREEN}✅ Signature successful with minisign${NC}"
                else
                    if [ "$ENV" = "dev" ]; then
                        echo -e "${RED}❌ Error during signing with minisign${NC}"
                        exit 1
                    else
                        echo -e "${RED}❌ Error during signing (required in prod)${NC}"
                        exit 1
                    fi
                fi
            else
                if [ "$ENV" = "dev" ]; then
                    echo -e "${RED}❌ minisign not available and tauri signer failed${NC}"
                    echo -e "${YELLOW}   Install minisign: brew install minisign${NC}"
                    echo -e "${YELLOW}   Then generate a key: minisign -G -s ~/.minisign/minisign-dev.key -p ~/.minisign/minisign-dev.key.pub -W${NC}"
                    exit 1
                else
                    echo -e "${RED}❌ Error during signing (required in prod)${NC}"
                    exit 1
                fi
            fi
        fi
    fi
fi

# Check that signature was created
if [ ! -f "$SIGNATURE_FILE" ]; then
    if [ "$ENV" = "dev" ]; then
        echo -e "${YELLOW}⚠️  No signature, using test signature${NC}"
        SIGNATURE="test-signature-placeholder"
    else
        echo -e "${RED}❌ Signature file not created${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✅ Bundle signed: ${SIGNATURE_FILE}${NC}"
    
    # 4. Read signature in base64
    # Compatible macOS and Linux
    if [[ "$OSTYPE" == "darwin"* ]]; then
        SIGNATURE=$(base64 -i "$SIGNATURE_FILE" | tr -d '\n')
    else
        SIGNATURE=$(base64 -w 0 "$SIGNATURE_FILE")
    fi
    if [ -z "$SIGNATURE" ]; then
        if [ "$ENV" = "dev" ]; then
            echo -e "${YELLOW}⚠️  Empty signature, using test signature${NC}"
            SIGNATURE="test-signature-placeholder"
        else
            echo -e "${RED}❌ Unable to read signature${NC}"
            exit 1
        fi
    fi
fi

# 5. Generate metadata JSON
echo ""
echo -e "${BLUE}📄 Step 3: Generating update metadata...${NC}"

# Create directory for JSON
JSON_DIR="$OUTPUT_DIR/$PLATFORM/$VERSION"
mkdir -p "$JSON_DIR"

# File name according to platform
if [[ "$PLATFORM" == darwin-* ]]; then
    FILE_NAME="reachy-mini-control_${VERSION}_${PLATFORM}.app.tar.gz"
elif [[ "$PLATFORM" == windows-* ]]; then
    FILE_NAME="reachy-mini-control_${VERSION}_${PLATFORM}-setup.msi"
elif [[ "$PLATFORM" == linux-* ]]; then
    FILE_NAME="reachy-mini-control_${VERSION}_${PLATFORM}.AppImage"
fi

# File URL (dev = localhost, prod = to be configured)
if [ "$ENV" = "dev" ]; then
    FILE_URL="http://localhost:8080/${FILE_NAME}"
else
    # For prod, use environment variable or default value
    if [ -n "$RELEASE_URL_BASE" ]; then
        FILE_URL="${RELEASE_URL_BASE}/${FILE_NAME}"
    else
        FILE_URL="https://releases.example.com/${FILE_NAME}"
        echo -e "${YELLOW}⚠️  Production URL to be configured via RELEASE_URL_BASE or in script${NC}"
    fi
fi

# Generate JSON
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

echo -e "${GREEN}✅ Metadata created: ${UPDATE_JSON}${NC}"

# Summary
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

