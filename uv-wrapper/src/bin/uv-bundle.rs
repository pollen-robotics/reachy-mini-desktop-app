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

    /// Source for reachy-mini package: 'pypi' (default) or any GitHub branch name (e.g., 'develop', 'main', 'my_branch')
    #[arg(long, default_value = "pypi")]
    reachy_mini_source: String,
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
        let mut deps = args.dependencies;
        
        // Replace reachy-mini with GitHub version if non-pypi source is requested
        if args.reachy_mini_source != "pypi" {
            let github_url = format!("git+https://github.com/pollen-robotics/reachy_mini.git@{}", args.reachy_mini_source);
            deps = deps
                .iter()
                .map(|dep| {
                    // Replace reachy-mini[...] with git+https://...@develop[...]
                    if dep.starts_with("reachy-mini") {
                        if let Some(extras_start) = dep.find('[') {
                            // Has extras like [placo_kinematics]
                            let extras = &dep[extras_start..];
                            format!("{}{}", github_url, extras)
                        } else {
                            // No extras
                            github_url.to_string()
                        }
                    } else {
                        dep.clone()
                    }
                })
                .collect();
        }
        
        let deps_str = deps.join(" ");
        #[cfg(not(target_os = "windows"))]
        {
            // For GitHub installs, configure git to skip LFS smudge to avoid errors with missing LFS files
            let git_lfs_skip = if args.reachy_mini_source != "pypi" {
                "GIT_LFS_SKIP_SMUDGE=1 "
            } else {
                ""
            };
            run_command(&format!(
                "{}UV_PYTHON_INSTALL_DIR=. UV_WORKING_DIR=. ./uv pip install {}",
                git_lfs_skip, deps_str
            ))
            .expect("Failed to install dependencies");
        }
        #[cfg(target_os = "windows")]
        {
            // For GitHub installs, configure git to skip LFS smudge to avoid errors with missing LFS files
            let git_lfs_skip = if args.reachy_mini_source != "pypi" {
                "$env:GIT_LFS_SKIP_SMUDGE='1'; "
            } else {
                ""
            };
            run_command(&format!(
                "{}$env:UV_PYTHON_INSTALL_DIR = '.'; $env:UV_WORKING_DIR = '.'; ./uv.exe pip install {}",
                git_lfs_skip, deps_str
            ))
            .expect("Failed to install dependencies");
        }
    }
}

