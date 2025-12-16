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

/// Check MuJoCo availability for simulation mode
/// MuJoCo is now pre-bundled at build-time, so this is a no-op
/// Kept for backward compatibility with frontend calls
#[tauri::command]
fn install_mujoco(_app_handle: tauri::AppHandle) -> Result<String, String> {
    // MuJoCo is pre-bundled at build-time (via reachy-mini[mujoco])
    // This ensures all binaries are properly signed before notarization
    // No runtime installation needed - fixes macOS signature issues (Issue #16)
    println!("[tauri] 🎭 MuJoCo is pre-bundled, skipping installation");
    Ok("MuJoCo already installed (pre-bundled)".to_string())
}

#[tauri::command]
fn start_daemon(app_handle: tauri::AppHandle, state: State<DaemonState>, sim_mode: Option<bool>) -> Result<String, String> {
    let sim_mode = sim_mode.unwrap_or(false);
    
    // 🎭 Simulation mode: MuJoCo is pre-bundled at build-time
    // No installation needed - all binaries are already signed (fixes Issue #16)
    if sim_mode {
        add_log(&state, "🎭 Starting simulation mode (MuJoCo pre-bundled)...".to_string());
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

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_http::init());

    let builder = if cfg!(target_os = "macos") {
        builder.plugin(tauri_plugin_macos_permissions::init())
    } else {
        builder
    };
    builder
        .manage(DaemonState {
            process: std::sync::Mutex::new(None),
            logs: std::sync::Mutex::new(std::collections::VecDeque::new()),
        })
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                let window = app.get_webview_window("main").unwrap();
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
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            match event {
                tauri::RunEvent::ExitRequested { .. } => {
                    // ⌘Q (Cmd+Q) on macOS triggers this event
                    // Kill daemon via port 8000 + process name (reliable cleanup)
                    println!("🔴 ExitRequested (Cmd+Q) - killing daemon");
                    cleanup_system_daemons();
                }
                tauri::RunEvent::Exit => {
                    // Final cleanup when app is about to exit
                    println!("🔴 Exit event - final cleanup");
                    cleanup_system_daemons();
                }
                _ => {}
            }
        });
}
