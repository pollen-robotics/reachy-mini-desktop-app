use std::{env, fs, path::PathBuf, process::Command};

/// The Python version used for all venvs created by the bootstrap process.
pub const PYTHON_VERSION: &str = "3.12";

/// Returns the platform-specific writable data directory for the app.
///
/// - macOS: ~/Library/Application Support/com.pollen-robotics.reachy-mini/
/// - Windows: %LOCALAPPDATA%\Reachy Mini Control\
/// - Linux: $XDG_DATA_HOME/reachy-mini-control/ or ~/.local/share/reachy-mini-control/
pub fn get_data_dir() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        env::var("HOME").ok().map(|home| {
            PathBuf::from(home)
                .join("Library")
                .join("Application Support")
                .join("com.pollen-robotics.reachy-mini")
        })
    }

    #[cfg(target_os = "windows")]
    {
        env::var("LOCALAPPDATA")
            .ok()
            .map(|local_app_data| PathBuf::from(local_app_data).join("Reachy Mini Control"))
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(xdg_data_home) = env::var("XDG_DATA_HOME") {
            return Some(PathBuf::from(xdg_data_home).join("reachy-mini-control"));
        }
        env::var("HOME")
            .ok()
            .map(|home| PathBuf::from(home).join(".local/share/reachy-mini-control"))
    }
}

/// Returns the path to the uv executable within the data directory.
pub fn uv_exe_path(data_dir: &PathBuf) -> PathBuf {
    if cfg!(target_os = "windows") {
        data_dir.join("uv.exe")
    } else {
        data_dir.join("uv")
    }
}

/// Returns the path to the Python executable within a venv.
pub fn python_exe_path(data_dir: &PathBuf, venv_name: &str) -> PathBuf {
    if cfg!(target_os = "windows") {
        data_dir.join(venv_name).join("Scripts").join("python.exe")
    } else {
        data_dir.join(venv_name).join("bin").join("python3")
    }
}

/// Checks if a venv exists and has a valid Python executable.
pub fn venv_exists(data_dir: &PathBuf, venv_name: &str) -> bool {
    python_exe_path(data_dir, venv_name).exists()
}

/// Minimum reachy-mini version required in .venv.
/// Versions below this trigger a full venv rebuild.
/// 1.6.0 introduced apps_venv (shared venv for all apps instead of per-app venvs).
const MIN_REACHY_MINI_VERSION: (u32, u32, u32) = (1, 6, 0);

/// Read the installed reachy-mini version from a venv's dist-info METADATA.
/// Returns `Some((major, minor, patch))` or `None` if unreadable.
pub fn get_installed_version(data_dir: &PathBuf, venv_name: &str) -> Option<(u32, u32, u32)> {
    let lib_dir = if cfg!(target_os = "windows") {
        data_dir.join(venv_name).join("Lib").join("site-packages")
    } else {
        // Find python3.x directory
        let lib = data_dir.join(venv_name).join("lib");
        let python_dir = fs::read_dir(&lib)
            .ok()?
            .filter_map(|e| e.ok())
            .find(|e| e.file_name().to_string_lossy().starts_with("python3"))?;
        python_dir.path().join("site-packages")
    };

    let entry = fs::read_dir(&lib_dir)
        .ok()?
        .filter_map(|e| e.ok())
        .find(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            name.starts_with("reachy_mini-") && name.ends_with(".dist-info")
        })?;

    let metadata = fs::read_to_string(entry.path().join("METADATA")).ok()?;
    let version_line = metadata
        .lines()
        .find(|l| l.starts_with("Version: "))?;
    let version_str = version_line.strip_prefix("Version: ")?.trim();

    // Parse "X.Y.Z" (ignore pre-release suffixes like rc1, .dev0, etc.)
    let parts: Vec<&str> = version_str.split('.').collect();
    if parts.len() >= 3 {
        let major = parts[0].parse().ok()?;
        let minor = parts[1].parse().ok()?;
        // Strip non-numeric suffix from patch (e.g., "0rc1" → "0")
        let patch_str: String = parts[2].chars().take_while(|c| c.is_ascii_digit()).collect();
        let patch = patch_str.parse().ok()?;
        Some((major, minor, patch))
    } else {
        None
    }
}

/// Check if the .venv has a reachy-mini version too old to work with the current app.
/// Returns true if a rebuild is needed.
pub fn needs_venv_rebuild(data_dir: &PathBuf) -> bool {
    match get_installed_version(data_dir, ".venv") {
        Some(version) => version < MIN_REACHY_MINI_VERSION,
        None => false, // Can't determine version — don't force rebuild
    }
}

/// Check if a venv contains a stale EXTERNALLY-MANAGED marker.
fn has_externally_managed_marker(data_dir: &PathBuf, venv_name: &str) -> bool {
    let venv_dir = data_dir.join(venv_name);
    if !venv_dir.exists() {
        return false;
    }

    if cfg!(target_os = "windows") {
        venv_dir.join("Lib").join("EXTERNALLY-MANAGED").exists()
    } else {
        let lib_dir = venv_dir.join("lib");
        fs::read_dir(&lib_dir)
            .ok()
            .and_then(|entries| {
                entries
                    .filter_map(|e| e.ok())
                    .find(|e| e.file_name().to_string_lossy().starts_with("python3"))
                    .map(|e| e.path().join("EXTERNALLY-MANAGED").exists())
            })
            .unwrap_or(false)
    }
}

