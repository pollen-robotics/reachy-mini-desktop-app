#!/bin/bash

# Script to build and sign update files
# Usage: ./scripts/build-update.sh [dev|prod] [version]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_DIR"

# Debug: verify we're in the right directory
echo -e "${BLUE}🔍 Script directory: ${SCRIPT_DIR}${NC}"
echo -e "${BLUE}🔍 Project directory: ${PROJECT_DIR}${NC}"
echo -e "${BLUE}🔍 Current directory: $(pwd)${NC}"

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
# Use TARGET_TRIPLET from environment if provided (for cross-compilation in CI)
# Otherwise, detect from OS
PLATFORM=""
if [ -n "$TARGET_TRIPLET" ]; then
    # Use TARGET_TRIPLET to determine platform (more reliable in CI)
    if [[ "$TARGET_TRIPLET" == *"aarch64-apple-darwin"* ]]; then
        PLATFORM="darwin-aarch64"
    elif [[ "$TARGET_TRIPLET" == *"x86_64-apple-darwin"* ]]; then
        PLATFORM="darwin-x86_64"
    elif [[ "$TARGET_TRIPLET" == *"x86_64-pc-windows-msvc"* ]]; then
        PLATFORM="windows-x86_64"
    elif [[ "$TARGET_TRIPLET" == *"x86_64-unknown-linux-gnu"* ]]; then
        PLATFORM="linux-x86_64"
    else
        echo -e "${YELLOW}⚠️  Unknown TARGET_TRIPLET: $TARGET_TRIPLET, falling back to OS detection${NC}"
        TARGET_TRIPLET="" # Clear to use fallback
    fi
fi

# Fallback to OS detection if TARGET_TRIPLET not set or not recognized
if [ -z "$PLATFORM" ]; then
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
fi

echo -e "${BLUE}📦 Platform: ${PLATFORM}${NC}"
if [ -n "$TARGET_TRIPLET" ]; then
    echo -e "${BLUE}   Target: ${TARGET_TRIPLET}${NC}"
fi

# Determine bundle directory first (before building)
# Adjust BUNDLE_DIR if target was specified
if [ -n "$TARGET_TRIPLET" ]; then
    if [ "$ENV" = "dev" ]; then
        BUNDLE_DIR="src-tauri/target/$TARGET_TRIPLET/debug/bundle"
    else
        BUNDLE_DIR="src-tauri/target/$TARGET_TRIPLET/release/bundle"
    fi
else
    if [ "$ENV" = "dev" ]; then
        BUNDLE_DIR="src-tauri/target/debug/bundle"
    else
        BUNDLE_DIR="src-tauri/target/release/bundle"
    fi
fi

# 1. Build the application (only if bundle doesn't exist)
echo ""
echo -e "${BLUE}🔨 Step 1: Building application...${NC}"

# Check if bundle already exists (e.g., built by CI/CD)
BUNDLE_EXISTS=false
if [[ "$PLATFORM" == darwin-* ]]; then
    if [ -d "$BUNDLE_DIR/macos/Reachy Mini Control.app" ]; then
        BUNDLE_EXISTS=true
    fi
elif [[ "$PLATFORM" == windows-* ]]; then
    if [ -d "$BUNDLE_DIR/msi" ] && [ -n "$(find "$BUNDLE_DIR/msi" -name "*.msi" 2>/dev/null | head -1)" ]; then
        BUNDLE_EXISTS=true
    fi
elif [[ "$PLATFORM" == linux-* ]]; then
    if [ -d "$BUNDLE_DIR/deb" ] && [ -n "$(find "$BUNDLE_DIR/deb" -name "*.deb" 2>/dev/null | head -1)" ]; then
        BUNDLE_EXISTS=true
    fi
fi

if [ "$BUNDLE_EXISTS" = true ]; then
    echo -e "${GREEN}✅ Bundle already exists, skipping build${NC}"
else
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
    else
        echo -e "${YELLOW}   Building in release mode...${NC}"
        if [ -n "$TARGET_ARG" ]; then
            yarn tauri build $TARGET_ARG
        else
            yarn tauri build
        fi
    fi
fi

