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

    // Build the full path to the executable
    let uv_exe_path = uv_folder.join(uv_exe);
    
    // Get the absolute working directory for environment variables
    let working_dir = match env::current_dir() {
        Ok(dir) => dir,
        Err(e) => {
            eprintln!("❌ Error: Unable to get working directory: {}", e);
            return ExitCode::FAILURE;
        }
    };

    let mut cmd = Command::new(&uv_exe_path);
    cmd.env("UV_WORKING_DIR", &working_dir)
       .env("UV_PYTHON_INSTALL_DIR", &working_dir)
       .args(&args);
    
    println!("🚀 Launching process: {:?}", cmd);
    
    let mut child = match cmd.spawn() {
        Ok(child) => child,
        Err(e) => {
            eprintln!("❌ Error: Unable to spawn process '{}': {}", uv_exe_path.display(), e);
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

