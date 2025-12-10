#!/bin/bash
# Post-removal script for Reachy Mini Control .deb package
# This script removes udev rules when the package is uninstalled

set -e

UDEV_RULES_FILE="/etc/udev/rules.d/99-reachy-mini.rules"

echo "🧹 Cleaning up Reachy Mini USB permissions..."

# Remove udev rules if they exist and were installed by this package
if [ -f "$UDEV_RULES_FILE" ]; then
    # Check if this is our rules file (contains Reachy Mini comment)
    if grep -q "Reachy Mini" "$UDEV_RULES_FILE" 2>/dev/null; then
        echo "   Removing udev rules..."
        rm -f "$UDEV_RULES_FILE"
        udevadm control --reload-rules || true
        udevadm trigger || true
        echo "   ✅ udev rules removed"
    else
        echo "   ℹ️  Keeping udev rules (not installed by this package)"
    fi
fi

echo "✅ Cleanup completed"

exit 0