# 2. Find bundle file according to platform
BUNDLE_FILE=""
if [[ "$PLATFORM" == darwin-* ]]; then
    APP_NAME="Reachy Mini Control.app"
    APP_PATH="$BUNDLE_DIR/macos/$APP_NAME"
    
    # Always use absolute path from PROJECT_DIR
    if [[ "$APP_PATH" != /* ]]; then
        # Relative path - make it absolute
        APP_PATH="$PROJECT_DIR/$APP_PATH"
    fi
    
    if [ ! -d "$APP_PATH" ]; then
        echo -e "${RED}❌ Bundle not found: ${APP_PATH}${NC}"
        echo -e "${YELLOW}   PROJECT_DIR: ${PROJECT_DIR}${NC}"
        echo -e "${YELLOW}   BUNDLE_DIR: ${BUNDLE_DIR}${NC}"
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
    # Find MSI file - try multiple methods for cross-platform compatibility
    # On Windows, paths might be absolute (D:\...) or relative
    MSI_DIR="$BUNDLE_DIR/msi"
    
    # Debug: show current directory and what we're looking for
    echo -e "${BLUE}🔍 Debug: Current directory: $(pwd)${NC}"
    echo -e "${BLUE}🔍 Debug: PROJECT_DIR: ${PROJECT_DIR}${NC}"
    echo -e "${BLUE}🔍 Debug: BUNDLE_DIR: ${BUNDLE_DIR}${NC}"
    echo -e "${BLUE}🔍 Debug: Looking for MSI in: ${MSI_DIR}${NC}"
    
    # Try absolute path from PROJECT_DIR first
    ABS_MSI_DIR="$PROJECT_DIR/$MSI_DIR"
    echo -e "${BLUE}🔍 Debug: Absolute MSI path: ${ABS_MSI_DIR}${NC}"
    if [ -d "$ABS_MSI_DIR" ]; then
        echo -e "${BLUE}✅ Found MSI directory at: ${ABS_MSI_DIR}${NC}"
        MSI_DIR="$ABS_MSI_DIR"
    fi
    
    # Try to find MSI with multiple path strategies
    BUNDLE_FILE=""
    
    # Always use absolute path from PROJECT_DIR
    # On Windows in CI, paths can be tricky, so use absolute path
    if [[ "$MSI_DIR" != /* ]] && [[ "$MSI_DIR" != [A-Za-z]:* ]]; then
        # Relative path - make it absolute
        MSI_DIR="$PROJECT_DIR/$MSI_DIR"
    fi
    
    # Verify the directory exists
    if [ ! -d "$MSI_DIR" ]; then
        echo -e "${RED}❌ MSI directory not found: ${MSI_DIR}${NC}"
        echo -e "${YELLOW}   PROJECT_DIR: ${PROJECT_DIR}${NC}"
        echo -e "${YELLOW}   BUNDLE_DIR: ${BUNDLE_DIR}${NC}"
        echo -e "${YELLOW}   Looking for MSI files in bundle directory:${NC}"
        ABS_BUNDLE_DIR="$PROJECT_DIR/$BUNDLE_DIR"
        if [ -d "$ABS_BUNDLE_DIR" ]; then
            echo -e "${YELLOW}   Contents of: ${ABS_BUNDLE_DIR}${NC}"
            ls -la "$ABS_BUNDLE_DIR" || true
        elif [ -d "$BUNDLE_DIR" ]; then
            echo -e "${YELLOW}   Contents of: ${BUNDLE_DIR}${NC}"
            ls -la "$BUNDLE_DIR" || true
        else
            echo -e "${YELLOW}   Bundle directory not found at all${NC}"
        fi
        exit 1
    fi
    
    # Try find first (works on Unix-like systems and Git Bash on Windows)
    BUNDLE_FILE=$(find "$MSI_DIR" -name "*.msi" 2>/dev/null | head -1)
    
    # If find failed, try ls (works on Windows with Git Bash)
    if [ -z "$BUNDLE_FILE" ] || [ ! -f "$BUNDLE_FILE" ]; then
        BUNDLE_FILE=$(ls "$MSI_DIR"/*.msi 2>/dev/null | head -1)
    fi
    
    # If still not found, try with wildcard expansion
    if [ -z "$BUNDLE_FILE" ] || [ ! -f "$BUNDLE_FILE" ]; then
        for msi in "$MSI_DIR"/*.msi; do
            if [ -f "$msi" ]; then
                BUNDLE_FILE="$msi"
                break
            fi
        done
    fi
    
    if [ -z "$BUNDLE_FILE" ] || [ ! -f "$BUNDLE_FILE" ]; then
        echo -e "${RED}❌ MSI bundle not found in: ${MSI_DIR}${NC}"
        echo -e "${YELLOW}   Contents of MSI directory:${NC}"
        ls -la "$MSI_DIR" || true
        exit 1
    fi
    
    echo -e "${GREEN}✅ Found MSI: ${BUNDLE_FILE}${NC}"
    
    # Tauri v2 updater uses the raw MSI directly (no zip wrapper).
    # The zip crate in tauri-plugin-updater is compiled without deflate support,
    # so .msi.zip files with Deflate compression cause "compression method not supported".
    
elif [[ "$PLATFORM" == linux-* ]]; then
    # Find .AppImage file (primary Linux update format)
    APPIMAGE_DIR="$BUNDLE_DIR/appimage"
    
    # Always use absolute path from PROJECT_DIR
    if [[ "$APPIMAGE_DIR" != /* ]]; then
        APPIMAGE_DIR="$PROJECT_DIR/$APPIMAGE_DIR"
    fi
    
    if [ ! -d "$APPIMAGE_DIR" ]; then
        echo -e "${RED}❌ AppImage directory not found: ${APPIMAGE_DIR}${NC}"
        echo -e "${YELLOW}   Make sure 'appimage' is in tauri.conf.json targets!${NC}"
        ABS_BUNDLE_DIR="$PROJECT_DIR/$BUNDLE_DIR"
        if [ -d "$ABS_BUNDLE_DIR" ]; then
            ls -la "$ABS_BUNDLE_DIR" || true
        fi
        exit 1
    fi
    
    APPIMAGE_FILE=$(find "$APPIMAGE_DIR" -name "*.AppImage" 2>/dev/null | head -1)
    if [ -z "$APPIMAGE_FILE" ]; then
        APPIMAGE_FILE=$(ls "$APPIMAGE_DIR"/*.AppImage 2>/dev/null | head -1)
    fi
    
    if [ -z "$APPIMAGE_FILE" ] || [ ! -f "$APPIMAGE_FILE" ]; then
        echo -e "${RED}❌ AppImage not found in: ${APPIMAGE_DIR}${NC}"
        ls -la "$APPIMAGE_DIR" || true
        exit 1
    fi
    
    echo -e "${BLUE}📦 Found AppImage: ${APPIMAGE_FILE}${NC}"
    
    APPIMAGE_BASENAME=$(basename "$APPIMAGE_FILE")
    TAR_FILE="$OUTPUT_DIR/${APPIMAGE_BASENAME}.tar.gz"
    
    echo -e "${BLUE}📦 Creating tar.gz archive for updater: ${TAR_FILE}${NC}"
    tar -czf "$TAR_FILE" -C "$(dirname "$APPIMAGE_FILE")" "$APPIMAGE_BASENAME"
    
    if [ ! -f "$TAR_FILE" ]; then
        echo -e "${RED}❌ Failed to create tar.gz archive${NC}"
        exit 1
    fi
    
    BUNDLE_FILE="$TAR_FILE"
    echo -e "${GREEN}✅ tar.gz archive created: ${BUNDLE_FILE}${NC}"
    
    # Also find .deb file for deb-based update support (tauri-plugin-updater >= 2.10)
    DEB_FILE=""
    DEB_DIR="$BUNDLE_DIR/deb"
    if [[ "$DEB_DIR" != /* ]]; then
        DEB_DIR="$PROJECT_DIR/$DEB_DIR"
    fi
    
    if [ -d "$DEB_DIR" ]; then
        DEB_FILE=$(find "$DEB_DIR" -name "*.deb" 2>/dev/null | head -1)
        if [ -z "$DEB_FILE" ]; then
            DEB_FILE=$(ls "$DEB_DIR"/*.deb 2>/dev/null | head -1)
        fi
        
        if [ -n "$DEB_FILE" ] && [ -f "$DEB_FILE" ]; then
            echo -e "${GREEN}✅ Found .deb package: ${DEB_FILE}${NC}"
        else
            echo -e "${YELLOW}⚠️  No .deb package found, skipping deb update entry${NC}"
            DEB_FILE=""
        fi
    else
        echo -e "${YELLOW}⚠️  No deb directory found, skipping deb update entry${NC}"
    fi
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
    
    # 4. Read signature for latest.json
    # Tauri expects: base64(minisign_text_format)
    # The minisign text format is:
    #   untrusted comment: ...
    #   <signature line>
    #   trusted comment: ...
    #   <hash line>
    #
    # IMPORTANT: Detect if .sig is already base64 or raw minisign text
    # - If raw text (starts with "untrusted comment") → encode to base64
    # - If already base64 → use as-is (DO NOT double-encode!)
    
    FIRST_LINE=$(head -1 "$SIGNATURE_FILE")
    
    if echo "$FIRST_LINE" | grep -q "untrusted comment"; then
        # Raw minisign text format → encode to base64 (correct behavior)
        echo -e "${BLUE}   Signature is in raw minisign text format, encoding to base64...${NC}"
        if [[ "$OSTYPE" == "darwin"* ]]; then
            SIGNATURE=$(base64 -i "$SIGNATURE_FILE" | tr -d '\n\r')
        else
            SIGNATURE=$(base64 -w 0 "$SIGNATURE_FILE" | tr -d '\r')
        fi
    else
        # Already base64 format → use as-is (avoid double encoding!)
        echo -e "${YELLOW}⚠️  Signature is already in base64 format, using as-is (no re-encoding)${NC}"
        SIGNATURE=$(cat "$SIGNATURE_FILE" | tr -d '\n\r\t ')
        
        # Verify it decodes to minisign format
        DECODED_FIRST=$(echo "$SIGNATURE" | base64 -d 2>/dev/null | head -1 || echo "")
        if ! echo "$DECODED_FIRST" | grep -q "untrusted comment"; then
            echo -e "${RED}❌ ERROR: Signature file is neither raw minisign text nor valid base64 of minisign text${NC}"
            echo -e "${RED}   First line of file: $FIRST_LINE${NC}"
            echo -e "${RED}   First line after base64 decode: $DECODED_FIRST${NC}"
            exit 1
        fi
    fi
    
    # ✅ Verify the signature is not empty and is valid base64
    if [ -z "$SIGNATURE" ]; then
        echo -e "${RED}❌ Signature encoding resulted in empty string${NC}"
        exit 1
    fi
    
    # Verify it's valid base64 (should only contain A-Z, a-z, 0-9, +, /, =)
    if ! echo "$SIGNATURE" | grep -qE '^[A-Za-z0-9+/=]+$'; then
        echo -e "${YELLOW}⚠️  Warning: Signature may contain invalid base64 characters${NC}"
        echo -e "${YELLOW}   First 100 chars: ${SIGNATURE:0:100}${NC}"
    fi
    
    # ✅ Final verification: decoded signature should be valid minisign format
    FINAL_CHECK=$(echo "$SIGNATURE" | base64 -d 2>/dev/null | head -1 || echo "")
    if echo "$FINAL_CHECK" | grep -q "untrusted comment"; then
        echo -e "${GREEN}✅ Signature verified: valid base64 of minisign format${NC}"
    else
        echo -e "${RED}❌ ERROR: Final signature is not valid base64 of minisign format${NC}"
        echo -e "${RED}   This will cause 'invalid encoding in minisign data' errors!${NC}"
        exit 1
    fi
fi

# 4b. Sign .deb file if present (Linux only, for tauri-plugin-updater >= 2.10)
DEB_SIGNATURE=""
if [ -n "$DEB_FILE" ] && [ -f "$DEB_FILE" ]; then
    echo ""
    echo -e "${BLUE}🔐 Step 2b: Signing .deb package...${NC}"
    DEB_SIGNATURE_FILE="${DEB_FILE}.sig"
    
    set +e
    if [ -n "$TAURI_SIGNING_KEY_PASSWORD" ]; then
        yarn tauri signer sign -f "$PRIVATE_KEY" -p "$TAURI_SIGNING_KEY_PASSWORD" "$DEB_FILE" 2>&1
    else
        yarn tauri signer sign -v -f "$PRIVATE_KEY" -p "" "$DEB_FILE" 2>&1
    fi
    DEB_SIGN_EXIT=$?
    set -e
    
    if [ -f "$DEB_SIGNATURE_FILE" ]; then
        echo -e "${GREEN}✅ .deb package signed: ${DEB_SIGNATURE_FILE}${NC}"
        
        DEB_FIRST_LINE=$(head -1 "$DEB_SIGNATURE_FILE")
        if echo "$DEB_FIRST_LINE" | grep -q "untrusted comment"; then
            if [[ "$OSTYPE" == "darwin"* ]]; then
                DEB_SIGNATURE=$(base64 -i "$DEB_SIGNATURE_FILE" | tr -d '\n\r')
            else
                DEB_SIGNATURE=$(base64 -w 0 "$DEB_SIGNATURE_FILE" | tr -d '\r')
            fi
        else
            DEB_SIGNATURE=$(cat "$DEB_SIGNATURE_FILE" | tr -d '\n\r\t ')
        fi
        
        echo -e "${GREEN}✅ .deb signature ready${NC}"
    else
        echo -e "${YELLOW}⚠️  Failed to sign .deb (exit code: $DEB_SIGN_EXIT), skipping deb update entry${NC}"
        DEB_FILE=""
    fi
fi

# 5. Generate metadata JSON
echo ""
echo -e "${BLUE}📄 Step 3: Generating update metadata...${NC}"

# Create directory for JSON
JSON_DIR="$OUTPUT_DIR/$PLATFORM/$VERSION"
mkdir -p "$JSON_DIR"

# File name according to platform (must match the actual filenames uploaded to GitHub Releases)
# Use the actual bundle file name that was created.
# GitHub Releases converts spaces to dots in asset names, so we must do the same
# to ensure the download URLs in latest.json match the actual asset URLs.
FILE_NAME=$(basename "$BUNDLE_FILE" | tr ' ' '.')

# Log what we're using
if [[ "$PLATFORM" == darwin-* ]]; then
    echo -e "${BLUE}   macOS update file: ${FILE_NAME}${NC}"
elif [[ "$PLATFORM" == windows-* ]]; then
    # Windows uses raw .msi for Tauri v2 updater (no zip wrapper)
    echo -e "${BLUE}   Windows update file: ${FILE_NAME}${NC}"
elif [[ "$PLATFORM" == linux-* ]]; then
    # Linux uses .AppImage.tar.gz format for updater
    echo -e "${BLUE}   Linux update file: ${FILE_NAME}${NC}"
fi

# File URL (dev = localhost, prod = to be configured)
if [ "$ENV" = "dev" ]; then
    FILE_URL="http://localhost:8080/${FILE_NAME}"
else
    # For prod, use environment variable or default value
    if [ -n "$RELEASE_URL_BASE" ]; then
        # RELEASE_URL_BASE should end with /v, we need to add version and filename
        # Format: https://github.com/user/repo/releases/download/v{VERSION}/filename
        FILE_URL="${RELEASE_URL_BASE}${VERSION}/${FILE_NAME}"
    else
        FILE_URL="https://releases.example.com/${FILE_NAME}"
        echo -e "${YELLOW}⚠️  Production URL to be configured via RELEASE_URL_BASE or in script${NC}"
    fi
fi

# Build the deb URL and platform entry if available (Linux only)
DEB_PLATFORM_ENTRY=""
if [ -n "$DEB_FILE" ] && [ -n "$DEB_SIGNATURE" ]; then
    DEB_FILE_NAME=$(basename "$DEB_FILE" | tr ' ' '.')
    if [ "$ENV" = "dev" ]; then
        DEB_FILE_URL="http://localhost:8080/${DEB_FILE_NAME}"
    elif [ -n "$RELEASE_URL_BASE" ]; then
        DEB_FILE_URL="${RELEASE_URL_BASE}${VERSION}/${DEB_FILE_NAME}"
    else
        DEB_FILE_URL="https://releases.example.com/${DEB_FILE_NAME}"
    fi
    DEB_PLATFORM_ENTRY=",
    \"${PLATFORM}-deb\": {
      \"signature\": \"${DEB_SIGNATURE}\",
      \"url\": \"${DEB_FILE_URL}\"
    }"
    echo -e "${GREEN}✅ Added ${PLATFORM}-deb entry for .deb update support${NC}"
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
    }${DEB_PLATFORM_ENTRY}
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
if [ -n "$DEB_FILE" ] && [ -n "$DEB_SIGNATURE" ]; then
echo "  - Deb package: ${DEB_FILE}"
echo "  - Deb signature: ${DEB_FILE}.sig"
fi
echo "  - Metadata: ${UPDATE_JSON}"
echo ""
if [ "$ENV" = "dev" ]; then
    echo -e "${BLUE}To test locally:${NC}"
    echo "  1. Start server: cd ${OUTPUT_DIR} && python3 -m http.server 8080"
    echo "  2. Update endpoint in tauri.conf.json to:"
    echo "     http://localhost:8080/${PLATFORM}/${VERSION}/update.json"
    echo "  3. Run app: yarn tauri:dev"
fi

