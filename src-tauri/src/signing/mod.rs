#[cfg(target_os = "macos")]
use std::path::PathBuf;

/// Re-sign Python binaries (.so, .dylib) in .venv and apps_venv after pip install
/// This fixes the Team ID mismatch issue on macOS where pip-installed binaries
/// are not signed with the same Team ID as the app bundle
///
/// Signs both .venv and apps_venv in all discovered locations:
/// - Application Support/com.pollen-robotics.reachy-mini/ (persists across updates)
/// - App bundle Contents/Resources/ (production)
/// - binaries/ or target/debug/ (dev mode)
///
/// Runs asynchronously in a background thread to avoid blocking the UI
#[cfg(target_os = "macos")]
#[tauri::command]
pub async fn sign_python_binaries() -> Result<String, String> {
    use std::env;
    use std::process::Command;

    // Run the signing work in a blocking thread to avoid blocking the async runtime
    let result = tauri::async_runtime::spawn_blocking(move || {
        log::info!("[tauri] Starting Python binaries re-signing...");

        let exe_path = env::current_exe()
            .map_err(|e| format!("Failed to get current executable path: {}", e))?;

        // Collect all directories that may contain .venv / apps_venv
        let mut base_dirs: Vec<PathBuf> = Vec::new();

        // Always check Application Support (used at runtime in both dev and prod)
        if let Some(data_dir) = dirs::data_dir() {
            let app_support_dir = data_dir.join("com.pollen-robotics.reachy-mini");
            if app_support_dir.exists() {
                log::info!(
                    "[tauri] Found Application Support dir: {}",
                    app_support_dir.display()
                );
                base_dirs.push(app_support_dir);
            }
        }

        if exe_path.to_string_lossy().contains(".app/Contents/MacOS") {
            // Production mode: also check app bundle Resources
            let app_bundle = exe_path
                .parent()
                .and_then(|p| p.parent())
                .and_then(|p| p.parent())
                .ok_or("Failed to find app bundle path")?;
            let resources_dir = app_bundle.join("Contents/Resources");
            if resources_dir.exists() {
                base_dirs.push(resources_dir);
            }
        } else {
            // Dev mode: also check binaries/ dir
            let current_dir = env::current_dir()
                .map_err(|e| format!("Failed to get current directory: {}", e))?;

            let is_in_src_tauri = current_dir
                .file_name()
                .and_then(|name| name.to_str())
                .map(|name| name == "src-tauri")
                .unwrap_or(false);

            let binaries_dir = if is_in_src_tauri {
                current_dir.join("binaries")
            } else {
                current_dir.join("src-tauri/binaries")
            };

            if binaries_dir.exists() {
                base_dirs.push(binaries_dir);
            }
        }

        // Collect all venv dirs (.venv and apps_venv) from discovered base dirs
        let venv_names = [".venv", "apps_venv"];
        let mut venv_dirs: Vec<PathBuf> = Vec::new();
        for base_dir in &base_dirs {
            for name in &venv_names {
                let venv_path = base_dir.join(name);
                if venv_path.exists() {
                    log::info!("[tauri] Will sign venv: {}", venv_path.display());
                    venv_dirs.push(venv_path);
                }
            }
        }

        if venv_dirs.is_empty() {
            return Err(format!(
                "No Python venvs (.venv or apps_venv) found in: {:?}",
                base_dirs
            ));
        }

        // Detect signing identity
        let app_bundle_for_signing = if exe_path.to_string_lossy().contains(".app/Contents/MacOS") {
            exe_path
                .parent()
                .and_then(|p| p.parent())
                .and_then(|p| p.parent())
        } else {
            None
        };

        let signing_identity = if let Some(app_bundle) = app_bundle_for_signing {
            let detect_output = Command::new("codesign")
                .arg("-d")
                .arg("-v")
                .arg(app_bundle)
                .output();

            match detect_output {
                Ok(output) => {
                    let output_str = String::from_utf8_lossy(&output.stderr);
                    let identity = output_str
                        .lines()
                        .find(|line| line.contains("Authority="))
                        .and_then(|line| {
                            line.split("Authority=")
                                .nth(1)
                                .map(|s| s.trim().to_string())
                        });

                    if let Some(id) = identity {
                        log::info!("[tauri] Detected signing identity: {}", id);
                        id
                    } else {
                        let sec_output = Command::new("security")
                            .arg("find-identity")
                            .arg("-v")
                            .arg("-p")
                            .arg("codesigning")
                            .output();

                        match sec_output {
                            Ok(sec_out) => {
                                let sec_str = String::from_utf8_lossy(&sec_out.stdout);
                                let dev_id = sec_str
                                    .lines()
                                    .find(|line| line.contains("Developer ID Application"))
                                    .and_then(|line| line.split('"').nth(1).map(|s| s.to_string()));

                                if let Some(id) = dev_id {
                                    log::info!("[tauri] Found Developer ID: {}", id);
                                    id
                                } else {
                                    log::info!(
                                        "[tauri] No Developer ID found, using adhoc signature"
                                    );
                                    "-".to_string()
                                }
                            }
                            Err(_) => {
                                log::info!(
                                    "[tauri] Failed to detect identity, using adhoc signature"
                                );
                                "-".to_string()
                            }
                        }
                    }
                }
                Err(_) => {
                    log::info!(
                        "[tauri] Failed to detect identity from app bundle, using adhoc signature"
                    );
                    "-".to_string()
                }
            }
        } else {
            log::info!("[tauri] Dev mode detected, using adhoc signature");
            "-".to_string()
        };

        // Find python-entitlements.plist
        let python_entitlements = if exe_path.to_string_lossy().contains(".app/Contents/MacOS") {
            let app_bundle = exe_path
                .parent()
                .and_then(|p| p.parent())
                .and_then(|p| p.parent());

            if let Some(bundle) = app_bundle {
                let entitlements_path = bundle.join("Contents/Resources/python-entitlements.plist");
                if entitlements_path.exists() {
                    log::info!(
                        "[tauri] Found python-entitlements.plist at: {}",
                        entitlements_path.display()
                    );
                    Some(entitlements_path)
                } else {
                    log::info!("[tauri] python-entitlements.plist not found in Resources");
                    None
                }
            } else {
                None
            }
        } else {
            let current_dir = env::current_dir().ok();
            if let Some(dir) = current_dir {
                let paths_to_try = vec![
                    dir.join("python-entitlements.plist"),
                    dir.join("src-tauri/python-entitlements.plist"),
                    dir.join("../scripts/signing/python-entitlements.plist"),
                ];
                paths_to_try.into_iter().find(|p| p.exists())
            } else {
                None
            }
        };

        // Sign all discovered venvs
        let mut total_signed = 0;
        let mut total_errors = 0;

        for venv_dir in &venv_dirs {
            log::info!("[tauri] Signing binaries in: {}", venv_dir.display());
            let (signed, errors) =
                sign_venv_binaries(venv_dir, &signing_identity, python_entitlements.as_ref())?;
            total_signed += signed;
            total_errors += errors;
        }

        let result_msg = if total_errors == 0 {
            format!(
                "Successfully signed {} Python binaries across {} venvs",
                total_signed,
                venv_dirs.len()
            )
        } else {
            format!(
                "Signed {} binaries, {} failed across {} venvs",
                total_signed,
                total_errors,
                venv_dirs.len()
            )
        };

        log::info!("[tauri] {}", result_msg);
        Ok(result_msg)
    })
    .await
    .map_err(|e| format!("Failed to execute signing task: {}", e))?;

    result
}

