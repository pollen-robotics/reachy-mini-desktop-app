#!/bin/bash
# Post-installation script for Reachy Mini Control Fedora RPM package.

set -e

APP_LIB_DIR="/usr/lib/Reachy Mini Control"
UDEV_RULES_FILE="/etc/udev/rules.d/99-reachy-mini.rules"
UDEV_RULES_SOURCE="/usr/share/reachy-mini-control/99-reachy-mini.rules"

echo "Patching Python virtual environment paths..."

PYVENV_CFG="$APP_LIB_DIR/.venv/pyvenv.cfg"
if [ -f "$PYVENV_CFG" ]; then
    CPYTHON_FOLDER=$(ls -d "$APP_LIB_DIR"/cpython-* 2>/dev/null | head -1)

    if [ -n "$CPYTHON_FOLDER" ]; then
        CPYTHON_BIN="$CPYTHON_FOLDER/bin"
        sed -i "s|^home = .*|home = $CPYTHON_BIN|g" "$PYVENV_CFG"
        echo "pyvenv.cfg patched: $CPYTHON_BIN"
    else
        echo "Warning: cpython folder not found in $APP_LIB_DIR"
    fi
else
    echo "Warning: pyvenv.cfg not found at $PYVENV_CFG"
fi

echo "Configuring Reachy Mini USB permissions..."

if [ -f "$UDEV_RULES_SOURCE" ]; then
    if [ ! -f "$UDEV_RULES_FILE" ] || ! cmp -s "$UDEV_RULES_SOURCE" "$UDEV_RULES_FILE"; then
        cp "$UDEV_RULES_SOURCE" "$UDEV_RULES_FILE"
        chmod 0644 "$UDEV_RULES_FILE"
        echo "udev rules installed"
    else
        echo "udev rules already up to date"
    fi
else
    echo "Warning: udev rules source file not found at $UDEV_RULES_SOURCE"
fi

if [ -f "$UDEV_RULES_FILE" ]; then
    udevadm control --reload-rules || true
    udevadm trigger || true
    echo "udev rules reloaded"
fi

CURRENT_USER="${SUDO_USER:-${USER}}"
if [ -n "$CURRENT_USER" ] && [ "$CURRENT_USER" != "root" ] && getent group dialout >/dev/null; then
    if ! groups "$CURRENT_USER" | grep -q "\bdialout\b"; then
        usermod -aG dialout "$CURRENT_USER" || true
        echo "User '$CURRENT_USER' added to dialout group"
        echo "Log out and back in for group changes to take effect"
    else
        echo "User '$CURRENT_USER' already in dialout group"
    fi
fi

echo "Reachy Mini USB permissions configured"

exit 0
