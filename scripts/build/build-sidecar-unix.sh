#!/bin/bash

# build_sidecar_unix.sh
# Script to build the sidecar for Unix systems (macOS/Linux)

set -e

DST_DIR="src-tauri/binaries"

# Remove old build artifacts but preserve installed app venvs (*_venv/)
# Apps are installed as {app_name}_venv/ alongside .venv in this directory
if [ -d "$DST_DIR" ]; then
    TEMP_APPS=$(mktemp -d)
    # Move app venvs to temp directory
    FOUND_APPS=false
    for app_venv in "$DST_DIR"/*_venv; do
        if [ -d "$app_venv" ]; then
            echo "💾 Preserving app venv: $(basename "$app_venv")"
            mv "$app_venv" "$TEMP_APPS/"
            FOUND_APPS=true
        fi
    done
    
    rm -rf "$DST_DIR"
    mkdir -p "$DST_DIR"
    
    # Restore app venvs
    if [ "$FOUND_APPS" = true ]; then
        for app_venv in "$TEMP_APPS"/*_venv; do
            if [ -d "$app_venv" ]; then
                echo "♻️  Restoring app venv: $(basename "$app_venv")"
                mv "$app_venv" "$DST_DIR/"
            fi
        done
    fi
    rm -rf "$TEMP_APPS"
else
    mkdir -p "$DST_DIR"
fi

# Get Rust target triplet
# Use TARGET_TRIPLET from environment if provided (for cross-compilation in CI)
# Otherwise, detect from rustc
if [ -n "$TARGET_TRIPLET" ]; then
    TRIPLET="$TARGET_TRIPLET"
    echo "🔍 Using TARGET_TRIPLET from environment: $TRIPLET"
else
TRIPLET=$(rustc -Vv | grep "host:" | awk '{print $2}')
    echo "🔍 Detected target triplet: $TRIPLET"
fi

cd uv-wrapper

# Build uv-bundle
echo "🔨 Building uv-bundle..."
cargo build --release --bin uv-bundle

# Use REACHY_MINI_SOURCE env var if set, default to 'pypi'
REACHY_MINI_SOURCE="${REACHY_MINI_SOURCE:-pypi}"

echo "📦 Installing sidecar with REACHY_MINI_SOURCE=$REACHY_MINI_SOURCE..."
# Install reachy-mini (no mujoco - simulation uses lightweight kinematics)
# Creates .venv for daemon and apps_venv for apps runtime
./target/release/uv-bundle \
    --install-dir "../$DST_DIR" \
    --python-version 3.12 \
    --dependencies "reachy-mini" \
    --apps-dependencies "reachy-mini" \
    --reachy-mini-source "$REACHY_MINI_SOURCE"

# Build uv-trampoline
echo "🔨 Building uv-trampoline..."
# Use TARGET_TRIPLET for cross-compilation if provided
if [ -n "$TARGET_TRIPLET" ]; then
    cargo build --release --bin uv-trampoline --target "$TARGET_TRIPLET"
    cp "target/$TARGET_TRIPLET/release/uv-trampoline" "../$DST_DIR/uv-trampoline-$TRIPLET"
else
cargo build --release --bin uv-trampoline
cp "target/release/uv-trampoline" "../$DST_DIR/uv-trampoline-$TRIPLET"
fi

# Make it executable
chmod +x "../$DST_DIR/uv-trampoline-$TRIPLET"

cd ..

echo "✅ Sidecar build complete!"
echo "   Location: $DST_DIR"
echo "   Source: $REACHY_MINI_SOURCE"

