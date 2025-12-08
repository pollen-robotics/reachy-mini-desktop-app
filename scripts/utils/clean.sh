#!/bin/bash

# Project cleanup script
# Removes all build files and artifacts

set -e

echo "🧹 Cleaning project..."

# Build directories to remove
DIRS_TO_CLEAN=(
  "dist"                          # Frontend Vite build
  "src-tauri/target"              # Rust Tauri build
  "src-tauri/gen"                 # Tauri generated files
  "uv-wrapper/target"            # Rust uv-wrapper build
  "scripts/__pycache__"          # Python cache
  "test-updates"                  # Test update files
)

# Temporary files to remove
FILES_TO_CLEAN=(
  "*.log"                         # Log files
  "daemon-develop-test.log"       # Specific log file
)

# Remove directories
for dir in "${DIRS_TO_CLEAN[@]}"; do
  if [ -d "$dir" ] || [ -f "$dir" ]; then
    echo "  ❌ Removing $dir"
    rm -rf "$dir"
  else
    echo "  ⏭️  $dir does not exist (already clean)"
  fi
done

# Remove files
for pattern in "${FILES_TO_CLEAN[@]}"; do
  if ls $pattern 1> /dev/null 2>&1; then
    echo "  ❌ Removing $pattern"
    rm -f $pattern
  fi
done

echo "✅ Cleanup complete!"
echo ""
echo "💡 To reinstall dependencies: yarn install"
echo "💡 To rebuild: yarn build"

