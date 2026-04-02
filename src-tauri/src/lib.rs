// Allow unexpected_cfgs from the objc crate's msg_send! macro
#![allow(unexpected_cfgs)]

// Modules
#[macro_use]
mod daemon;
mod discovery;
mod local_proxy;
mod network;
mod paths;
mod permissions;
mod python;
mod reset;
mod update;
mod usb;
mod wifi;
mod window;

use daemon::{
    add_log, cleanup_system_daemons, kill_daemon, set_external_mode, spawn_and_monitor_sidecar,
    transition_and_emit, transition_status, DaemonState, DaemonStatus,
};

/// Cross-platform path for the crash marker file.
/// Uses the same data directory as the rest of the app (paths::get_data_dir).
fn crash_marker_path() -> Option<std::path::PathBuf> {
    paths::get_data_dir().ok().map(|d| d.join(".crash_marker"))
}
use discovery::DiscoveryState;
use local_proxy::LocalProxyState;
use std::sync::Arc;
use tauri::{Manager, State};
use tauri_plugin_log::{Target, TargetKind};

#[cfg(not(windows))]
use signal_hook::{consts::TERM_SIGNALS, iterator::Signals};

// ============================================================================
// TAURI COMMANDS
// ============================================================================

#[tauri::command]
fn start_daemon(
    app_handle: tauri::AppHandle,
    state: State<DaemonState>,
    sim_mode: Option<bool>,
    connection_mode: Option<String>,
) -> Result<String, String> {
    let sim_mode = sim_mode.unwrap_or(false);

    // Reset external mode flag (handles external → USB reconnect without app restart)
    set_external_mode(false);

    // Track which frontend connection mode initiated this daemon
    match state.connection_mode.lock() {
        Ok(mut mode) => *mode = connection_mode,
        Err(e) => log::warn!("[daemon] connection_mode mutex poisoned on start: {}", e),
    }

    if sim_mode {
        add_log(
            &state,
            "Starting simulation mode (mockup-sim)...".to_string(),
        );
    }

    add_log(&state, "Cleaning up existing daemons...".to_string());
    kill_daemon(&state);

    transition_and_emit(&state, DaemonStatus::Starting, &app_handle).map_err(|e| {
        add_log(&state, format!("Transition error: {}", e));
        e
    })?;

    if let Err(e) = spawn_and_monitor_sidecar(app_handle.clone(), &state, sim_mode) {
        if let Err(te) = transition_and_emit(&state, DaemonStatus::Crashed, &app_handle) {
            log::warn!(
                "[daemon] Failed to transition to Crashed after spawn failure: {}",
                te
            );
        }
        add_log(&state, format!("Spawn failed: {}", e));
        return Err(e);
    }

    if let Err(te) = transition_and_emit(&state, DaemonStatus::Running, &app_handle) {
        log::warn!(
            "[daemon] Failed to transition to Running after spawn: {}",
            te
        );
    }

    let success_msg = if sim_mode {
        "Daemon started in simulation mode (mockup-sim)"
    } else {
        "Daemon started via embedded sidecar"
    };
    add_log(&state, success_msg.to_string());
    Ok("Daemon started successfully".to_string())
}

#[tauri::command]
fn stop_daemon(app_handle: tauri::AppHandle, state: State<DaemonState>) -> Result<String, String> {
    if let Err(e) = transition_and_emit(&state, DaemonStatus::Stopping, &app_handle) {
        log::warn!("[daemon] Failed to transition to Stopping: {}", e);
    }
    kill_daemon(&state);
    if let Err(e) = transition_and_emit(&state, DaemonStatus::Idle, &app_handle) {
        log::warn!("[daemon] Failed to transition to Idle after stop: {}", e);
    }

    match state.connection_mode.lock() {
        Ok(mut mode) => *mode = None,
        Err(e) => log::warn!("[daemon] connection_mode mutex poisoned on stop: {}", e),
    }

    add_log(&state, "Daemon stopped".to_string());
    Ok("Daemon stopped successfully".to_string())
}

#[tauri::command]
fn set_daemon_external_mode(external: bool) {
    set_external_mode(external);
}

#[tauri::command]
fn get_daemon_status(state: State<DaemonState>) -> Result<serde_json::Value, String> {
    let status = *state
        .status
        .lock()
        .map_err(|e| format!("Failed to read daemon status: {}", e))?;
    let mode = state
        .connection_mode
        .lock()
        .map_err(|e| format!("Failed to read connection mode: {}", e))?
        .clone();
    Ok(serde_json::json!({
        "status": format!("{:?}", status),
        "connectionMode": mode,
    }))
}

