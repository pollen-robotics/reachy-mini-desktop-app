use std::path::PathBuf;

/// Re-sign Python binaries (.so, .dylib) in .venv after pip install
/// This fixes the Team ID mismatch issue on macOS where pip-installed binaries
/// are not signed with the same Team ID as the app bundle
/// 
/// Runs asynchronously in a background thread to avoid blocking the UI
#[cfg(target_os = "macos")]
#[tauri::command]
pub async fn sign_python_binaries() -> Result<String, String> {
    use std::process::Command;
    use std::env;
    
    // Run the signing work in a blocking thread to avoid blocking the async runtime
    let result = tauri::async_runtime::spawn_blocking(move || {
        println!("[tauri] 🔐 Starting Python binaries re-signing...");
        
        // 1. Find app bundle path or dev mode path
    let exe_path = env::current_exe()
        .map_err(|e| format!("Failed to get current executable path: {}", e))?;
    
    // Try to find .venv in different locations:
    // - Production: Contents/Resources/.venv (in .app bundle)
    // - Dev mode: target/debug/.venv or current_dir/.venv
    let venv_dir = if exe_path.to_string_lossy().contains(".app/Contents/MacOS") {
        // Production mode: in app bundle
        let app_bundle = exe_path
            .parent() // Contents/MacOS
            .and_then(|p| p.parent()) // Contents
            .and_then(|p| p.parent()) // .app bundle
            .ok_or("Failed to find app bundle path")?;
        
        let resources_dir = app_bundle.join("Contents/Resources");
        resources_dir.join(".venv")
    } else {
        // Dev mode: try to find .venv relative to current dir or target/debug
        let current_dir = env::current_dir()
            .map_err(|e| format!("Failed to get current directory: {}", e))?;
        
        // Try multiple locations in dev mode:
        // 1. binaries/.venv (if we're in src-tauri/)
        // 2. src-tauri/binaries/.venv (if we're in project root)
        // 3. target/debug/.venv
        // 4. current_dir/.venv
        
        // Check if we're in src-tauri/ directory by checking the last component
        let is_in_src_tauri = current_dir
            .file_name()
            .and_then(|name| name.to_str())
            .map(|name| name == "src-tauri")
            .unwrap_or(false);
        
        // Try multiple locations in dev mode:
        let binaries_venv = if is_in_src_tauri {
            // We're in src-tauri/, look for binaries/.venv
            current_dir.join("binaries/.venv")
        } else {
            // We're in project root, look for src-tauri/binaries/.venv
            current_dir.join("src-tauri/binaries/.venv")
        };
        
        if binaries_venv.exists() {
            println!("[tauri] 📁 Found .venv at: {}", binaries_venv.display());
            binaries_venv
        } else {
            let target_venv = if is_in_src_tauri {
                current_dir.join("target/debug/.venv")
            } else {
                current_dir.join("src-tauri/target/debug/.venv")
            };
            
            if target_venv.exists() {
                println!("[tauri] 📁 Found .venv at: {}", target_venv.display());
                target_venv
            } else {
                // Fallback: try current_dir/.venv
                let fallback_venv = current_dir.join(".venv");
                println!("[tauri] 📁 Trying fallback .venv at: {}", fallback_venv.display());
                fallback_venv
            }
        }
    };
    
    if !venv_dir.exists() {
        return Err(format!("Python virtual environment (.venv) not found at: {}", venv_dir.display()));
    }
    
    println!("[tauri] 📁 Using .venv at: {}", venv_dir.display());
    
    // For signing identity detection, we still need the app bundle in production
    // In dev mode, we'll use adhoc signature
    let app_bundle_for_signing = if exe_path.to_string_lossy().contains(".app/Contents/MacOS") {
        exe_path
            .parent()
            .and_then(|p| p.parent())
            .and_then(|p| p.parent())
    } else {
        None // Dev mode: no app bundle
    };
    
    // 2. Detect signing identity from app bundle (production) or use adhoc (dev)
    let signing_identity = if let Some(app_bundle) = app_bundle_for_signing {
        // Production mode: try to detect signing identity
        let detect_output = Command::new("codesign")
            .arg("-d")
            .arg("-v")
            .arg(app_bundle)
            .output();
    
        match detect_output {
            Ok(output) => {
                // Try to extract identity from verbose output
                let output_str = String::from_utf8_lossy(&output.stderr);
                // Look for "Authority=" line
                let identity = output_str
                    .lines()
                    .find(|line| line.contains("Authority="))
                    .and_then(|line| {
                        line.split("Authority=").nth(1).map(|s| s.trim().to_string())
                    });
                
                if let Some(id) = identity {
                    println!("[tauri] ✅ Detected signing identity: {}", id);
                    id
                } else {
                    // Fallback: try to get from security find-identity
                    let sec_output = Command::new("security")
                        .arg("find-identity")
                        .arg("-v")
                        .arg("-p")
                        .arg("codesigning")
                        .output();
                    
                    match sec_output {
                        Ok(sec_out) => {
                            let sec_str = String::from_utf8_lossy(&sec_out.stdout);
                            // Look for Developer ID Application
                            let dev_id = sec_str
                                .lines()
                                .find(|line| line.contains("Developer ID Application"))
                                .and_then(|line| {
                                    // Extract identity from line like: "   1) ABC123... \"Developer ID Application: Name (TEAM_ID)\""
                                    line.split('"')
                                        .nth(1)
                                        .map(|s| s.to_string())
                                });
                            
                            if let Some(id) = dev_id {
                                println!("[tauri] ✅ Found Developer ID: {}", id);
                                id
                            } else {
                                println!("[tauri] ⚠️  No Developer ID found, using adhoc signature");
                                "-".to_string() // Adhoc signature
                            }
                        }
                        Err(_) => {
                            println!("[tauri] ⚠️  Failed to detect identity, using adhoc signature");
                            "-".to_string() // Adhoc signature
                        }
                    }
                }
            }
            Err(_) => {
                println!("[tauri] ⚠️  Failed to detect identity from app bundle, using adhoc signature");
                "-".to_string() // Adhoc signature
            }
        }
    } else {
        // Dev mode: use adhoc signature
        println!("[tauri] 🛠️  Dev mode detected, using adhoc signature");
        "-".to_string()
    };
    
    // 3. Find python-entitlements.plist in Resources
    // This file contains disable-library-validation entitlement required for Python
    let python_entitlements = if exe_path.to_string_lossy().contains(".app/Contents/MacOS") {
        let app_bundle = exe_path
            .parent()
            .and_then(|p| p.parent())
            .and_then(|p| p.parent());
        
        if let Some(bundle) = app_bundle {
            let entitlements_path = bundle.join("Contents/Resources/python-entitlements.plist");
            if entitlements_path.exists() {
                println!("[tauri] 📜 Found python-entitlements.plist at: {}", entitlements_path.display());
                Some(entitlements_path)
            } else {
                println!("[tauri] ⚠️  python-entitlements.plist not found in Resources");
                None
            }
        } else {
            None
        }
    } else {
        // Dev mode: look for it in src-tauri/
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
    
    // 4. Find and sign all binaries in .venv
    // IMPORTANT: Sign in order: libpython first, then executables, then extensions
    // Python binaries need disable-library-validation entitlement!
    let mut signed_count = 0;
    let mut error_count = 0;
    
    // Priority 1: Sign libpython*.dylib FIRST (critical for Python to load)
    // Apply entitlements to libpython for disable-library-validation
    let libpython_dylib = venv_dir.join("lib/libpython3.12.dylib");
    if libpython_dylib.exists() {
        println!("[tauri] 🔐 Signing libpython3.12.dylib with entitlements (priority)...");
        if sign_binary_with_entitlements(&libpython_dylib, &signing_identity, python_entitlements.as_ref())? {
            signed_count += 1;
        } else {
            error_count += 1;
        }
    }
    
    // Priority 2: Sign Python executables (python3, python3.12)
    // Apply entitlements to python3 for disable-library-validation
    let python_bin = venv_dir.join("bin/python3");
    if python_bin.exists() {
        println!("[tauri] 🔐 Signing python3 executable with entitlements...");
        if sign_binary_with_entitlements(&python_bin, &signing_identity, python_entitlements.as_ref())? {
            signed_count += 1;
        } else {
            error_count += 1;
        }
    }
    
    // Also sign python3.12 if it exists and is different from python3
    let python312_bin = venv_dir.join("bin/python3.12");
    if python312_bin.exists() && python312_bin != python_bin {
        println!("[tauri] 🔐 Signing python3.12 executable with entitlements...");
        if sign_binary_with_entitlements(&python312_bin, &signing_identity, python_entitlements.as_ref())? {
            signed_count += 1;
        } else {
            error_count += 1;
        }
    }
    
    // Priority 3: Sign all other .dylib files (including libpython in other locations)
    let dylib_files = find_files(&venv_dir, "*.dylib")
        .map_err(|e| format!("Failed to find .dylib files: {}", e))?;
    
    for dylib_file in dylib_files {
        // Skip libpython3.12.dylib if already signed above
        if dylib_file == libpython_dylib {
            continue;
        }
        // Apply entitlements to all libpython*.dylib files
        let use_entitlements = dylib_file.file_name()
            .map(|n| n.to_string_lossy().starts_with("libpython"))
            .unwrap_or(false);
        
        if use_entitlements {
            if sign_binary_with_entitlements(&dylib_file, &signing_identity, python_entitlements.as_ref())? {
                signed_count += 1;
            } else {
                error_count += 1;
            }
        } else {
        if sign_binary(&dylib_file, &signing_identity)? {
            signed_count += 1;
        } else {
            error_count += 1;
            }
        }
    }
    
    // Priority 4: Sign all .so files (Python extensions)
    let so_files = find_files(&venv_dir, "*.so")
        .map_err(|e| format!("Failed to find .so files: {}", e))?;
    
    for so_file in so_files {
        if sign_binary(&so_file, &signing_identity)? {
            signed_count += 1;
        } else {
            error_count += 1;
        }
    }
    
        let result_msg = if error_count == 0 {
            format!("✅ Successfully signed {} Python binaries", signed_count)
        } else {
            format!("⚠️  Signed {} binaries, {} failed", signed_count, error_count)
        };
        
        println!("[tauri] {}", result_msg);
        Ok(result_msg)
    })
    .await
    .map_err(|e| format!("Failed to execute signing task: {}", e))?;
    
    result
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
                if file_name.to_string_lossy().ends_with(&pattern[2..]) { // Remove "*." from pattern
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
    entitlements_path: Option<&PathBuf>
) -> Result<bool, String> {
    use std::process::Command;
    
    // Check if it's a Mach-O binary
    let file_output = Command::new("file")
        .arg(binary_path)
        .output()
        .map_err(|e| format!("Failed to check file type: {}", e))?;
    
    let file_str = String::from_utf8_lossy(&file_output.stdout);
    if !file_str.contains("Mach-O") && !file_str.contains("dynamically linked") && !file_str.contains("shared library") {
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
            println!("[tauri]   📜 Using entitlements: {}", entitlements.display());
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
                println!("[tauri]   ✓ Signed: {}", binary_path.display());
                Ok(true)
            } else {
                let error = String::from_utf8_lossy(&output.stderr);
                println!("[tauri]   ⚠️  Failed to sign {}: {}", binary_path.display(), error);
                Ok(false)
            }
        }
        Err(e) => {
            println!("[tauri]   ⚠️  Error signing {}: {}", binary_path.display(), e);
            Ok(false)
        }
    }
}

