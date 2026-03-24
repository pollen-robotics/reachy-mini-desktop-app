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

    /// Dependencies to install in the apps venv (apps_venv)
    #[arg(long, value_delimiter = ' ', num_args = 1..)]
    apps_dependencies: Vec<String>,

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

    // Replace reachy-mini with GitHub version if a branch is specified (not "pypi")
    let is_github_source = args.reachy_mini_source != "pypi";
    let github_url = if is_github_source {
        Some(format!(
            "git+https://github.com/pollen-robotics/reachy_mini.git@{}",
            args.reachy_mini_source
        ))
    } else {
        None
    };

    // Creating the daemon venv (.venv) and installing dependencies
    create_venv_and_install(".venv", args.dependencies, &github_url);

    #[cfg(not(target_os = "windows"))]
    prewarm_imports(".venv");

    // Creating the apps venv (apps_venv) and installing dependencies
    if !args.apps_dependencies.is_empty() {
        create_venv_and_install("apps_venv", args.apps_dependencies, &github_url);

        #[cfg(not(target_os = "windows"))]
        prewarm_imports("apps_venv");
    }
}

#[cfg(not(target_os = "windows"))]
fn prewarm_imports(venv_name: &str) {
    // Pre-warm GStreamer registry cache (stored in <venv>/.cache/gstreamer-1.0/).
    // Without this, first launch scans 256 plugins which takes 2+ minutes.
    // GST_REGISTRY_FORK=no prevents the forked scanner (even slower).
    println!("🔥 Pre-warming GStreamer registry cache for {}...", venv_name);
    run_command(&format!(
        "GST_REGISTRY_FORK=no {}/bin/python3 -c \"import gi; gi.require_version('Gst', '1.0'); from gi.repository import Gst; Gst.init([])\" 2>/dev/null || true",
        venv_name
    )).ok();

    // Pre-warm reachy_mini import to trigger any first-import setup (bytecode caching, etc.)
    println!("🔥 Pre-warming reachy_mini import for {}...", venv_name);
    run_command(&format!(
        "{}/bin/python3 -c \"import reachy_mini\" 2>/dev/null || true",
        venv_name
    )).ok();
}

fn resolve_deps(deps: Vec<String>, github_url: &Option<String>) -> Vec<String> {
    match github_url {
        Some(url) => deps
            .into_iter()
            .map(|dep| {
                if dep.starts_with("reachy-mini") {
                    if let Some(extras_start) = dep.find('[') {
                        let extras = &dep[extras_start..];
                        format!("{}{}", url, extras)
                    } else {
                        url.clone()
                    }
                } else {
                    dep
                }
            })
            .collect(),
        None => deps,
    }
}

fn create_venv_and_install(venv_name: &str, deps: Vec<String>, github_url: &Option<String>) {
    let is_github_source = github_url.is_some();

    // Create the venv
    println!("📦 Creating venv: {}", venv_name);
    #[cfg(not(target_os = "windows"))]
    run_command(&format!(
        "UV_PYTHON_INSTALL_DIR=. UV_WORKING_DIR=. ./uv venv {}",
        venv_name
    ))
    .expect(&format!("Failed to create virtual environment: {}", venv_name));
    #[cfg(target_os = "windows")]
    run_command(&format!(
        "$env:UV_PYTHON_INSTALL_DIR = '.'; $env:UV_WORKING_DIR = '.'; ./uv.exe venv {}",
        venv_name
    ))
    .expect(&format!("Failed to create virtual environment: {}", venv_name));

    // Install dependencies
    if !deps.is_empty() {
        let resolved = resolve_deps(deps, github_url);
        let deps_str = resolved.join(" ");

        #[cfg(not(target_os = "windows"))]
        {
            let git_lfs_skip = if is_github_source {
                "GIT_LFS_SKIP_SMUDGE=1 "
            } else {
                ""
            };
            run_command(&format!(
                "{}{}VIRTUAL_ENV={} UV_PYTHON_INSTALL_DIR=. UV_WORKING_DIR=. ./uv pip install --python {}/bin/python3 {}",
                git_lfs_skip,
                if cfg!(target_os = "macos") {
                    "MACOSX_DEPLOYMENT_TARGET=10.15 "
                } else {
                    ""
                },
                venv_name,
                venv_name,
                deps_str
            ))
            .expect(&format!("Failed to install dependencies in {}", venv_name));
        }
        #[cfg(target_os = "windows")]
        {
            let git_lfs_skip = if is_github_source {
                "$env:GIT_LFS_SKIP_SMUDGE='1'; "
            } else {
                ""
            };
            run_command(&format!(
                "{}$env:VIRTUAL_ENV='{}'; $env:UV_PYTHON_INSTALL_DIR = '.'; $env:UV_WORKING_DIR = '.'; ./uv.exe pip install --python {}\\Scripts\\python.exe {}",
                git_lfs_skip, venv_name, venv_name, deps_str
            ))
            .expect(&format!("Failed to install dependencies in {}", venv_name));
        }
    }
}
