// Helper to build daemon arguments
// IMPORTANT: Use .venv/bin/python3 directly instead of "uv run python" to ensure
// we use the venv Python with all installed packages, not the cpython bundle
pub fn build_daemon_args(sim_mode: bool) -> Result<Vec<String>, String> {
    // Use Python from .venv directly (not via uv run)
    // This ensures we use the venv with all installed packages
    #[cfg(target_os = "windows")]
    let python_cmd = ".venv\\Scripts\\python.exe";
    #[cfg(not(target_os = "windows"))]
    let python_cmd = ".venv/bin/python3";
    
    let mut args = vec![
        python_cmd.to_string(),
        "-m".to_string(),
        "reachy_mini.daemon.app.main".to_string(),
        "--desktop-app-daemon".to_string(),
        "--no-wake-up-on-start".to_string(), // Robot starts sleeping, toggle controls wake
        "--preload-datasets".to_string(),    // Pre-download emotions/dances at startup
    ];
    
    if sim_mode {
        // Use --mockup-sim for mockup simulation (no MuJoCo required)
        args.push("--mockup-sim".to_string());
    }
    
    Ok(args)
}
