// Suppress warnings from objc crate's msg_send! macro (uses deprecated cfg checks)
#![allow(unexpected_cfgs)]

// Modules
#[macro_use]
mod daemon;
mod permissions;
mod python;
mod signing;
mod update;
mod usb;
mod wifi;
mod window;
mod local_proxy;

use std::sync::Arc;
use tauri::{State, Manager};
use daemon::{DaemonState, add_log, kill_daemon, cleanup_system_daemons, spawn_and_monitor_sidecar};
use local_proxy::LocalProxyState;

#[cfg(not(windows))]
use signal_hook::{consts::TERM_SIGNALS, iterator::Signals};

// ============================================================================
// TAURI COMMANDS
// ============================================================================

#[tauri::command]
fn start_daemon(app_handle: tauri::AppHandle, state: State<DaemonState>, sim_mode: Option<bool>) -> Result<String, String> {
    let sim_mode = sim_mode.unwrap_or(false);
    
    // 🎭 Simulation mode: mockup-sim backend (no physics engine needed)
    if sim_mode {
        add_log(&state, "🎭 Starting simulation mode (mockup-sim)...".to_string());
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
        "✓ Daemon started in simulation mode (mockup-sim) via embedded sidecar"
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
// LOCAL PROXY COMMANDS
// ============================================================================

#[tauri::command]
async fn set_local_proxy_target(state: State<'_, Arc<LocalProxyState>>, host: String) -> Result<(), String> {
    local_proxy::set_target_host(&state, host).await;
    Ok(())
}

#[tauri::command]
async fn clear_local_proxy_target(state: State<'_, Arc<LocalProxyState>>) -> Result<(), String> {
    local_proxy::clear_target_host(&state).await;
    Ok(())
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

    // PostHog Analytics (EU Cloud) - Project ID: 115674
    // Override with POSTHOG_KEY env var for self-hosted instances
    let posthog_key = option_env!("POSTHOG_KEY").unwrap_or("phc_oFlHvjvOT6aWXQ4Fot7A1VSAOHtGv9L2M9BZRZcyYQm");
    let posthog_host = option_env!("POSTHOG_HOST").unwrap_or("https://eu.i.posthog.com");

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_posthog::init(tauri_plugin_posthog::PostHogConfig {
            api_key: posthog_key.to_string(),
            api_host: posthog_host.to_string(),
            ..Default::default()
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_deep_link::init());

    let builder = if cfg!(target_os = "macos") {
        builder.plugin(tauri_plugin_macos_permissions::init())
    } else {
        builder
    };

    // Create shared local proxy state (proxy starts on-demand when WiFi target is set)
    let local_proxy_state = Arc::new(LocalProxyState::new());

    builder
        .manage(DaemonState {
            process: std::sync::Mutex::new(None),
            logs: std::sync::Mutex::new(std::collections::VecDeque::new()),
        })
        .manage(local_proxy_state)
        .setup(move |
            #[cfg(target_os = "macos")]
            app,
            #[cfg(not(target_os = "macos"))]
            _app
        | {
            // 🔌 Start USB device monitor (Windows: event-driven, no polling, no terminal flicker)
            if let Err(e) = usb::start_monitor() {
                eprintln!("⚠️ Failed to start USB monitor: {}", e);
            }
            
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
            window::apply_transparent_titlebar,
            window::close_window,
            signing::sign_python_binaries,
            permissions::open_camera_settings,
            permissions::open_microphone_settings,
            permissions::open_wifi_settings,
            permissions::open_files_settings,
            wifi::scan_local_wifi_networks,
            wifi::get_current_wifi_ssid,
            update::check_daemon_update,
            update::update_daemon,
            set_local_proxy_target,
            clear_local_proxy_target
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