#[tauri::command]
fn get_logs(state: State<DaemonState>) -> Result<Vec<String>, String> {
    let logs = state
        .logs
        .lock()
        .map_err(|e| format!("Failed to read logs: {}", e))?;
    Ok(logs.iter().cloned().collect())
}

// ============================================================================
// CRASH MARKER COMMANDS
// ============================================================================

/// Read and delete the crash marker left by the panic hook.
/// Returns `{ panic_info, log_tail }` if a marker was found, or null.
#[tauri::command]
fn check_crash_marker(app_handle: tauri::AppHandle) -> Option<serde_json::Value> {
    let marker_path = crash_marker_path()?;

    if !marker_path.exists() {
        return None;
    }

    let panic_info = std::fs::read_to_string(&marker_path).unwrap_or_default();
    let _ = std::fs::remove_file(&marker_path);

    // Try to read the last 100 lines of the most recent log file
    let log_tail = app_handle
        .path()
        .app_log_dir()
        .ok()
        .and_then(|log_dir| {
            let mut entries: Vec<_> = std::fs::read_dir(&log_dir)
                .ok()?
                .filter_map(|e| e.ok())
                .filter(|e| {
                    e.path()
                        .extension()
                        .map(|ext| ext == "log")
                        .unwrap_or(false)
                })
                .collect();
            entries.sort_by_key(|e| {
                std::cmp::Reverse(
                    e.metadata()
                        .and_then(|m| m.modified())
                        .unwrap_or(std::time::SystemTime::UNIX_EPOCH),
                )
            });
            entries.first().map(|e| e.path())
        })
        .and_then(|path| std::fs::read_to_string(&path).ok())
        .map(|content| {
            content
                .lines()
                .rev()
                .take(100)
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_default();

    log::info!("Previous crash detected, reporting to telemetry");

    Some(serde_json::json!({
        "panic_info": panic_info,
        "log_tail": log_tail,
    }))
}

// ============================================================================
// LOCAL PROXY COMMANDS
// ============================================================================

#[tauri::command]
async fn set_local_proxy_target(
    state: State<'_, Arc<LocalProxyState>>,
    host: String,
) -> Result<(), String> {
    local_proxy::set_target_host(&state, host).await
}

#[tauri::command]
async fn clear_local_proxy_target(state: State<'_, Arc<LocalProxyState>>) -> Result<(), String> {
    local_proxy::clear_target_host(&state).await;
    Ok(())
}

// ============================================================================
// ENTRY POINT
// ============================================================================

#[cfg(target_os = "linux")]
extern "C" {
    fn XInitThreads() -> std::ffi::c_int;
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // On Linux/X11, XInitThreads must be called before ANY other X11/GTK call
    // to prevent "[xcb] Unknown sequence number" crashes in multi-threaded apps.
    // This must happen before panic hooks, signal handlers, and Tauri builder.
    #[cfg(target_os = "linux")]
    {
        let result = unsafe { XInitThreads() };
        if result == 0 {
            eprintln!("Warning: XInitThreads() failed");
        }
    }

    // Custom panic hook: log the panic and write a crash marker for next-startup detection
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        log::error!("PANIC: {}", info);
        if let Some(marker) = crash_marker_path() {
            if let Some(parent) = marker.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let _ = std::fs::write(&marker, format!("{}", info));
        }
        default_hook(info);
    }));

    // Setup signal handler for brutal kill (SIGTERM, SIGINT, etc.) - Unix only
    #[cfg(not(windows))]
    {
        std::thread::spawn(|| match Signals::new(TERM_SIGNALS) {
            Ok(mut signals) => {
                if let Some(sig) = signals.forever().next() {
                    log::error!("Signal {:?} received - cleaning up daemon", sig);
                    cleanup_system_daemons();
                    std::process::exit(0);
                }
            }
            Err(e) => {
                log::warn!("Failed to register signal handlers: {} — daemon cleanup on SIGTERM will not work", e);
            }
        });
    }

    // PostHog Analytics (EU Cloud) - Project ID: 115674
    // Override with POSTHOG_KEY env var for self-hosted instances
    let posthog_key =
        option_env!("POSTHOG_KEY").unwrap_or("phc_oFlHvjvOT6aWXQ4Fot7A1VSAOHtGv9L2M9BZRZcyYQm");
    let posthog_host = option_env!("POSTHOG_HOST").unwrap_or("https://eu.i.posthog.com");

    let builder = tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir { file_name: None }),
                    Target::new(TargetKind::Webview),
                ])
                .max_file_size(5_000_000) // 5 MB per log file
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepOne)
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_posthog::init(
            tauri_plugin_posthog::PostHogConfig {
                api_key: posthog_key.to_string(),
                api_host: posthog_host.to_string(),
                ..Default::default()
            },
        ))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_deep_link::init());

    // BLE plugin panics if Bluetooth is unavailable (CI runners, VMs, no adapter).
    // Catch the panic so the app starts without BLE support.
    // When BT is installed but adapter is off, init succeeds and the UI prompts the user.
    let builder = match std::panic::catch_unwind(tauri_plugin_blec::init) {
        Ok(plugin) => builder.plugin(plugin),
        Err(_) => {
            log::warn!("Bluetooth not available — BLE features disabled");
            builder
        }
    };

    let builder = if cfg!(target_os = "macos") {
        builder.plugin(tauri_plugin_macos_permissions::init())
    } else {
        builder
    };

    // Add automation plugin for E2E testing (macOS requires CrabNebula driver)
    // This plugin is only active when the app is launched via WebDriver
    let builder = builder.plugin(tauri_plugin_automation::init());

    // Create shared local proxy state (proxy starts on-demand when WiFi target is set)
    let local_proxy_state = Arc::new(LocalProxyState::new());

    // Create discovery state (mDNS + cache + static peers)
    let discovery_state = DiscoveryState::new();

    builder
        .manage(DaemonState {
            process: std::sync::Mutex::new(None),
            logs: std::sync::Mutex::new(std::collections::VecDeque::new()),
            status: std::sync::Mutex::new(DaemonStatus::Idle),
            generation: std::sync::Mutex::new(0),
            connection_mode: std::sync::Mutex::new(None),
        })
        .manage(local_proxy_state)
        .manage(discovery_state)
        .setup(
            move |#[cfg(target_os = "macos")] app, #[cfg(not(target_os = "macos"))] _app| {
                // 🔌 Start USB device monitor (Windows: event-driven, no polling, no terminal flicker)
                if let Err(e) = usb::start_monitor() {
                    log::warn!("Failed to start USB monitor: {}", e);
                }

                #[cfg(target_os = "macos")]
                {
                    if let Some(win) = app.get_webview_window("main") {
                        window::setup_transparent_titlebar(&win);
                        window::setup_content_process_handler(&win);
                    }
                    permissions::request_all_permissions();
                }

                Ok(())
            },
        )
        .invoke_handler(tauri::generate_handler![
            start_daemon,
            stop_daemon,
            set_daemon_external_mode,
            get_daemon_status,
            get_logs,
            check_crash_marker,
            usb::check_usb_robot,
            window::apply_transparent_titlebar,
            window::close_window,
            permissions::open_camera_settings,
            permissions::open_microphone_settings,
            permissions::open_wifi_settings,
            permissions::open_files_settings,
            permissions::open_local_network_settings,
            permissions::check_local_network_permission,
            permissions::request_local_network_permission,
            permissions::check_location_permission,
            permissions::request_location_permission,
            permissions::open_location_settings,
            permissions::check_bluetooth_permission,
            permissions::request_bluetooth_permission,
            permissions::open_bluetooth_settings,
            wifi::scan_local_wifi_networks,
            wifi::get_current_wifi_ssid,
            update::check_daemon_update,
            update::update_daemon,
            reset::reset_apps_venv,
            reset::reset_python_env,
            set_local_proxy_target,
            clear_local_proxy_target,
            // Robot discovery (mDNS + manual IP)
            discovery::discover_robots,
            discovery::connect_to_ip,
            discovery::add_static_peer,
            discovery::remove_static_peer,
            discovery::get_static_peers,
            discovery::clear_discovery_cache,
            // Network detection (VPN)
            network::detect_vpn
        ])
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { .. } => {
                if window.label() == "main" {
                    log::info!("[tauri] Main window close requested - killing daemon");
                    let state: tauri::State<DaemonState> = window.state();
                    let _ = transition_status(&state.status, DaemonStatus::Stopping);
                    kill_daemon(&state);
                    let _ = transition_status(&state.status, DaemonStatus::Idle);
                }
            }
            tauri::WindowEvent::Destroyed => {
                if window.label() == "main" {
                    log::info!("[tauri] Main window destroyed - final cleanup");
                    cleanup_system_daemons();
                }
            }
            _ => {}
        })
        .build(tauri::generate_context!())
        .unwrap_or_else(|e| {
            eprintln!("Fatal: failed to build Tauri application: {}", e);
            std::process::exit(1);
        })
        .run(|_app_handle, event| {
            match event {
                tauri::RunEvent::ExitRequested { .. } => {
                    log::info!("ExitRequested (Cmd+Q) - killing daemon");
                    cleanup_system_daemons();
                }
                tauri::RunEvent::Exit => {
                    // Final cleanup when app is about to exit
                    log::info!("Exit event - final cleanup");
                    cleanup_system_daemons();
                }
                _ => {}
            }
        });
}
