/// Update module for managing daemon updates
/// 
/// This module provides functionality to check for and install daemon updates
/// independently of the Python daemon's update routes. It directly queries PyPI
/// and manages the local venv using pip.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, State};

use crate::daemon::DaemonState;

// ============================================================================
// TYPES
// ============================================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DaemonUpdateInfo {
    pub current_version: String,
    pub available_version: String,
    pub is_available: bool,
}

#[derive(Debug, Deserialize)]
struct PyPiResponse {
    info: PackageInfo,
    releases: HashMap<String, Vec<serde_json::Value>>,
}

#[derive(Debug, Deserialize)]
struct PackageInfo {
    version: String,
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/// Get the path to the local venv SOURCE directory
/// This is the directory that contains the .venv that uv-trampoline will copy
/// - In dev: src-tauri/binaries/.venv
/// - In production: App.app/Contents/Resources/binaries/.venv
fn get_local_venv_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    {
        // On Windows, the source venv is in Program Files (MSI install)
        // or in the dev environment
        let program_files = std::env::var("ProgramFiles")
            .unwrap_or_else(|_| "C:\\Program Files".to_string());
        let program_files_dir = PathBuf::from(program_files)
            .join("Reachy Mini Control")
            .join("binaries");
        
        if program_files_dir.join(".venv").exists() {
            println!("[update] ✅ Using Program Files venv: {:?}", program_files_dir);
            return Ok(program_files_dir);
        }
        
        // Try resource_dir for dev
        let resource_dir = app_handle
            .path()
            .resource_dir()
            .map_err(|e| format!("Failed to get resource dir: {}", e))?;
        let binaries_dir = resource_dir.join("binaries");
        
        if binaries_dir.join(".venv").exists() {
            println!("[update] ✅ Using dev venv: {:?}", binaries_dir);
            return Ok(binaries_dir);
        }
        
        Err(format!("Venv not found. Checked {:?} and {:?}", program_files_dir, binaries_dir))
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        // On macOS/Linux, first try to get the executable's directory
        // This will help us determine if we're in dev or prod
        let exe_path = std::env::current_exe()
            .map_err(|e| format!("Failed to get exe path: {}", e))?;
        let exe_dir = exe_path
            .parent()
            .ok_or_else(|| "Failed to get exe parent directory".to_string())?;
        
        println!("[update] Executable directory: {:?}", exe_dir);
        
        // In development, the executable is in target/debug/
        // The source venv is in src-tauri/binaries/.venv
        // We need to go up to the tauri-app root, then into src-tauri/binaries/
        if exe_dir.ends_with("target/debug") || exe_dir.ends_with("target\\debug") {
            // Dev mode - go to src-tauri/binaries/
            let src_tauri_dir = exe_dir
                .parent() // target/
                .and_then(|p| p.parent()) // tauri-app/src-tauri/ OR tauri-app/ depending on structure
                .ok_or_else(|| "Failed to navigate to src-tauri directory".to_string())?;
            
            // Check if we're already in src-tauri or need to go into it
            let binaries_dir = if src_tauri_dir.ends_with("src-tauri") {
                src_tauri_dir.join("binaries")
            } else {
                src_tauri_dir.join("src-tauri").join("binaries")
            };
            
            if binaries_dir.join(".venv").exists() {
                println!("[update] ✅ Using dev venv: {:?}", binaries_dir);
                return Ok(binaries_dir);
            } else {
                return Err(format!(
                    "Dev venv not found at {:?}",
                    binaries_dir.join(".venv")
                ));
            }
        }
        
        // In production (macOS app bundle), the executable is in:
        // App.app/Contents/MacOS/
        // The resources are in App.app/Contents/Resources/
        // The venv is in App.app/Contents/Resources/binaries/.venv
        #[cfg(target_os = "macos")]
        {
            if let Some(macos_dir) = exe_dir.parent() { // Contents/
                let resources_dir = macos_dir.join("Resources").join("binaries");
                if resources_dir.join(".venv").exists() {
                    println!("[update] ✅ Using production venv: {:?}", resources_dir);
                    return Ok(resources_dir);
                }
            }
        }
        
        // Fallback: Use resource_dir from Tauri API
        let resource_dir = app_handle
            .path()
            .resource_dir()
            .map_err(|e| format!("Failed to get resource dir: {}", e))?;
        let binaries_dir = resource_dir.join("binaries");
        
        if binaries_dir.join(".venv").exists() {
            println!("[update] ✅ Using resource_dir venv: {:?}", binaries_dir);
            Ok(binaries_dir)
        } else {
            Err(format!(
                "Venv not found. Checked exe_dir, macOS Resources, and resource_dir: {:?}",
                binaries_dir.join(".venv")
            ))
        }
    }
}

