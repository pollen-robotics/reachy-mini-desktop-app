#!/bin/bash

# build-daemon-pyinstaller.sh
# Build the reachy-mini daemon as a standalone executable using PyInstaller
# This replaces the complex venv bundling with a single binary for Linux AppImage compatibility

set -e

echo "🔨 Building reachy-mini daemon with PyInstaller..."

# Configuration
REACHY_MINI_PATH="../reachy_mini"
DST_DIR="src-tauri/binaries"
DAEMON_NAME="reachy-mini-daemon"

# Get Rust target triplet
if [ -n "$TARGET_TRIPLET" ]; then
    TRIPLET="$TARGET_TRIPLET"
    echo "🔍 Using TARGET_TRIPLET from environment: $TRIPLET"
else
    TRIPLET=$(rustc -Vv | grep "host:" | awk '{print $2}')
    echo "🔍 Detected target triplet: $TRIPLET"
fi

# Use REACHY_MINI_SOURCE env var if set, default to 'pypi'
REACHY_MINI_SOURCE="${REACHY_MINI_SOURCE:-pypi}"

# Only check if reachy_mini repository exists when using local path
# Skip check for:
# - "pypi" (install from PyPI)
# - branch names like "develop", "main", etc. (install from GitHub)
if [ "$REACHY_MINI_SOURCE" != "pypi" ]; then
    # If it looks like a path (contains /, ./, or ../), verify it exists
    if [[ "$REACHY_MINI_SOURCE" == */* ]] || [[ "$REACHY_MINI_SOURCE" == .* ]]; then
        if [ ! -d "$REACHY_MINI_SOURCE" ]; then
            echo "❌ reachy_mini repository not found at $REACHY_MINI_SOURCE"
            echo "   Please ensure the reachy_mini repository is cloned at the expected location"
            exit 1
        fi
    fi
fi

# Create a temporary Python virtual environment for building
echo "📦 Creating temporary build environment..."
TEMP_VENV=$(mktemp -d)
python3 -m venv "$TEMP_VENV"
source "$TEMP_VENV/bin/activate"

# Install PyInstaller and reachy-mini
echo "📥 Installing PyInstaller..."
pip install --quiet pyinstaller

echo "📥 Installing reachy-mini..."
if [ "$REACHY_MINI_SOURCE" = "pypi" ]; then
    echo "   Installing from PyPI..."
    pip install reachy-mini
elif [ -d "$REACHY_MINI_SOURCE" ]; then
    echo "   Installing from local path: $REACHY_MINI_SOURCE"
    pip install "$REACHY_MINI_SOURCE"
else
    echo "   Installing from GitHub branch: $REACHY_MINI_SOURCE"
    pip install "git+https://github.com/pollen-robotics/reachy_mini.git@$REACHY_MINI_SOURCE"
fi

# Create PyInstaller spec file for better control
echo "📝 Creating PyInstaller spec file..."
cat > /tmp/daemon.spec << 'EOF'
# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_data_files

block_cipher = None
datas = collect_data_files('reachy_mini')

a = Analysis(
    ['entry_point.py'],
    pathex=[],
    binaries=[],
    datas=datas,
    hiddenimports=[
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'fastapi',
        'reachy_mini',
        'sounddevice',
        'soundfile',
        'cv2',
        'numpy',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='reachy-mini-daemon',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
EOF

# Create entry point script
echo "📝 Creating entry point script..."
cat > /tmp/entry_point.py << 'EOF'
#!/usr/bin/env python3
"""Entry point for PyInstaller-bundled reachy-mini daemon."""
import sys
from reachy_mini.daemon.app.main import main

if __name__ == "__main__":
    sys.exit(main())
EOF

# Build with PyInstaller
echo "🔨 Running PyInstaller..."
cd /tmp
pyinstaller --clean -y daemon.spec

if [ ! -f "dist/reachy-mini-daemon" ]; then
    echo "❌ PyInstaller build failed - executable not found"
    deactivate
    rm -rf "$TEMP_VENV"
    exit 1
fi

# Create destination directory
cd -
mkdir -p "$DST_DIR"

# Copy the built executable with target triple suffix
OUTPUT_NAME="${DAEMON_NAME}-${TRIPLET}"
cp /tmp/dist/reachy-mini-daemon "$DST_DIR/$OUTPUT_NAME"
chmod +x "$DST_DIR/$OUTPUT_NAME"

# Cleanup
deactivate
rm -rf "$TEMP_VENV"
rm -f /tmp/daemon.spec /tmp/entry_point.py
rm -rf /tmp/build /tmp/dist

# Verify the executable
echo "🔍 Verifying executable..."
if [ -f "$DST_DIR/$OUTPUT_NAME" ]; then
    SIZE=$(du -h "$DST_DIR/$OUTPUT_NAME" | cut -f1)
    echo "✅ Daemon built successfully!"
    echo "   Location: $DST_DIR/$OUTPUT_NAME"
    echo "   Size: $SIZE"
    echo "   Source: $REACHY_MINI_SOURCE"
else
    echo "❌ Build verification failed"
    exit 1
fi

# Test the executable (just check it can show help)
echo "🧪 Testing executable..."
if "$DST_DIR/$OUTPUT_NAME" --help > /dev/null 2>&1; then
    echo "✅ Executable test passed!"
else
    echo "⚠️  Warning: Executable test failed (might need runtime dependencies)"
fi

echo ""
echo "✅ Build complete!"
echo "   The daemon is ready to be bundled by Tauri"