/// If any venv has a stale EXTERNALLY-MANAGED marker, remove both venvs
/// so that bootstrap recreates them cleanly.
/// Returns true if venvs were removed.
pub fn fix_externally_managed_venvs(data_dir: &PathBuf) -> bool {
    if !has_externally_managed_marker(data_dir, ".venv")
        && !has_externally_managed_marker(data_dir, "apps_venv")
    {
        return false;
    }

    println!("[fix] Found EXTERNALLY-MANAGED marker in venv, removing Python environment...");

    // Remove uv, venvs, and cpython installations so bootstrap starts completely fresh.
    // - uv: an old version may be the cause of the stale marker
    // - cpython: binaries were signed with the previous app identity and macOS will SIGKILL them
    if let Ok(entries) = fs::read_dir(data_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            let should_remove = name_str == ".venv"
                || name_str == "apps_venv"
                || name_str.starts_with("cpython-");
            if should_remove && entry.path().is_dir() {
                if let Err(e) = fs::remove_dir_all(entry.path()) {
                    eprintln!("[fix] Failed to remove {}: {}", name_str, e);
                } else {
                    println!("[fix] Removed {}", name_str);
                }
            }
        }
    }

    // Remove uv/uvx binaries so bootstrap downloads a fresh version
    for bin_name in &["uv", "uvx"] {
        let bin_path = data_dir.join(if cfg!(target_os = "windows") {
            format!("{}.exe", bin_name)
        } else {
            bin_name.to_string()
        });
        if bin_path.exists() {
            if let Err(e) = fs::remove_file(&bin_path) {
                eprintln!("[fix] Failed to remove {}: {}", bin_name, e);
            } else {
                println!("[fix] Removed {}", bin_name);
            }
        }
    }

    true
}

