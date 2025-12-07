#!/bin/bash

# Script to verify and diagnose update signature issues
# Usage: ./scripts/utils/verify-update-signature.sh [version] [platform]

set -e

VERSION="${1:-0.3.23}"
PLATFORM="${2:-darwin-aarch64}"

echo "🔍 Verifying update signature for version $VERSION, platform $PLATFORM"
echo ""

# Get the latest.json URL
LATEST_JSON_URL="https://pollen-robotics.github.io/reachy-mini-desktop-app/latest.json"

echo "📥 Fetching latest.json..."
LATEST_JSON=$(curl -s "$LATEST_JSON_URL")

if [ -z "$LATEST_JSON" ]; then
    echo "❌ Failed to fetch latest.json"
    exit 1
fi

echo "✅ Fetched latest.json"
echo ""

# Extract signature and URL for the platform
SIGNATURE=$(echo "$LATEST_JSON" | jq -r ".platforms.\"$PLATFORM\".signature")
URL=$(echo "$LATEST_JSON" | jq -r ".platforms.\"$PLATFORM\".url")

if [ "$SIGNATURE" = "null" ] || [ -z "$SIGNATURE" ]; then
    echo "❌ No signature found for platform $PLATFORM"
    exit 1
fi

echo "📋 Signature (first 100 chars): ${SIGNATURE:0:100}..."
echo "📋 URL: $URL"
echo ""

# Decode the signature from base64
echo "🔍 Decoding signature from base64..."
TEMP_SIG_FILE="/tmp/decoded-signature-$$.sig"
echo "$SIGNATURE" | base64 -d > "$TEMP_SIG_FILE" 2>&1 || {
    echo "❌ Failed to decode signature from base64"
    echo "   This indicates the signature in latest.json is not valid base64"
    exit 1
}

echo "✅ Signature decoded successfully"
echo ""

# Check signature file format
echo "📄 Signature file content:"
cat "$TEMP_SIG_FILE"
echo ""
echo ""

# Download the file to verify
echo "📥 Downloading file to verify signature..."
TEMP_FILE="/tmp/update-file-$$"
curl -s -L "$URL" -o "$TEMP_FILE" || {
    echo "❌ Failed to download file from $URL"
    exit 1
}

FILE_SIZE=$(stat -f%z "$TEMP_FILE" 2>/dev/null || stat -c%s "$TEMP_FILE" 2>/dev/null)
echo "✅ Downloaded file ($FILE_SIZE bytes)"
echo ""

# Get public key from tauri.conf.json
echo "🔑 Extracting public key from tauri.conf.json..."
PUBKEY_BASE64=$(grep -o '"pubkey": "[^"]*"' src-tauri/tauri.conf.json | cut -d'"' -f4)

if [ -z "$PUBKEY_BASE64" ]; then
    echo "❌ No public key found in tauri.conf.json"
    exit 1
fi

echo "✅ Found public key in tauri.conf.json"
echo ""

# Decode public key
TEMP_PUBKEY="/tmp/pubkey-$$.pub"
echo "$PUBKEY_BASE64" | base64 -d > "$TEMP_PUBKEY" 2>&1 || {
    echo "❌ Failed to decode public key from base64"
    exit 1
}

echo "✅ Public key decoded"
echo ""

# Verify signature with minisign
echo "🔍 Verifying signature with minisign..."
if command -v minisign &> /dev/null; then
    if minisign -V -p "$TEMP_PUBKEY" -m "$TEMP_FILE" -x "$TEMP_SIG_FILE" 2>&1; then
        echo "✅ Signature verification successful!"
    else
        echo "❌ Signature verification failed!"
        echo ""
        echo "🔍 Possible causes:"
        echo "   1. Public key in tauri.conf.json doesn't match private key used to sign"
        echo "   2. Signature file is corrupted or incorrectly encoded"
        echo "   3. File was modified after signing"
        echo ""
        echo "💡 Solution:"
        echo "   - Verify that TAURI_SIGNING_KEY in GitHub Secrets matches the public key in tauri.conf.json"
        echo "   - Regenerate signing keys if needed (see .scripts/regenerate-signing-keys.md)"
        exit 1
    fi
else
    echo "⚠️  minisign not installed, skipping verification"
    echo "   Install with: brew install minisign"
fi

# Cleanup
rm -f "$TEMP_SIG_FILE" "$TEMP_FILE" "$TEMP_PUBKEY"

echo ""
echo "✅ Verification complete!"

