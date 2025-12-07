/// Module pour gérer les permissions cross-platform (caméra, micro, etc.)
/// Utilise directement les APIs système sans dépendre du plugin tauri-plugin-macos-permissions
/// 
/// Pour macOS : Utilise AVFoundation directement via objc
/// Pour Windows/Linux : Ouvre les paramètres système ou retourne des valeurs par défaut

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
pub fn request_all_permissions() {
    // No-op on non-macOS platforms
    println!("ℹ️  Permission requests are only needed on macOS");
}


/// Open System Settings to Privacy & Security > Camera
#[tauri::command]
#[cfg(target_os = "macos")]
pub fn open_camera_settings() -> Result<(), String> {
    use std::process::Command;
    
    // Open System Settings to Privacy & Security > Camera
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

/// Open System Settings to Privacy & Security > Microphone
#[tauri::command]
#[cfg(target_os = "macos")]
pub fn open_microphone_settings() -> Result<(), String> {
    use std::process::Command;
    
    // Open System Settings to Privacy & Security > Microphone
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


/// Check camera permission status (macOS only, using AVFoundation directly)
#[tauri::command]
#[cfg(target_os = "macos")]
pub fn check_camera_permission() -> Result<bool, String> {
    use objc::{msg_send, sel, sel_impl};
    use objc::runtime::{Object, Class};
    
    unsafe {
        // Import AVFoundation classes
        let av_capture_device_class = Class::get("AVCaptureDevice").ok_or_else(|| {
            "AVCaptureDevice class not found".to_string()
        })?;
        
        // AVMediaTypeVideo is a constant NSString in AVFoundation
        // Declare it as extern (linked via build.rs)
        extern "C" {
            static AVMediaTypeVideo: *mut Object;
        }
        
        let status: i32 = msg_send![av_capture_device_class, authorizationStatusForMediaType: AVMediaTypeVideo];
        
        // AVAuthorizationStatusAuthorized = 3
        Ok(status == 3)
    }
}

/// Request camera permission (macOS only, using AVFoundation directly)
#[tauri::command]
#[cfg(target_os = "macos")]
pub async fn request_camera_permission() -> Result<Option<bool>, String> {
    use objc::{msg_send, sel, sel_impl};
    use objc::runtime::{Object, Class};
    use block::ConcreteBlock;
    use std::sync::mpsc;
    
    unsafe {
        // Import AVFoundation classes
        let av_capture_device_class = Class::get("AVCaptureDevice").ok_or_else(|| {
            "AVCaptureDevice class not found".to_string()
        })?;
        
        // AVMediaTypeVideo constant from AVFoundation
        extern "C" {
            static AVMediaTypeVideo: *mut Object;
        }
        let media_type = AVMediaTypeVideo;
        
        // Check current status first
        let current_status: i32 = msg_send![av_capture_device_class, authorizationStatusForMediaType: media_type];
        
        // AVAuthorizationStatusAuthorized = 3
        if current_status == 3 {
            return Ok(Some(true));
        }
        
        // AVAuthorizationStatusDenied = 1, AVAuthorizationStatusRestricted = 2
        // If already denied, return false
        if current_status == 1 || current_status == 2 {
            return Ok(Some(false));
        }
        
        // AVAuthorizationStatusNotDetermined = 0 - request permission
        // Use a channel to wait for the async completion
        let (tx, rx) = mpsc::channel();
        
        // Use Arc to safely share the sender across the block boundary
        use std::sync::Arc;
        let tx_arc = Arc::new(tx);
        let tx_clone = Arc::clone(&tx_arc);
        
        // Create block using block crate
        // The block will be retained by Objective-C runtime and released when done
        let block = ConcreteBlock::new(move |granted: bool| {
            let _ = tx_clone.send(granted);
        });
        let block = block.copy();
        
        // Request access
        // Note: The block is copied by Objective-C, so it will be released automatically
        let _: () = msg_send![av_capture_device_class, requestAccessForMediaType: media_type completionHandler: &*block];
        
        // Wait for response (with timeout)
        match rx.recv_timeout(std::time::Duration::from_secs(30)) {
            Ok(granted) => Ok(Some(granted)),
            Err(_) => {
                // Timeout or error - return None to indicate popup was shown
                Ok(None)
            }
        }
    }
}

/// Check microphone permission status (macOS only, using AVFoundation directly)
#[tauri::command]
#[cfg(target_os = "macos")]
pub fn check_microphone_permission() -> Result<bool, String> {
    use objc::{msg_send, sel, sel_impl};
    use objc::runtime::{Object, Class};
    
    unsafe {
        // Import AVFoundation classes
        let av_capture_device_class = Class::get("AVCaptureDevice").ok_or_else(|| {
            "AVCaptureDevice class not found".to_string()
        })?;
        
        // AVMediaTypeAudio constant from AVFoundation
        extern "C" {
            static AVMediaTypeAudio: *mut Object;
        }
        
        let status: i32 = msg_send![av_capture_device_class, authorizationStatusForMediaType: AVMediaTypeAudio];
        
        // AVAuthorizationStatusAuthorized = 3
        Ok(status == 3)
    }
}

/// Request microphone permission (macOS only, using AVFoundation directly)
#[tauri::command]
#[cfg(target_os = "macos")]
pub async fn request_microphone_permission() -> Result<Option<bool>, String> {
    use objc::{msg_send, sel, sel_impl};
    use objc::runtime::{Object, Class};
    use block::ConcreteBlock;
    use std::sync::mpsc;
    
    unsafe {
        // Import AVFoundation classes
        let av_capture_device_class = Class::get("AVCaptureDevice").ok_or_else(|| {
            "AVCaptureDevice class not found".to_string()
        })?;
        
        // AVMediaTypeAudio constant from AVFoundation
        extern "C" {
            static AVMediaTypeAudio: *mut Object;
        }
        let media_type = AVMediaTypeAudio;
        
        // Check current status first
        let current_status: i32 = msg_send![av_capture_device_class, authorizationStatusForMediaType: media_type];
        
        // AVAuthorizationStatusAuthorized = 3
        if current_status == 3 {
            return Ok(Some(true));
        }
        
        // AVAuthorizationStatusDenied = 1, AVAuthorizationStatusRestricted = 2
        // If already denied, return false
        if current_status == 1 || current_status == 2 {
            return Ok(Some(false));
        }
        
        // AVAuthorizationStatusNotDetermined = 0 - request permission
        // Use a channel to wait for the async completion
        let (tx, rx) = mpsc::channel();
        
        // Use Arc to safely share the sender across the block boundary
        use std::sync::Arc;
        let tx_arc = Arc::new(tx);
        let tx_clone = Arc::clone(&tx_arc);
        
        // Create block using block crate
        // The block will be retained by Objective-C runtime and released when done
        let block = ConcreteBlock::new(move |granted: bool| {
            let _ = tx_clone.send(granted);
        });
        let block = block.copy();
        
        // Request access
        // Note: The block is copied by Objective-C, so it will be released automatically
        let _: () = msg_send![av_capture_device_class, requestAccessForMediaType: media_type completionHandler: &*block];
        
        // Wait for response (with timeout)
        match rx.recv_timeout(std::time::Duration::from_secs(30)) {
            Ok(granted) => Ok(Some(granted)),
            Err(_) => {
                // Timeout or error - return None to indicate popup was shown
                Ok(None)
            }
        }
    }
}

// Non-macOS implementations (stubs for cross-platform compatibility)
// On Windows/Linux, permissions are handled automatically by the OS
// Return true to indicate permissions are "granted" (not needed)
#[tauri::command]
#[cfg(not(target_os = "macos"))]
pub fn check_camera_permission() -> Result<bool, String> {
    // On Windows/Linux, permissions are handled automatically
    // Return true so the app doesn't block waiting for permissions
    Ok(true)
}

#[tauri::command]
#[cfg(not(target_os = "macos"))]
pub async fn request_camera_permission() -> Result<Option<bool>, String> {
    // On Windows/Linux, permissions are handled automatically
    // Return Some(true) to indicate "granted" (not needed)
    Ok(Some(true))
}

#[tauri::command]
#[cfg(not(target_os = "macos"))]
pub fn check_microphone_permission() -> Result<bool, String> {
    // On Windows/Linux, permissions are handled automatically
    // Return true so the app doesn't block waiting for permissions
    Ok(true)
}

#[tauri::command]
#[cfg(not(target_os = "macos"))]
pub async fn request_microphone_permission() -> Result<Option<bool>, String> {
    // On Windows/Linux, permissions are handled automatically
    // Return Some(true) to indicate "granted" (not needed)
    Ok(Some(true))
}

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
