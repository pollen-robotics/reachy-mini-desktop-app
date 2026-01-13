use std::env;
use std::path::PathBuf;
use std::process::{Command, ExitCode};
use std::fs;

use uv_wrapper::lookup_bin_folder;

#[cfg(target_os = "windows")]
use uv_wrapper::{get_local_app_data_dir, is_program_files_path, setup_local_venv_windows};

#[cfg(target_os = "linux")]
use uv_wrapper::{get_xdg_data_home, is_system_lib_path, setup_local_venv_linux};

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
    
    // On Windows MSI, sidecar and resources are typically in the same folder
    // C:\Program Files\Reachy Mini Control\
    //   ├── Reachy Mini Control.exe
    //   ├── uv-trampoline-*.exe  (sidecar)
    //   ├── uv.exe               (resource)
    //   ├── .venv/               (resource)
    //   └── .venv/               (resource, self-contained with --relocatable)
    //
    // BUT: Program Files is read-only, so we copy to %LOCALAPPDATA%\Reachy Mini Control\
    // The local copy has patched pyvenv.cfg with correct paths
    #[cfg(target_os = "windows")]
    {
        // Priority 1: Local app data (writable, with patched paths)
        // This is where we copy the venv on first launch
        if let Some(local_dir) = get_local_app_data_dir() {
            // We need to leak the string to get a static reference
            // This is fine because we only call this function once
            let local_path: &'static str = Box::leak(local_dir.to_string_lossy().into_owned().into_boxed_str());
            folders.insert(0, local_path); // Insert at beginning for priority
        }
        
        // Priority 2: Same directory as sidecar (MSI structure - Program Files)
        // Note: "." is already added in the common folders above
        
        // Resources subfolder (if Tauri uses a subfolder)
        folders.push("./resources");
        
        // Legacy relative paths (for dev/other setups)
        folders.push("..");
        folders.push("../bin");
        folders.push("../binaries");
        folders.push("../resources");
        folders.push("../..");
        folders.push("../../bin");
        folders.push("../../binaries");
    }
    
    // On Linux .deb, sidecar is in /usr/bin/ and resources are in /usr/lib/<productName>/
    // Tauri uses the productName from tauri.conf.json which is "Reachy Mini Control" (with spaces!)
    #[cfg(target_os = "linux")]
    {
        // Priority 1: XDG data home (writable, with patched paths)
        // This is where we copy the venv on first launch: ~/.local/share/Reachy Mini Control/
        if let Some(local_dir) = get_xdg_data_home() {
            // We need to leak the string to get a static reference
            // This is fine because we only call this function once
            let local_path: &'static str = Box::leak(local_dir.to_string_lossy().into_owned().into_boxed_str());
            folders.insert(0, local_path); // Insert at beginning for priority
        }
        
        // Priority 2: Tauri .deb structure - resources in /usr/lib/<productName>/
        // The productName is "Reachy Mini Control" (with spaces)
        folders.push("/usr/lib/Reachy Mini Control");
        folders.push("../lib/Reachy Mini Control");
        
        // Fallback: lowercase with dashes (in case Tauri changes behavior)
        folders.push("/usr/lib/reachy-mini-control");
        folders.push("../lib/reachy-mini-control");
        
        // Alternative: /usr/share/<app-name>/ (older Tauri versions)
        folders.push("/usr/share/reachy-mini-control");
        folders.push("../share/reachy-mini-control");
        folders.push("/usr/lib/reachy-mini-control");
        
        // Legacy relative paths (for dev/other setups)
        folders.push("..");
        folders.push("../bin");
        folders.push("../binaries");
        folders.push("../..");
        folders.push("../../bin");
        folders.push("../../binaries");
        
        // Dev mode: sidecar runs from target/debug/, resources in src-tauri/binaries/
        // Path: target/debug/ -> src-tauri/binaries/ = ../../binaries (already above)
        // But also try absolute-ish paths for cargo run scenarios
        folders.push("../../../src-tauri/binaries");
        folders.push("../../../../src-tauri/binaries");
    }
    
    folders
}