/// Get the currently installed version of reachy-mini from the local venv
fn get_local_daemon_version(venv_path: &Path) -> Result<String, String> {
    // Try to read version from dist-info METADATA file
    // Path: .venv/lib/python3.12/site-packages/reachy_mini-X.Y.Z.dist-info/METADATA
    
    #[cfg(target_os = "windows")]
    let site_packages = venv_path.join(".venv").join("Lib").join("site-packages");
    
    #[cfg(not(target_os = "windows"))]
    let site_packages = venv_path.join(".venv").join("lib").join("python3.12").join("site-packages");
    
    if !site_packages.exists() {
        return Err(format!("Site-packages not found at {:?}", site_packages));
    }
    
    // Find reachy_mini-*.dist-info directory
    let entries = std::fs::read_dir(&site_packages)
        .map_err(|e| format!("Failed to read site-packages: {}", e))?;
    
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let name = entry.file_name().to_string_lossy().to_string();
        
        if name.starts_with("reachy_mini-") && name.ends_with(".dist-info") {
            let metadata_path = entry.path().join("METADATA");
            if metadata_path.exists() {
                let content = std::fs::read_to_string(&metadata_path)
                    .map_err(|e| format!("Failed to read METADATA: {}", e))?;
                
                // Parse METADATA file for "Version: X.Y.Z"
                for line in content.lines() {
                    if line.starts_with("Version: ") {
                        return Ok(line.replace("Version: ", "").trim().to_string());
                    }
                }
            }
        }
    }
    
    Err("reachy-mini version not found in venv".to_string())
}

/// Get the latest version available on PyPI
async fn get_pypi_version(package_name: &str, pre_release: bool) -> Result<String, String> {
    let url = format!("https://pypi.org/pypi/{}/json", package_name);
    
    println!("[update] Fetching PyPI info from: {}", url);
    
    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("Failed to fetch PyPI: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("PyPI returned status: {}", response.status()));
    }
    
    let data: PyPiResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse PyPI JSON: {}", e))?;
    
    if pre_release {
        // Get all versions and sort them
        let mut versions: Vec<String> = data.releases.keys().cloned().collect();
        versions.sort_by(|a, b| compare_semver(a, b));
        
        if let Some(latest) = versions.last() {
            println!("[update] Latest version (including pre-release): {}", latest);
            Ok(latest.clone())
        } else {
            Err("No versions found on PyPI".to_string())
        }
    } else {
        // Return the stable version from info
        println!("[update] Latest stable version: {}", data.info.version);
        Ok(data.info.version)
    }
}

/// Parse a version string, handling PyPI pre-release formats (e.g., "1.2.5rc1" -> "1.2.5-rc.1")
fn parse_version(version_str: &str) -> Result<semver::Version, String> {
    // First, try standard semver parsing
    if let Ok(ver) = semver::Version::parse(version_str) {
        return Ok(ver);
    }
    
    // If that fails, try to handle PyPI pre-release format: "1.2.5rc1"
    let parts: Vec<&str> = version_str.split('.').collect();
    if parts.len() < 3 {
        return Err(format!("Invalid version string: {}", version_str));
    }
    
    let major = parts[0];
    let minor = parts[1];
    let patch_part = parts[2];
    
    // Check for "rc" in patch part
    if patch_part.contains("rc") {
        let rc_parts: Vec<&str> = patch_part.split("rc").collect();
        if rc_parts.len() == 2 {
            let patch = rc_parts[0];
            let rc_num = rc_parts[1];
            let clean_version = format!("{}.{}.{}-rc.{}", major, minor, patch, rc_num);
            return semver::Version::parse(&clean_version)
                .map_err(|e| format!("Failed to parse cleaned version '{}': {}", clean_version, e));
        }
    }
    
    // Check for "a" (alpha) or "b" (beta) in patch part
    if patch_part.contains('a') {
        let parts: Vec<&str> = patch_part.split('a').collect();
        if parts.len() == 2 {
            let patch = parts[0];
            let alpha_num = parts[1];
            let clean_version = format!("{}.{}.{}-alpha.{}", major, minor, patch, alpha_num);
            return semver::Version::parse(&clean_version)
                .map_err(|e| format!("Failed to parse cleaned version '{}': {}", clean_version, e));
        }
    }
    
    if patch_part.contains('b') {
        let parts: Vec<&str> = patch_part.split('b').collect();
        if parts.len() == 2 {
            let patch = parts[0];
            let beta_num = parts[1];
            let clean_version = format!("{}.{}.{}-beta.{}", major, minor, patch, beta_num);
            return semver::Version::parse(&clean_version)
                .map_err(|e| format!("Failed to parse cleaned version '{}': {}", clean_version, e));
        }
    }
    
    Err(format!("Could not parse version: {}", version_str))
}

