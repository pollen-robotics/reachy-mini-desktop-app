use clap::Parser;
use uv_wrapper::run_command;

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    /// Installation directory
    #[arg(short, long)]
    install_dir: std::path::PathBuf,

    /// Python version to install
    #[arg(short, long)]
    python_version: String,

    /// Additional dependencies to install
    #[arg(short, long, value_delimiter = ' ', num_args = 1..)]
    dependencies: Vec<String>,
}

fn main() {
    let args = Args::parse();

    let install_dir = args.install_dir.clone();
    let python_version = args.python_version.clone();

    // Changing to the installation directory
    std::env::set_current_dir(&install_dir).expect("Failed to change directory");

    // Install uv
    #[cfg(not(target_os = "windows"))]
    run_command(
        "curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=. UV_NO_MODIFY_PATH=1 sh",
    )
    .expect("Failed to install uv");
    #[cfg(target_os = "windows")]
    run_command("$env:UV_INSTALL_DIR = '.';  $env:UV_NO_MODIFY_PATH=1; irm https://astral.sh/uv/install.ps1 | iex")
        .expect("Failed to install uv");

    // Install Python using uv
    #[cfg(not(target_os = "windows"))]
    run_command(&format!(
        "UV_PYTHON_INSTALL_DIR=. ./uv python install {}",
        python_version
    ))
    .expect("Failed to install python");
    #[cfg(target_os = "windows")]
    run_command(&format!(
        "$env:UV_PYTHON_INSTALL_DIR = '.'; ./uv.exe python install {}",
        python_version
    ))
    .expect("Failed to install python");

    // Creating a venv
    #[cfg(not(target_os = "windows"))]
    run_command("UV_PYTHON_INSTALL_DIR=. UV_WORKING_DIR=. ./uv venv")
        .expect("Failed to create virtual environment");
    #[cfg(target_os = "windows")]
    run_command("$env:UV_PYTHON_INSTALL_DIR = '.'; $env:UV_WORKING_DIR = '.'; ./uv.exe venv")
        .expect("Failed to create virtual environment");

    // Installing dependencies
    if !args.dependencies.is_empty() {
        let deps = args.dependencies.join(" ");
        #[cfg(not(target_os = "windows"))]
        run_command(&format!(
            "UV_PYTHON_INSTALL_DIR=. UV_WORKING_DIR=. ./uv pip install {}",
            deps
        ))
        .expect("Failed to install dependencies");
        #[cfg(target_os = "windows")]
        run_command(&format!(
            "$env:UV_PYTHON_INSTALL_DIR = '.'; $env:UV_WORKING_DIR = '.'; ./uv.exe pip install {}",
            deps
        ))
        .expect("Failed to install dependencies");
    }
}

