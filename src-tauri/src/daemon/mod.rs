use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::State;
use tauri_plugin_shell::process::CommandChild;

/// Port used by the Python daemon's HTTP API
pub const DAEMON_PORT: u16 = 8000;

/// Process name pattern for pkill fallback (Python module entrypoint)
const DAEMON_PROCESS_PATTERN: &str = "reachy_mini.daemon.app.main";

/// When true, cleanup_system_daemons() and kill_daemon() skip killing system
/// processes. This prevents the app from killing an externally-managed daemon
/// on close. Uses a static because the signal handler thread cannot access
/// Tauri managed state.
static EXTERNAL_DAEMON_MODE: AtomicBool = AtomicBool::new(false);

pub fn set_external_mode(external: bool) {
    EXTERNAL_DAEMON_MODE.store(external, Ordering::Relaxed);
}

// ============================================================================
// DAEMON STATUS - Process lifecycle state machine (USB/Simulation only)
// ============================================================================

#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize)]
pub enum DaemonStatus {
    Idle,
    Starting,
    Running,
    Stopping,
    Crashed,
}

const VALID_DAEMON_TRANSITIONS: &[(DaemonStatus, DaemonStatus)] = &[
    (DaemonStatus::Idle, DaemonStatus::Starting),
    (DaemonStatus::Starting, DaemonStatus::Running),
    (DaemonStatus::Starting, DaemonStatus::Crashed),
    (DaemonStatus::Running, DaemonStatus::Stopping),
    (DaemonStatus::Running, DaemonStatus::Crashed),
    (DaemonStatus::Stopping, DaemonStatus::Idle),
    (DaemonStatus::Crashed, DaemonStatus::Idle),
    (DaemonStatus::Crashed, DaemonStatus::Starting),
];

pub fn is_valid_transition(from: DaemonStatus, to: DaemonStatus) -> bool {
    VALID_DAEMON_TRANSITIONS
        .iter()
        .any(|(f, t)| *f == from && *t == to)
}

/// Attempt a validated status transition. Returns the previous status on success.
/// Same-state transitions are treated as no-ops and return Ok.
pub fn transition_status(
    status_lock: &Mutex<DaemonStatus>,
    new_status: DaemonStatus,
) -> Result<DaemonStatus, String> {
    let mut status = status_lock
        .lock()
        .map_err(|e| format!("Daemon status mutex poisoned: {}", e))?;
    let old = *status;

    if old == new_status {
        return Ok(old);
    }

    if !is_valid_transition(old, new_status) {
        return Err(format!(
            "Invalid daemon transition: {:?} -> {:?}",
            old, new_status
        ));
    }

    *status = new_status;
    log::info!("[daemon] Status transition: {:?} -> {:?}", old, new_status);
    Ok(old)
}

/// Transition + emit "daemon-status-changed" in one call.
/// Returns the previous status on success, or silently does nothing if the
/// transition is invalid (returns Err but doesn't panic).
pub fn transition_and_emit(
    state: &DaemonState,
    new_status: DaemonStatus,
    app_handle: &tauri::AppHandle,
) -> Result<DaemonStatus, String> {
    use tauri::Emitter;
    let old = transition_status(&state.status, new_status)?;
    if old != new_status {
        let _ = app_handle.emit(
            "daemon-status-changed",
            serde_json::json!({
                "previous": format!("{:?}", old),
                "current": format!("{:?}", new_status),
            }),
        );
    }
    Ok(old)
}

// ============================================================================
// STATE
// ============================================================================
pub struct DaemonState {
    pub process: Mutex<Option<CommandChild>>,
    pub logs: Mutex<VecDeque<String>>,
    pub status: Mutex<DaemonStatus>,
    /// Incremented on each spawn to distinguish old vs new daemon Terminated events
    pub generation: Mutex<u64>,
    /// Tracks how the frontend connected (usb/wifi/simulation/external).
    /// Set by start_daemon, cleared on stop. Used for HMR/boot reconciliation.
    pub connection_mode: Mutex<Option<String>>,
}

pub const MAX_LOGS: usize = 50;

// ============================================================================
// LOG MANAGEMENT
// ============================================================================