/// Compare two semver version strings
/// Returns Ordering (Less, Equal, Greater)
fn compare_semver(a: &str, b: &str) -> std::cmp::Ordering {
    // Try to parse both versions with our custom parser
    match (parse_version(a), parse_version(b)) {
        (Ok(va), Ok(vb)) => va.cmp(&vb),
        _ => {
            // Fallback to string comparison if parsing fails
            a.cmp(b)
        }
    }
}

/// Check if a new version is available
fn is_update_available(current: &str, available: &str) -> Result<bool, String> {
    let current_ver = parse_version(current)?;
    let available_ver = parse_version(available)?;
    
    Ok(available_ver > current_ver)
}

// ============================================================================
// TAURI COMMANDS
// ============================================================================

/// Check if an update is available for the daemon
#[tauri::command]
pub async fn check_daemon_update(
    app_handle: AppHandle,
    pre_release: bool,
) -> Result<DaemonUpdateInfo, String> {
    println!("[update] Checking for daemon updates (pre_release: {})", pre_release);
    
    // 1. Get local version
    let venv_path = get_local_venv_path(&app_handle)?;
    let current_version = get_local_daemon_version(&venv_path)?;
    println!("[update] Current version: {}", current_version);
    
    // 2. Get PyPI version
    let available_version = get_pypi_version("reachy-mini", pre_release).await?;
    println!("[update] Available version: {}", available_version);
    
    // 3. Compare versions
    let is_available = is_update_available(&current_version, &available_version)?;
    println!("[update] Update available: {}", is_available);
    
    Ok(DaemonUpdateInfo {
        current_version,
        available_version,
        is_available,
    })
}

/// Update the daemon to the latest version
#[tauri::command]
pub async fn update_daemon(
    app_handle: AppHandle,
    state: State<'_, DaemonState>,
    pre_release: bool,
) -> Result<String, String> {
    println!("[update] Starting daemon update (pre_release: {})", pre_release);
    
    // 1. Stop the daemon gracefully
    println!("[update] Stopping daemon...");
    crate::stop_daemon(state.clone())?;
    
    // Wait a bit for the daemon to stop completely
    tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;
    
    // 2. Get venv path and pip executable
    let venv_path = get_local_venv_path(&app_handle)?;
    
    #[cfg(target_os = "windows")]
    let pip_path = venv_path.join(".venv").join("Scripts").join("pip.exe");
    
    #[cfg(not(target_os = "windows"))]
    let pip_path = venv_path.join(".venv").join("bin").join("pip");
    
    if !pip_path.exists() {
        return Err(format!("pip not found at {:?}", pip_path));
    }
    
    println!("[update] Using pip at: {:?}", pip_path);
    
    // 3. Build pip command
    let mut args = vec!["install", "--upgrade", "reachy-mini[mujoco]"];
    if pre_release {
        args.push("--pre");
    }
    
    println!("[update] Running: {:?} {:?}", pip_path, args);
    
    // 4. Execute pip install
    let output = std::process::Command::new(&pip_path)
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to run pip: {}", e))?;
    
    // Log output
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    
    if !stdout.is_empty() {
        println!("[update] pip stdout:\n{}", stdout);
    }
    if !stderr.is_empty() {
        println!("[update] pip stderr:\n{}", stderr);
    }
    
    if !output.status.success() {
        return Err(format!(
            "pip update failed with exit code {:?}:\n{}",
            output.status.code(),
            stderr
        ));
    }
    
    println!("[update] Daemon updated successfully!");
    println!("[update] ⚠️  The updated venv will be used on next connection");
    println!("[update] ⚠️  uv-trampoline will copy the new venv when daemon starts again");
    
    // 5. DON'T restart daemon here
    // Let the user reconnect - uv-trampoline will copy the updated venv at next launch
    
    Ok("Daemon updated successfully. Reconnect to use the new version.".to_string())
}

