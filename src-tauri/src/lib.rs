use std::sync::Mutex;
use std::collections::VecDeque;
use std::path::PathBuf;
use tauri::{State, Manager, Emitter};
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};
use serialport;

#[cfg(not(windows))]
use signal_hook::{consts::TERM_SIGNALS, iterator::Signals};

struct DaemonState {
    process: Mutex<Option<CommandChild>>,
    logs: Mutex<VecDeque<String>>,
}

// Helper to fix mjpython shebang on macOS
// mjpython's shebang points to binaries/.venv but we're in target/debug/.venv
#[cfg(target_os = "macos")]
fn fix_mjpython_shebang() -> Result<(), String> {
    use std::fs;
    use std::env;
    
    // Find the current working directory (where uv-trampoline runs)
    let current_dir = env::current_dir().map_err(|e| format!("Failed to get current dir: {}", e))?;
    let mjpython_path = current_dir.join(".venv/bin/mjpython");
    
    if !mjpython_path.exists() {
        return Ok(()); // mjpython doesn't exist, skip
    }
    
    // Read mjpython content
    let content = fs::read_to_string(&mjpython_path)
        .map_err(|e| format!("Failed to read mjpython: {}", e))?;
    
    // Get the correct Python path (absolute path)
    let python_path = current_dir.join(".venv/bin/python3");
    let python_path_str = python_path.to_str()
        .ok_or("Invalid Python path")?;
    
    // Check if shebang needs fixing (points to binaries/.venv)
    if content.contains("binaries/.venv/bin/python3") {
        // Fix the shebang on line 2
        let lines: Vec<&str> = content.lines().collect();
        if lines.len() >= 2 {
            let mut new_lines: Vec<String> = lines.iter().map(|s| s.to_string()).collect();
            new_lines[1] = format!("'''exec' '{}' \"$0\" \"$@\"", python_path_str);
            let new_content = new_lines.join("\n");
            
            fs::write(&mjpython_path, new_content)
                .map_err(|e| format!("Failed to write mjpython: {}", e))?;
            
            println!("[tauri] ✅ Fixed mjpython shebang to point to {}", python_path_str);
        }
    }
    
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn fix_mjpython_shebang() -> Result<(), String> {
    Ok(()) // No-op on non-macOS
}

// Helper to build daemon arguments
// On macOS with simulation mode, we need to use mjpython (required by MuJoCo)
fn build_daemon_args(sim_mode: bool) -> Result<Vec<String>, String> {
    let python_cmd = if sim_mode && cfg!(target_os = "macos") {
            // Fix mjpython shebang before using it
        fix_mjpython_shebang()?;
        "mjpython"
    } else {
        "python"
    };
    
    let mut args = vec![
        "run".to_string(),
        python_cmd.to_string(),
        "-m".to_string(),
        "reachy_mini.daemon.app.main".to_string(),
        "--kinematics-engine".to_string(),
        "Placo".to_string(),
    ];
    
    if sim_mode {
        args.push("--sim".to_string());
    }
    
    Ok(args)
}

const MAX_LOGS: usize = 50;

// ============================================================================
// LOG MANAGEMENT
// ============================================================================

fn add_log(state: &State<DaemonState>, message: String) {
    let mut logs = state.logs.lock().unwrap();
    logs.push_back(message);
    if logs.len() > MAX_LOGS {
        logs.pop_front();
    }
}

// ============================================================================
// DAEMON LIFECYCLE MANAGEMENT
// ============================================================================

/// Kill processes listening on a specific port
#[cfg(not(target_os = "windows"))]
fn kill_processes_on_port(port: u16, signal: Option<&str>) {
    use std::process::Command;
    
    let output = Command::new("lsof")
        .arg(&format!("-ti:{}", port))
        .output();
    
    if let Ok(output) = output {
        let pids = String::from_utf8_lossy(&output.stdout);
        for pid in pids.lines() {
            let pid = pid.trim();
            if !pid.is_empty() {
                let mut cmd = Command::new("kill");
                if let Some(sig) = signal {
                    cmd.arg(sig);
                }
                cmd.arg(pid);
                let _ = cmd.output();
            }
        }
    }
}

/// Clean up all daemon processes running on the system (via port 8000)
fn cleanup_system_daemons() {
    #[cfg(not(target_os = "windows"))]
    {
        use std::process::Command;
        
        // Method 1: Kill via port 8000 (more reliable)
        // Try SIGTERM first (graceful shutdown)
        kill_processes_on_port(8000, None);
        std::thread::sleep(std::time::Duration::from_millis(500));
        
        // Force kill if still there
        kill_processes_on_port(8000, Some("-9"));
        
        // Method 2: Kill by process name (fallback)
        let _ = Command::new("pkill")
            .arg("-9")
            .arg("-f")
            .arg("reachy_mini.daemon.app.main")
            .output();
            
        std::thread::sleep(std::time::Duration::from_millis(300));
    }
}

/// Kill daemon completely (local sidecar process + system)
fn kill_daemon(state: &State<DaemonState>) {
    // Clear the stored process reference
    // Note: CommandChild doesn't expose kill() method, so we rely on cleanup_system_daemons()
    // which kills processes via port 8000 (more reliable)
    let mut process_lock = state.process.lock().unwrap();
    process_lock.take();
    drop(process_lock);
    
    // Clean up system processes (kills via port 8000 and process name)
    cleanup_system_daemons();
}

// ============================================================================
// SIDECAR MANAGEMENT
// ============================================================================

/// Macro helper to spawn sidecar monitoring task
/// Avoids duplication while working around private Receiver type
macro_rules! spawn_sidecar_monitor {
    ($rx:ident, $app_handle:ident, $prefix:expr) => {
        {
            let prefix = $prefix;
            let app_handle_clone = $app_handle.clone();
            tauri::async_runtime::spawn(async move {
                if let Some(ref p) = prefix {
                    println!("[tauri] Starting sidecar output monitoring ({})...", p);
                } else {
                    println!("[tauri] Starting sidecar output monitoring...");
                }
                
                while let Some(event) = $rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line_bytes) => {
                            let line = String::from_utf8_lossy(&line_bytes);
                            let prefixed_line = prefix
                                .as_ref()
                                .map(|p| format!("[{}] {}", p, line))
                                .unwrap_or_else(|| line.to_string());
                            println!("Sidecar stdout: {}", prefixed_line);
                            let _ = app_handle_clone.emit("sidecar-stdout", prefixed_line.clone());
                        }
                        CommandEvent::Stderr(line_bytes) => {
                            let line = String::from_utf8_lossy(&line_bytes);
                            let prefixed_line = prefix
                                .as_ref()
                                .map(|p| format!("[{}] {}", p, line))
                                .unwrap_or_else(|| line.to_string());
                            eprintln!("Sidecar stderr: {}", prefixed_line);
                            let _ = app_handle_clone.emit("sidecar-stderr", prefixed_line.clone());
                        }
                        CommandEvent::Terminated(status) => {
                            if let Some(ref p) = prefix {
                                println!("[tauri] [{}] Process terminated with status: {:?}", p, status);
                            } else {
                                println!("[tauri] Sidecar process terminated with status: {:?}", status);
                                // ✅ Emit event to frontend so it can detect the crash
                                let status_str = format!("{:?}", status);
                                let _ = app_handle_clone.emit("sidecar-terminated", status_str);
                            }
                        }
                        _ => {}
                    }
                }
            });
        }
    };
}

