use std::env;

use uv_wrapper::{find_cpython_folder, lookup_bin_folder, patching_pyvenv_cfg};

const POSSIBLE_BIN_FOLDER: &[&str] = &[".", "../Resources"];

fn main() {
    let args = env::args().skip(1).collect::<Vec<String>>();

    let uv_exe = if cfg!(target_os = "windows") {
        "uv.exe"
    } else {
        "uv"
    };
    let uv_folder = lookup_bin_folder(POSSIBLE_BIN_FOLDER, uv_exe)
        .expect("Failed to find uv in possible locations");

    env::set_current_dir(&uv_folder).expect("Failed to change working directory");

    println!("Running from {:?}", uv_folder);

    let cpython_folder = find_cpython_folder(&uv_folder);
    patching_pyvenv_cfg(&uv_folder, &cpython_folder);

    let mut binding = std::process::Command::new(uv_exe);
    let cmd = binding
        .env("UV_WORKING_DIR", ".")
        .env("UV_PYTHON_INSTALL_DIR", ".")
        .args(args);
    println!("Spawning child process: {:?}", cmd);
    let mut child = cmd.spawn().expect("Failed to spawn python process");

    // Wait for child or signal
    loop {
        match child.try_wait() {
            Ok(Some(_status)) => break, // Child exited
            Ok(None) => std::thread::sleep(std::time::Duration::from_millis(100)),
            Err(e) => {
                let _ = child.kill();
                panic!("Error waiting for child: {}", e);
            }
        }
    }
}

