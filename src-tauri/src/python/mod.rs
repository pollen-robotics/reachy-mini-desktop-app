// Helper to build daemon arguments
// IMPORTANT: Use .venv/bin/python3 directly instead of "uv run python" to ensure
// we use the venv Python with all installed packages, not the cpython bundle
#[allow(unused_variables)]
pub fn build_daemon_args(
    app_handle: &tauri::AppHandle,
    sim_mode: bool,
    preload_datasets: bool,
) -> Result<Vec<String>, String> {
    // Use Python from .venv directly (not via uv run)
    // This ensures we use the venv with all installed packages
    #[cfg(target_os = "windows")]
    let python_cmd = ".venv\\Scripts\\python.exe";
    #[cfg(not(target_os = "windows"))]
    let python_cmd = ".venv/bin/python3";

    let mut args = vec![python_cmd.to_string()];

    // On Windows, use avast_ssl_fix wrapper to prevent Avast antivirus SSL injection issues
    // Avast injects SSLKEYLOGFILE pointing to aswMonFltProxy which causes PermissionError
    // This is a Windows-specific issue (Avast is primarily a Windows antivirus)
    #[cfg(target_os = "windows")]
    {
        // In dev mode, the script is in the project source tree
        // In production, Tauri bundles it as a resource next to the executable
        let script_path = if cfg!(debug_assertions) {
            let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
            manifest_dir
                .parent()
                .unwrap_or(manifest_dir)
                .join("scripts")
                .join("avast_ssl_fix.py")
        } else {
            use tauri::Manager;
            app_handle
                .path()
                .resource_dir()
                .map_err(|e| format!("Failed to get resource dir: {}", e))?
                .join("scripts")
                .join("avast_ssl_fix.py")
        };
        args.push(script_path.to_string_lossy().to_string());
    }

    // On macOS/Linux, run the daemon module directly (no wrapper needed)
    #[cfg(not(target_os = "windows"))]
    {
        args.push("-m".to_string());
        args.push("reachy_mini.daemon.app.main".to_string());
    }

    // Common daemon arguments
    args.push("--desktop-app-daemon".to_string());
    args.push("--no-wake-up-on-start".to_string()); // Robot starts sleeping, toggle controls wake

    // Pre-download emotions/dances at startup (requires newer reachy-mini)
    // We'll try with this first, and fall back to without it if the daemon doesn't support it
    if preload_datasets {
        args.push("--preload-datasets".to_string());
    }

    if sim_mode {
        // Use --mockup-sim for mockup simulation (no MuJoCo required)
        args.push("--mockup-sim".to_string());
    }

    Ok(args)
}

/// Environment variables that must not leak from the desktop app into the
/// Python sidecar.
///
/// The AppImage launcher (AppImageKit `AppRun` + linuxdeploy GTK hook) exports
/// these so the bundled Tauri/WebKit binary finds its own libraries. The sidecar
/// runs the host's `uv`, a standalone CPython and the host's GStreamer, and
/// breaks in various ways when it inherits them:
///
/// - `PYTHONHOME`/`PYTHONPATH` point at `$APPDIR/usr` → every Python started by
///   uv fails with `No module named 'encodings'` (pycairo/pygobject builds die).
/// - `LD_LIBRARY_PATH` prefers the bundled (Ubuntu 22.04) libssl over the host's
///   → the bootstrap's `curl` fails with `OPENSSL_3.x.0 not found` on newer
///   distros and uv is never downloaded.
/// - `GST_PLUGIN_SYSTEM_PATH(_1_0)` replaces the host plugin search path with a
///   non-existent bundle dir → `Gst.DeviceMonitor` sees no camera/mic and
///   `webrtcsink` is missing (GStreamer 1.x prefers the `_1_0` variant).
/// - `GIO_EXTRA_MODULES`/`GSETTINGS_SCHEMA_DIR`/`GTK_*`/`GDK_PIXBUF_MODULE_FILE`
///   belong to the bundled GTK stack; the sidecar has no use for them.
const SIDECAR_ENV_BLOCKLIST: &[&str] = &[
    "PYTHONHOME",
    "PYTHONPATH",
    "PYTHONDONTWRITEBYTECODE",
    "LD_LIBRARY_PATH",
    "LD_PRELOAD",
    "GST_PLUGIN_SYSTEM_PATH",
    "GST_PLUGIN_SYSTEM_PATH_1_0",
    "GST_PLUGIN_PATH",
    "GST_PLUGIN_PATH_1_0",
    "GIO_EXTRA_MODULES",
    "GSETTINGS_SCHEMA_DIR",
    "GDK_PIXBUF_MODULE_FILE",
    "GTK_PATH",
    "GTK_EXE_PREFIX",
    "GTK_DATA_PREFIX",
    "GTK_IM_MODULE_FILE",
];