/// Spawn and monitor the embedded daemon sidecar
/// 
/// # Arguments
/// * `app_handle` - Tauri app handle
/// * `state` - Daemon state
/// * `sim_mode` - If true, launch daemon in simulation mode (MuJoCo) with --sim flag
fn spawn_and_monitor_sidecar(app_handle: tauri::AppHandle, state: &State<DaemonState>, sim_mode: bool) -> Result<(), String> {
    // Check if a sidecar process already exists
    let process_lock = state.process.lock().unwrap();
    if process_lock.is_some() {
        println!("[tauri] Sidecar is already running. Skipping spawn.");
        return Ok(());
    }
    drop(process_lock);
    
    // Build daemon arguments dynamically
    let daemon_args = build_daemon_args(sim_mode)?;
    
    if sim_mode {
        #[cfg(target_os = "macos")]
        {
            println!("[tauri] 🎭 Launching daemon in simulation mode (MuJoCo) with mjpython");
        }
        #[cfg(not(target_os = "macos"))]
        {
            println!("[tauri] 🎭 Launching daemon in simulation mode (MuJoCo)");
        }
    }
    
    // Convert Vec<String> to Vec<&str> for args()
    let daemon_args_refs: Vec<&str> = daemon_args.iter().map(|s| s.as_str()).collect();
    
    let sidecar_command = app_handle
        .shell()
        .sidecar("uv-trampoline")
        .map_err(|e| e.to_string())?
        .args(daemon_args_refs);
    
    let (mut rx, child) = sidecar_command.spawn().map_err(|e| e.to_string())?;

    // Store the child process in DaemonState
    let mut process_lock = state.process.lock().unwrap();
    *process_lock = Some(child);
    drop(process_lock);

    // Spawn async task to monitor sidecar output
    spawn_sidecar_monitor!(rx, app_handle, None::<String>);

    Ok(())
}

