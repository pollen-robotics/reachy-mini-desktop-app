use std::{env, process::Command, path::PathBuf, fs};

/// Gets the local app data directory for Windows
/// Returns %LOCALAPPDATA%\Reachy Mini Control\
#[cfg(target_os = "windows")]
pub fn get_local_app_data_dir() -> Option<PathBuf> {
    env::var("LOCALAPPDATA").ok().map(|local_app_data| {
        PathBuf::from(local_app_data).join("Reachy Mini Control")
    })
}

#[cfg(not(target_os = "windows"))]
pub fn get_local_app_data_dir() -> Option<PathBuf> {
    None
}

/// Gets the XDG data home directory for Linux
/// Returns $XDG_DATA_HOME/reachy-mini-control/ or ~/.local/share/reachy-mini-control/
/// Note: Uses lowercase with dashes to match Tauri's XDG directory naming convention
#[cfg(target_os = "linux")]
pub fn get_xdg_data_home() -> Option<PathBuf> {
    // First try XDG_DATA_HOME environment variable
    if let Ok(xdg_data_home) = env::var("XDG_DATA_HOME") {
        return Some(PathBuf::from(xdg_data_home).join("reachy-mini-control"));
    }
    
    // Fall back to ~/.local/share/ (XDG default)
    env::var("HOME").ok().map(|home| {
        PathBuf::from(home).join(".local/share/reachy-mini-control")
    })
}

#[cfg(not(target_os = "linux"))]
pub fn get_xdg_data_home() -> Option<PathBuf> {
    None
}

/// Check if we're running from /usr/lib/ (read-only system directory on Linux)
#[cfg(target_os = "linux")]
pub fn is_system_lib_path(path: &std::path::Path) -> bool {
    let path_str = path.to_string_lossy();
    path_str.starts_with("/usr/lib/") || path_str.starts_with("/usr/share/")
}

#[cfg(not(target_os = "linux"))]
pub fn is_system_lib_path(_path: &std::path::Path) -> bool {
    false
}

/// Check if we're running from Program Files (read-only on Windows)
#[cfg(target_os = "windows")]
pub fn is_program_files_path(path: &std::path::Path) -> bool {
    let path_str = path.to_string_lossy().to_lowercase();
    path_str.contains("program files") || path_str.contains("programfiles")
}

#[cfg(not(target_os = "windows"))]
pub fn is_program_files_path(_path: &std::path::Path) -> bool {
    false
}

/// Copy a directory recursively
pub fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> Result<(), String> {
    if !src.exists() {
        return Err(format!("Source directory does not exist: {:?}", src));
    }
    
    // Create destination directory if it doesn't exist
    if !dst.exists() {
        fs::create_dir_all(dst)
            .map_err(|e| format!("Failed to create directory {:?}: {}", dst, e))?;
    }
    
    let entries = fs::read_dir(src)
        .map_err(|e| format!("Failed to read directory {:?}: {}", src, e))?;
    
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        
        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)
                .map_err(|e| format!("Failed to copy {:?} to {:?}: {}", src_path, dst_path, e))?;
        }
    }
    
    Ok(())
}

/// Setup local venv on Windows by copying from Program Files to %LOCALAPPDATA%
/// Returns the local directory path if setup was successful or already done
/// Note: With --relocatable venv, we no longer need cpython or pyvenv.cfg patching
#[cfg(target_os = "windows")]
pub fn setup_local_venv_windows(program_files_dir: &std::path::Path) -> Result<PathBuf, String> {
    let local_dir = get_local_app_data_dir()
        .ok_or_else(|| "LOCALAPPDATA environment variable not set".to_string())?;
    
    // Check if local venv already exists
    let local_venv = local_dir.join(".venv");
    let local_python = local_venv.join("Scripts").join("python.exe");
    
    if local_python.exists() {
        println!("✅ Local venv already configured at {:?}", local_dir);
        return Ok(local_dir);
    }
    
    println!("📦 Setting up local Python environment...");
    println!("   Source: {:?}", program_files_dir);
    println!("   Target: {:?}", local_dir);
    
    // Create local directory
    fs::create_dir_all(&local_dir)
        .map_err(|e| format!("Failed to create local directory: {}", e))?;
    
    // Copy .venv (self-contained with --relocatable)
    let src_venv = program_files_dir.join(".venv");
    if src_venv.exists() {
        println!("   📁 Copying .venv...");
        // Remove existing local venv if it exists (to ensure clean copy)
        if local_venv.exists() {
            fs::remove_dir_all(&local_venv)
                .map_err(|e| format!("Failed to remove old local venv: {}", e))?;
        }
        copy_dir_recursive(&src_venv, &local_venv)?;
        println!("   ✅ .venv copied");
    } else {
        return Err(format!(".venv not found at {:?}", src_venv));
    }
    
    // Copy uv.exe and uvx.exe
    for exe in &["uv.exe", "uvx.exe"] {
        let src_exe = program_files_dir.join(exe);
        let dst_exe = local_dir.join(exe);
        if src_exe.exists() {
            fs::copy(&src_exe, &dst_exe)
                .map_err(|e| format!("Failed to copy {}: {}", exe, e))?;
            println!("   ✅ {} copied", exe);
        }
    }
    
    println!("✅ Local Python environment ready at {:?}", local_dir);
    Ok(local_dir)
}

