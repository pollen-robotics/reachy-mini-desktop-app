#!/bin/bash
# Post-removal script for Reachy Mini Control Fedora RPM package.

set -e

UDEV_RULES_FILE="/etc/udev/rules.d/99-reachy-mini.rules"

# RPM passes 0 on final erase and 1 on upgrade. Keep rules during upgrades.
if [ "${1:-0}" != "0" ]; then
    exit 0
fi

echo "Cleaning up Reachy Mini USB permissions..."

if [ -f "$UDEV_RULES_FILE" ]; then
    if grep -q "Reachy Mini" "$UDEV_RULES_FILE" 2>/dev/null; then
        rm -f "$UDEV_RULES_FILE"
        udevadm control --reload-rules || true
        udevadm trigger || true
        echo "udev rules removed"
    else
        echo "Keeping udev rules not installed by this package"
    fi
fi

echo "Cleanup completed"

exit 0