pub fn add_log(state: &State<DaemonState>, message: String) {
    use std::time::{SystemTime, UNIX_EPOCH};

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);

    let timestamped_message = format!("{}|{}", timestamp, message);

    match state.logs.lock() {
        Ok(mut logs) => {
            logs.push_back(timestamped_message);
            if logs.len() > MAX_LOGS {
                logs.pop_front();
            }
        }
        Err(e) => {
            log::error!(
                "[daemon] Logs mutex poisoned, message dropped: {} — {}",
                message,
                e
            );
        }
    }
}

// ============================================================================
// DAEMON LIFECYCLE MANAGEMENT
// ============================================================================

/// Find PIDs of processes LISTENING on a given port (never includes our own PID).
fn find_listener_pids(port: u16) -> Vec<String> {
    use std::process::Command;
    let own_pid = std::process::id().to_string();

    let raw_pids = {
        #[cfg(not(target_os = "windows"))]
        {
            // -sTCP:LISTEN only matches listeners, not outgoing connections
            Command::new("lsof")
                .args(["-ti", &format!("TCP:{}", port), "-sTCP:LISTEN"])
                .output()
                .ok()
                .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
                .unwrap_or_default()
        }
        #[cfg(target_os = "windows")]
        {
            let output = Command::new("netstat")
                .args(["-ano"])
                .output()
                .ok()
                .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
                .unwrap_or_default();

            let port_str = format!(":{}", port);
            output
                .lines()
                .filter(|l| l.contains(&port_str) && l.contains("LISTENING"))
                .filter_map(|l| l.split_whitespace().last())
                .filter(|pid| *pid != "0")
                .collect::<Vec<_>>()
                .join("\n")
        }
    };

    raw_pids
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|pid| {
            if pid.is_empty() {
                return false;
            }
            if *pid == own_pid {
                log::warn!("[daemon] Skipping self-kill (PID {} on port {})", pid, port);
                return false;
            }
            true
        })
        .collect()
}

/// Send a signal to a list of PIDs.
fn kill_pids(pids: &[String], force: bool) {
    use std::process::Command;

    for pid in pids {
        log::info!("[daemon] Killing PID {} (force={})", pid, force);

        #[cfg(not(target_os = "windows"))]
        {
            let mut cmd = Command::new("kill");
            if force {
                cmd.arg("-9");
            }
            cmd.arg(pid);
            let _ = cmd.output();
        }
        #[cfg(target_os = "windows")]
        {
            let _ = Command::new("taskkill")
                .args(if force {
                    vec!["/PID", pid, "/F"]
                } else {
                    vec!["/PID", pid]
                })
                .output();
        }
    }
}

/// Kill orphaned daemon processes from previous sessions.
/// Uses port scanning + process name matching as a safety net.
/// Skipped entirely when connected to an external daemon.
pub fn cleanup_system_daemons() {
    if EXTERNAL_DAEMON_MODE.load(Ordering::Relaxed) {
        log::info!("[daemon] External daemon mode - skipping system daemon cleanup");
        return;
    }

    let pids = find_listener_pids(DAEMON_PORT);
    if !pids.is_empty() {
        kill_pids(&pids, false);
        std::thread::sleep(std::time::Duration::from_millis(500));

        let remaining = find_listener_pids(DAEMON_PORT);
        if !remaining.is_empty() {
            kill_pids(&remaining, true);
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        use std::process::Command;
        let _ = Command::new("pkill")
            .args(["-9", "-f", DAEMON_PROCESS_PATTERN])
            .output();
    }
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        // Kill Python processes matching the daemon module name in their command line
        let output = Command::new("wmic")
            .args([
                "process",
                "where",
                &format!("CommandLine like '%{}%'", DAEMON_PROCESS_PATTERN),
                "get",
                "ProcessId",
            ])
            .output();
        if let Ok(output) = output {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let own_pid = std::process::id().to_string();
            for line in stdout.lines().skip(1) {
                let pid = line.trim();
                if !pid.is_empty() && pid != own_pid && pid.chars().all(|c| c.is_ascii_digit()) {
                    log::info!("[daemon] Killing orphan Python daemon (PID {})", pid);
                    let _ = Command::new("taskkill").args(["/F", "/PID", pid]).output();
                }
            }
        }
    }

    std::thread::sleep(std::time::Duration::from_millis(300));
}