/// Download and install uv into the data directory.
pub fn download_uv(data_dir: &PathBuf) -> Result<(), String> {
    let uv_path = uv_exe_path(data_dir);
    if uv_path.exists() {
        return Ok(());
    }

    println!("[bootstrap] Downloading uv...");

    #[cfg(not(target_os = "windows"))]
    {
        let script = format!(
            "curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR='{}' UV_NO_MODIFY_PATH=1 sh",
            data_dir.display()
        );
        run_command(&script).map_err(|e| format!("Failed to download uv: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    {
        // Download uv zip directly using curl.exe (the real curl, not PowerShell alias)
        let zip_path = data_dir.join("uv.zip");
        let download_cmd = format!(
            "curl.exe -L -o \"{}\" https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-pc-windows-msvc.zip",
            zip_path.display()
        );
        run_command(&download_cmd).map_err(|e| format!("Failed to download uv: {}", e))?;

        let extract_cmd = format!(
            "Expand-Archive -Path \"{}\" -DestinationPath \"{}\" -Force",
            zip_path.display(),
            data_dir.display()
        );
        run_command(&extract_cmd).map_err(|e| format!("Failed to extract uv: {}", e))?;

        // Clean up zip
        let _ = fs::remove_file(&zip_path);
    }

    if !uv_path.exists() {
        return Err(format!("uv not found at {:?} after download", uv_path));
    }

    println!("[bootstrap] uv downloaded successfully");
    Ok(())
}

/// Run a uv command in the data directory.
pub fn run_uv(data_dir: &PathBuf, args: &[&str]) -> Result<(), String> {
    let uv_path = uv_exe_path(data_dir);

    let status = Command::new(&uv_path)
        .current_dir(data_dir)
        .env("UV_PYTHON_INSTALL_DIR", data_dir)
        .env("UV_WORKING_DIR", data_dir)
        .args(args)
        .status()
        .map_err(|e| format!("Failed to run uv {:?}: {}", args, e))?;

    if !status.success() {
        return Err(format!(
            "uv {:?} failed with exit code: {:?}",
            args,
            status.code()
        ));
    }

    Ok(())
}

/// Determine the reachy-mini package spec.
///
/// Checked in order (first match wins):
/// 1. Compile-time REACHY_MINI_VERSION → "reachy-mini==0.9.20"
/// 2. Compile-time REACHY_MINI_SOURCE → "git+...@branch"
/// 3. Runtime env REACHY_MINI_VERSION → "reachy-mini==0.9.20"
/// 4. Runtime env REACHY_MINI_SOURCE → "git+...@branch"
/// 5. default → "reachy-mini" (latest from PyPI)
pub fn get_reachy_mini_spec() -> String {
    // Compile-time (set during `cargo build` via env vars)
    if let Some(version) = option_env!("REACHY_MINI_VERSION") {
        return format!("reachy-mini=={}", version);
    }
    if let Some(source) = option_env!("REACHY_MINI_SOURCE") {
        if source != "pypi" {
            return format!(
                "git+https://github.com/pollen-robotics/reachy_mini.git@{}",
                source
            );
        }
    }

    // Runtime (for flexibility, but compile-time takes precedence)
    if let Ok(version) = env::var("REACHY_MINI_VERSION") {
        return format!("reachy-mini=={}", version);
    }
    if let Ok(source) = env::var("REACHY_MINI_SOURCE") {
        if source != "pypi" {
            return format!(
                "git+https://github.com/pollen-robotics/reachy_mini.git@{}",
                source
            );
        }
    }

    "reachy-mini".to_string()
}

/// Bootstrap the Python environment: download uv, install Python, create venvs, install packages.
pub fn bootstrap(data_dir: &PathBuf) -> Result<(), String> {
    fs::create_dir_all(data_dir)
        .map_err(|e| format!("Failed to create data directory {:?}: {}", data_dir, e))?;

    // Step 1: Download uv
    download_uv(data_dir)?;

    // Step 2: Install Python
    println!("[bootstrap] Installing Python {}...", PYTHON_VERSION);
    run_uv(data_dir, &["python", "install", PYTHON_VERSION])?;

    let package_spec = get_reachy_mini_spec();

    // Step 3: Create .venv and install reachy-mini
    println!("[bootstrap] Creating .venv...");
    run_uv(data_dir, &["venv", "--python", PYTHON_VERSION, ".venv"])?;

    println!("[bootstrap] Installing {}...", package_spec);
    let python_rel = if cfg!(target_os = "windows") {
        ".venv\\Scripts\\python.exe"
    } else {
        ".venv/bin/python3"
    };
    run_uv(
        data_dir,
        &["pip", "install", "--python", python_rel, &package_spec],
    )?;

    // Step 4: Create apps_venv and install reachy-mini
    println!("[bootstrap] Creating apps_venv...");
    run_uv(data_dir, &["venv", "--python", PYTHON_VERSION, "apps_venv"])?;

    let apps_python_rel = if cfg!(target_os = "windows") {
        "apps_venv\\Scripts\\python.exe"
    } else {
        "apps_venv/bin/python3"
    };
    run_uv(
        data_dir,
        &["pip", "install", "--python", apps_python_rel, &package_spec],
    )?;

    println!("[bootstrap] Packages installed successfully");
    write_spec_marker(data_dir);
    Ok(())
}

/// Path to the marker file that records which reachy-mini spec was last installed.
pub fn spec_marker_path(data_dir: &PathBuf) -> PathBuf {
    data_dir.join(".reachy_mini_spec")
}

/// Check if the installed reachy-mini spec differs from what this build expects.
/// Returns true when an upgrade is needed (marker missing or content differs).
pub fn needs_upgrade(data_dir: &PathBuf) -> bool {
    let marker = spec_marker_path(data_dir);
    let current_spec = get_reachy_mini_spec();
    match fs::read_to_string(&marker) {
        Ok(saved) => saved.trim() != current_spec,
        Err(_) => true,
    }
}

/// Write the current spec to the marker file so subsequent launches skip the upgrade.
pub fn write_spec_marker(data_dir: &PathBuf) {
    let _ = fs::write(spec_marker_path(data_dir), get_reachy_mini_spec());
}

/// Upgrade reachy-mini in both venvs to match the current spec.
pub fn upgrade_venvs(data_dir: &PathBuf) -> Result<(), String> {
    let package_spec = get_reachy_mini_spec();

    let python_rel = if cfg!(target_os = "windows") {
        ".venv\\Scripts\\python.exe"
    } else {
        ".venv/bin/python3"
    };
    let apps_python_rel = if cfg!(target_os = "windows") {
        "apps_venv\\Scripts\\python.exe"
    } else {
        "apps_venv/bin/python3"
    };

    println!("[upgrade] Upgrading .venv to {}...", package_spec);
    run_uv(
        data_dir,
        &["pip", "install", "-U", "--python", python_rel, &package_spec],
    )?;

    if python_exe_path(data_dir, "apps_venv").exists() {
        println!("[upgrade] Upgrading apps_venv to {}...", package_spec);
        run_uv(
            data_dir,
            &["pip", "install", "-U", "--python", apps_python_rel, &package_spec],
        )?;
    }

    write_spec_marker(data_dir);
    println!("[upgrade] Upgrade complete");
    Ok(())
}

pub fn run_command(cmd: &str) -> Result<std::process::ExitStatus, std::io::Error> {
    println!("Running command: {}", cmd);

    #[cfg(target_os = "windows")]
    let status = Command::new("powershell")
        .arg("-ExecutionPolicy")
        .arg("ByPass")
        .arg("-c")
        .arg(cmd)
        .status()?;

    #[cfg(not(target_os = "windows"))]
    let status = Command::new("sh").arg("-c").arg(cmd).status()?;

    if !status.success() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::Other,
            format!("Command failed with exit code: {:?}", status.code()),
        ));
    }

    Ok(status)
}
