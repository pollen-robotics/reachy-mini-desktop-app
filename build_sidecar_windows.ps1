# build_sidecar_windows.ps1
# PowerShell script equivalent to build_sidecar_unix.sh

$DST_DIR = "src-tauri/binaries"

# Remove old build
if (Test-Path $DST_DIR) { Remove-Item $DST_DIR -Recurse -Force }
New-Item -ItemType Directory -Path $DST_DIR | Out-Null

# Get Rust target triplet
$TRIPLET = (rustc -Vv | Select-String "host:" | ForEach-Object { $_.Line.Split(" ")[1] })

Push-Location uv-wrapper
    cargo build --release --bin uv-bundle
    target/release/uv-bundle.exe --install-dir ..\$DST_DIR --python-version 3.12 --dependencies reachy-mini

    cargo build --release --bin uv-trampoline
    Copy-Item target/release/uv-trampoline.exe ../$DST_DIR/uv-trampoline-$TRIPLET.exe -Force
Pop-Location