/// Sign all binaries within a single venv directory.
/// Uses a `.last_signed` marker file for incremental signing — only files
/// modified after the marker are signed. If no marker exists, signs everything.
/// Returns (signed_count, skipped_count, error_count).
#[cfg(target_os = "macos")]
fn sign_venv_binaries(
    venv_dir: &PathBuf,
    signing_identity: &str,
    python_entitlements: Option<&PathBuf>,
) -> Result<(u32, u32), String> {
    use std::fs;
    use std::time::SystemTime;

    let marker_path = venv_dir.join(".last_signed");
    let marker_mtime = if marker_path.exists() {
        fs::metadata(&marker_path)
            .ok()
            .and_then(|m| m.modified().ok())
    } else {
        None
    };

    if let Some(t) = marker_mtime {
        log::info!(
            "[tauri]   Incremental signing (marker exists) for {}",
            venv_dir.display()
        );
        let age = SystemTime::now().duration_since(t).unwrap_or_default();
        log::info!("[tauri]   Marker age: {}s", age.as_secs());
    } else {
        log::info!(
            "[tauri]   Full signing (no marker) for {}",
            venv_dir.display()
        );
    }

    /// Check if a file needs signing (modified after marker, or no marker)
    fn needs_signing(path: &PathBuf, marker_mtime: Option<SystemTime>) -> bool {
        let Some(marker_time) = marker_mtime else {
            return true; // No marker = sign everything
        };
        std::fs::metadata(path)
            .ok()
            .and_then(|m| m.modified().ok())
            .map(|file_mtime| file_mtime > marker_time)
            .unwrap_or(true)
    }

    let mut signed_count = 0;
    let mut error_count = 0;

    // Priority 1: Sign libpython*.dylib FIRST (critical for Python to load)
    let libpython_dylib = venv_dir.join("lib/libpython3.12.dylib");
    if libpython_dylib.exists() && needs_signing(&libpython_dylib, marker_mtime) {
        log::info!("[tauri]   Signing libpython3.12.dylib with entitlements (priority)...");
        if sign_binary_with_entitlements(&libpython_dylib, signing_identity, python_entitlements)? {
            signed_count += 1;
        } else {
            error_count += 1;
        }
    }

    // Priority 2: Sign Python executables (python3, python3.12)
    let python_bin = venv_dir.join("bin/python3");
    if python_bin.exists() && needs_signing(&python_bin, marker_mtime) {
        log::info!("[tauri]   Signing python3 executable with entitlements...");
        if sign_binary_with_entitlements(&python_bin, signing_identity, python_entitlements)? {
            signed_count += 1;
        } else {
            error_count += 1;
        }
    }

    let python312_bin = venv_dir.join("bin/python3.12");
    if python312_bin.exists()
        && python312_bin != python_bin
        && needs_signing(&python312_bin, marker_mtime)
    {
        log::info!("[tauri]   Signing python3.12 executable with entitlements...");
        if sign_binary_with_entitlements(&python312_bin, signing_identity, python_entitlements)? {
            signed_count += 1;
        } else {
            error_count += 1;
        }
    }

    // Priority 3: Sign all other .dylib files
    let dylib_files = find_files(venv_dir, "*.dylib")
        .map_err(|e| format!("Failed to find .dylib files: {}", e))?;

    for dylib_file in dylib_files {
        if dylib_file == libpython_dylib {
            continue;
        }
        if !needs_signing(&dylib_file, marker_mtime) {
            continue;
        }
        let use_entitlements = dylib_file
            .file_name()
            .map(|n: &std::ffi::OsStr| n.to_string_lossy().starts_with("libpython"))
            .unwrap_or(false);

        if use_entitlements {
            if sign_binary_with_entitlements(&dylib_file, signing_identity, python_entitlements)? {
                signed_count += 1;
            } else {
                error_count += 1;
            }
        } else if sign_binary(&dylib_file, signing_identity)? {
            signed_count += 1;
        } else {
            error_count += 1;
        }
    }

    // Priority 4: Sign all .so files (Python extensions)
    let so_files =
        find_files(venv_dir, "*.so").map_err(|e| format!("Failed to find .so files: {}", e))?;

    for so_file in so_files {
        if !needs_signing(&so_file, marker_mtime) {
            continue;
        }
        if sign_binary(&so_file, signing_identity)? {
            signed_count += 1;
        } else {
            error_count += 1;
        }
    }

    // Update marker after successful signing
    if error_count == 0 {
        fs::File::create(&marker_path)
            .map_err(|e| format!("Failed to create .last_signed marker: {}", e))?;
        log::info!("[tauri]   Updated .last_signed marker");
    }

    log::info!(
        "[tauri]   Venv {}: signed={}, errors={}",
        venv_dir.display(),
        signed_count,
        error_count
    );
    Ok((signed_count, error_count))
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn sign_python_binaries() -> Result<String, String> {
    // No-op on non-macOS
    Ok("Code signing not required on this platform".to_string())
}

/// Helper to find files matching a pattern recursively
#[cfg(target_os = "macos")]
fn find_files(dir: &PathBuf, pattern: &str) -> Result<Vec<PathBuf>, String> {
    use std::fs;

    let mut files = Vec::new();

    if !dir.exists() {
        return Ok(files);
    }

    let entries = fs::read_dir(dir)
        .map_err(|e| format!("Failed to read directory {}: {}", dir.display(), e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();

        if path.is_dir() {
            // Recursively search subdirectories
            let mut sub_files = find_files(&path, pattern)?;
            files.append(&mut sub_files);
        } else if path.is_file() {
            // Check if file matches pattern
            if let Some(file_name) = path.file_name() {
                if file_name.to_string_lossy().ends_with(&pattern[2..]) {
                    // Remove "*." from pattern
                    files.push(path);
                }
            }
        }
    }

    Ok(files)
}

/// Sign a single binary file (without entitlements)
#[cfg(target_os = "macos")]
fn sign_binary(binary_path: &PathBuf, signing_identity: &str) -> Result<bool, String> {
    sign_binary_with_entitlements(binary_path, signing_identity, None)
}

/// Sign a single binary file with optional entitlements
/// entitlements_path: Optional path to .plist file with entitlements
#[cfg(target_os = "macos")]
fn sign_binary_with_entitlements(
    binary_path: &PathBuf,
    signing_identity: &str,
    entitlements_path: Option<&PathBuf>,
) -> Result<bool, String> {
    use std::process::Command;

    // Check if it's a Mach-O binary
    let file_output = Command::new("file")
        .arg(binary_path)
        .output()
        .map_err(|e| format!("Failed to check file type: {}", e))?;

    let file_str = String::from_utf8_lossy(&file_output.stdout);
    if !file_str.contains("Mach-O")
        && !file_str.contains("dynamically linked")
        && !file_str.contains("shared library")
    {
        // Not a Mach-O binary, skip
        return Ok(false);
    }

    // Build codesign command
    let mut cmd = Command::new("codesign");
    cmd.arg("--force")
        .arg("--sign")
        .arg(signing_identity)
        .arg("--options")
        .arg("runtime");

    // Add entitlements if provided
    if let Some(entitlements) = entitlements_path {
        if entitlements.exists() {
            cmd.arg("--entitlements").arg(entitlements);
            log::info!("[tauri]   Using entitlements: {}", entitlements.display());
        }
    }

    // Add timestamp (skip for adhoc as it may not work)
    if signing_identity != "-" {
        cmd.arg("--timestamp");
    }

    cmd.arg(binary_path);

    // Sign the binary
    let sign_result = cmd.output();

    match sign_result {
        Ok(output) => {
            if output.status.success() {
                log::info!("[tauri]   Signed: {}", binary_path.display());
                Ok(true)
            } else {
                let error = String::from_utf8_lossy(&output.stderr);
                log::info!(
                    "[tauri]   Failed to sign {}: {}",
                    binary_path.display(),
                    error
                );
                Ok(false)
            }
        }
        Err(e) => {
            log::info!("[tauri]   Error signing {}: {}", binary_path.display(), e);
            Ok(false)
        }
    }
}
