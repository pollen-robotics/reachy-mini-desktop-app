use std::env;
use std::path::PathBuf;
use std::process::{Command, ExitCode};

use uv_wrapper::{find_cpython_folder, lookup_bin_folder, patching_pyvenv_cfg};

#[cfg(not(target_os = "windows"))]
use signal_hook::{consts::TERM_SIGNALS, flag::register};

/// Determines possible folders according to the platform
/// 
/// The uv installation script can install the executable:
/// - Directly in the current directory (UV_INSTALL_DIR=.)
/// - In a bin/ subdirectory (default behavior of some installers)
/// - In a binaries/ subdirectory (alternative naming, especially in Tauri context)
fn get_possible_bin_folders() -> Vec<&'static str> {
    let mut folders = vec![
        ".",           // Same directory as uv-trampoline (direct installation)
        "./bin",       // bin/ subdirectory (if installer creates a subdirectory)
        "./binaries",  // binaries/ subdirectory (alternative naming, Tauri context)
    ];
    
    // On macOS, apps are in a bundle with structure App.app/Contents/Resources
    #[cfg(target_os = "macos")]
    {
        folders.push("../Resources");
        folders.push("../Resources/bin");
        folders.push("../Resources/binaries");
        folders.push("../../Resources");
        folders.push("../../Resources/bin");
        folders.push("../../Resources/binaries");
    }
    
    // On Windows, binaries can be in the same directory or in a subdirectory
    #[cfg(target_os = "windows")]
    {
        folders.push("..");
        folders.push("../bin");
        folders.push("../binaries");
        folders.push("../..");
        folders.push("../../bin");
        folders.push("../../binaries");
    }
    
    // On Linux, structure similar to Windows
    #[cfg(target_os = "linux")]
    {
        folders.push("..");
        folders.push("../bin");
        folders.push("../binaries");
        folders.push("../..");
        folders.push("../../bin");
        folders.push("../../binaries");
    }
    
    folders
}

