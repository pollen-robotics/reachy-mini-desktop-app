use std::env;
use std::io::{BufRead, BufReader};
use std::process::{ChildStderr, ChildStdout, Command, ExitCode, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
#[cfg(target_os = "macos")]
use std::fs;
#[cfg(target_os = "macos")]
use std::path::PathBuf;

use uv_wrapper::{get_data_dir, bootstrap, venv_exists, uv_exe_path, needs_upgrade, upgrade_venvs, fix_externally_managed_venvs};

#[cfg(not(target_os = "windows"))]
use signal_hook::{consts::TERM_SIGNALS, flag::register};

/// Interval at which we emit heartbeat messages during silent bootstrap phases.
/// Tauri's sidecar-stdout listener on the frontend uses these lines to reset
/// the activity-based startup timeout (ACTIVITY_RESET_DELAY = 15s).
/// Keeping the heartbeat well under that window prevents spurious timeouts.
const BOOTSTRAP_HEARTBEAT_INTERVAL: Duration = Duration::from_secs(5);

/// RAII guard that spawns a background thread emitting `[bootstrap]` heartbeat
/// lines on stdout every `BOOTSTRAP_HEARTBEAT_INTERVAL`. The thread stops on
/// drop. This keeps the frontend's activity-reset alive during long silent
/// phases (codesigning, GStreamer registry scan, Python import warmup).
struct BootstrapHeartbeat {
    stop: Arc<AtomicBool>,
    handle: Option<thread::JoinHandle<()>>,
}

impl BootstrapHeartbeat {
    fn start(label: &str) -> Self {
        let stop = Arc::new(AtomicBool::new(false));
        let stop_clone = Arc::clone(&stop);
        let label = label.to_string();
        let handle = thread::spawn(move || {
            let mut tick: u64 = 0;
            while !stop_clone.load(Ordering::Relaxed) {
                // Sleep in short slices so we stop promptly when the guard is
                // dropped, without waking up too often.
                for _ in 0..(BOOTSTRAP_HEARTBEAT_INTERVAL.as_secs().max(1)) {
                    if stop_clone.load(Ordering::Relaxed) {
                        return;
                    }
                    thread::sleep(Duration::from_secs(1));
                }
                tick += 1;
                println!("[bootstrap] {} (still working... {}s)", label, tick * BOOTSTRAP_HEARTBEAT_INTERVAL.as_secs());
            }
        });
        BootstrapHeartbeat { stop, handle: Some(handle) }
    }
}

impl Drop for BootstrapHeartbeat {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
    }
}

/// Spawn a thread that forwards each line from a piped child stream to our own
/// stdout/stderr with a `[bootstrap] [<label>] ` prefix. This gives the frontend
/// real visibility into what Python subprocesses are doing (GStreamer plugin
/// scan, reachy_mini import, etc.) instead of swallowing them with `Stdio::null`.
fn forward_stream_stdout(stream: ChildStdout, label: String) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        let reader = BufReader::new(stream);
        for line in reader.lines().map_while(Result::ok) {
            // Drop blank lines (GStreamer emits extra newlines between warnings).
            // Trim trailing whitespace but keep leading indent for readability.
            let trimmed = line.trim_end();
            if trimmed.is_empty() {
                continue;
            }
            println!("[bootstrap] [{}] {}", label, trimmed);
        }
    })
}

fn forward_stream_stderr(stream: ChildStderr, label: String) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        let reader = BufReader::new(stream);
        for line in reader.lines().map_while(Result::ok) {
            let trimmed = line.trim_end();
            if trimmed.is_empty() {
                continue;
            }
            eprintln!("[bootstrap] [{}] {}", label, trimmed);
        }
    })
}

/// Map a POSIX signal number to a short human-readable name.
///
/// Used when the Python daemon is killed by a native fault (segfault, abort,
/// bus error) so the frontend log shows `SIGSEGV` instead of a cryptic
/// `exit code 1`.
#[cfg(not(target_os = "windows"))]
fn signal_name(sig: i32) -> &'static str {
    match sig {
        1 => "SIGHUP",
        2 => "SIGINT",
        3 => "SIGQUIT",
        4 => "SIGILL",
        5 => "SIGTRAP",
        6 => "SIGABRT",
        7 => "SIGBUS",   // macOS: SIGEMT; Linux: SIGBUS
        8 => "SIGFPE",
        9 => "SIGKILL",
        10 => "SIGBUS",  // macOS
        11 => "SIGSEGV",
        13 => "SIGPIPE",
        14 => "SIGALRM",
        15 => "SIGTERM",
        24 => "SIGXCPU",
        25 => "SIGXFSZ",
        _ => "unknown",
    }
}

