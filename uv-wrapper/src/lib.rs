use std::{env, process::Command};

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
    possible_folders.iter().map(|p| cur_folder.join(p)).collect()
}

pub fn run_command(cmd: &str) -> Result<std::process::ExitStatus, std::io::Error> {
    println!("Running command: {}", cmd);

    #[cfg(target_os = "windows")]
    return Command::new("powershell")
        .arg("-ExecutionPolicy")
        .arg("ByPass")
        .arg("-c")
        .arg(cmd)
        .status();

    #[cfg(not(target_os = "windows"))]
    Command::new("sh").arg("-c").arg(cmd).status()
}

pub fn find_cpython_folder(uv_folder: &std::path::Path) -> Result<String, String> {
    let entries = std::fs::read_dir(uv_folder)
        .map_err(|e| format!("Unable to read uv folder for cpython lookup: {}", e))?;

    for entry in entries {
        let entry = entry
            .map_err(|e| format!("Unable to read entry in uv folder: {}", e))?;
        let file_name = entry.file_name();
        let file_name_str = file_name.to_string_lossy();

        if file_name_str.starts_with("cpython-") && entry.path().is_dir() {
            return Ok(file_name_str.to_string());
        }
    }

    Err(format!(
        "Unable to find cpython folder in {:?}",
        uv_folder
    ))
}

/// Check if the current path is in AppTranslocation (macOS security feature)
#[cfg(target_os = "macos")]
pub fn is_app_translocation_path(path: &std::path::Path) -> bool {
    path.to_string_lossy().contains("AppTranslocation")
}

#[cfg(not(target_os = "macos"))]
pub fn is_app_translocation_path(_path: &std::path::Path) -> bool {
    false
}

pub fn patching_pyvenv_cfg(uv_folder: &std::path::Path, cpython_folder: &str) -> Result<(), String> {
    let pyvenv_cfg_path = uv_folder.join(".venv").join("pyvenv.cfg");
    
    // Check if file exists before trying to patch it
    if !pyvenv_cfg_path.exists() {
        return Err(format!(
            "pyvenv.cfg file does not exist at {:?}",
            pyvenv_cfg_path
        ));
    }
    
    println!("🔧 Patching pyvenv.cfg at {:?}", pyvenv_cfg_path);

    let content = std::fs::read_to_string(&pyvenv_cfg_path)
        .map_err(|e| format!("Unable to read pyvenv.cfg for patching: {}", e))?;

    #[cfg(target_os = "windows")]
    let home = uv_folder.join(cpython_folder);
    #[cfg(not(target_os = "windows"))]
    let home = uv_folder.join(cpython_folder).join("bin");

    let new_content = content
        .lines()
        .map(|line| {
            if line.starts_with("home = ") {
                format!("home = {}", home.display())
            } else {
                line.to_string()
            }
        })
        .collect::<Vec<String>>()
        .join("\n");

    // Try to write the patched file
    match std::fs::write(&pyvenv_cfg_path, new_content) {
        Ok(_) => Ok(()),
        Err(e) => {
            let error_msg = format!("Unable to write patched pyvenv.cfg: {}", e);
    
            // Check if we're in AppTranslocation and the error is read-only
            #[cfg(target_os = "macos")]
            {
                if is_app_translocation_path(uv_folder) && error_msg.contains("Read-only") {
                    return Err(format!("APP_TRANSLOCATION_ERROR: {}", error_msg));
                }
            }
            
            Err(error_msg)
        }
    }
}