/// Filter the given environment down to what the sidecar may inherit.
///
/// Separated from [`sidecar_command`] so it can be unit-tested without an
/// `AppHandle`.
pub fn filtered_sidecar_env<I, K, V>(vars: I) -> Vec<(K, V)>
where
    I: IntoIterator<Item = (K, V)>,
    K: AsRef<std::ffi::OsStr>,
{
    vars.into_iter()
        .filter(|(key, _)| {
            let key = key.as_ref().to_string_lossy();
            !SIDECAR_ENV_BLOCKLIST
                .iter()
                .any(|blocked| key.eq_ignore_ascii_case(blocked))
        })
        .collect()
}

/// Build the `uv-trampoline` sidecar command with a sanitized environment.
///
/// All sidecar spawns (daemon start, crash retry, self-update) go through here so
/// they behave identically.
pub fn sidecar_command(
    app_handle: &tauri::AppHandle,
) -> Result<tauri_plugin_shell::process::Command, String> {
    use tauri_plugin_shell::ShellExt;

    let mut command = app_handle
        .shell()
        .sidecar("uv-trampoline")
        .map_err(|e| e.to_string())?
        .env_clear()
        .envs(filtered_sidecar_env(std::env::vars_os()))
        .env("PYTHONIOENCODING", "utf-8");

    if cfg!(target_os = "linux") {
        // Pre-built webrtcsink/rsrtp plugins shipped by the .deb/.rpm packages
        command = command.env(
            "GST_PLUGIN_PATH",
            "/usr/share/reachy-mini-control/gstreamer-plugins",
        );
    }

    Ok(command)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn keys<'a>(env: Vec<(&'a str, &'a str)>) -> Vec<&'a str> {
        env.into_iter().map(|(k, _)| k).collect()
    }

    #[test]
    fn filtered_env_drops_appimage_variables() {
        let env = filtered_sidecar_env(vec![
            ("PATH", "/usr/bin"),
            ("PYTHONHOME", "/tmp/.mount_x/usr/"),
            ("PYTHONPATH", "/tmp/.mount_x/usr/share/pyshared/"),
            ("LD_LIBRARY_PATH", "/tmp/.mount_x/usr/lib/"),
            ("GST_PLUGIN_SYSTEM_PATH", "/tmp/.mount_x/usr/lib/gstreamer"),
            (
                "GST_PLUGIN_SYSTEM_PATH_1_0",
                "/tmp/.mount_x/usr/lib/gstreamer-1.0:",
            ),
            ("GIO_EXTRA_MODULES", "/tmp/.mount_x/usr/lib/gio/modules"),
            ("HOME", "/home/user"),
        ]);
        assert_eq!(keys(env), vec!["PATH", "HOME"]);
    }

    #[test]
    fn filtered_env_keeps_unrelated_variables() {
        let env = filtered_sidecar_env(vec![
            ("XDG_RUNTIME_DIR", "/run/user/1000"),
            ("WAYLAND_DISPLAY", "wayland-1"),
            ("HF_TOKEN", "x"),
            ("APPDIR", "/tmp/.mount_x"),
        ]);
        assert_eq!(env.len(), 4);
    }

    #[test]
    fn filtered_env_is_case_insensitive() {
        // Windows environment variable names are case-insensitive
        let env = filtered_sidecar_env(vec![("PythonHome", "C:\\x"), ("Path", "C:\\y")]);
        assert_eq!(keys(env), vec!["Path"]);
    }
}
