/// Module for managing cross-platform permissions (camera, microphone, etc.)
/// 
/// Note: Camera/microphone permissions are managed by tauri-plugin-macos-permissions
/// This module only provides functions to open System Settings
/// and the initialization function at startup.

/// Log configured permissions at app startup (macOS only)
#[cfg(target_os = "macos")]
pub fn request_all_permissions() {
    println!("🔐 macOS permissions configured:");
    println!("   📷 Camera: NSCameraUsageDescription declared in Info.plist");
    println!("   🎤 Microphone: NSMicrophoneUsageDescription declared in Info.plist");
    println!("   📁 Filesystem: Entitlements configured");
    println!("   🔌 USB: Entitlements configured");
    println!("");
    println!("✅ Permissions will be requested automatically when needed:");
    println!("   - Camera/microphone: macOS will show dialog when first accessed by apps");
    println!("   - Filesystem/USB: Already granted via entitlements");
    println!("");
    println!("ℹ️  Note: Permissions granted to the main app will propagate to child processes");
    println!("   (Python daemon and its apps)");
    println!("");
    println!("ℹ️  Note: App will appear in System Settings > Privacy after first permission request");
}

#[cfg(not(target_os = "macos"))]
#[allow(dead_code)]
pub fn request_all_permissions() {
    // No-op on non-macOS platforms
    println!("ℹ️  Permission requests are only needed on macOS");
}

/// Open System Settings to Privacy & Security > Camera (macOS)
#[tauri::command]
#[cfg(target_os = "macos")]
pub fn open_camera_settings() -> Result<(), String> {
    use std::process::Command;
    
    let output = Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Camera")
        .output()
        .map_err(|e| format!("Failed to open System Settings: {}", e))?;
    
    if !output.status.success() {
        return Err(format!("Failed to open System Settings: {}", 
            String::from_utf8_lossy(&output.stderr)));
    }
    
    Ok(())
}

/// Open System Settings to Privacy & Security > Microphone (macOS)
#[tauri::command]
#[cfg(target_os = "macos")]
pub fn open_microphone_settings() -> Result<(), String> {
    use std::process::Command;
    
    let output = Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone")
        .output()
        .map_err(|e| format!("Failed to open System Settings: {}", e))?;
    
    if !output.status.success() {
        return Err(format!("Failed to open System Settings: {}", 
            String::from_utf8_lossy(&output.stderr)));
    }
    
    Ok(())
}

/// Open System Settings to Network/WiFi (macOS)
#[tauri::command]
#[cfg(target_os = "macos")]
pub fn open_wifi_settings() -> Result<(), String> {
    use std::process::Command;
    
    // Try the new macOS 13+ Network Settings first
    let output = Command::new("open")
        .arg("x-apple.systempreferences:com.apple.Network-Settings.extension")
        .output()
        .map_err(|e| format!("Failed to open System Settings: {}", e))?;
    
    if !output.status.success() {
        // Fallback to legacy Network preferences (macOS 12 and earlier)
        let fallback = Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.network")
            .output()
            .map_err(|e| format!("Failed to open System Settings: {}", e))?;
        
        if !fallback.status.success() {
            return Err(format!("Failed to open System Settings: {}", 
                String::from_utf8_lossy(&fallback.stderr)));
        }
    }
    
    Ok(())
}

/// Open System Settings to Privacy & Security > Files and Folders (macOS)
#[tauri::command]
#[cfg(target_os = "macos")]
pub fn open_files_settings() -> Result<(), String> {
    use std::process::Command;
    
    let output = Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_FilesAndFolders")
        .output()
        .map_err(|e| format!("Failed to open System Settings: {}", e))?;
    
    if !output.status.success() {
        return Err(format!("Failed to open System Settings: {}", 
            String::from_utf8_lossy(&output.stderr)));
    }
    
    Ok(())
}

// ============================================================================
// Windows Implementation
// ============================================================================

#[tauri::command]
#[cfg(target_os = "windows")]
pub fn open_camera_settings() -> Result<(), String> {
    use std::process::Command;
    // Open Windows Settings > Privacy > Camera
    Command::new("cmd")
        .args(["/C", "start", "ms-settings:privacy-webcam"])
        .spawn()
        .map_err(|e| format!("Failed to open Settings: {}", e))?;
    Ok(())
}

#[tauri::command]
#[cfg(target_os = "windows")]
pub fn open_microphone_settings() -> Result<(), String> {
    use std::process::Command;
    // Open Windows Settings > Privacy > Microphone
    Command::new("cmd")
        .args(["/C", "start", "ms-settings:privacy-microphone"])
        .spawn()
        .map_err(|e| format!("Failed to open Settings: {}", e))?;
    Ok(())
}

#[tauri::command]
#[cfg(target_os = "windows")]
pub fn open_wifi_settings() -> Result<(), String> {
    use std::process::Command;
    // Open Windows Settings > Network & Internet > Wi-Fi
    Command::new("cmd")
        .args(["/C", "start", "ms-settings:network-wifi"])
        .spawn()
        .map_err(|e| format!("Failed to open Settings: {}", e))?;
    Ok(())
}

#[tauri::command]
#[cfg(target_os = "windows")]
pub fn open_files_settings() -> Result<(), String> {
    use std::process::Command;
    // Open Windows Settings > Privacy > File System
    Command::new("cmd")
        .args(["/C", "start", "ms-settings:privacy-broadfilesystemaccess"])
        .spawn()
        .map_err(|e| format!("Failed to open Settings: {}", e))?;
    Ok(())
}

// ============================================================================
// Linux Implementation
// ============================================================================

#[tauri::command]
#[cfg(target_os = "linux")]
pub fn open_camera_settings() -> Result<(), String> {
    // Linux doesn't have a centralized camera settings
    // Best effort: open GNOME Settings if available
    use std::process::Command;
    let _ = Command::new("gnome-control-center")
        .arg("privacy")
        .spawn();
    Ok(())
}

#[tauri::command]
#[cfg(target_os = "linux")]
pub fn open_microphone_settings() -> Result<(), String> {
    use std::process::Command;
    // Try GNOME Sound settings
    let _ = Command::new("gnome-control-center")
        .arg("sound")
        .spawn();
    Ok(())
}

#[tauri::command]
#[cfg(target_os = "linux")]
pub fn open_wifi_settings() -> Result<(), String> {
    use std::process::Command;
    // Try GNOME Network settings first, fallback to nm-connection-editor
    if Command::new("gnome-control-center")
        .arg("wifi")
        .spawn()
        .is_err()
    {
        let _ = Command::new("nm-connection-editor").spawn();
    }
    Ok(())
}

#[tauri::command]
#[cfg(target_os = "linux")]
pub fn open_files_settings() -> Result<(), String> {
    // Linux doesn't have centralized file access permissions
    // Best effort: open file manager or GNOME privacy settings
    use std::process::Command;
    let _ = Command::new("gnome-control-center")
        .arg("privacy")
        .spawn();
    Ok(())
}

// ============================================================================
// Fallback for other platforms (no-op)
// ============================================================================

#[tauri::command]
#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
pub fn open_camera_settings() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
pub fn open_microphone_settings() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
pub fn open_wifi_settings() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
pub fn open_files_settings() -> Result<(), String> {
    Ok(())
}
