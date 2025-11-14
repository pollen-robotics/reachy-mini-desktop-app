#!/bin/bash

DST_DIR="src-tauri/binaries"
# Use TARGET_TRIPLET if provided (for cross-compilation), otherwise use host triplet
TRIPLET=${TARGET_TRIPLET:-$(rustc -Vv | grep host | cut -f2 -d' ')}

set -e

rm -rf $DST_DIR
mkdir -p $DST_DIR

pushd uv-wrapper
    # Build uv-bundle for host (needed to run during build)
    cargo build --release --bin uv-bundle
    ./target/release/uv-bundle --install-dir ../$DST_DIR --python-version 3.12 --dependencies "reachy-mini[placo_kinematics]"

    # Build uv-trampoline for target platform
    if [ -n "$TARGET_TRIPLET" ]; then
        cargo build --release --bin uv-trampoline --target $TARGET_TRIPLET
        cp target/$TARGET_TRIPLET/release/uv-trampoline ../$DST_DIR/uv-trampoline-$TRIPLET
    else
        cargo build --release --bin uv-trampoline
        cp target/release/uv-trampoline ../$DST_DIR/uv-trampoline-$TRIPLET
    fi
popd

