// Helper to fix mjpython shebang on macOS
// mjpython's shebang points to binaries/.venv but we're in target/debug/.venv
#[cfg(target_os = "macos")]
pub fn fix_mjpython_shebang() -> Result<(), String> {
    use std::fs;
    use std::env;
    
    // Find the current working directory (where uv-trampoline runs)
    let current_dir = env::current_dir().map_err(|e| format!("Failed to get current dir: {}", e))?;
    let mjpython_path = current_dir.join(".venv/bin/mjpython");
    
    if !mjpython_path.exists() {
        return Ok(()); // mjpython doesn't exist, skip
    }
    
    // Read mjpython content
    let content = fs::read_to_string(&mjpython_path)
        .map_err(|e| format!("Failed to read mjpython: {}", e))?;
    
    // Get the correct Python path (absolute path)
    let python_path = current_dir.join(".venv/bin/python3");
    let python_path_str = python_path.to_str()
        .ok_or("Invalid Python path")?;
    
    // Check if shebang needs fixing (points to binaries/.venv)
    if content.contains("binaries/.venv/bin/python3") {
        // Fix the shebang on line 2
        let lines: Vec<&str> = content.lines().collect();
        if lines.len() >= 2 {
            let mut new_lines: Vec<String> = lines.iter().map(|s| s.to_string()).collect();
            new_lines[1] = format!("'''exec' '{}' \"$0\" \"$@\"", python_path_str);
            let new_content = new_lines.join("\n");
            
            fs::write(&mjpython_path, new_content)
                .map_err(|e| format!("Failed to write mjpython: {}", e))?;
            
            println!("[tauri] ✅ Fixed mjpython shebang to point to {}", python_path_str);
        }
    }
    
    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub fn fix_mjpython_shebang() -> Result<(), String> {
    Ok(()) // No-op on non-macOS
}

// Helper to build daemon arguments
// On macOS with simulation mode, we need to use mjpython (required by MuJoCo)
// IMPORTANT: Use .venv/bin/python3 directly instead of "uv run python" to ensure
// we use the venv Python with all installed packages, not the cpython bundle
pub fn build_daemon_args(sim_mode: bool) -> Result<Vec<String>, String> {
    // Use Python from .venv directly (not via uv run)
    // This ensures we use the venv with all installed packages
    let python_cmd = if sim_mode && cfg!(target_os = "macos") {
        // Fix mjpython shebang before using it
        fix_mjpython_shebang()?;
        ".venv/bin/mjpython"
    } else if sim_mode {
        // Linux/Windows: use python3 for simulation
        #[cfg(target_os = "windows")]
        { ".venv\\Scripts\\python.exe" }
        #[cfg(not(target_os = "windows"))]
        { ".venv/bin/python3" }
    } else {
        // Non-simulation mode: use python3
        #[cfg(target_os = "windows")]
        { ".venv\\Scripts\\python.exe" }
        #[cfg(not(target_os = "windows"))]
        { ".venv/bin/python3" }
    };
    
    let mut args = vec![
        python_cmd.to_string(),
        "-m".to_string(),
        "reachy_mini.daemon.app.main".to_string(),
        "--desktop-app-daemon".to_string(),
    ];
    
    if sim_mode {
        args.push("--sim".to_string());
    }
    
    Ok(args)
}