/// Adhoc-sign Python executables and libpython with disable-library-validation entitlement.
/// This allows Python to load pip-installed native extensions (.so/.dylib) regardless of
/// their signing status. Only Python itself needs the entitlement — extensions don't need
/// to be individually signed.
#[cfg(target_os = "macos")]
fn sign_python_entitlements(dir: &PathBuf) {
    // Find python-entitlements.plist in app bundle Resources or dev paths
    let entitlements_path = env::current_exe()
        .ok()
        .and_then(|exe| {
            // Production: .app/Contents/MacOS/uv-trampoline -> .app/Contents/Resources/
            let resources_dir = exe.parent()?.parent()?.join("Resources");
            let candidate = resources_dir.join("python-entitlements.plist");
            if candidate.exists() {
                println!("   📜 Found python-entitlements.plist in Resources");
                return Some(candidate);
            }
            // Dev mode: binary is in src-tauri/binaries/ — check same dir
            let same_dir = exe.parent()?.join("python-entitlements.plist");
            if same_dir.exists() {
                println!("   📜 Found python-entitlements.plist next to binary");
                return Some(same_dir);
            }
            // Dev mode fallback: check parent dir (src-tauri/)
            let parent_dir = exe.parent()?.parent()?.join("python-entitlements.plist");
            if parent_dir.exists() {
                println!("   📜 Found python-entitlements.plist in parent dir");
                return Some(parent_dir);
            }
            println!("   ⚠️  python-entitlements.plist not found");
            None
        });

    let Some(entitlements) = entitlements_path else {
        eprintln!("   ⚠️  python-entitlements.plist not found, skipping signing");
        return;
    };

    let python_bin = format!("bin/python{}", uv_wrapper::PYTHON_VERSION);
    let libpython = format!("lib/libpython{}.dylib", uv_wrapper::PYTHON_VERSION);

    for rel_path in &["bin/python3", python_bin.as_str(), libpython.as_str()] {
        let path = dir.join(rel_path);
        if !path.exists() {
            continue;
        }

        let result = Command::new("codesign")
            .arg("--force")
            .arg("--sign")
            .arg("-")
            .arg("--entitlements")
            .arg(&entitlements)
            .arg(&path)
            .output();

        match result {
            Ok(output) if output.status.success() => {
                log::debug!("   ✅ Signed: {}", rel_path);
            }
            Ok(output) => {
                log::debug!("   ⚠️  Failed to sign {}: {}", rel_path, String::from_utf8_lossy(&output.stderr));
            }
            Err(e) => {
                log::debug!("   ⚠️  Error signing {}: {}", rel_path, e);
            }
        }
    }
}