// ============================================================================
// TAURI COMMANDS
// ============================================================================

/// Install MuJoCo dependencies for simulation mode
/// Uses uv-trampoline to install mujoco and reachy-mini[mujoco] in the same environment as the daemon
/// Monitors installation in background
#[tauri::command]
fn install_mujoco(app_handle: tauri::AppHandle) -> Result<String, String> {
    println!("[tauri] 🎭 Installing MuJoCo dependencies for simulation mode...");
    
    // Use uv-trampoline to run: uv pip install mujoco reachy-mini[mujoco]
    // Install mujoco first, then reachy-mini[mujoco] to ensure all dependencies are available
    // This ensures we install in the same Python environment as the daemon
    let (mut rx, _child) = app_handle
        .shell()
        .sidecar("uv-trampoline")
        .map_err(|e| format!("Failed to find uv-trampoline: {}", e))?
        .args(&["pip", "install", "mujoco", "reachy-mini[mujoco]"])
        .spawn()
        .map_err(|e| format!("Failed to spawn uv-trampoline: {}", e))?;
    
    // Monitor output in background using shared helper
    spawn_sidecar_monitor!(rx, app_handle, Some("mujoco-install".to_string()));
    
    // Wait a bit for installation to start (it runs async)
    // Note: We can't easily wait for completion without blocking, so we rely on
    // the frontend to detect when MuJoCo is available via health checks
    std::thread::sleep(std::time::Duration::from_secs(3));
    
    Ok("MuJoCo installation started".to_string())
}

#[tauri::command]
fn start_daemon(app_handle: tauri::AppHandle, state: State<DaemonState>, sim_mode: Option<bool>) -> Result<String, String> {
    let sim_mode = sim_mode.unwrap_or(false);
    
    // 🎭 If simulation mode, ensure MuJoCo is installed first
    // Installation happens asynchronously, we wait a bit for it to complete
    if sim_mode {
        add_log(&state, "🎭 Installing MuJoCo dependencies for simulation mode...".to_string());
        match install_mujoco(app_handle.clone()) {
            Ok(_) => {
                add_log(&state, "✅ MuJoCo installation started, waiting...".to_string());
                // Wait a bit longer for installation to complete (mujoco can take time)
                std::thread::sleep(std::time::Duration::from_secs(5));
            }
            Err(e) => {
                // ✅ Improved error handling: Log detailed error but continue
                // MuJoCo might already be installed, or installation might be in progress
                let error_msg = format!("⚠️ MuJoCo installation warning: {}", e);
                add_log(&state, error_msg.clone());
                println!("[tauri] ⚠️ MuJoCo installation returned error: {}", e);
                println!("[tauri] ⚠️ Continuing anyway - MuJoCo might already be installed or installation in progress");
                // Note: We continue because:
                // 1. MuJoCo might already be installed (uv pip install is idempotent)
                // 2. Installation runs asynchronously, error might be transient
                // 3. If MuJoCo is truly missing, the daemon will fail to start and we'll catch it via sidecar-terminated
            }
        }
    }
    
    // 1. ⚡ Aggressive cleanup of all existing daemons (including zombies)
    let cleanup_msg = if sim_mode {
        "🧹 Cleaning up existing daemons (simulation mode)..."
    } else {
        "🧹 Cleaning up existing daemons..."
    };
    add_log(&state, cleanup_msg.to_string());
    kill_daemon(&state);
    
    // 2. Spawn embedded daemon sidecar
    spawn_and_monitor_sidecar(app_handle, &state, sim_mode)?;
    
    // 3. Log success
    let success_msg = if sim_mode {
        "✓ Daemon started in simulation mode (MuJoCo) via embedded sidecar"
    } else {
        "✓ Daemon started via embedded sidecar"
    };
    add_log(&state, success_msg.to_string());
    
    Ok("Daemon started successfully".to_string())
}

