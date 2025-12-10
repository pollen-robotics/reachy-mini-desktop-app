#!/bin/bash
# Post-installation script for Reachy Mini Control .deb package
# This script installs udev rules and adds user to dialout group

set -e

UDEV_RULES_FILE="/etc/udev/rules.d/99-reachy-mini.rules"
UDEV_RULES_SOURCE="/usr/share/reachy-mini-control/99-reachy-mini.rules"

echo "🔧 Configuring Reachy Mini USB permissions..."

# 1. Copy udev rules if they don't exist or are different
if [ -f "$UDEV_RULES_SOURCE" ]; then
    if [ ! -f "$UDEV_RULES_FILE" ] || ! cmp -s "$UDEV_RULES_SOURCE" "$UDEV_RULES_FILE"; then
        echo "   Installing udev rules..."
        cp "$UDEV_RULES_SOURCE" "$UDEV_RULES_FILE"
        chmod 0644 "$UDEV_RULES_FILE"
        echo "   ✅ udev rules installed"
    else
        echo "   ✅ udev rules already up to date"
    fi
else
    echo "   ⚠️  Warning: udev rules source file not found at $UDEV_RULES_SOURCE"
fi

# 2. Reload udev rules
if [ -f "$UDEV_RULES_FILE" ]; then
    echo "   Reloading udev rules..."
    udevadm control --reload-rules || true
    udevadm trigger || true
    echo "   ✅ udev rules reloaded"
fi

# 3. Add current user to dialout group (if not already)
# Note: This requires the user to log out and back in to take effect
CURRENT_USER="${SUDO_USER:-${USER}}"
if [ -n "$CURRENT_USER" ] && [ "$CURRENT_USER" != "root" ]; then
    if ! groups "$CURRENT_USER" | grep -q "\bdialout\b"; then
        echo "   Adding user '$CURRENT_USER' to dialout group..."
        usermod -aG dialout "$CURRENT_USER" || true
        echo "   ✅ User added to dialout group"
        echo "   ℹ️  Note: You may need to log out and back in for group changes to take effect"
    else
        echo "   ✅ User '$CURRENT_USER' already in dialout group"
    fi
fi

echo "✅ Reachy Mini USB permissions configured successfully!"
echo ""
echo "ℹ️  If you just installed this package, you may need to:"
echo "   1. Log out and log back in (for group changes)"
echo "   2. Unplug and replug your Reachy Mini USB cable"

exit 0

