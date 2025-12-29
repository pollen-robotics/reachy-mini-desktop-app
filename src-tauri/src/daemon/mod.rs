use std::sync::Mutex;
use std::collections::VecDeque;
use tauri::State;
use tauri_plugin_shell::{
    process::CommandChild,
};

pub struct DaemonState {
    pub process: Mutex<Option<CommandChild>>,
    pub logs: Mutex<VecDeque<String>>,
}

pub const MAX_LOGS: usize = 50;

// ============================================================================
// LOG MANAGEMENT
// ============================================================================

pub fn add_log(state: &State<DaemonState>, message: String) {
    use std::time::{SystemTime, UNIX_EPOCH};
    
    // Add timestamp prefix (Unix millis) for proper chronological sorting
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    
    // Format: "TIMESTAMP|MESSAGE" - will be parsed by frontend
    let timestamped_message = format!("{}|{}", timestamp, message);
    
    let mut logs = state.logs.lock().unwrap();
    logs.push_back(timestamped_message);
    if logs.len() > MAX_LOGS {
        logs.pop_front();
    }
}

// ============================================================================
// DAEMON LIFECYCLE MANAGEMENT
// ============================================================================

/// Kill processes listening on a specific port
#[cfg(not(target_os = "windows"))]
pub fn kill_processes_on_port(port: u16, signal: Option<&str>) {
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
pub fn cleanup_system_daemons() {
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
    #[cfg(target_os = "windows")]
    {
        println!("Cleaning up system daemons on Windows...");
        use std::process::Command;

        // Windows: Use netstat and taskkill to find and kill processes on port 8000
        let output = Command::new("netstat").args(&["-ano"]).output();

        if let Ok(output) = output {
            let output_str = String::from_utf8_lossy(&output.stdout);
            let mut pids = Vec::new();
            for line in output_str.lines() {
                if line.contains(":8000") && line.contains("LISTENING") {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    let pid = parts.last().unwrap().to_string();
                    if pid != "0" && !pids.contains(&pid) {
                        pids.push(pid);
                    }
                }
            }
            for pid_str in pids {
                println!("Killing process with PID: {}", pid_str);
                let _ = Command::new("taskkill")
                    .args(&["/PID", &pid_str, "/F"])
                    .output();
            }
        }
    }
}

/// Kill daemon completely (local sidecar process + system)
pub fn kill_daemon(state: &State<DaemonState>) {
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
#[macro_export]
macro_rules! spawn_sidecar_monitor {
    ($rx:ident, $app_handle:ident, $prefix:expr) => {
        {
            let prefix = $prefix;
            let app_handle_clone = $app_handle.clone();
            tauri::async_runtime::spawn(async move {
                use tauri::Emitter;
                use tauri_plugin_shell::process::CommandEvent;
                
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
/// * `sim_mode` - If true, launch daemon in simulation mode (mockup-sim) with --mockup-sim flag
pub fn spawn_and_monitor_sidecar(
    app_handle: tauri::AppHandle,
    state: &State<DaemonState>,
    sim_mode: bool,
) -> Result<(), String> {
    use crate::python::build_daemon_args;
    use tauri_plugin_shell::ShellExt;
    
    // Check if a sidecar process already exists
    let process_lock = state.process.lock().unwrap();
    if process_lock.is_some() {
        println!("[tauri] Sidecar is already running. Skipping spawn.");
        return Ok(());
    }
    drop(process_lock);
    
    // Build daemon arguments dynamically
    let daemon_args = build_daemon_args(sim_mode)?;
    
    // Note: libpython3.12.dylib signing is now handled by uv-trampoline
    // which runs in the correct working directory context
    
    if sim_mode {
        println!("[tauri] 🎭 Launching daemon in simulation mode (mockup-sim)");
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
    crate::spawn_sidecar_monitor!(rx, app_handle, None::<String>);

    Ok(())
}