#[cfg(not(target_os = "windows"))]
pub fn setup_local_venv_windows(_program_files_dir: &std::path::Path) -> Result<PathBuf, String> {
    Err("setup_local_venv_windows is only available on Windows".to_string())
}

/// Setup local venv on Linux by copying from /usr/lib/ to ~/.local/share/
/// Returns the local directory path if setup was successful or already done
/// Note: With --relocatable venv, we no longer need cpython or pyvenv.cfg patching
#[cfg(target_os = "linux")]
pub fn setup_local_venv_linux(system_lib_dir: &std::path::Path) -> Result<PathBuf, String> {
    let local_dir = get_xdg_data_home()
        .ok_or_else(|| "HOME environment variable not set".to_string())?;
    
    // Check if local venv already exists
    let local_venv = local_dir.join(".venv");
    let local_python = local_venv.join("bin").join("python3");
    
    if local_python.exists() {
        println!("✅ Local venv already configured at {:?}", local_dir);
        return Ok(local_dir);
    }
    
    println!("📦 Setting up local Python environment...");
    println!("   Source: {:?}", system_lib_dir);
    println!("   Target: {:?}", local_dir);
    
    // Create local directory
    fs::create_dir_all(&local_dir)
        .map_err(|e| format!("Failed to create local directory: {}", e))?;
    
    // Copy .venv (self-contained with --relocatable)
    let src_venv = system_lib_dir.join(".venv");
    if src_venv.exists() {
        println!("   📁 Copying .venv...");
        // Remove existing local venv if it exists (to ensure clean copy)
        if local_venv.exists() {
            fs::remove_dir_all(&local_venv)
                .map_err(|e| format!("Failed to remove old local venv: {}", e))?;
        }
        copy_dir_recursive(&src_venv, &local_venv)?;
        println!("   ✅ .venv copied");
    } else {
        return Err(format!(".venv not found at {:?}", src_venv));
    }
    
    // Copy uv and uvx binaries
    for bin in &["uv", "uvx"] {
        let src_bin = system_lib_dir.join(bin);
        let dst_bin = local_dir.join(bin);
        if src_bin.exists() {
            fs::copy(&src_bin, &dst_bin)
                .map_err(|e| format!("Failed to copy {}: {}", bin, e))?;
            // Make executable
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let mut perms = fs::metadata(&dst_bin)
                    .map_err(|e| format!("Failed to get permissions for {}: {}", bin, e))?
                    .permissions();
                perms.set_mode(0o755);
                fs::set_permissions(&dst_bin, perms)
                    .map_err(|e| format!("Failed to set permissions for {}: {}", bin, e))?;
            }
            println!("   ✅ {} copied", bin);
        }
    }
    
    println!("✅ Local Python environment ready at {:?}", local_dir);
    Ok(local_dir)
}

#[cfg(not(target_os = "linux"))]
pub fn setup_local_venv_linux(_system_lib_dir: &std::path::Path) -> Result<PathBuf, String> {
    Err("setup_local_venv_linux is only available on Linux".to_string())
}

/// Gets the folder containing the current executable
/// 
/// Returns the parent directory of the executable, or the current directory
/// if the executable cannot be located (robust fallback)
pub fn get_current_folder() -> std::path::PathBuf {
    env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| {
            // Fallback: use current directory if we can't find the executable
            env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."))
        })
}

pub fn lookup_bin_folder(possible_folders: &[&str], bin: &str) -> Option<std::path::PathBuf> {
    for abs_path in possible_abs_bin(possible_folders) {
        let candidate = abs_path.join(bin);
        if candidate.exists() {
            return Some(abs_path);
        }
    }
    None
}

fn possible_abs_bin(possible_folders: &[&str]) -> Vec<std::path::PathBuf> {
    let cur_folder = get_current_folder();
    possible_folders.iter().map(|p| {
        let path = std::path::Path::new(p);
        // If the path is absolute, use it as-is; otherwise join with cur_folder
        if path.is_absolute() {
            path.to_path_buf()
        } else {
            cur_folder.join(p)
        }
    }).collect()
}

pub fn run_command(cmd: &str) -> Result<std::process::ExitStatus, std::io::Error> {
    println!("Running command: {}", cmd);

    #[cfg(target_os = "windows")]
    let status = Command::new("powershell")
        .arg("-ExecutionPolicy")
        .arg("ByPass")
        .arg("-c")
        .arg(cmd)
        .status()?;

    #[cfg(not(target_os = "windows"))]
    let status = Command::new("sh").arg("-c").arg(cmd).status()?;
    
    // Check exit code and return error if non-zero
    if !status.success() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::Other,
            format!("Command failed with exit code: {:?}", status.code())
        ));
    }
    
    Ok(status)
}

// Note: find_cpython_folder and patching_pyvenv_cfg have been removed
// With --relocatable venv, the venv is self-contained and doesn't need cpython or patching