/// Kill daemon: first the tracked sidecar process, then orphan cleanup as safety net.
pub fn kill_daemon(state: &State<DaemonState>) {
    let child = match state.process.lock() {
        Ok(mut guard) => guard.take(),
        Err(e) => {
            log::error!("[daemon] Process mutex poisoned during kill: {}", e);
            None
        }
    };

    if let Some(child) = child {
        let pid = child.pid();
        log::info!("[daemon] Killing tracked sidecar (PID {})", pid);
        if let Err(e) = child.kill() {
            log::warn!(
                "[daemon] Sidecar kill failed (PID {}): {} — falling back to port cleanup",
                pid,
                e
            );
        }
    }

    cleanup_system_daemons();
}

// ============================================================================
// SIDECAR TERMINATION HELPERS
// ============================================================================

/// Determine the target status when a daemon process terminates.
fn terminated_target_status(current: DaemonStatus) -> DaemonStatus {
    match current {
        DaemonStatus::Stopping => DaemonStatus::Idle,
        DaemonStatus::Running | DaemonStatus::Starting => DaemonStatus::Crashed,
        other => other,
    }
}

/// Clear the tracked process handle and transition daemon status after termination.
/// Returns Err(()) only when the status mutex is poisoned (caller should break).
pub fn finalize_daemon_termination(
    daemon_state: &DaemonState,
    app_handle: &tauri::AppHandle,
) -> Result<(), ()> {
    match daemon_state.process.lock() {
        Ok(mut guard) => {
            guard.take();
        }
        Err(e) => log::error!(
            "[daemon] Process mutex poisoned in terminated handler: {}",
            e
        ),
    }

    let current_status = *daemon_state.status.lock().map_err(|e| {
        log::error!(
            "[daemon] Status mutex poisoned in terminated handler: {}",
            e
        );
    })?;

    let target = terminated_target_status(current_status);
    if target != current_status {
        let _ = transition_and_emit(daemon_state, target, app_handle);
    }

    Ok(())
}

/// Check generation match, then finalize daemon termination.
/// Returns Ok(true) if handled (gen matched), Ok(false) if stale, Err if poisoned mutex.
pub fn handle_daemon_terminated(
    daemon_state: &DaemonState,
    app_handle: &tauri::AppHandle,
    captured_generation: u64,
) -> Result<bool, ()> {
    let current_gen = *daemon_state.generation.lock().map_err(|e| {
        log::error!(
            "[daemon] Generation mutex poisoned in terminated handler: {}",
            e
        );
    })?;

    if captured_generation != current_gen {
        log::info!(
            "[daemon] Ignoring terminated event for old daemon (gen {} vs current {})",
            captured_generation,
            current_gen
        );
        return Ok(false);
    }

    finalize_daemon_termination(daemon_state, app_handle)?;
    Ok(true)
}

// ============================================================================
// SIDECAR MANAGEMENT
// ============================================================================

/// Macro helper to spawn sidecar monitoring task
/// Avoids duplication while working around private Receiver type.
/// For daemon sidecars (prefix=None), automatically handles DaemonStatus
/// transitions on process termination using a generation counter to avoid
/// stale events from old daemon instances.
#[macro_export]
macro_rules! spawn_sidecar_monitor {
    ($rx:ident, $app_handle:ident, $prefix:expr, $generation:expr) => {{
        let prefix = $prefix;
        let app_handle_clone = $app_handle.clone();
        let captured_generation: u64 = $generation;
        tauri::async_runtime::spawn(async move {
            use tauri::Emitter;
            use tauri::Manager;
            use tauri_plugin_shell::process::CommandEvent;

            if let Some(ref p) = prefix {
                log::info!("[tauri] Starting sidecar output monitoring ({})...", p);
            } else {
                log::info!(
                    "[tauri] Starting sidecar output monitoring (gen {})...",
                    captured_generation
                );
            }

            while let Some(event) = $rx.recv().await {
                match event {
                    CommandEvent::Stdout(line_bytes) => {
                        let line = String::from_utf8_lossy(&line_bytes);
                        let prefixed_line = prefix
                            .as_ref()
                            .map(|p| format!("[{}] {}", p, line))
                            .unwrap_or_else(|| line.to_string());
                        log::info!("Sidecar stdout: {}", prefixed_line);
                        let _ = app_handle_clone.emit("sidecar-stdout", prefixed_line.clone());
                    }
                    CommandEvent::Stderr(line_bytes) => {
                        let line = String::from_utf8_lossy(&line_bytes);
                        let prefixed_line = prefix
                            .as_ref()
                            .map(|p| format!("[{}] {}", p, line))
                            .unwrap_or_else(|| line.to_string());
                        log::warn!("Sidecar stderr: {}", prefixed_line);
                        let _ = app_handle_clone.emit("sidecar-stderr", prefixed_line.clone());
                    }
                    CommandEvent::Terminated(status) => {
                        if let Some(ref p) = prefix {
                            log::info!(
                                "[tauri] [{}] Process terminated with status: {:?}",
                                p,
                                status
                            );
                        } else {
                            log::info!(
                                "[tauri] Sidecar process terminated with status: {:?}",
                                status
                            );
                            let daemon_state =
                                app_handle_clone.state::<$crate::daemon::DaemonState>();
                            if $crate::daemon::handle_daemon_terminated(
                                &daemon_state,
                                &app_handle_clone,
                                captured_generation,
                            )
                            .is_err()
                            {
                                break;
                            }
                        }
                    }
                    _ => {}
                }
            }
        });
    }};
}

