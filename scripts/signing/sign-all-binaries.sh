#!/bin/bash
# Script to sign all binaries in macOS app bundle before notarization
# Usage: ./scripts/signing/sign-all-binaries.sh <path-to-app-bundle> <signing-identity>
#
# This script recursively signs all Mach-O binaries in the bundle:
# - Binaries in Resources (uvx, uv, etc.)
# - Python libraries (.so, .dylib) in .venv
# - Binaries in cpython-*
# - Main app bundle with --deep (last)

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

# Error counter
ERROR_COUNT=0

# Function to sign a binary
sign_binary() {
    local binary="$1"
    local entitlements_file="${2:-}"  # Optional entitlements file (default to empty)
    if [ ! -f "$binary" ]; then
        return 0
    fi
    
    # Check if it's a Mach-O binary (may be executable or not)
    if file "$binary" 2>/dev/null | grep -qE "(Mach-O|dynamically linked|shared library)"; then
        echo "   Signing: $binary"
        
        # Build codesign command
        local codesign_cmd=(
            codesign
            --force
            --verify
            --verbose
            --sign "$SIGNING_IDENTITY"
            --options runtime
            --timestamp
        )
        
        # Add entitlements if provided
        if [ -n "$entitlements_file" ] && [ -f "$entitlements_file" ]; then
            codesign_cmd+=(--entitlements "$entitlements_file")
        fi
        
        codesign_cmd+=("$binary")
        
        if "${codesign_cmd[@]}" 2>&1; then
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
    
    # Sign uvx and uv
    for binary_name in uvx uv; do
        if [ -f "$RESOURCES_DIR/$binary_name" ]; then
            sign_binary "$RESOURCES_DIR/$binary_name"
        fi
    done
    
    # Sign uv-trampoline (in MacOS)
    MACOS_DIR="$APP_BUNDLE/Contents/MacOS"
    if [ -d "$MACOS_DIR" ]; then
        find "$MACOS_DIR" -type f -perm +111 | while read -r binary; do
            sign_binary "$binary"
        done
    fi
    
    # Sign all binaries in .venv
    if [ -d "$RESOURCES_DIR/.venv" ]; then
        echo "📦 Signing all binaries in .venv..."
        
        # Sign all .dylib
        find "$RESOURCES_DIR/.venv" -name "*.dylib" -type f | while read -r dylib; do
            sign_binary "$dylib"
        done
        
        # Sign all .so (native Python extensions) - including those in subdirectories
        find "$RESOURCES_DIR/.venv" -name "*.so" -type f | while read -r so_file; do
            sign_binary "$so_file"
        done
        
        # Sign all executable binaries in .venv/bin
        # Apply disable-library-validation entitlement to Python executable
        if [ -d "$RESOURCES_DIR/.venv/bin" ]; then
            # Get path to python entitlements file (in same directory as this script)
            SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
            PYTHON_ENTITLEMENTS="$SCRIPT_DIR/python-entitlements.plist"
            
            # Find all files (not just executables) to catch all Python binaries
            find "$RESOURCES_DIR/.venv/bin" -type f | while read -r binary; do
                # Check if this is the Python executable (python, python3, python3.12, etc.)
                if basename "$binary" | grep -qE "^python[0-9.]*$"; then
                    echo "   Applying entitlements to Python executable: $binary"
                    sign_binary "$binary" "$PYTHON_ENTITLEMENTS"
                else
                    # Other binaries: sign without entitlements
                    if [ -x "$binary" ]; then
                        sign_binary "$binary"
                    fi
                fi
            done
        fi
        
        # Sign all binaries in .venv/lib (including subdirectories like cmeel.prefix/bin)
        # This catches binaries in packages like cmeel.prefix/bin, etc.
        # Also sign Python libraries (libpython*.dylib) with entitlements
        if [ -d "$RESOURCES_DIR/.venv/lib" ]; then
            # First, find and sign all libpython*.dylib with entitlements (exhaustive search)
            find "$RESOURCES_DIR/.venv/lib" -name "libpython*.dylib" -type f | while read -r dylib; do
                echo "   Applying entitlements to Python library: $dylib"
                sign_binary "$dylib" "$PYTHON_ENTITLEMENTS"
            done
            
            # Then, sign all other executable binaries without entitlements
            find "$RESOURCES_DIR/.venv/lib" -type f -perm +111 | while read -r binary; do
                # Skip libpython*.dylib (already signed above)
                if ! basename "$binary" | grep -qE "^libpython.*\.dylib$"; then
                    sign_binary "$binary"
                fi
            done
        fi
        
    fi
    
    # Sign binaries in cpython (for all architectures)
    # Apply entitlements to Python executables and libraries
    for cpython_dir in "$RESOURCES_DIR"/cpython-*; do
        if [ -d "$cpython_dir" ]; then
            echo "📦 Signing binaries in $(basename "$cpython_dir")..."
            
            # First, sign Python executables with entitlements
            find "$cpython_dir/bin" -type f 2>/dev/null | while read -r binary; do
                if basename "$binary" | grep -qE "^python[0-9.]*$"; then
                    echo "   Applying entitlements to Python executable: $binary"
                    sign_binary "$binary" "$PYTHON_ENTITLEMENTS"
                fi
            done
            
            # Second, sign Python libraries (libpython*.dylib) with entitlements
            find "$cpython_dir/lib" -name "libpython*.dylib" -type f 2>/dev/null | while read -r dylib; do
                echo "   Applying entitlements to Python library: $dylib"
                sign_binary "$dylib" "$PYTHON_ENTITLEMENTS"
            done
            
            # Finally, sign all other binaries without entitlements
            find "$cpython_dir" -type f \( -name "*.dylib" -o -name "*.so" -o -perm +111 \) | while read -r binary; do
                # Skip Python executables and libraries (already signed above)
                if ! basename "$binary" | grep -qE "^python[0-9.]*$" && ! basename "$binary" | grep -qE "^libpython.*\.dylib$"; then
                    sign_binary "$binary"
                fi
            done
        fi
    done
fi

# Sign main app bundle (must be done last with --deep)
# Apply entitlements from src-tauri/entitlements.plist
echo "📦 Signing main app bundle with --deep and entitlements..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENTITLEMENTS_FILE="$PROJECT_DIR/src-tauri/entitlements.plist"

if [ ! -f "$ENTITLEMENTS_FILE" ]; then
    echo "⚠️  Warning: Entitlements file not found: $ENTITLEMENTS_FILE"
    echo "   Signing without entitlements (not recommended)"
if ! codesign --force --verify --verbose --sign "$SIGNING_IDENTITY" \
    --options runtime \
    --timestamp \
    --deep \
    "$APP_BUNDLE"; then
    echo "❌ Failed to sign main app bundle"
    exit 1
    fi
else
    echo "   Using entitlements: $ENTITLEMENTS_FILE"
    if ! codesign --force --verify --verbose --sign "$SIGNING_IDENTITY" \
        --options runtime \
        --timestamp \
        --entitlements "$ENTITLEMENTS_FILE" \
        --deep \
        "$APP_BUNDLE"; then
        echo "❌ Failed to sign main app bundle"
        exit 1
    fi
fi

# Verify signature
echo "✅ Verifying signature..."
if ! codesign --verify --deep --strict --verbose=2 "$APP_BUNDLE"; then
    echo "❌ Signature verification failed"
    exit 1
fi

# Display summary
if [ $ERROR_COUNT -gt 0 ]; then
    echo "⚠️  Warning: $ERROR_COUNT binaries failed to sign (may not be critical)"
else
    echo "✅ All binaries signed successfully!"
fi

# List all signed binaries for verification
echo ""
echo "📋 Signed binaries summary:"
codesign --verify --deep --strict --verbose=2 "$APP_BUNDLE" 2>&1 | grep -E "^$APP_BUNDLE" | head -20 || true

