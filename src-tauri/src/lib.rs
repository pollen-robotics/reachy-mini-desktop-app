// Modules
#[macro_use]
mod daemon;
mod permissions;
mod python;
mod signing;
mod usb;
mod window;

use tauri::{State, Manager};
use tauri_plugin_shell::ShellExt;
use daemon::{DaemonState, add_log, kill_daemon, cleanup_system_daemons, spawn_and_monitor_sidecar};

#[cfg(not(windows))]
use signal_hook::{consts::TERM_SIGNALS, iterator::Signals};

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
    crate::spawn_sidecar_monitor!(rx, app_handle, Some("mujoco-install".to_string()));
    
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
            process: std::sync::Mutex::new(None),
            logs: std::sync::Mutex::new(std::collections::VecDeque::new()),
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
                
                // Request all macOS permissions (camera, microphone, etc.)
                // These permissions will propagate to child processes (Python daemon and apps)
                permissions::request_all_permissions();
            }
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_daemon,
            stop_daemon,
            get_logs,
            usb::check_usb_robot,
            install_mujoco,
            window::apply_transparent_titlebar,
            window::close_window,
            signing::sign_python_binaries,
            permissions::check_permissions,
            permissions::request_camera_permission,
            permissions::request_microphone_permission,
            permissions::open_camera_settings,
            permissions::open_microphone_settings
        ])
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
