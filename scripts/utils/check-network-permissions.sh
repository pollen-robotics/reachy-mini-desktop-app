#!/bin/bash

# Script pour diagnostiquer et corriger les problèmes de permissions réseau sur macOS
# Usage: ./scripts/utils/check-network-permissions.sh [path-to-app]

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
    # Try to find the app bundle
    APP_BUNDLE=$(find src-tauri/target -name "*.app" -type d 2>/dev/null | grep -E "(release|debug)" | head -1)
fi

if [ -z "$APP_BUNDLE" ] || [ ! -d "$APP_BUNDLE" ]; then
    echo -e "${RED}❌ App bundle not found${NC}"
    echo -e "${YELLOW}   Build the app first: yarn tauri:build${NC}"
    exit 1
fi

echo -e "${BLUE}🔍 Checking network permissions for:${NC}"
echo "   $APP_BUNDLE"
echo ""

# 1. Check signature
echo -e "${BLUE}1️⃣ Checking code signature...${NC}"
SIGNATURE_INFO=$(codesign -dv --verbose=4 "$APP_BUNDLE" 2>&1 || true)

if echo "$SIGNATURE_INFO" | grep -q "Signature=adhoc"; then
    echo -e "${YELLOW}⚠️  App is signed with ADHOC signature (self-signed)${NC}"
    echo -e "${YELLOW}   macOS may block network access for adhoc-signed apps${NC}"
    ADHOC_SIGNED=true
else
    echo -e "${GREEN}✅ App has proper code signature${NC}"
    ADHOC_SIGNED=false
fi

# Check if signature is valid
if codesign --verify --deep --strict --verbose=2 "$APP_BUNDLE" 2>&1 | grep -q "valid on disk"; then
    echo -e "${GREEN}✅ Signature is valid${NC}"
else
    echo -e "${RED}❌ Signature is invalid or incomplete${NC}"
    echo -e "${YELLOW}   Some resources may not be signed${NC}"
fi

echo ""

# 2. Check Gatekeeper
echo -e "${BLUE}2️⃣ Checking Gatekeeper status...${NC}"
GATEKEEPER_CHECK=$(spctl -a -vv "$APP_BUNDLE" 2>&1 || true)

if echo "$GATEKEEPER_CHECK" | grep -q "accepted"; then
    echo -e "${GREEN}✅ App is accepted by Gatekeeper${NC}"
elif echo "$GATEKEEPER_CHECK" | grep -q "rejected"; then
    echo -e "${RED}❌ App is rejected by Gatekeeper${NC}"
    echo -e "${YELLOW}   This will block network access${NC}"
elif echo "$GATEKEEPER_CHECK" | grep -q "sealed resource"; then
    echo -e "${RED}❌ App has invalid signature (sealed resource missing)${NC}"
    echo -e "${YELLOW}   Some files in the bundle are not properly signed${NC}"
else
    echo -e "${YELLOW}⚠️  Gatekeeper status unclear${NC}"
    echo "$GATEKEEPER_CHECK"
fi

echo ""

# 3. Check entitlements
echo -e "${BLUE}3️⃣ Checking entitlements...${NC}"
ENTITLEMENTS=$(codesign -d --entitlements - "$APP_BUNDLE" 2>&1 | grep -A 20 "<dict>" || echo "")

if echo "$ENTITLEMENTS" | grep -q "com.apple.security.network.client"; then
    NETWORK_CLIENT=$(echo "$ENTITLEMENTS" | grep -A 1 "com.apple.security.network.client" | grep -oE "<true/>|<false/>" | head -1)
    if [ "$NETWORK_CLIENT" = "<true/>" ]; then
        echo -e "${GREEN}✅ Network client entitlement: enabled${NC}"
    else
        echo -e "${RED}❌ Network client entitlement: disabled${NC}"
    fi
else
    echo -e "${RED}❌ Network client entitlement: missing${NC}"
fi

if echo "$ENTITLEMENTS" | grep -q "com.apple.security.network.server"; then
    NETWORK_SERVER=$(echo "$ENTITLEMENTS" | grep -A 1 "com.apple.security.network.server" | grep -oE "<true/>|<false/>" | head -1)
    if [ "$NETWORK_SERVER" = "<true/>" ]; then
        echo -e "${GREEN}✅ Network server entitlement: enabled${NC}"
    else
        echo -e "${RED}❌ Network server entitlement: disabled${NC}"
    fi
else
    echo -e "${RED}❌ Network server entitlement: missing${NC}"
fi

echo ""

# 4. Check Info.plist
echo -e "${BLUE}4️⃣ Checking Info.plist network settings...${NC}"
INFO_PLIST="$APP_BUNDLE/Contents/Info.plist"

if [ -f "$INFO_PLIST" ]; then
    if plutil -p "$INFO_PLIST" 2>/dev/null | grep -q "NSAllowsArbitraryLoads.*true"; then
        echo -e "${GREEN}✅ NSAllowsArbitraryLoads: enabled${NC}"
    else
        echo -e "${YELLOW}⚠️  NSAllowsArbitraryLoads: not set or false${NC}"
    fi
    
    if plutil -p "$INFO_PLIST" 2>/dev/null | grep -q "NSAllowsLocalNetworking.*true"; then
        echo -e "${GREEN}✅ NSAllowsLocalNetworking: enabled${NC}"
    else
        echo -e "${YELLOW}⚠️  NSAllowsLocalNetworking: not set or false${NC}"
    fi
else
    echo -e "${RED}❌ Info.plist not found${NC}"
fi

echo ""

# 5. Recommendations
echo -e "${BLUE}====================================${NC}"
echo -e "${BLUE}💡 Recommendations:${NC}"
echo -e "${BLUE}====================================${NC}"
echo ""

if [ "$ADHOC_SIGNED" = true ]; then
    echo -e "${YELLOW}⚠️  For development with adhoc signature:${NC}"
    echo "   1. Sign the app properly with entitlements:"
    echo "      codesign --force --deep --sign - --entitlements src-tauri/entitlements.plist \"$APP_BUNDLE\""
    echo ""
    echo "   2. Or use a Developer ID certificate (for production):"
    echo "      - Get a certificate from Apple Developer"
    echo "      - Use: scripts/signing/setup-apple-signing.sh"
    echo "      - Then: scripts/signing/sign-all-binaries.sh"
    echo ""
    echo "   3. For testing only, you can temporarily disable Gatekeeper:"
    echo "      sudo spctl --master-disable"
    echo "      (⚠️  Security risk - re-enable after testing)"
    echo ""
fi

echo -e "${BLUE}To fix signature issues:${NC}"
echo "   ./scripts/utils/fix-app-signature.sh \"$APP_BUNDLE\""
echo ""

