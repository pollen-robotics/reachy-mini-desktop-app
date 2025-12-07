#!/bin/bash

# Reset macOS Camera and Microphone permissions for Reachy Mini Control
# Works for both development and production builds
# Automatically detects the app identifier from tauri.conf.json

set -e

# Get the script directory and project root
# Script is in scripts/utils/, so we need to go up 2 levels to reach project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Read identifier from tauri.conf.json
TAURI_CONF="$PROJECT_ROOT/src-tauri/tauri.conf.json"

if [ ! -f "$TAURI_CONF" ]; then
    echo "❌ Error: tauri.conf.json not found at $TAURI_CONF"
    echo "   Make sure you're running this from the project root"
    exit 1
fi

# Extract identifier - try jq first, fallback to grep/sed
if command -v jq &> /dev/null; then
    IDENTIFIER=$(jq -r '.identifier' "$TAURI_CONF" 2>/dev/null)
else
    # Fallback: use grep and sed
    IDENTIFIER=$(grep -o '"identifier"[[:space:]]*:[[:space:]]*"[^"]*"' "$TAURI_CONF" | sed -E 's/.*"identifier"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/')
fi

if [ -z "$IDENTIFIER" ] || [ "$IDENTIFIER" = "null" ]; then
    echo "❌ Error: Could not find identifier in tauri.conf.json"
    echo "   File: $TAURI_CONF"
    exit 1
fi

# Check if we're in dev mode (binary exists in target/debug)
DEV_BINARY="$PROJECT_ROOT/src-tauri/target/debug/reachy-mini-control"
IS_DEV=false

if [ -f "$DEV_BINARY" ]; then
    IS_DEV=true
    echo "🔍 Development mode detected (binary found in target/debug)"
    echo "   In dev, macOS may identify the app by its path instead of bundle identifier"
    echo ""
fi

echo "🔐 Resetting macOS permissions for: $IDENTIFIER"
if [ "$IS_DEV" = true ]; then
    echo "   (Also trying dev binary path: $DEV_BINARY)"
fi
echo ""

# Reset Camera permissions for this specific app
echo "📷 Resetting Camera permissions..."

# Always try with bundle identifier (works in production)
tccutil reset Camera "$IDENTIFIER" >/dev/null 2>&1 && echo "   ✅ Camera permissions reset (bundle identifier)" || true

# In dev mode, also reset ALL Camera permissions (original behavior - works for unsigned apps)
if [ "$IS_DEV" = true ]; then
    tccutil reset Camera >/dev/null 2>&1 && echo "   ✅ Camera permissions reset (all apps - dev mode)" || true
fi

# Reset Microphone permissions for this specific app
echo "🎤 Resetting Microphone permissions..."

# Always try with bundle identifier (works in production)
tccutil reset Microphone "$IDENTIFIER" >/dev/null 2>&1 && echo "   ✅ Microphone permissions reset (bundle identifier)" || true

# In dev mode, also reset ALL Microphone permissions (original behavior - works for unsigned apps)
if [ "$IS_DEV" = true ]; then
    tccutil reset Microphone >/dev/null 2>&1 && echo "   ✅ Microphone permissions reset (all apps - dev mode)" || true
fi

# Also reset All permissions (more comprehensive)
echo "🔄 Resetting All permissions..."

# Always try with bundle identifier (works in production)
tccutil reset All "$IDENTIFIER" >/dev/null 2>&1 && echo "   ✅ All permissions reset (bundle identifier)" || true

# In dev mode, also reset ALL permissions for all apps (original behavior - works for unsigned apps)
if [ "$IS_DEV" = true ]; then
    tccutil reset All >/dev/null 2>&1 && echo "   ✅ All permissions reset (all apps - dev mode)" || true
fi

echo ""
echo "✅ Permissions reset complete for $IDENTIFIER!"
echo "   Relaunch the app to test the permission flow."
echo ""
echo "ℹ️  Note: If you get permission errors, run with sudo:"
echo "   sudo ./scripts/utils/reset-macos-permissions.sh"

