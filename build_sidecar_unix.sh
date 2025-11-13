#!/bin/bash

DST_DIR="src-tauri/binaries"
TRIPLET=$(rustc -Vv | grep host | cut -f2 -d' ')

set -e

rm -rf $DST_DIR
mkdir -p $DST_DIR

pushd uv-wrapper
    cargo build --release --bin uv-bundle
    ./target/release/uv-bundle --install-dir ../$DST_DIR --python-version 3.12 --dependencies reachy-mini

    cargo build --release --bin uv-trampoline
    cp target/release/uv-trampoline ../$DST_DIR/uv-trampoline-$TRIPLET
popd

