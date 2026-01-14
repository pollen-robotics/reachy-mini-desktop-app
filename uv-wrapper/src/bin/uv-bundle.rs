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

    /// Source for reachy-mini package: 'pypi' (default) or a GitHub branch name (e.g., 'develop', 'main')
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
    
    // On Windows, download uv directly (the install.ps1 script has issues with Get-ExecutionPolicy on CI)
    // IMPORTANT: Use curl.exe (not curl which is a PowerShell alias for Invoke-WebRequest)
    #[cfg(target_os = "windows")]
    {
        // Download uv zip from GitHub releases using curl.exe (the real curl, not the PowerShell alias)
        run_command("curl.exe -L -o uv.zip https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-pc-windows-msvc.zip")
            .expect("Failed to download uv");
        
        // Extract the zip (PowerShell's Expand-Archive)
        run_command("Expand-Archive -Path uv.zip -DestinationPath . -Force")
            .expect("Failed to extract uv");
        
        // Clean up zip file
        run_command("Remove-Item uv.zip -Force")
            .expect("Failed to remove uv.zip");
        
        println!("✅ uv installed successfully on Windows");
    }

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
        
        // Replace reachy-mini with GitHub version if a branch is specified (not "pypi")
        let is_github_source = args.reachy_mini_source != "pypi";
        if is_github_source {
            let branch = &args.reachy_mini_source;
            let github_url = format!("git+https://github.com/pollen-robotics/reachy_mini.git@{}", branch);
            deps = deps
                .iter()
                .map(|dep| {
                    // Replace reachy-mini[...] with git+https://...@<branch>[...]
                    if dep.starts_with("reachy-mini") {
                        if let Some(extras_start) = dep.find('[') {
                            // Has extras like [placo_kinematics]
                            let extras = &dep[extras_start..];
                            format!("{}{}", github_url, extras)
                        } else {
                            // No extras
                            github_url.clone()
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
            let git_lfs_skip = if is_github_source {
                "GIT_LFS_SKIP_SMUDGE=1 "
            } else {
                ""
            };
            run_command(&format!(
                "{}{}UV_PYTHON_INSTALL_DIR=. UV_WORKING_DIR=. ./uv pip install {}",
                git_lfs_skip,
                if cfg!(target_os = "macos") { "MACOSX_DEPLOYMENT_TARGET=10.15 " } else { "" },
                deps_str
            ))
            .expect("Failed to install dependencies");
        }
        #[cfg(target_os = "windows")]
        {
            // For GitHub installs, configure git to skip LFS smudge to avoid errors with missing LFS files
            let git_lfs_skip = if is_github_source {
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