#[tauri::command]
fn stop_daemon(state: State<DaemonState>) -> Result<String, String> {
    // 1. Kill daemon (local process + system)
    kill_daemon(&state);
    
    // 2. Log stop
    add_log(&state, "✓ Daemon stopped".to_string());
    
    Ok("Daemon stopped successfully".to_string())
}

#[tauri::command]
fn get_logs(state: State<DaemonState>) -> Vec<String> {
    let logs = state.logs.lock().unwrap();
    logs.iter().cloned().collect()
}

#[tauri::command]
fn apply_transparent_titlebar(app: tauri::AppHandle, window_label: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        if let Some(window) = app.get_webview_window(&window_label) {
            use cocoa::base::{id, YES};
            use objc::{msg_send, sel, sel_impl};
            
            let ns_window_result = window.ns_window();
            match ns_window_result {
                Ok(ns_window_ptr) => {
                    unsafe {
                        let ns_window = ns_window_ptr as id;
                        
                        // Transparent titlebar and fullscreen content
                        let _: () = msg_send![ns_window, setTitlebarAppearsTransparent: YES];
                        
                        // Full size content view so content goes under titlebar
                        let style_mask: u64 = msg_send![ns_window, styleMask];
                        let new_style = style_mask | (1 << 15); // NSWindowStyleMaskFullSizeContentView
                        let _: () = msg_send![ns_window, setStyleMask: new_style];
                    }
                    Ok(())
                }
                Err(e) => Err(format!("Failed to get ns_window: {}", e)),
            }
        } else {
            Err(format!("Window '{}' not found", window_label))
        }
    }
    
    #[cfg(not(target_os = "macos"))]
    {
        // No-op on non-macOS
        Ok(())
    }
}

#[tauri::command]
fn close_window(app: tauri::AppHandle, window_label: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&window_label) {
        // Use close() method - this should work for WebviewWindow
        window.close().map_err(|e| format!("Failed to close window '{}': {}", window_label, e))?;
        println!("✅ Window '{}' closed successfully", window_label);
    } else {
        return Err(format!("Window '{}' not found", window_label));
    }
    Ok(())
}

#[tauri::command]
fn check_usb_robot() -> Result<Option<String>, String> {
    match serialport::available_ports() {
        Ok(ports) => {
            // Look for USB device with VID:PID = 1a86:55d3 (Reachy Mini CH340)
            for port in ports {
                if let serialport::SerialPortType::UsbPort(usb_info) = &port.port_type {
                    if usb_info.vid == 0x1a86 && usb_info.pid == 0x55d3 {
                        return Ok(Some(port.port_name.clone()));
                    }
                }
            }
            Ok(None)
        }
        Err(e) => Err(format!("USB detection error: {}", e)),
    }
}

