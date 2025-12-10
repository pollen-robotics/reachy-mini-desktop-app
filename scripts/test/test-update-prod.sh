#!/bin/bash

# Script to test update in production mode
# This script builds the app, creates an update, and launches the test server

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

echo -e "${BLUE}🧪 Testing update in production mode${NC}"
echo -e "${BLUE}===========================================${NC}"
echo ""

# Step 1: Check that we're ready
echo -e "${YELLOW}📋 Step 1: Checking prerequisites...${NC}"

# Check that signing key exists
PRIVATE_KEY="${HOME}/.tauri/reachy-mini.key"
if [ ! -f "$PRIVATE_KEY" ]; then
    echo -e "${RED}❌ Private key not found: ${PRIVATE_KEY}${NC}"
    echo -e "${YELLOW}   Generate with: yarn tauri signer generate -w ${PRIVATE_KEY} --ci${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Signing key found${NC}"

# Check current version
CURRENT_VERSION=$(grep -o '"version": "[^"]*"' src-tauri/tauri.conf.json | cut -d'"' -f4)
echo -e "${GREEN}✅ Current version: ${CURRENT_VERSION}${NC}"

# Calculate update version (increment patch)
IFS='.' read -ra VERSION_PARTS <<< "$CURRENT_VERSION"
MAJOR="${VERSION_PARTS[0]}"
MINOR="${VERSION_PARTS[1]}"
PATCH="${VERSION_PARTS[2]}"
UPDATE_VERSION="${MAJOR}.${MINOR}.$((PATCH + 1))"
echo -e "${BLUE}   Update version: ${UPDATE_VERSION}${NC}"
echo ""

# Step 2: Build app in production mode
echo -e "${YELLOW}📦 Step 2: Building application in production mode...${NC}"
echo -e "${BLUE}   This may take several minutes...${NC}"

if ! yarn tauri:build; then
    echo -e "${RED}❌ Build error${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Build completed${NC}"
echo ""

# Find created bundle
BUNDLE_PATH=""
BUNDLE_DIR="src-tauri/target/release/bundle"

if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    BUNDLE_PATH="${BUNDLE_DIR}/macos/Reachy Mini Control.app"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux - find first .deb package
    BUNDLE_PATH=$(find "${BUNDLE_DIR}/deb" -name "*.deb" 2>/dev/null | head -1)
    if [ -z "$BUNDLE_PATH" ]; then
        echo -e "${RED}❌ No .deb package found in ${BUNDLE_DIR}/deb${NC}"
        exit 1
    fi
else
    # Windows - find first MSI
    BUNDLE_PATH=$(find "${BUNDLE_DIR}/msi" -name "*.msi" 2>/dev/null | head -1)
    if [ -z "$BUNDLE_PATH" ]; then
        echo -e "${RED}❌ No MSI found in ${BUNDLE_DIR}/msi${NC}"
        exit 1
    fi
fi

if [ ! -e "$BUNDLE_PATH" ]; then
    echo -e "${RED}❌ Bundle not found: ${BUNDLE_PATH}${NC}"
    echo -e "${YELLOW}   Check that the build completed successfully${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Bundle found: ${BUNDLE_PATH}${NC}"
echo ""

# Step 3: Update version in tauri.conf.json for the update
echo -e "${YELLOW}📝 Step 3: Preparing update...${NC}"

# Backup current version
BACKUP_FILE="src-tauri/tauri.conf.json.backup"
cp src-tauri/tauri.conf.json "$BACKUP_FILE"
echo -e "${BLUE}   Backup created: ${BACKUP_FILE}${NC}"

# Temporarily update version in tauri.conf.json
if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/\"version\": \"${CURRENT_VERSION}\"/\"version\": \"${UPDATE_VERSION}\"/" src-tauri/tauri.conf.json
else
    sed -i "s/\"version\": \"${CURRENT_VERSION}\"/\"version\": \"${UPDATE_VERSION}\"/" src-tauri/tauri.conf.json
fi

echo -e "${GREEN}✅ Version updated in tauri.conf.json: ${UPDATE_VERSION}${NC}"
echo ""

# Step 4: Build update
echo -e "${YELLOW}🔨 Step 4: Building update...${NC}"

if ! yarn build:update:dev "$UPDATE_VERSION"; then
    # Restore original version on error
    mv "$BACKUP_FILE" src-tauri/tauri.conf.json
    echo -e "${RED}❌ Error building update${NC}"
    exit 1
fi

# Restore original version
mv "$BACKUP_FILE" src-tauri/tauri.conf.json
echo -e "${GREEN}✅ Version restored in tauri.conf.json: ${CURRENT_VERSION}${NC}"
echo ""

# Step 5: Check that update files exist
echo -e "${YELLOW}🔍 Step 5: Checking update files...${NC}"

UPDATE_DIR="test-updates"
if [ ! -d "$UPDATE_DIR" ]; then
    echo -e "${RED}❌ Update directory not found: ${UPDATE_DIR}${NC}"
    exit 1
fi

# Find platform directory
PLATFORM=""
if [[ "$OSTYPE" == "darwin"* ]]; then
    ARCH=$(uname -m)
    if [ "$ARCH" == "arm64" ]; then
        PLATFORM="darwin-aarch64"
    else
        PLATFORM="darwin-x86_64"
    fi
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    ARCH=$(uname -m)
    if [ "$ARCH" == "x86_64" ]; then
        PLATFORM="linux-x86_64"
    else
        PLATFORM="linux-aarch64"
    fi
else
    PLATFORM="windows-x86_64"
fi

UPDATE_JSON="${UPDATE_DIR}/${PLATFORM}/${CURRENT_VERSION}/update.json"
if [ ! -f "$UPDATE_JSON" ]; then
    echo -e "${RED}❌ update.json file not found: ${UPDATE_JSON}${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Update files found${NC}"
echo -e "${BLUE}   Platform: ${PLATFORM}${NC}"
echo -e "${BLUE}   Update JSON: ${UPDATE_JSON}${NC}"
echo ""

# Step 6: Test instructions
echo -e "${GREEN}✅ Everything is ready for testing!${NC}"
echo ""
echo -e "${BLUE}===========================================${NC}"
echo -e "${BLUE}📋 Test Instructions:${NC}"
echo -e "${BLUE}===========================================${NC}"
echo ""
echo -e "${YELLOW}1.${NC} Open a new terminal and launch the update server:"
echo -e "   ${GREEN}cd ${PROJECT_DIR} && yarn serve:updates${NC}"
echo ""
echo -e "${YELLOW}2.${NC} Launch the built application:"
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo -e "   ${GREEN}open \"${PROJECT_DIR}/${BUNDLE_PATH}\"${NC}"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo -e "   ${GREEN}${PROJECT_DIR}/${BUNDLE_PATH}${NC}"
else
    echo -e "   ${GREEN}${PROJECT_DIR}/${BUNDLE_PATH}${NC}"
fi
echo ""
echo -e "${YELLOW}3.${NC} In the application:"
echo -e "   - The app should automatically detect update ${UPDATE_VERSION}"
echo -e "   - Click on 'Install Update'"
echo -e "   - The app should download, install and restart automatically"
echo ""
echo -e "${YELLOW}4.${NC} Verify that the app has been updated:"
echo -e "   - The app should restart with version ${UPDATE_VERSION}"
echo ""
echo -e "${BLUE}===========================================${NC}"
echo ""
echo -e "${YELLOW}⚠️  Note:${NC} The update server must remain active during the test"
echo -e "${YELLOW}⚠️  Note:${NC} The endpoint in tauri.conf.json must point to http://localhost:8080"
echo ""
