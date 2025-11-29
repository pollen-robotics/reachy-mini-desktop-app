#!/bin/bash

# Script pour corriger la signature d'une app macOS avec entitlements
# Usage: ./scripts/utils/fix-app-signature.sh [path-to-app]

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_DIR"

# Find app bundle
if [ -n "$1" ]; then
    APP_BUNDLE="$1"
else
    APP_BUNDLE=$(find src-tauri/target -name "*.app" -type d 2>/dev/null | grep -E "(release|debug)" | head -1)
fi

if [ -z "$APP_BUNDLE" ] || [ ! -d "$APP_BUNDLE" ]; then
    echo -e "${RED}❌ App bundle not found${NC}"
    exit 1
fi

ENTITLEMENTS_FILE="src-tauri/entitlements.plist"

if [ ! -f "$ENTITLEMENTS_FILE" ]; then
    echo -e "${RED}❌ Entitlements file not found: $ENTITLEMENTS_FILE${NC}"
    exit 1
fi

echo -e "${BLUE}🔐 Fixing app signature...${NC}"
echo "   App: $APP_BUNDLE"
echo "   Entitlements: $ENTITLEMENTS_FILE"
echo ""

# Check if we have a signing identity
SIGNING_IDENTITY=$(security find-identity -v -p codesigning 2>/dev/null | grep "Developer ID Application" | head -1 | sed 's/.*"\(.*\)".*/\1/' || echo "")

if [ -z "$SIGNING_IDENTITY" ]; then
    echo -e "${YELLOW}⚠️  No Developer ID certificate found${NC}"
    echo -e "${YELLOW}   Using adhoc signature (self-signed)${NC}"
    echo -e "${YELLOW}   Note: macOS may still block network access with adhoc signature${NC}"
    SIGNING_IDENTITY="-"
else
    echo -e "${GREEN}✅ Found signing identity:${NC}"
    echo "   $SIGNING_IDENTITY"
fi

echo ""

# Remove existing signature
echo -e "${BLUE}1️⃣ Removing existing signature...${NC}"
codesign --remove-signature "$APP_BUNDLE" 2>/dev/null || true
echo -e "${GREEN}✅ Done${NC}"
echo ""

# Sign with entitlements
echo -e "${BLUE}2️⃣ Signing app with entitlements...${NC}"
if [ "$SIGNING_IDENTITY" = "-" ]; then
    # Adhoc signature
    codesign --force --deep --sign "-" \
        --entitlements "$ENTITLEMENTS_FILE" \
        --options runtime \
        --timestamp \
        "$APP_BUNDLE"
else
    # Developer ID signature
    codesign --force --deep --sign "$SIGNING_IDENTITY" \
        --entitlements "$ENTITLEMENTS_FILE" \
        --options runtime \
        --timestamp \
        "$APP_BUNDLE"
fi

echo -e "${GREEN}✅ App signed${NC}"
echo ""

# Verify signature
echo -e "${BLUE}3️⃣ Verifying signature...${NC}"
if codesign --verify --deep --strict --verbose=2 "$APP_BUNDLE" 2>&1 | grep -q "valid on disk"; then
    echo -e "${GREEN}✅ Signature is valid${NC}"
else
    echo -e "${YELLOW}⚠️  Signature verification had warnings${NC}"
    codesign --verify --deep --strict --verbose=2 "$APP_BUNDLE" 2>&1 || true
fi

echo ""

# Check Gatekeeper
echo -e "${BLUE}4️⃣ Checking Gatekeeper...${NC}"
GATEKEEPER_CHECK=$(spctl -a -vv "$APP_BUNDLE" 2>&1 || true)

if echo "$GATEKEEPER_CHECK" | grep -q "accepted"; then
    echo -e "${GREEN}✅ App is accepted by Gatekeeper${NC}"
elif echo "$GATEKEEPER_CHECK" | grep -q "rejected"; then
    echo -e "${YELLOW}⚠️  App is still rejected by Gatekeeper${NC}"
    echo -e "${YELLOW}   This is normal for adhoc-signed apps${NC}"
    echo -e "${YELLOW}   For production, use a Developer ID certificate${NC}"
else
    echo -e "${YELLOW}⚠️  Gatekeeper status:${NC}"
    echo "$GATEKEEPER_CHECK"
fi

echo ""
echo -e "${GREEN}====================================${NC}"
echo -e "${GREEN}✅ Signature fix complete!${NC}"
echo -e "${GREEN}====================================${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
if [ "$SIGNING_IDENTITY" = "-" ]; then
    echo -e "${YELLOW}⚠️  For production builds, use a Developer ID certificate:${NC}"
    echo "   1. Get certificate from Apple Developer"
    echo "   2. Run: source scripts/signing/setup-apple-signing.sh"
    echo "   3. Run: scripts/signing/sign-all-binaries.sh \"$APP_BUNDLE\" \"\$APPLE_SIGNING_IDENTITY\""
    echo ""
    echo -e "${YELLOW}⚠️  For testing with adhoc signature, you may need to:${NC}"
    echo "   - Right-click app → Open (first time only)"
    echo "   - Or: sudo spctl --master-disable (⚠️  security risk)"
fi

