/// Module pour gérer les permissions cross-platform (caméra, micro, etc.)
/// 
/// Note: Les permissions camera/microphone sont gérées par le plugin tauri-plugin-macos-permissions
/// Ce module fournit uniquement les fonctions pour ouvrir les Réglages Système
/// et la fonction d'initialisation au démarrage.

/// Log les permissions configurées au démarrage de l'app (macOS uniquement)
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

// Non-macOS stubs (no-op)
#[tauri::command]
#[cfg(not(target_os = "macos"))]
pub fn open_camera_settings() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
#[cfg(not(target_os = "macos"))]
pub fn open_microphone_settings() -> Result<(), String> {
    Ok(())
}