/// Re-sign Python binaries (.so, .dylib) in .venv after pip install
/// This fixes the Team ID mismatch issue on macOS where pip-installed binaries
/// are not signed with the same Team ID as the app bundle
/// 
/// Runs asynchronously in a background thread to avoid blocking the UI
#[cfg(target_os = "macos")]
#[tauri::command]
async fn sign_python_binaries() -> Result<String, String> {
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
    
    // 3. Find and sign all binaries in .venv
    // IMPORTANT: Sign in order: libpython first, then executables, then extensions
    let mut signed_count = 0;
    let mut error_count = 0;
    
    // Priority 1: Sign libpython*.dylib FIRST (critical for Python to load)
    let libpython_dylib = venv_dir.join("lib/libpython3.12.dylib");
    if libpython_dylib.exists() {
        println!("[tauri] 🔐 Signing libpython3.12.dylib (priority)...");
        if sign_binary(&libpython_dylib, &signing_identity)? {
            signed_count += 1;
        } else {
            error_count += 1;
        }
    }
    
    // Priority 2: Sign Python executables (python3, python3.12)
    let python_bin = venv_dir.join("bin/python3");
    if python_bin.exists() {
        println!("[tauri] 🔐 Signing python3 executable...");
        if sign_binary(&python_bin, &signing_identity)? {
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
        if sign_binary(&dylib_file, &signing_identity)? {
            signed_count += 1;
        } else {
            error_count += 1;
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
fn sign_python_binaries() -> Result<String, String> {
    // No-op on non-macOS
    Ok("Code signing not required on this platform".to_string())
}

/// Helper to find files matching a pattern recursively
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

/// Sign a single binary file
fn sign_binary(binary_path: &PathBuf, signing_identity: &str) -> Result<bool, String> {
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
    
    // Sign the binary
    let sign_result = Command::new("codesign")
        .arg("--force")
        .arg("--sign")
        .arg(signing_identity)
        .arg("--options")
        .arg("runtime")
        .arg("--timestamp")
        .arg(binary_path)
        .output();
    
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

// ============================================================================
// ENTRY POINT
// ============================================================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Setup signal handler for brutal kill (SIGTERM, SIGINT, etc.) - Unix only
    #[cfg(not(windows))]
    {
        std::thread::spawn(|| {
            let mut signals = Signals::new(TERM_SIGNALS).expect("Failed to register signal handlers");
            for sig in signals.forever() {
                eprintln!("🔴 Signal {:?} received - cleaning up daemon", sig);
                cleanup_system_daemons();
                std::process::exit(0);
            }
        });
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(DaemonState {
            process: Mutex::new(None),
            logs: Mutex::new(VecDeque::new()),
        })
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            
            #[cfg(target_os = "macos")]
            {
                use cocoa::base::{id, YES};
                use objc::{msg_send, sel, sel_impl};
                
                unsafe {
                    let ns_window = window.ns_window().unwrap() as id;
                    
                    // Transparent titlebar and fullscreen content
                    let _: () = msg_send![ns_window, setTitlebarAppearsTransparent: YES];
                    
                    // Full size content view so content goes under titlebar
                    let style_mask: u64 = msg_send![ns_window, styleMask];
                    let new_style = style_mask | (1 << 15); // NSWindowStyleMaskFullSizeContentView
                    let _: () = msg_send![ns_window, setStyleMask: new_style];
                }
            }
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![start_daemon, stop_daemon, get_logs, check_usb_robot, install_mujoco, apply_transparent_titlebar, close_window, sign_python_binaries])
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { .. } => {
                    // Only kill daemon if main window is closing
                    if window.label() == "main" {
                        println!("🔴 Main window close requested - killing daemon");
                    let state: tauri::State<DaemonState> = window.state();
                    kill_daemon(&state);
                    } else {
                        println!("🔴 Secondary window close requested: {}", window.label());
                    }
                }
                tauri::WindowEvent::Destroyed => {
                    // Only cleanup if main window is destroyed
                    if window.label() == "main" {
                        println!("🔴 Main window destroyed - final cleanup");
                    cleanup_system_daemons();
                    } else {
                        println!("🔴 Secondary window destroyed: {}", window.label());
                    }
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