/// Spawn and monitor the embedded daemon sidecar with graceful fallback
///
/// Uses --preload-datasets for new daemon versions, falls back gracefully
/// for old versions that don't support it.
pub fn spawn_and_monitor_sidecar(
    app_handle: tauri::AppHandle,
    state: &State<DaemonState>,
    sim_mode: bool,
) -> Result<(), String> {
    use crate::python::build_daemon_args;
    use tauri_plugin_shell::ShellExt;

    let process_lock = state
        .process
        .lock()
        .map_err(|e| format!("Failed to lock process mutex: {}", e))?;
    if process_lock.is_some() {
        log::info!("[tauri] Sidecar is already running. Skipping spawn.");
        return Ok(());
    }
    drop(process_lock);

    let daemon_args = build_daemon_args(&app_handle, sim_mode, true)?;
    log::info!("[tauri] Launching daemon with --preload-datasets");

    if sim_mode {
        log::info!("[tauri] Launching daemon in simulation mode (mockup-sim)");
    }

    let daemon_args_refs: Vec<&str> = daemon_args.iter().map(|s| s.as_str()).collect();

    let mut sidecar_command = app_handle
        .shell()
        .sidecar("uv-trampoline")
        .map_err(|e| e.to_string())?
        .args(daemon_args_refs)
        .env("PYTHONIOENCODING", "utf-8");

    if cfg!(target_os = "linux") {
        sidecar_command = sidecar_command.env(
            "GST_PLUGIN_PATH",
            "/usr/share/reachy-mini-control/gstreamer-plugins",
        );
    }

    let (mut rx, child) = sidecar_command.spawn().map_err(|e| e.to_string())?;

    // Bump generation so old Terminated handlers become stale
    let generation = {
        let mut gen = state
            .generation
            .lock()
            .map_err(|e| format!("Failed to lock generation mutex: {}", e))?;
        *gen += 1;
        *gen
    };

    let mut process_lock = state
        .process
        .lock()
        .map_err(|e| format!("Failed to lock process mutex: {}", e))?;
    *process_lock = Some(child);
    drop(process_lock);

    let app_handle_clone = app_handle.clone();
    let captured_generation: u64 = generation;

    // Spawn monitoring task with --preload-datasets fallback support
    tauri::async_runtime::spawn(async move {
        use tauri::Emitter;
        use tauri::Manager;
        use tauri_plugin_shell::process::CommandEvent;

        log::info!(
            "[tauri] Starting sidecar output monitoring (gen {})...",
            captured_generation
        );

        let mut has_argument_error = false;

        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line_bytes) => {
                    let line = String::from_utf8_lossy(&line_bytes);
                    log::info!("Sidecar stdout: {}", line);
                    let _ = app_handle_clone.emit("sidecar-stdout", line.to_string());
                }
                CommandEvent::Stderr(line_bytes) => {
                    let line = String::from_utf8_lossy(&line_bytes);
                    log::warn!("Sidecar stderr: {}", line);
                    let _ = app_handle_clone.emit("sidecar-stderr", line.to_string());

                    let line_lower = line.to_lowercase();
                    if line_lower.contains("unrecognised argument")
                        || line_lower.contains("unrecognized argument")
                        || line_lower.contains("invalid choice")
                    {
                        has_argument_error = true;
                        log::warn!("[tauri] Detected unsupported --preload-datasets argument");
                    }
                }
                CommandEvent::Terminated(status) => {
                    log::info!(
                        "[tauri] Sidecar process terminated with status: {:?}",
                        status
                    );

                    let daemon_state = app_handle_clone.state::<crate::daemon::DaemonState>();
                    let current_gen = match daemon_state.generation.lock() {
                        Ok(gen) => *gen,
                        Err(e) => {
                            log::error!("[daemon] Generation mutex poisoned: {}", e);
                            break;
                        }
                    };

                    if captured_generation != current_gen {
                        log::info!(
                            "[daemon] Ignoring terminated event for old daemon (gen {} vs current {})",
                            captured_generation, current_gen
                        );
                        continue;
                    }

                    if has_argument_error {
                        log::info!("[tauri] Retrying without --preload-datasets...");

                        match daemon_state.process.lock() {
                            Ok(mut guard) => {
                                guard.take();
                            }
                            Err(e) => log::error!("[daemon] Process mutex poisoned: {}", e),
                        }

                        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

                        use crate::python::build_daemon_args;
                        use tauri_plugin_shell::ShellExt;

                        let daemon_args =
                            match build_daemon_args(&app_handle_clone, sim_mode, false) {
                                Ok(args) => args,
                                Err(e) => {
                                    log::error!("[tauri] Failed to build daemon args: {}", e);
                                    let _ = crate::daemon::transition_and_emit(
                                        &daemon_state,
                                        crate::daemon::DaemonStatus::Crashed,
                                        &app_handle_clone,
                                    );
                                    continue;
                                }
                            };

                        let daemon_args_refs: Vec<&str> =
                            daemon_args.iter().map(|s| s.as_str()).collect();

                        let sidecar_cmd = match app_handle_clone.shell().sidecar("uv-trampoline") {
                            Ok(cmd) => cmd,
                            Err(e) => {
                                log::error!("[tauri] Failed to get sidecar: {}", e);
                                let _ = crate::daemon::transition_and_emit(
                                    &daemon_state,
                                    crate::daemon::DaemonStatus::Crashed,
                                    &app_handle_clone,
                                );
                                continue;
                            }
                        };

                        let mut sidecar_cmd = sidecar_cmd
                            .args(daemon_args_refs)
                            .env("PYTHONIOENCODING", "utf-8");

                        if cfg!(target_os = "linux") {
                            sidecar_cmd = sidecar_cmd.env(
                                "GST_PLUGIN_PATH",
                                "/usr/share/reachy-mini-control/gstreamer-plugins",
                            );
                        }

                        match sidecar_cmd.spawn() {
                            Ok((mut new_rx, new_child)) => {
                                let new_gen = match daemon_state.generation.lock() {
                                    Ok(mut gen) => {
                                        *gen += 1;
                                        *gen
                                    }
                                    Err(e) => {
                                        log::error!(
                                            "[daemon] Generation mutex poisoned on retry: {}",
                                            e
                                        );
                                        break;
                                    }
                                };

                                match daemon_state.process.lock() {
                                    Ok(mut process_lock) => {
                                        *process_lock = Some(new_child);
                                    }
                                    Err(e) => {
                                        log::error!(
                                            "[daemon] Process mutex poisoned on retry: {}",
                                            e
                                        );
                                        break;
                                    }
                                }

                                let app_handle_ref = app_handle_clone.clone();
                                crate::spawn_sidecar_monitor!(
                                    new_rx,
                                    app_handle_ref,
                                    None::<String>,
                                    new_gen
                                );
                            }
                            Err(e) => {
                                log::error!("[tauri] Failed to spawn fallback daemon: {}", e);
                                let _ = crate::daemon::transition_and_emit(
                                    &daemon_state,
                                    crate::daemon::DaemonStatus::Crashed,
                                    &app_handle_clone,
                                );
                            }
                        }
                    } else if finalize_daemon_termination(&daemon_state, &app_handle_clone).is_err()
                    {
                        break;
                    }
                }
                _ => {}
            }
        }
    });

    Ok(())
}