/// Re-sign all Python binaries (.so, .dylib) in .venv after pip install
/// This fixes Team ID mismatch issues on macOS
/// Now supports adhoc signing with entitlements (disable-library-validation)
#[cfg(target_os = "macos")]
fn resign_all_venv_binaries(venv_dir: &PathBuf, signing_identity: &str) -> Result<(), String> {
    use std::process::Command;
    
    println!("🔐 Re-signing all Python binaries in .venv after pip install...");
    println!("   Signing identity: {}", if signing_identity == "-" { "adhoc" } else { signing_identity });
    
    // Find python-entitlements.plist in Resources (for disable-library-validation)
    let entitlements_path = std::env::current_exe()
        .ok()
        .and_then(|exe| {
            // Production: exe is in Contents/MacOS, entitlements in Contents/Resources
            let resources_dir = exe
                .parent()? // Contents/MacOS
                .parent()? // Contents
                .join("Resources");
            
            let entitlements = resources_dir.join("python-entitlements.plist");
            if entitlements.exists() {
                println!("   📜 Found python-entitlements.plist");
                Some(entitlements)
            } else {
                println!("   ⚠️  python-entitlements.plist not found in Resources");
                None
            }
        });
    
    // Helper to find files recursively
    fn find_files(dir: &PathBuf, pattern: &str) -> Result<Vec<PathBuf>, String> {
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
                let mut sub_files = find_files(&path, pattern)?;
                files.append(&mut sub_files);
            } else if path.is_file() {
                if let Some(file_name) = path.file_name() {
                    if file_name.to_string_lossy().ends_with(&pattern[2..]) {
                        files.push(path);
                    }
                }
            }
        }
        
        Ok(files)
    }
    
    // Helper to sign a binary with optional entitlements
    fn sign_binary_with_entitlements(
        binary_path: &PathBuf, 
        signing_identity: &str,
        entitlements: Option<&PathBuf>
    ) -> Result<bool, String> {
        // Check if it's a Mach-O binary
        let file_output = Command::new("file")
            .arg(binary_path)
            .output()
            .map_err(|e| format!("Failed to check file type: {}", e))?;
        
        let file_str = String::from_utf8_lossy(&file_output.stdout);
        if !file_str.contains("Mach-O") && !file_str.contains("dynamically linked") && !file_str.contains("shared library") {
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
        if let Some(ent_path) = entitlements {
            cmd.arg("--entitlements").arg(ent_path);
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
                    Ok(true)
                } else {
                    let error = String::from_utf8_lossy(&output.stderr);
                    eprintln!("   ⚠️  Failed to sign {}: {}", binary_path.display(), error);
                    Ok(false)
                }
            }
            Err(e) => {
                eprintln!("   ⚠️  Error signing {}: {}", binary_path.display(), e);
                Ok(false)
            }
        }
    }
    
    let mut signed_count = 0;
    let mut error_count = 0;
    
    // Priority 1: Sign python3 and libpython with entitlements (critical!)
    let python_bin = venv_dir.join("bin/python3");
    if python_bin.exists() {
        println!("   🔐 Signing python3 with entitlements...");
        if sign_binary_with_entitlements(&python_bin, signing_identity, entitlements_path.as_ref())? {
            signed_count += 1;
        } else {
            error_count += 1;
        }
    }
    
    let python312_bin = venv_dir.join("bin/python3.12");
    if python312_bin.exists() && python312_bin != python_bin {
        println!("   🔐 Signing python3.12 with entitlements...");
        if sign_binary_with_entitlements(&python312_bin, signing_identity, entitlements_path.as_ref())? {
            signed_count += 1;
        } else {
            error_count += 1;
        }
    }
    
    let libpython = venv_dir.join("lib/libpython3.12.dylib");
    if libpython.exists() {
        println!("   🔐 Signing libpython3.12.dylib with entitlements...");
        if sign_binary_with_entitlements(&libpython, signing_identity, entitlements_path.as_ref())? {
            signed_count += 1;
        } else {
            error_count += 1;
        }
    }
    
    // Sign all .dylib files
    let dylib_files = find_files(venv_dir, "*.dylib")?;
    for dylib_file in dylib_files {
        // Skip libpython if already signed above
        if dylib_file == libpython {
            continue;
        }
        // Apply entitlements to all libpython*.dylib files
        let use_entitlements = dylib_file.file_name()
            .map(|n| n.to_string_lossy().starts_with("libpython"))
            .unwrap_or(false);
        
        if sign_binary_with_entitlements(
            &dylib_file, 
            signing_identity, 
            if use_entitlements { entitlements_path.as_ref() } else { None }
        )? {
            signed_count += 1;
        } else {
            error_count += 1;
        }
    }
    
    // Sign all .so files (Python extensions)
    let so_files = find_files(venv_dir, "*.so")?;
    for so_file in so_files {
        if sign_binary_with_entitlements(&so_file, signing_identity, None)? {
            signed_count += 1;
        } else {
            error_count += 1;
        }
    }
    
    if error_count == 0 {
        println!("   ✅ Successfully re-signed {} binaries", signed_count);
    } else {
        println!("   ⚠️  Re-signed {} binaries, {} failed", signed_count, error_count);
    }
    
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn resign_all_venv_binaries(_venv_dir: &PathBuf, _signing_identity: &str) -> Result<(), String> {
    // No-op on non-macOS
    Ok(())
}

