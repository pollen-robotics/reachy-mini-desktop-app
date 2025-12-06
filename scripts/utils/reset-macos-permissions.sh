#!/bin/bash

# Reset macOS Camera and Microphone permissions
# Useful for testing permission flows in development

set -e

echo "🔐 Resetting macOS Camera and Microphone permissions..."
echo ""

# Reset Camera permissions
echo "📷 Resetting Camera permissions..."
tccutil reset Camera 2>/dev/null || {
    echo "⚠️  Failed to reset Camera permissions (may require sudo)"
    echo "   Try: sudo tccutil reset Camera"
}

# Reset Microphone permissions
echo "🎤 Resetting Microphone permissions..."
tccutil reset Microphone 2>/dev/null || {
    echo "⚠️  Failed to reset Microphone permissions (may require sudo)"
    echo "   Try: sudo tccutil reset Microphone"
}

echo ""
echo "✅ Permissions reset complete!"
echo "   Relaunch the app to test the permission flow."
echo ""
echo "ℹ️  Note: You may need to run this with sudo if you get permission errors:"
echo "   sudo ./scripts/utils/reset-macos-permissions.sh"