fn main() -> ExitCode {
    let args = env::args().skip(1).collect::<Vec<String>>();

    let uv_exe = if cfg!(target_os = "windows") {
        "uv.exe"
    } else {
        "uv"
    };
    
    let possible_folders = get_possible_bin_folders();
    let uv_folder = match lookup_bin_folder(&possible_folders, uv_exe) {
        Some(folder) => folder,
        None => {
            eprintln!("❌ Error: Unable to find '{}' in the following locations:", uv_exe);
            for folder in &possible_folders {
                eprintln!("   - {}", folder);
            }
            eprintln!("   Current directory: {:?}", env::current_exe()
                .ok()
                .and_then(|p| p.parent().map(|p| p.to_path_buf()))
                .unwrap_or_else(|| PathBuf::from(".")));
            return ExitCode::FAILURE;
        }
    };

    if let Err(e) = env::set_current_dir(&uv_folder) {
        eprintln!("❌ Error: Unable to change working directory to {:?}: {}", uv_folder, e);
        return ExitCode::FAILURE;
    }

    println!("📂 Running from {:?}", uv_folder);

    let cpython_folder = match find_cpython_folder(&uv_folder) {
        Ok(folder) => folder,
        Err(e) => {
            eprintln!("❌ Error: Unable to find cpython folder: {}", e);
            return ExitCode::FAILURE;
        }
    };
    
    if let Err(e) = patching_pyvenv_cfg(&uv_folder, &cpython_folder) {
        // Check if this is an AppTranslocation error
        if e.contains("APP_TRANSLOCATION_ERROR") {
            eprintln!("❌ AppTranslocation Error: {}", e);
            eprintln!("");
            eprintln!("📱 Please move the app to the Applications folder:");
            eprintln!("   1. Open Finder");
            eprintln!("   2. Drag 'Reachy Mini Control.app' to Applications");
            eprintln!("   3. Launch from Applications");
            eprintln!("");
            eprintln!("This is required because macOS isolates apps downloaded from the internet.");
            return ExitCode::FAILURE;
        }
        eprintln!("⚠️  Warning: Unable to patch pyvenv.cfg: {}", e);
        // Continue anyway, this is not fatal
    }

    // Get the absolute working directory for environment variables
    let working_dir = match env::current_dir() {
        Ok(dir) => dir,
        Err(e) => {
            eprintln!("❌ Error: Unable to get working directory: {}", e);
            return ExitCode::FAILURE;
        }
    };

    // Check if the first argument is a Python executable path (e.g., .venv/bin/python3)
    // If so, execute it directly instead of passing through uv
    println!("🔍 Checking args: {:?}", args);
    let mut cmd = if !args.is_empty() && (args[0].contains("python") || args[0].contains("mjpython")) {
        println!("✅ Detected Python executable: {}", args[0]);
        // First argument is a Python executable - execute it directly
        let python_path = if args[0].starts_with("/") || args[0].starts_with(".") {
            // Relative or absolute path - resolve relative to working_dir
            let python_exe = working_dir.join(&args[0]);
            println!("🔍 Resolved Python path: {:?}", python_exe);
            if !python_exe.exists() {
                eprintln!("❌ Error: Python executable not found at {:?}", python_exe);
                return ExitCode::FAILURE;
            }
            python_exe
        } else {
            // Just a name like "python" or "python3" - use as-is
            println!("🔍 Using Python from PATH: {}", args[0]);
            PathBuf::from(&args[0])
        };
        
        // On macOS, check if python3 needs signing before launching
        // In production, binaries are already signed with Developer ID at build time
        // In dev, we sign with ad-hoc and disable Library Validation
        #[cfg(target_os = "macos")]
        {
            if let Some(python_parent) = python_path.parent() {
                // python_parent is .venv/bin, so parent is .venv
                if let Some(venv_dir) = python_parent.parent() {
                    // Check if we're in production (app bundle) or dev mode
                    let is_production = std::env::current_exe()
                        .ok()
                        .map(|exe| exe.to_string_lossy().contains(".app/Contents"))
                        .unwrap_or(false);
                    
                    // Check if python3 is already signed with a Developer ID (production)
                    let check_signature = Command::new("codesign")
                        .arg("-d")
                        .arg("-v")
                        .arg(&python_path)
                        .output();
                    
                    let needs_signing = match check_signature {
                        Ok(output) => {
                            let output_str = String::from_utf8_lossy(&output.stderr);
                            // If already signed with Developer ID, don't re-sign
                            // Only sign if unsigned or signed with ad-hoc
                            !output_str.contains("Authority=") || output_str.contains("adhoc")
                        }
                        Err(_) => true, // Not signed, needs signing
                    };
                    
                    if needs_signing {
                        println!("🔐 Pre-signing Python binaries for macOS Library Validation...");
                        
                        if is_production {
                            // Production: Try to detect Developer ID from app bundle
                            // But in practice, binaries should already be signed at build time
                            // This is a fallback in case they're not
                            println!("   ℹ️  Production mode detected - binaries should already be signed");
                            // Don't sign in production - they should be signed at build time
                            // If they're not, sign_python_binaries will handle it after app install
                        } else {
                            // Dev mode: Sign with ad-hoc and disable Library Validation
                            let entitlements = r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.cs.disable-library-validation</key>
    <true/>
</dict>
</plist>"#;
                            
                            let temp_entitlements = std::env::temp_dir().join(format!("python3_entitlements_{}.plist", std::process::id()));
                            std::fs::write(&temp_entitlements, entitlements)
                                .map_err(|e| eprintln!("   ⚠️  Failed to write entitlements: {}", e))
                                .ok();
                            
                            let sign_python_result = if temp_entitlements.exists() {
                                Command::new("codesign")
                                    .arg("--force")
                                    .arg("--sign")
                                    .arg("-") // Ad-hoc signature for dev
                                    .arg("--options")
                                    .arg("runtime")
                                    .arg("--entitlements")
                                    .arg(&temp_entitlements)
                                    .arg(&python_path)
                                    .output()
                            } else {
                                Command::new("codesign")
                                    .arg("--force")
                                    .arg("--sign")
                                    .arg("-")
                                    .arg("--options")
                                    .arg("runtime")
                                    .arg(&python_path)
                                    .output()
                            };
                            
                            match sign_python_result {
                                Ok(output) => {
                                    if output.status.success() {
                                        println!("   ✓ Signed python3 executable (dev mode, Library Validation disabled)");
                                    } else {
                                        let error = String::from_utf8_lossy(&output.stderr);
                                        eprintln!("   ⚠️  Failed to sign python3: {}", error);
                                    }
                                }
                                Err(e) => {
                                    eprintln!("   ⚠️  Error signing python3: {}", e);
                                }
                            }
                            
                            // Clean up temp entitlements file
                            if temp_entitlements.exists() {
                                let _ = std::fs::remove_file(&temp_entitlements);
                            }
                            
                            // Sign libpython3.12.dylib with same ad-hoc signature
                            let libpython = venv_dir.join("lib/libpython3.12.dylib");
                            if libpython.exists() {
                                let sign_lib_result = Command::new("codesign")
                                    .arg("--force")
                                    .arg("--sign")
                                    .arg("-") // Same ad-hoc signature
                                    .arg("--options")
                                    .arg("runtime")
                                    .arg(&libpython)
                                    .output();
                                
                                match sign_lib_result {
                                    Ok(output) => {
                                        if output.status.success() {
                                            println!("   ✓ Signed libpython3.12.dylib");
                                        } else {
                                            let error = String::from_utf8_lossy(&output.stderr);
                                            eprintln!("   ⚠️  Failed to sign libpython3.12.dylib: {}", error);
                                        }
                                    }
                                    Err(e) => {
                                        eprintln!("   ⚠️  Error signing libpython3.12.dylib: {}", e);
                                    }
                                }
                            }
                        }
                    } else {
                        println!("   ✓ Python binaries already signed (production)");
                    }
                }
            }
        }
        
        println!("🐍 Direct Python execution: {:?} with args: {:?}", python_path, &args[1..]);
        let mut cmd = Command::new(&python_path);
        cmd.env("UV_WORKING_DIR", &working_dir)
           .env("UV_PYTHON_INSTALL_DIR", &working_dir)
           .args(&args[1..]); // Pass remaining arguments
        cmd
    } else {
        println!("ℹ️  Using normal uv command execution");
        // Normal uv command execution
        let uv_exe_path = uv_folder.join(uv_exe);
    let mut cmd = Command::new(&uv_exe_path);
    cmd.env("UV_WORKING_DIR", &working_dir)
       .env("UV_PYTHON_INSTALL_DIR", &working_dir)
       .args(&args);
        cmd
    };
    
    println!("🚀 Launching process: {:?}", cmd);
    
    let mut child = match cmd.spawn() {
        Ok(child) => child,
        Err(e) => {
            eprintln!("❌ Error: Unable to spawn process: {}", e);
            return ExitCode::FAILURE;
        }
    };

    // Signal handling configuration on Unix
    #[cfg(not(target_os = "windows"))]
    {
        use std::sync::atomic::{AtomicBool, Ordering};
        use std::sync::Arc;
        
        let term_now = Arc::new(AtomicBool::new(false));
        for sig in TERM_SIGNALS {
            if let Err(e) = register(*sig, Arc::clone(&term_now)) {
                eprintln!("⚠️  Warning: Unable to register handler for signal {:?}: {}", sig, e);
            }
        }
        
        // Wait loop with signal checking
    loop {
            // Check if a termination signal was received
            if term_now.load(Ordering::Relaxed) {
                eprintln!("🛑 Termination signal received, stopping child process...");
                let _ = child.kill();
                break;
            }
            
        match child.try_wait() {
                Ok(Some(status)) => {
                    let exit_code = status.code().unwrap_or(1);
                    if exit_code != 0 {
                        eprintln!("⚠️  Process exited with code: {}", exit_code);
                    }
                    return ExitCode::from(exit_code as u8);
                }
                Ok(None) => {
                    std::thread::sleep(std::time::Duration::from_millis(100));
                }
                Err(e) => {
                    eprintln!("❌ Error while waiting for child process: {}", e);
                    let _ = child.kill();
                    return ExitCode::FAILURE;
                }
            }
        }
        
        // Wait for process to terminate after kill
        match child.wait() {
            Ok(status) => ExitCode::from(status.code().unwrap_or(1) as u8),
            Err(e) => {
                eprintln!("❌ Error during final wait: {}", e);
                ExitCode::FAILURE
            }
        }
    }
    
    // On Windows, no signal handling, just wait
    #[cfg(target_os = "windows")]
    {
        match child.wait() {
            Ok(status) => {
                let exit_code = status.code().unwrap_or(1);
                if exit_code != 0 {
                    eprintln!("⚠️  Process exited with code: {}", exit_code);
                }
                ExitCode::from(exit_code as u8)
            }
            Err(e) => {
                eprintln!("❌ Error while waiting for process: {}", e);
                ExitCode::FAILURE
            }
        }
    }
}