// ============================================================================
// TESTS
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn status_mutex(initial: DaemonStatus) -> Mutex<DaemonStatus> {
        Mutex::new(initial)
    }

    // ========================================================================
    // Transition table: exhaustive valid/invalid
    // ========================================================================

    #[test]
    fn every_valid_transition_is_accepted() {
        for (from, to) in VALID_DAEMON_TRANSITIONS.iter() {
            assert!(
                is_valid_transition(*from, *to),
                "{:?} -> {:?} should be valid",
                from,
                to
            );
        }
    }

    #[test]
    fn all_unlisted_transitions_are_rejected() {
        let all = [
            DaemonStatus::Idle,
            DaemonStatus::Starting,
            DaemonStatus::Running,
            DaemonStatus::Stopping,
            DaemonStatus::Crashed,
        ];
        for from in all.iter() {
            for to in all.iter() {
                if from == to {
                    continue;
                }
                let is_listed = VALID_DAEMON_TRANSITIONS
                    .iter()
                    .any(|(f, t)| f == from && t == to);
                if is_listed {
                    continue;
                }
                assert!(
                    !is_valid_transition(*from, *to),
                    "{:?} -> {:?} should be invalid",
                    from,
                    to
                );
            }
        }
    }

    // ========================================================================
    // transition_status: mutex behavior
    // ========================================================================

    #[test]
    fn transition_returns_previous_status() {
        let lock = status_mutex(DaemonStatus::Idle);
        let prev = transition_status(&lock, DaemonStatus::Starting).unwrap();
        assert_eq!(prev, DaemonStatus::Idle);
        assert_eq!(*lock.lock().unwrap(), DaemonStatus::Starting);
    }

    #[test]
    fn invalid_transition_leaves_state_unchanged() {
        let lock = status_mutex(DaemonStatus::Idle);
        let result = transition_status(&lock, DaemonStatus::Running);
        assert!(result.is_err());
        assert_eq!(*lock.lock().unwrap(), DaemonStatus::Idle);
    }

    #[test]
    fn same_state_is_noop_and_returns_ok() {
        let lock = status_mutex(DaemonStatus::Running);
        let prev = transition_status(&lock, DaemonStatus::Running).unwrap();
        assert_eq!(prev, DaemonStatus::Running);
    }

    // ========================================================================
    // Real lifecycle scenarios
    // ========================================================================

    #[test]
    fn clean_start_stop_cycle() {
        let lock = status_mutex(DaemonStatus::Idle);
        transition_status(&lock, DaemonStatus::Starting).unwrap();
        transition_status(&lock, DaemonStatus::Running).unwrap();
        transition_status(&lock, DaemonStatus::Stopping).unwrap();
        transition_status(&lock, DaemonStatus::Idle).unwrap();
        assert_eq!(*lock.lock().unwrap(), DaemonStatus::Idle);
    }

    #[test]
    fn crash_during_startup_then_restart() {
        let lock = status_mutex(DaemonStatus::Idle);
        transition_status(&lock, DaemonStatus::Starting).unwrap();
        transition_status(&lock, DaemonStatus::Crashed).unwrap();
        // Restart directly from Crashed
        transition_status(&lock, DaemonStatus::Starting).unwrap();
        transition_status(&lock, DaemonStatus::Running).unwrap();
        assert_eq!(*lock.lock().unwrap(), DaemonStatus::Running);
    }

    #[test]
    fn crash_while_running_then_go_idle() {
        let lock = status_mutex(DaemonStatus::Idle);
        transition_status(&lock, DaemonStatus::Starting).unwrap();
        transition_status(&lock, DaemonStatus::Running).unwrap();
        transition_status(&lock, DaemonStatus::Crashed).unwrap();
        // User chooses to go back to idle (disconnect)
        transition_status(&lock, DaemonStatus::Idle).unwrap();
        assert_eq!(*lock.lock().unwrap(), DaemonStatus::Idle);
    }

    #[test]
    fn stopping_is_a_dead_end_except_idle() {
        let lock = status_mutex(DaemonStatus::Stopping);
        assert!(transition_status(&lock, DaemonStatus::Starting).is_err());
        assert!(transition_status(&lock, DaemonStatus::Running).is_err());
        assert!(transition_status(&lock, DaemonStatus::Crashed).is_err());
        assert!(transition_status(&lock, DaemonStatus::Idle).is_ok());
    }

    // ========================================================================
    // Generation counter: prevents stale Terminated handlers
    // ========================================================================

    #[test]
    fn generation_counter_starts_at_zero() {
        let state = DaemonState {
            process: Mutex::new(None),
            logs: Mutex::new(VecDeque::new()),
            status: Mutex::new(DaemonStatus::Idle),
            generation: Mutex::new(0),
            connection_mode: Mutex::new(None),
        };
        assert_eq!(*state.generation.lock().unwrap(), 0);
    }

    #[test]
    fn generation_counter_increments_prevent_stale_handlers() {
        let state = DaemonState {
            process: Mutex::new(None),
            logs: Mutex::new(VecDeque::new()),
            status: Mutex::new(DaemonStatus::Running),
            generation: Mutex::new(1),
            connection_mode: Mutex::new(None),
        };

        // Simulate daemon restart: new generation
        {
            let mut gen = state.generation.lock().unwrap();
            *gen += 1;
        }
        *state.status.lock().unwrap() = DaemonStatus::Running;

        // Old handler (gen=1) tries to crash the new daemon (gen=2)
        let old_gen = 1u64;
        let current_gen = *state.generation.lock().unwrap();
        assert_ne!(old_gen, current_gen);

        // The handler should NOT transition because generations don't match
        if old_gen == current_gen {
            // This path should NOT execute
            let _ = transition_status(&state.status, DaemonStatus::Crashed);
        }

        assert_eq!(*state.status.lock().unwrap(), DaemonStatus::Running);
    }

    #[test]
    fn current_generation_handler_can_transition() {
        let state = DaemonState {
            process: Mutex::new(None),
            logs: Mutex::new(VecDeque::new()),
            status: Mutex::new(DaemonStatus::Running),
            generation: Mutex::new(3),
            connection_mode: Mutex::new(None),
        };

        let captured_gen = 3u64;
        let current_gen = *state.generation.lock().unwrap();
        assert_eq!(captured_gen, current_gen);

        // Current-gen handler should be allowed to crash
        let _ = transition_status(&state.status, DaemonStatus::Crashed);
        assert_eq!(*state.status.lock().unwrap(), DaemonStatus::Crashed);
    }

    // ========================================================================
    // Race: stop vs terminated event
    // ========================================================================

    #[test]
    fn stop_then_terminated_converge_to_idle() {
        let lock = status_mutex(DaemonStatus::Running);

        // stop_daemon transitions Running -> Stopping
        transition_status(&lock, DaemonStatus::Stopping).unwrap();

        // Terminated handler sees Stopping -> transitions to Idle
        transition_status(&lock, DaemonStatus::Idle).unwrap();
        assert_eq!(*lock.lock().unwrap(), DaemonStatus::Idle);

        // stop_daemon's second transition (Stopping -> Idle) is now a no-op
        let result = transition_status(&lock, DaemonStatus::Idle);
        assert!(result.is_ok());
        assert_eq!(*lock.lock().unwrap(), DaemonStatus::Idle);
    }

    #[test]
    fn double_stop_is_harmless() {
        let lock = status_mutex(DaemonStatus::Running);
        transition_status(&lock, DaemonStatus::Stopping).unwrap();

        // Second stop attempt: Stopping -> Stopping (same state = no-op)
        let result = transition_status(&lock, DaemonStatus::Stopping);
        assert!(result.is_ok());
        assert_eq!(*lock.lock().unwrap(), DaemonStatus::Stopping);
    }

    #[test]
    fn rapid_restart_increments_generation() {
        let state = DaemonState {
            process: Mutex::new(None),
            logs: Mutex::new(VecDeque::new()),
            status: Mutex::new(DaemonStatus::Idle),
            generation: Mutex::new(0),
            connection_mode: Mutex::new(None),
        };

        for i in 1..=5 {
            {
                let mut gen = state.generation.lock().unwrap();
                *gen += 1;
            }
            assert_eq!(*state.generation.lock().unwrap(), i);
        }
    }
}