fn main() -> ExitCode {
    let args = env::args().skip(1).collect::<Vec<String>>();

    // Step 1: Determine the writable data directory
    let data_dir = match get_data_dir() {
        Some(dir) => dir,
        None => {
            eprintln!("❌ Error: Unable to determine data directory");
            return ExitCode::FAILURE;
        }
    };

    println!("📂 Data directory: {:?}", data_dir);

    // Step 1b: If .venv has a stale EXTERNALLY-MANAGED marker, remove both venvs
    // so bootstrap recreates them cleanly.
    fix_externally_managed_venvs(&data_dir);

    // Step 2: Bootstrap — ensure uv, Python, .venv, and apps_venv all exist.
    // On first run everything is created. After a partial reset (e.g., apps_venv
    // deleted), only the missing pieces are recreated.
    let needs_full_bootstrap = !venv_exists(&data_dir, ".venv");
    let needs_apps_venv = !venv_exists(&data_dir, "apps_venv");

    if needs_full_bootstrap {
        println!("📦 First run detected, bootstrapping Python environment...");
        if let Err(e) = bootstrap(&data_dir) {
            eprintln!("❌ Bootstrap failed: {}", e);
            return ExitCode::FAILURE;
        }
    } else if needs_apps_venv {
        // .venv exists but apps_venv is missing (e.g., after "Reset Apps Environment")
        println!("[bootstrap] Recreating apps_venv...");
        let package_spec = uv_wrapper::get_reachy_mini_spec();
        let apps_python_rel = if cfg!(target_os = "windows") {
            "apps_venv\\Scripts\\python.exe"
        } else {
            "apps_venv/bin/python3"
        };
        // `--clear` ensures idempotency: if a previous attempt crashed mid-creation
        // (leaving e.g. `apps_venv/.cache/` only), the directory would prevent a
        // fresh `uv venv` from succeeding. See bootstrap() in lib.rs for details.
        if let Err(e) = uv_wrapper::run_uv(&data_dir, &["venv", "--clear", "--python", uv_wrapper::PYTHON_VERSION, "apps_venv"]) {
            eprintln!("❌ Failed to create apps_venv: {}", e);
        } else if let Err(e) = uv_wrapper::run_uv(
            &data_dir,
            &["pip", "install", "--python", apps_python_rel, &package_spec],
        ) {
            eprintln!("❌ Failed to install packages in apps_venv: {}", e);
        }
    }

    // Step 2b: Upgrade — if the venv already existed but the expected reachy-mini
    // spec changed (e.g., app was updated), or the installed version is below the
    // minimum required (e.g., < 1.6.0 which introduced apps_venv), upgrade both
    // venvs in place.
    let needs_version_bump = !needs_full_bootstrap && uv_wrapper::needs_venv_rebuild(&data_dir);
    let needs_spec_upgrade = !needs_full_bootstrap
        && (needs_upgrade(&data_dir) || needs_version_bump);
    if needs_spec_upgrade {
        if needs_version_bump {
            println!(
                "[upgrade] Installed reachy-mini is below minimum required version, upgrading venvs..."
            );
        } else {
            println!("[upgrade] App updated — reachy-mini spec changed, upgrading venvs...");
        }
        if let Err(e) = upgrade_venvs(&data_dir) {
            eprintln!("⚠️  Upgrade failed (will continue with existing venv): {}", e);
            // Non-fatal: the old version may still work. Don't write the marker
            // so we retry on next launch.
        }
    }

    // macOS: adhoc-sign Python executables with disable-library-validation entitlement.
    // This allows Python to load pip-installed native extensions. Only Python + libpython
    // need signing — individual .so/.dylib extensions are covered by the entitlement.
    if needs_full_bootstrap || needs_apps_venv || needs_spec_upgrade {
        #[cfg(target_os = "macos")]
        {
            println!("[bootstrap] Signing Python binaries with entitlements...");

            if needs_full_bootstrap {
                if let Ok(entries) = fs::read_dir(&data_dir) {
                    for entry in entries.flatten() {
                        let name = entry.file_name();
                        let name_str = name.to_string_lossy();
                        if name_str.starts_with("cpython-") && entry.path().is_dir() {
                            println!("[bootstrap] Signing cpython: {}", name_str);
                            // codesign can take several seconds per binary; heartbeat
                            // keeps the frontend activity-reset ticking.
                            let _hb = BootstrapHeartbeat::start(&format!("Signing {}", name_str));
                            sign_python_entitlements(&entry.path());
                        }
                    }
                }
            }

            let venvs_to_sign: &[&str] = if needs_full_bootstrap || needs_spec_upgrade {
                &[".venv", "apps_venv"]
            } else {
                &["apps_venv"]
            };
            for venv_name in venvs_to_sign {
                let venv_dir = data_dir.join(venv_name);
                if venv_dir.exists() {
                    println!("[bootstrap] Signing {}", venv_name);
                    let _hb = BootstrapHeartbeat::start(&format!("Signing {}", venv_name));
                    sign_python_entitlements(&venv_dir);
                }
            }
        }

        // Pre-warm: GStreamer registry cache + reachy_mini import in parallel
        // Without this, first launch scans 256 GStreamer plugins (2+ min)
        let venvs_to_warm: &[&str] = if needs_full_bootstrap || needs_spec_upgrade {
            &[".venv", "apps_venv"]
        } else {
            &["apps_venv"]
        };
        // Verbose pre-warm script: emits progress lines with `flush=True` so each
        // step (GStreamer init, reachy_mini import) streams in real time and we
        // can forward it to the frontend. The try/except keeps the import
        // best-effort (same behaviour as before) while reporting failures.
        const PREWARM_SCRIPT: &str = concat!(
            "import sys, time\n",
            "def log(msg):\n",
            "    print(msg, flush=True)\n",
            "t0 = time.monotonic()\n",
            "def elapsed():\n",
            "    return f'[+{time.monotonic() - t0:.1f}s]'\n",
            "log(f'{elapsed()} importing gi')\n",
            "try:\n",
            "    import gi\n",
            "    gi.require_version('Gst', '1.0')\n",
            "    from gi.repository import Gst\n",
            "    log(f'{elapsed()} initializing GStreamer (scanning plugin registry, first run only)')\n",
            "    Gst.init([])\n",
            "    log(f'{elapsed()} GStreamer ready')\n",
            "except Exception as e:\n",
            "    log(f'{elapsed()} GStreamer skipped: {e}')\n",
            "log(f'{elapsed()} importing reachy_mini')\n",
            "import reachy_mini\n",
            "log(f'{elapsed()} reachy_mini imported')\n",
            "log(f'{elapsed()} pre-warm done')\n",
        );

        println!("[bootstrap] Pre-warming GStreamer and Python imports...");
        {
            let mut children = Vec::new();
            let mut reader_handles: Vec<thread::JoinHandle<()>> = Vec::new();

            for venv_name in venvs_to_warm {
                let python_path = if cfg!(target_os = "windows") {
                    data_dir.join(venv_name).join("Scripts").join("python.exe")
                } else {
                    data_dir.join(venv_name).join("bin").join("python3")
                };
                if !python_path.exists() {
                    continue;
                }

                println!("[bootstrap] Pre-warming {}...", venv_name);
                let spawn_result = Command::new(&python_path)
                    .current_dir(&data_dir)
                    .env("GST_REGISTRY_FORK", "no")
                    // `PYTHONUNBUFFERED=1` + `print(..., flush=True)` together
                    // guarantee we observe each log line as it happens instead
                    // of getting a silent block then a burst at process exit.
                    .env("PYTHONUNBUFFERED", "1")
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped())
                    .arg("-c")
                    .arg(PREWARM_SCRIPT)
                    .spawn();

                match spawn_result {
                    Ok(mut child) => {
                        let label = format!("prewarm:{}", venv_name);
                        if let Some(out) = child.stdout.take() {
                            reader_handles.push(forward_stream_stdout(out, label.clone()));
                        }
                        if let Some(err) = child.stderr.take() {
                            reader_handles.push(forward_stream_stderr(err, label));
                        }
                        children.push((venv_name.to_string(), child));
                    }
                    Err(e) => eprintln!("[bootstrap] Warning: failed to spawn pre-warm for {}: {}", venv_name, e),
                }
            }

            // Heartbeat as a safety net: if both subprocesses happen to be
            // silent for longer than ACTIVITY_RESET_DELAY (e.g. blocked in a
            // C-level call like the GStreamer registry scan before the first
            // print), we still emit an activity line every 5s.
            let _hb = BootstrapHeartbeat::start("Pre-warming Python imports");
            for (venv_name, mut child) in children {
                match child.wait() {
                    Ok(status) if !status.success() => {
                        eprintln!("[bootstrap] Warning: pre-warm for {} exited with {:?}", venv_name, status.code());
                    }
                    Err(e) => {
                        eprintln!("[bootstrap] Warning: pre-warm wait failed for {}: {}", venv_name, e);
                    }
                    _ => {}
                }
            }
            // Drain reader threads so we flush every buffered line before
            // declaring pre-warm complete (avoids interleaved "complete" log
            // appearing before the last subprocess line).
            for handle in reader_handles {
                let _ = handle.join();
            }
            drop(_hb);
            println!("[bootstrap] Pre-warming complete");
        }

        println!("[bootstrap] Setup complete!");
    }

    // Step 3: Build the command to launch
    // The first arg is typically a Python path (e.g., .venv/bin/python3)
    // followed by daemon arguments
    println!("🔍 Args: {:?}", args);

    let mut cmd = if !args.is_empty() && args[0].contains("python") {
        println!("🐍 Detected Python executable: {}", args[0]);

        // Convert Unix-style path to Windows-style if needed
        #[cfg(target_os = "windows")]
        let python_arg = {
            let arg = &args[0];
            if arg.contains(".venv/bin/python") || arg.contains(".venv\\bin\\python") {
                arg.replace(".venv/bin/python3", ".venv/Scripts/python.exe")
                   .replace(".venv\\bin\\python3", ".venv\\Scripts\\python.exe")
                   .replace(".venv/bin/python", ".venv/Scripts/python.exe")
                   .replace(".venv\\bin\\python", ".venv\\Scripts\\python.exe")
                   .replace("/", "\\")
            } else {
                arg.replace("/", "\\")
            }
        };

        #[cfg(not(target_os = "windows"))]
        let python_arg = args[0].clone();

        // Resolve relative to data_dir
        let python_path = data_dir.join(&python_arg);
        println!("🔍 Resolved Python path: {:?}", python_path);
        if !python_path.exists() {
            eprintln!("❌ Error: Python executable not found at {:?}", python_path);
            return ExitCode::FAILURE;
        }

        let mut c = Command::new(&python_path);
        c.current_dir(&data_dir)
         .env("UV_WORKING_DIR", &data_dir)
         .env("UV_PYTHON_INSTALL_DIR", &data_dir)
         // Force Python to flush stdout/stderr line by line so we never
         // lose the last error line if the interpreter dies abruptly.
         .env("PYTHONUNBUFFERED", "1")
         // Install the built-in faulthandler so native crashes (SIGSEGV,
         // SIGABRT from C extensions) emit a Python/C traceback on stderr
         // before the process dies. Essential for diagnosing GStreamer /
         // PyGObject crashes that otherwise leave an empty `exit code 1`.
         .env("PYTHONFAULTHANDLER", "1")
         .args(&args[1..]);
        c
    } else {
        println!("ℹ️  Using uv command execution");
        let uv_path = uv_exe_path(&data_dir);
        let mut c = Command::new(&uv_path);
        c.current_dir(&data_dir)
         .env("UV_WORKING_DIR", &data_dir)
         .env("UV_PYTHON_INSTALL_DIR", &data_dir)
         .args(&args);
        c
    };

    // Add data_dir to PATH so Python subprocesses can find uv
    let current_path = env::var("PATH").unwrap_or_default();
    let new_path = if cfg!(target_os = "windows") {
        format!("{};{}", data_dir.display(), current_path)
    } else {
        format!("{}:{}", data_dir.display(), current_path)
    };
    cmd.env("PATH", &new_path);

    println!("🚀 Launching: {:?}", cmd);

    let mut child = match cmd.spawn() {
        Ok(child) => child,
        Err(e) => {
            eprintln!("❌ Error: Unable to spawn process: {}", e);
            return ExitCode::FAILURE;
        }
    };

    // Unix: signal handling with wait loop
    #[cfg(not(target_os = "windows"))]
    {
        use std::sync::atomic::{AtomicBool, Ordering};
        use std::sync::Arc;

        let term_now = Arc::new(AtomicBool::new(false));
        for sig in TERM_SIGNALS {
            if let Err(e) = register(*sig, Arc::clone(&term_now)) {
                eprintln!("⚠️  Warning: Unable to register handler for signal {:?}: {}", sig, e);
            }
        }

        loop {
            if term_now.load(Ordering::Relaxed) {
                eprintln!("🛑 Termination signal received, stopping child process...");
                let _ = child.kill();
                break;
            }

            match child.try_wait() {
                Ok(Some(status)) => {
                    use std::os::unix::process::ExitStatusExt;
                    if let Some(signal) = status.signal() {
                        // Process was terminated by a signal (SIGSEGV, SIGABRT,
                        // SIGBUS...). Surface it explicitly instead of masking
                        // it as a generic exit code 1 - this is what we need
                        // to diagnose native crashes (GStreamer, PyGObject,
                        // libffi) that never reach Python's excepthook.
                        eprintln!(
                            "💥 Process terminated by signal {} ({})",
                            signal,
                            signal_name(signal),
                        );
                        // Follow POSIX convention: 128 + signal number.
                        return ExitCode::from((128u16 + signal as u16).min(255) as u8);
                    }
                    let exit_code = status.code().unwrap_or(1);
                    if exit_code != 0 {
                        eprintln!("⚠️  Process exited with code: {}", exit_code);
                    }

                    return ExitCode::from(exit_code as u8);
                }
                Ok(None) => {
                    std::thread::sleep(std::time::Duration::from_millis(100));
                }
                Err(e) => {
                    eprintln!("❌ Error while waiting for child process: {}", e);
                    let _ = child.kill();
                    return ExitCode::FAILURE;
                }
            }
        }

        match child.wait() {
            Ok(status) => {
                use std::os::unix::process::ExitStatusExt;
                if let Some(signal) = status.signal() {
                    eprintln!(
                        "💥 Process terminated by signal {} ({})",
                        signal,
                        signal_name(signal),
                    );
                    return ExitCode::from((128u16 + signal as u16).min(255) as u8);
                }
                ExitCode::from(status.code().unwrap_or(1) as u8)
            }
            Err(e) => {
                eprintln!("❌ Error during final wait: {}", e);
                ExitCode::FAILURE
            }
        }
    }

    // Windows: simple wait
    #[cfg(target_os = "windows")]
    {
        match child.wait() {
            Ok(status) => {
                let exit_code = status.code().unwrap_or(1);
                if exit_code != 0 {
                    eprintln!("⚠️  Process exited with code: {}", exit_code);
                }
                ExitCode::from(exit_code as u8)
            }
            Err(e) => {
                eprintln!("❌ Error while waiting for process: {}", e);
                ExitCode::FAILURE
            }
        }
    }
}
