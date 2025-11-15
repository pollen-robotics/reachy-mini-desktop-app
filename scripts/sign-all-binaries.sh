#!/bin/bash
# Script pour signer tous les binaires dans l'app bundle macOS avant la notarisation
# Usage: ./scripts/sign-all-binaries.sh <path-to-app-bundle> <signing-identity>
#
# Ce script signe récursivement tous les binaires Mach-O dans le bundle :
# - Les binaires dans Resources (uvx, uv, etc.)
# - Les bibliothèques Python (.so, .dylib) dans .venv
# - Les binaires dans cpython-*
# - L'app bundle principal avec --deep (en dernier)

set -eu

APP_BUNDLE="$1"
SIGNING_IDENTITY="$2"

if [ -z "$APP_BUNDLE" ] || [ -z "$SIGNING_IDENTITY" ]; then
    echo "Usage: $0 <path-to-app-bundle> <signing-identity>"
    echo "Example: $0 'Reachy Mini Control.app' 'Developer ID Application: Pollen Robotics (4KLHP7L6KP)'"
    exit 1
fi

if [ ! -d "$APP_BUNDLE" ]; then
    echo "❌ App bundle not found: $APP_BUNDLE"
    exit 1
fi

echo "🔐 Signing all binaries in $APP_BUNDLE"
echo "   Signing identity: $SIGNING_IDENTITY"

# Compteur d'erreurs
ERROR_COUNT=0

# Fonction pour signer un binaire
sign_binary() {
    local binary="$1"
    if [ ! -f "$binary" ]; then
        return 0
    fi
    
    # Vérifier si c'est un binaire Mach-O (peut être exécutable ou non)
    if file "$binary" 2>/dev/null | grep -qE "(Mach-O|dynamically linked|shared library)"; then
        echo "   Signing: $binary"
        if codesign --force --verify --verbose --sign "$SIGNING_IDENTITY" \
            --options runtime \
            --timestamp \
            "$binary" 2>&1; then
            return 0
        else
            echo "⚠️  Failed to sign: $binary"
            ERROR_COUNT=$((ERROR_COUNT + 1))
            return 1
        fi
    fi
    return 0
}

# Signer tous les binaires dans Resources
RESOURCES_DIR="$APP_BUNDLE/Contents/Resources"

if [ -d "$RESOURCES_DIR" ]; then
    echo "📦 Signing binaries in Resources..."
    
    # Signer uvx et uv
    for binary_name in uvx uv; do
        if [ -f "$RESOURCES_DIR/$binary_name" ]; then
            sign_binary "$RESOURCES_DIR/$binary_name"
        fi
    done
    
    # Signer uv-trampoline (dans MacOS)
    MACOS_DIR="$APP_BUNDLE/Contents/MacOS"
    if [ -d "$MACOS_DIR" ]; then
        find "$MACOS_DIR" -type f -perm +111 | while read -r binary; do
            sign_binary "$binary"
        done
    fi
    
    # Signer tous les binaires dans .venv
    if [ -d "$RESOURCES_DIR/.venv" ]; then
        echo "📦 Signing all binaries in .venv..."
        
        # Signer tous les .dylib
        find "$RESOURCES_DIR/.venv" -name "*.dylib" -type f | while read -r dylib; do
            sign_binary "$dylib"
        done
        
        # Signer tous les .so (extensions Python natives) - y compris ceux dans les sous-dossiers
        find "$RESOURCES_DIR/.venv" -name "*.so" -type f | while read -r so_file; do
            sign_binary "$so_file"
        done
        
        # Signer tous les binaires exécutables dans .venv/bin
        if [ -d "$RESOURCES_DIR/.venv/bin" ]; then
            find "$RESOURCES_DIR/.venv/bin" -type f -perm +111 | while read -r binary; do
                sign_binary "$binary"
            done
        fi
        
    fi
    
    # Signer les binaires dans cpython (pour toutes les architectures)
    for cpython_dir in "$RESOURCES_DIR"/cpython-*; do
        if [ -d "$cpython_dir" ]; then
            echo "📦 Signing binaries in $(basename "$cpython_dir")..."
            find "$cpython_dir" -type f \( -name "*.dylib" -o -name "*.so" -o -perm +111 \) | while read -r binary; do
                sign_binary "$binary"
            done
        fi
    done
fi

# Signer l'app bundle principal (doit être fait en dernier avec --deep)
echo "📦 Signing main app bundle with --deep..."
if ! codesign --force --verify --verbose --sign "$SIGNING_IDENTITY" \
    --options runtime \
    --timestamp \
    --deep \
    "$APP_BUNDLE"; then
    echo "❌ Failed to sign main app bundle"
    exit 1
fi

# Vérifier la signature
echo "✅ Verifying signature..."
if ! codesign --verify --deep --strict --verbose=2 "$APP_BUNDLE"; then
    echo "❌ Signature verification failed"
    exit 1
fi

# Afficher un résumé
if [ $ERROR_COUNT -gt 0 ]; then
    echo "⚠️  Warning: $ERROR_COUNT binaries failed to sign (may not be critical)"
else
    echo "✅ All binaries signed successfully!"
fi

# Lister tous les binaires signés pour vérification
echo ""
echo "📋 Signed binaries summary:"
codesign --verify --deep --strict --verbose=2 "$APP_BUNDLE" 2>&1 | grep -E "^$APP_BUNDLE" | head -20 || true

