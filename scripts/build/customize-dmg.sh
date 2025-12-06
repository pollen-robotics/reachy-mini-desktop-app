#!/bin/bash

# Script to create a customized DMG with background image and Applications link
# Uses create-dmg (shell script) - the recommended tool for macOS DMG creation
# https://github.com/create-dmg/create-dmg
# Usage: ./customize-dmg.sh <app-bundle> <output-dmg> <background-image> <volume-name>

set -e

APP_BUNDLE="$1"
OUTPUT_DMG="$2"
BACKGROUND_IMAGE="$3"
VOLUME_NAME="${4:-Reachy Mini Control}"

if [ -z "$APP_BUNDLE" ] || [ -z "$OUTPUT_DMG" ] || [ -z "$BACKGROUND_IMAGE" ]; then
  echo "Usage: $0 <app-bundle> <output-dmg> <background-image> [volume-name]"
  exit 1
fi

if [ ! -d "$APP_BUNDLE" ]; then
  echo "❌ App bundle not found: $APP_BUNDLE"
  exit 1
fi

if [ ! -f "$BACKGROUND_IMAGE" ]; then
  echo "❌ Background image not found: $BACKGROUND_IMAGE"
  exit 1
fi

# Check if create-dmg is installed
# Try Homebrew version first, then fallback to npm version (but warn)
CREATE_DMG_CMD=""
if command -v /opt/homebrew/bin/create-dmg &> /dev/null; then
  CREATE_DMG_CMD="/opt/homebrew/bin/create-dmg"
elif command -v /usr/local/bin/create-dmg &> /dev/null; then
  CREATE_DMG_CMD="/usr/local/bin/create-dmg"
elif command -v create-dmg &> /dev/null; then
  # Check if it's the npm version (which is different)
  if create-dmg --version 2>&1 | grep -q "^[0-9]\+\.[0-9]\+\.[0-9]\+$"; then
    CREATE_DMG_CMD="create-dmg"
  else
    echo "⚠️  Found npm create-dmg package, but we need the shell script version"
    echo "   Install with: brew install create-dmg"
    exit 1
  fi
else
  echo "📦 create-dmg not found. Installing via Homebrew..."
  if command -v brew &> /dev/null; then
    brew install create-dmg
    CREATE_DMG_CMD="/opt/homebrew/bin/create-dmg"
    if [ ! -f "$CREATE_DMG_CMD" ]; then
      CREATE_DMG_CMD="/usr/local/bin/create-dmg"
    fi
  else
    echo "❌ Homebrew not found. Please install create-dmg manually:"
    echo "   brew install create-dmg"
    exit 1
  fi
fi

# Get absolute paths
APP_BUNDLE_ABS=$(cd "$(dirname "$APP_BUNDLE")" && pwd)/$(basename "$APP_BUNDLE")
OUTPUT_DMG_ABS=$(cd "$(dirname "$OUTPUT_DMG")" && pwd)/$(basename "$OUTPUT_DMG")
BACKGROUND_IMAGE_ABS=$(cd "$(dirname "$BACKGROUND_IMAGE")" && pwd)/$(basename "$BACKGROUND_IMAGE")
BUNDLE_DIR=$(dirname "$APP_BUNDLE_ABS")
APP_NAME=$(basename "$APP_BUNDLE_ABS")

# Remove existing DMG to force fresh creation
if [ -f "$OUTPUT_DMG_ABS" ]; then
  echo "🧹 Removing existing DMG: $OUTPUT_DMG_ABS"
  rm -f "$OUTPUT_DMG_ABS"
fi

# Try to find .icns file for volume icon (optional)
ICON_ICNS=""
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
if [ -f "$PROJECT_ROOT/src-tauri/icons/icon.icns" ]; then
  ICON_ICNS="$PROJECT_ROOT/src-tauri/icons/icon.icns"
fi

# Standard macOS DMG configuration
# Window size: 800×600 points (logical size)
# Background image: 800×600 px
WINDOW_WIDTH=800
WINDOW_HEIGHT=600
WINDOW_X=400
WINDOW_Y=100

# Standard icon positions for 800×600 window
ICON_SIZE=128
ICON_Y=236  # Vertically centered: (600 - 128) / 2 = 236
APP_X=200   # Standard position from left
APPS_X=550  # Standard position from left

echo "💿 Creating customized DMG with create-dmg..."
echo "   App: $APP_BUNDLE_ABS"
echo "   Background: $BACKGROUND_IMAGE_ABS"
echo "   Output: $OUTPUT_DMG_ABS"

# Build create-dmg command
CREATE_DMG_ARGS=(
  --volname "$VOLUME_NAME"
  --background "$BACKGROUND_IMAGE_ABS"
  --window-pos $WINDOW_X $WINDOW_Y
  --window-size $WINDOW_WIDTH $WINDOW_HEIGHT
  --icon-size $ICON_SIZE
  --icon "$APP_NAME" $APP_X $ICON_Y
  --app-drop-link $APPS_X $ICON_Y
  --hdiutil-quiet
)

# Add volume icon if available
if [ -n "$ICON_ICNS" ] && [ -f "$ICON_ICNS" ]; then
  CREATE_DMG_ARGS+=(--volicon "$ICON_ICNS")
fi

# Execute create-dmg
# Note: create-dmg expects the source folder, not the app bundle directly
# We need to pass the directory containing the app
cd "$BUNDLE_DIR"
"$CREATE_DMG_CMD" "${CREATE_DMG_ARGS[@]}" "$OUTPUT_DMG_ABS" .

if [ ! -f "$OUTPUT_DMG_ABS" ]; then
  echo "❌ Failed to create DMG"
  exit 1
fi

echo "✅ Customized DMG created: $OUTPUT_DMG_ABS ($(du -h "$OUTPUT_DMG_ABS" | cut -f1))"