fn main() -> ExitCode {
    let args = env::args().skip(1).collect::<Vec<String>>();

    let uv_exe = if cfg!(target_os = "windows") {
        "uv.exe"
    } else {
        "uv"
    };
    
    // On Windows, if we're running from Program Files, setup local venv first
    // This copies .venv to %LOCALAPPDATA% where we can write
    #[cfg(target_os = "windows")]
    {
        let exe_dir = env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.to_path_buf()))
            .unwrap_or_else(|| PathBuf::from("."));
        
        if is_program_files_path(&exe_dir) {
            println!("📍 Running from Program Files, checking local venv...");
            match setup_local_venv_windows(&exe_dir) {
                Ok(local_dir) => {
                    println!("✅ Using local venv at {:?}", local_dir);
                }
                Err(e) => {
                    eprintln!("⚠️  Failed to setup local venv: {}", e);
                    eprintln!("   Will try to use Program Files directly (may fail)");
                }
            }
        }
    }
    
    // On Linux, if running from /usr/lib/, copy venv to ~/.local/share/
    // This copies .venv to XDG_DATA_HOME where we can write
    #[cfg(target_os = "linux")]
    {
        let exe_dir = env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.to_path_buf()))
            .unwrap_or_else(|| PathBuf::from("."));
        
        if is_system_lib_path(&exe_dir) {
            println!("📍 Running from /usr/lib/, checking local venv...");
            // Look for the actual install dir with the venv
            let install_dir = PathBuf::from("/usr/lib/Reachy Mini Control");
            if install_dir.exists() {
                match setup_local_venv_linux(&install_dir) {
                    Ok(local_dir) => {
                        println!("✅ Using local venv at {:?}", local_dir);
                    }
                    Err(e) => {
                        eprintln!("⚠️  Failed to setup local venv: {}", e);
                        eprintln!("   Will try to use /usr/lib/ directly (may fail)");
                    }
                }
            }
        }
    }
    
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
    
    // Note: With --relocatable venv, we no longer need to find cpython or patch pyvenv.cfg
    // The venv is self-contained and works from any location
    
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
    let mut cmd = if !args.is_empty() && args[0].contains("python") {
        println!("✅ Detected Python executable: {}", args[0]);
        
        // Convert Unix-style path to Windows-style if needed
        #[cfg(target_os = "windows")]
        let python_arg = {
            let arg = &args[0];
            // Convert .venv/bin/python3 to .venv/Scripts/python.exe on Windows
            if arg.contains(".venv/bin/python") || arg.contains(".venv\\bin\\python") {
                let converted = arg
                    .replace(".venv/bin/python3", ".venv/Scripts/python.exe")
                    .replace(".venv\\bin\\python3", ".venv\\Scripts\\python.exe")
                    .replace(".venv/bin/python", ".venv/Scripts/python.exe")
                    .replace(".venv\\bin\\python", ".venv\\Scripts\\python.exe")
                    .replace("/", "\\"); // Convert forward slashes to backslashes
                println!("🔄 Converted Unix path to Windows: {} -> {}", arg, converted);
                converted
            } else {
                arg.replace("/", "\\") // Just convert slashes
            }
        };
        
        #[cfg(not(target_os = "windows"))]
        let python_arg = args[0].clone();
        
        // First argument is a Python executable - execute it directly
        let python_path = if python_arg.starts_with("/") || python_arg.starts_with(".") || 
                          (cfg!(target_os = "windows") && (python_arg.starts_with(".") || python_arg.chars().nth(1) == Some(':'))) {
            // Relative or absolute path - resolve relative to working_dir
            let python_exe = working_dir.join(&python_arg);
            println!("🔍 Resolved Python path: {:?}", python_exe);
            if !python_exe.exists() {
                eprintln!("❌ Error: Python executable not found at {:?}", python_exe);
                return ExitCode::FAILURE;
            }
            python_exe
        } else {
            // Just a name like "python" or "python3" - use as-is
            println!("🔍 Using Python from PATH: {}", python_arg);
            PathBuf::from(&python_arg)
        };
        
        println!("🐍 Direct Python execution: {:?} with args: {:?}", python_path, &args[1..]);
        let mut c = Command::new(&python_path);
        c.env("UV_WORKING_DIR", &working_dir)
         .env("UV_PYTHON_INSTALL_DIR", &working_dir)
         .args(&args[1..]); // Pass remaining arguments
        c
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
    
    // Add the working directory (where uv is located) to PATH
    // This allows Python subprocess to find uv when installing apps
    let current_path = env::var("PATH").unwrap_or_default();
    let new_path = if cfg!(target_os = "windows") {
        format!("{};{}", working_dir.display(), current_path)
    } else {
        format!("{}:{}", working_dir.display(), current_path)
    };
    cmd.env("PATH", &new_path);
    println!("📍 Added {} to PATH for subprocess", working_dir.display());
    
    // Check if this is a pip install command (for auto-signing after installation)
    #[cfg(target_os = "macos")]
    let is_pip_install = !args.is_empty() && args[0] == "pip" && args.len() >= 2 && args[1] == "install";
    
    #[cfg(not(target_os = "macos"))]
    let is_pip_install = false;
    
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
                    
                    // If pip install succeeded, re-sign all binaries in .venv
                    // This applies entitlements (disable-library-validation) to Python binaries
                    #[cfg(target_os = "macos")]
                    {
                        if is_pip_install && exit_code == 0 {
                            // Detect Developer ID and re-sign all binaries
                            let is_production = std::env::current_exe()
                                .ok()
                                .map(|exe| exe.to_string_lossy().contains(".app/Contents"))
                                .unwrap_or(false);
                            
                            if is_production {
                                // Find app bundle and detect Developer ID
                                let app_bundle_path = std::env::current_exe()
                                    .ok()
                                    .and_then(|exe| {
                                        let path = exe
                                            .parent()? // Contents/MacOS/
                                            .parent()? // Contents/
                                            .parent()?; // .app bundle
                                        Some(path.to_path_buf())
                                    });
                                
                                // Try to detect Developer ID, fallback to adhoc ("-")
                                let signing_identity = if let Some(app_bundle) = &app_bundle_path {
                                    // Detect Developer ID from app bundle
                                    let detect_output = Command::new("codesign")
                                        .arg("-d")
                                        .arg("-vv")
                                        .arg(app_bundle)
                                        .output();
                                    
                                    if let Ok(output) = detect_output {
                                        let stderr_str = String::from_utf8_lossy(&output.stderr);
                                        let dev_id = stderr_str
                                            .lines()
                                            .find(|line| line.contains("Authority=") && line.contains("Developer ID Application"))
                                            .and_then(|line| {
                                                line.split("Authority=").nth(1).map(|s| s.trim().to_string())
                                            });
                                        
                                        dev_id.unwrap_or_else(|| "-".to_string())
                                    } else {
                                        "-".to_string() // Fallback to adhoc
                                    }
                                } else {
                                    "-".to_string() // Fallback to adhoc
                                };
                                
                                            // Find .venv directory (working_dir is already set to Contents/Resources in production)
                                            let venv_dir = working_dir.join(".venv");
                                            
                                            if venv_dir.exists() {
                                    // Re-sign all binaries with entitlements
                                    // Now works with both Developer ID AND adhoc (with disable-library-validation)
                                                if let Err(e) = resign_all_venv_binaries(&venv_dir, &signing_identity) {
                                                    eprintln!("⚠️  Failed to re-sign binaries after pip install: {}", e);
                                                    // Don't fail the pip install, just log the error
                                    }
                                }
                            }
                        }
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

