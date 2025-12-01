use std::sync::Mutex;
use std::collections::VecDeque;
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
                // Log warning but continue (MuJoCo might already be installed)
                add_log(&state, format!("⚠️ MuJoCo installation: {}", e));
                println!("[tauri] ⚠️ Continuing anyway - MuJoCo might already be installed");
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
        .invoke_handler(tauri::generate_handler![start_daemon, stop_daemon, get_logs, check_usb_robot, install_mujoco, apply_transparent_titlebar, close_window])
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
