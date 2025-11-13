use std::{env, process::Command};

pub fn get_current_folder() -> std::path::PathBuf {
    env::current_exe()
        .ok()
        .unwrap()
        .parent()
        .unwrap()
        .to_path_buf()
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

pub fn find_cpython_folder(uv_folder: &std::path::Path) -> String {
    let entries =
        std::fs::read_dir(uv_folder).expect("Failed to read uv folder for cpython lookup");

    for entry in entries {
        let entry = entry.expect("Failed to read entry in uv folder for cpython lookup");
        let file_name = entry.file_name();
        let file_name_str = file_name.to_string_lossy();

        if file_name_str.starts_with("cpython-") && entry.path().is_dir() {
            return file_name_str.to_string();
        }
    }

    panic!("Failed to find cpython folder in uv folder");
}

pub fn patching_pyvenv_cfg(uv_folder: &std::path::Path, cpython_folder: &str) {
    let pyvenv_cfg_path = uv_folder.join(".venv").join("pyvenv.cfg");
    println!("Patching pyvenv.cfg at {:?}", pyvenv_cfg_path);

    let content =
        std::fs::read_to_string(&pyvenv_cfg_path).expect("Failed to read pyvenv.cfg for patching");

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

    std::fs::write(&pyvenv_cfg_path, new_content).expect("Failed to write patched pyenv.cfg");
}

