#!/bin/bash

# Helper script to build sidecar with a specific branch
# Usage: bash build-sidecar-with-branch.sh <platform> <branch>
# Example: bash build-sidecar-with-branch.sh macos develop

set -e

if [ $# -lt 2 ]; then
    echo "Usage: $0 <platform> <branch>"
    echo "Platforms: macos, linux, windows"
    echo "Branch: pypi, develop, main, or any GitHub branch name"
    echo ""
    echo "Examples:"
    echo "  $0 macos develop"
    echo "  $0 linux main"
    echo "  $0 macos feature/my-feature"
    exit 1
fi

PLATFORM=$1
BRANCH=$2

case $PLATFORM in
    macos|linux)
        REACHY_MINI_SOURCE="$BRANCH" bash ./scripts/build/build-sidecar-unix.sh
        ;;
    windows)
        powershell -Command "\$env:REACHY_MINI_SOURCE='$BRANCH'; ./scripts/build/build-sidecar-windows.ps1"
        ;;
    *)
        echo "Error: Unknown platform '$PLATFORM'"
        echo "Supported platforms: macos, linux, windows"
        exit 1
        ;;
esac

