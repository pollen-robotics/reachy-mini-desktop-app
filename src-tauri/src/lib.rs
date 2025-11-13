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

const DAEMON_ARGS: &[&str] = &[
    "run",
    "python",
    "-m",
    "reachy_mini.daemon.app.main",
];

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

/// Clean up all daemon processes running on the system (via port 8000)
fn cleanup_system_daemons() {
    #[cfg(not(target_os = "windows"))]
    {
        use std::process::Command;
        
        // Method 1: Kill via port 8000 (more reliable)
        let output = Command::new("lsof")
            .arg("-ti:8000")
            .output();
        
        if let Ok(output) = output {
            let pids = String::from_utf8_lossy(&output.stdout);
            for pid in pids.lines() {
                let pid = pid.trim();
                if !pid.is_empty() {
                    // Try SIGTERM first
                    let _ = Command::new("kill").arg(pid).output();
                }
            }
        }
        
        std::thread::sleep(std::time::Duration::from_millis(500));
        
        // Force kill via port if still there
        let output = Command::new("lsof")
            .arg("-ti:8000")
            .output();
        
        if let Ok(output) = output {
            let pids = String::from_utf8_lossy(&output.stdout);
            for pid in pids.lines() {
                let pid = pid.trim();
                if !pid.is_empty() {
                    let _ = Command::new("kill").arg("-9").arg(pid).output();
                }
            }
        }
        
        // Method 2: Kill by process name
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
    let mut process_lock = state.process.lock().unwrap();
    
    // Kill local sidecar process if present
    if let Some(mut process) = process_lock.take() {
        // Try graceful shutdown first
        let command = "sidecar shutdown\n";
        if let Err(_) = process.write(command.as_bytes()) {
            // If write fails, process might already be dead
            println!("⚠️ Failed to send shutdown command to sidecar");
        }
        // Note: CommandChild doesn't have a kill method, but the process will be cleaned up
    }
    
    // Clean up system processes
    cleanup_system_daemons();
}

// ============================================================================
// SIDECAR MANAGEMENT
// ============================================================================

/// Spawn and monitor the embedded daemon sidecar
fn spawn_and_monitor_sidecar(app_handle: tauri::AppHandle, state: &State<DaemonState>) -> Result<(), String> {
    // Check if a sidecar process already exists
    let process_lock = state.process.lock().unwrap();
    if process_lock.is_some() {
        println!("[tauri] Sidecar is already running. Skipping spawn.");
        return Ok(());
    }
    drop(process_lock);
    
    // Spawn sidecar
    let sidecar_command = app_handle
        .shell()
        .sidecar("uv-trampoline")
        .map_err(|e| e.to_string())?
        .args(DAEMON_ARGS);
    
    let (mut rx, child) = sidecar_command.spawn().map_err(|e| e.to_string())?;

    // Store the child process in DaemonState
    let mut process_lock = state.process.lock().unwrap();
    *process_lock = Some(child);
    drop(process_lock);

    // Spawn an async task to handle sidecar communication
    let app_handle_clone = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        println!("[tauri] Starting sidecar output monitoring...");
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line_bytes) => {
                    let line = String::from_utf8_lossy(&line_bytes);
                    println!("Sidecar stdout: {}", line);
                    // Emit the line to the frontend
                    let _ = app_handle_clone.emit("sidecar-stdout", line.to_string());
                }
                CommandEvent::Stderr(line_bytes) => {
                    let line = String::from_utf8_lossy(&line_bytes);
                    eprintln!("Sidecar stderr: {}", line);
                    // Emit the error line to the frontend
                    let _ = app_handle_clone.emit("sidecar-stderr", line.to_string());
                }
                _ => {}
            }
        }
    });

    Ok(())
}

// ============================================================================
// TAURI COMMANDS
// ============================================================================

#[tauri::command]
fn start_daemon(app_handle: tauri::AppHandle, state: State<DaemonState>) -> Result<String, String> {
    // 1. ⚡ Cleanup agressif de tous les daemons existants (même zombies)
    add_log(&state, "🧹 Cleaning up existing daemons...".to_string());
    kill_daemon(&state);
    
    // 2. Spawn embedded daemon sidecar
    spawn_and_monitor_sidecar(app_handle, &state)?;
    
    // 3. Log success
    add_log(&state, "✓ Daemon started via embedded sidecar".to_string());
    
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
        .invoke_handler(tauri::generate_handler![start_daemon, stop_daemon, get_logs, check_usb_robot])
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { .. } => {
                    println!("🔴 Window close requested - killing daemon");
                    let state: tauri::State<DaemonState> = window.state();
                    kill_daemon(&state);
                }
                tauri::WindowEvent::Destroyed => {
                    println!("🔴 Window destroyed - final cleanup");
                    cleanup_system_daemons();
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
