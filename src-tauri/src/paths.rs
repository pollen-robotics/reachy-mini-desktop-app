use std::path::PathBuf;

/// Returns the platform-specific writable data directory for the app.
/// This is where uv-trampoline creates venvs at first run.
///
/// - macOS: ~/Library/Application Support/com.pollen-robotics.reachy-mini/
/// - Windows: %LOCALAPPDATA%\Reachy Mini Control\
/// - Linux: $XDG_DATA_HOME/reachy-mini-control/ or ~/.local/share/reachy-mini-control/
pub fn get_data_dir() -> Result<PathBuf, String> {
    #[cfg(target_os = "macos")]
    {
        std::env::var("HOME")
            .map(|home| {
                PathBuf::from(home)
                    .join("Library")
                    .join("Application Support")
                    .join("com.pollen-robotics.reachy-mini")
            })
            .map_err(|_| "HOME not set".to_string())
    }

    #[cfg(target_os = "windows")]
    {
        std::env::var("LOCALAPPDATA")
            .map(|local| PathBuf::from(local).join("Reachy Mini Control"))
            .map_err(|_| "LOCALAPPDATA not set".to_string())
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(xdg) = std::env::var("XDG_DATA_HOME") {
            return Ok(PathBuf::from(xdg).join("reachy-mini-control"));
        }
        std::env::var("HOME")
            .map(|home| PathBuf::from(home).join(".local/share/reachy-mini-control"))
            .map_err(|_| "HOME not set".to_string())
    }
}

/// Path for the external browser camera viewer HTML page.
///
/// On Linux, Snap/Flatpak browsers often cannot read `/tmp` or hidden app-data
/// directories. Use a visible location under the user's home directory instead.
pub fn external_camera_viewer_path() -> Result<PathBuf, String> {
    #[cfg(target_os = "linux")]
    {
        if let Some(downloads) = dirs::download_dir() {
            return Ok(downloads.join("reachy-mini-camera-viewer.html"));
        }

        if let Some(home) = dirs::home_dir() {
            return Ok(home.join("reachy-mini-camera-viewer.html"));
        }
    }

    Ok(std::env::temp_dir().join("reachy-mini-camera-viewer.html"))
}
