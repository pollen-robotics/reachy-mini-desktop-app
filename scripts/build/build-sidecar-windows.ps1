# build_sidecar_windows.ps1
# PowerShell script equivalent to build_sidecar_unix.sh

$DST_DIR = "src-tauri/binaries"

# Remove old build artifacts but preserve installed app venvs (*_venv/)
# Apps are installed as {app_name}_venv/ alongside .venv in this directory
if (Test-Path $DST_DIR) {
    $TempApps = New-TemporaryFile | ForEach-Object { Remove-Item $_; New-Item -ItemType Directory -Path $_ }
    $AppVenvs = Get-ChildItem -Path $DST_DIR -Directory -Filter "*_venv"
    foreach ($venv in $AppVenvs) {
        Write-Host "Preserving app venv: $($venv.Name)"
        Move-Item $venv.FullName $TempApps.FullName
    }
    
    Remove-Item $DST_DIR -Recurse -Force
    New-Item -ItemType Directory -Path $DST_DIR | Out-Null
    
    # Restore app venvs
    $RestoredVenvs = Get-ChildItem -Path $TempApps.FullName -Directory -Filter "*_venv" -ErrorAction SilentlyContinue
    foreach ($venv in $RestoredVenvs) {
        Write-Host "Restoring app venv: $($venv.Name)"
        Move-Item $venv.FullName "$DST_DIR/"
    }
    Remove-Item $TempApps.FullName -Recurse -Force -ErrorAction SilentlyContinue
} else {
    New-Item -ItemType Directory -Path $DST_DIR | Out-Null
}

# Get Rust target triplet
$TRIPLET = (rustc -Vv | Select-String "host:" | ForEach-Object { $_.Line.Split(" ")[1] })

Push-Location uv-wrapper
    cargo build --release --bin uv-bundle
    
    # Use REACHY_MINI_SOURCE env var if set, default to 'pypi'
    $ReachyMiniSource = if ($env:REACHY_MINI_SOURCE) { $env:REACHY_MINI_SOURCE } else { "pypi" }
    # Install reachy-mini (no mujoco - simulation uses lightweight kinematics)
    # Creates .venv for daemon and apps_venv for apps runtime
    target/release/uv-bundle.exe --install-dir ..\$DST_DIR --python-version 3.12 --dependencies "reachy-mini" --apps-dependencies "reachy-mini" --reachy-mini-source $ReachyMiniSource

    cargo build --release --bin uv-trampoline
    Copy-Item target/release/uv-trampoline.exe ../$DST_DIR/uv-trampoline-$TRIPLET.exe -Force
Pop-Location

