use std::process::{Command, Child, Stdio};
use std::sync::Mutex;
use std::path::PathBuf;
use std::env;
use std::collections::VecDeque;
use tauri::{State, Manager};
use serialport;
use signal_hook::{consts::TERM_SIGNALS, iterator::Signals};

struct DaemonState {
    process: Mutex<Option<Child>>,
    logs: Mutex<VecDeque<String>>,
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

/// Kill a specific child process cleanly
fn kill_child_process(child: &mut Child) {
    let _ = child.kill();
    let _ = child.wait();
}

/// Clean up all daemon processes running on the system
fn cleanup_system_daemons() {
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

/// Kill daemon completely (local process + system)
fn kill_daemon(state: &State<DaemonState>) {
    let mut process_lock = state.process.lock().unwrap();
    
    // Kill local process if present
    if let Some(mut child) = process_lock.take() {
        kill_child_process(&mut child);
    }
    
    // Clean up system processes
    cleanup_system_daemons();
}

// ============================================================================
// DAEMON DETECTION
// ============================================================================

/// Find the command to launch the daemon
fn find_daemon_command() -> Option<(String, Vec<String>)> {
    let home = env::var("HOME").ok()?;
    
    let possible_paths = vec![
        // Direct path to reachy-mini-daemon
        format!("{}/Documents/work-projects/huggingface/reachy_mini_conversation_app/venv/bin/reachy-mini-daemon", home),
        format!("{}/.local/bin/reachy-mini-daemon", home),
        "/usr/local/bin/reachy-mini-daemon".to_string(),
        
        // Via Python with venv
        format!("{}/Documents/work-projects/huggingface/reachy_mini_conversation_app/venv/bin/python", home),
    ];
    
    // Try direct paths to reachy-mini-daemon
    for path in &possible_paths[..3] {
        if PathBuf::from(path).exists() {
            return Some((path.clone(), vec![]));
        }
    }
    
    // Try with Python venv
    let venv_python = &possible_paths[3];
    if PathBuf::from(venv_python).exists() {
        return Some((
            venv_python.clone(),
            vec!["-m".to_string(), "reachy_mini.daemon.app.main".to_string()]
        ));
    }
    
    None
}

/// Launch a new daemon process
fn spawn_daemon_process(cmd: &str, args: &[String]) -> Result<Child, String> {
    if args.is_empty() {
        Command::new(cmd)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Error launching: {}", e))
    } else {
        Command::new(cmd)
            .args(args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Error launching: {}", e))
    }
}

// ============================================================================
// TAURI COMMANDS
// ============================================================================

#[tauri::command]
fn start_daemon(state: State<DaemonState>) -> Result<String, String> {
    // 1. ⚡ Cleanup agressif de tous les daemons existants (même zombies)
    add_log(&state, "🧹 Cleaning up existing daemons...".to_string());
    kill_daemon(&state);
    
    // 2. Find daemon command
    let (cmd, args) = find_daemon_command()
        .ok_or_else(|| "Unable to find reachy-mini-daemon. Check that reachy-mini is installed.".to_string())?;
    
    // 3. Launch new daemon
    let child = spawn_daemon_process(&cmd, &args)?;
    
    // 4. Store process and log
    let mut process_lock = state.process.lock().unwrap();
    *process_lock = Some(child);
    drop(process_lock);
    
    add_log(&state, format!("✓ Daemon started via: {}", cmd));
    
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
    // Setup signal handler for brutal kill (SIGTERM, SIGINT, etc.)
    std::thread::spawn(|| {
        let mut signals = Signals::new(TERM_SIGNALS).expect("Failed to register signal handlers");
        for sig in signals.forever() {
            eprintln!("🔴 Signal {:?} received - cleaning up daemon", sig);
            cleanup_system_daemons();
            std::process::exit(0);
        }
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_positioner::init())
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
