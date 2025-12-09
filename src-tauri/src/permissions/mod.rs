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
#[allow(dead_code)]
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
/// Uses NSString::from_str("vide") like tauri-plugin-macos-permissions
#[tauri::command]
#[cfg(target_os = "macos")]
pub fn check_camera_permission() -> Result<bool, String> {
    use objc::{msg_send, sel, sel_impl};
    use objc::runtime::{Object, Class};
    use std::ffi::CString;
    
    unsafe {
        // Import AVFoundation classes
        let av_capture_device_class = Class::get("AVCaptureDevice").ok_or_else(|| {
            "AVCaptureDevice class not found".to_string()
        })?;
        
        // Create NSString from "vide" (like tauri-plugin-macos-permissions)
        // This is more reliable than using the constant
        let ns_string_class = Class::get("NSString").ok_or_else(|| {
            "NSString class not found".to_string()
        })?;
        let c_str = CString::new("vide").map_err(|e| format!("Failed to create CString: {}", e))?;
        let media_type: *mut Object = msg_send![ns_string_class, stringWithUTF8String: c_str.as_ptr()];
        
        let status: i32 = msg_send![av_capture_device_class, authorizationStatusForMediaType: media_type];
        
        // AVAuthorizationStatusAuthorized = 3
        Ok(status == 3)
    }
}

/// Request camera permission (macOS only, using AVFoundation directly)
/// Exactly like tauri-plugin-macos-permissions: uses NSString::from_str("vide") and passes None as completionHandler
#[tauri::command]
#[cfg(target_os = "macos")]
pub async fn request_camera_permission(app_handle: tauri::AppHandle) -> Result<Option<bool>, String> {
    use objc::{msg_send, sel, sel_impl};
    use objc::runtime::{Object, Class, BOOL};
    use std::ffi::CString;
    use tauri::Emitter;
    
    // Helper to log and emit to frontend
    let log_and_emit = |message: &str| {
        eprintln!("{}", message);
        let _ = app_handle.emit("rust-log", message);
    };
    
    unsafe {
        // Import AVFoundation classes
        let av_capture_device_class = Class::get("AVCaptureDevice").ok_or_else(|| {
            "AVCaptureDevice class not found".to_string()
        })?;
        
        // Create NSString from "vide" (exactly like tauri-plugin-macos-permissions)
        let ns_string_class = Class::get("NSString").ok_or_else(|| {
            "NSString class not found".to_string()
        })?;
        let c_str = CString::new("vide").map_err(|e| format!("Failed to create CString: {}", e))?;
        let media_type: *mut Object = msg_send![ns_string_class, stringWithUTF8String: c_str.as_ptr()];
        
        // Check current status first
        let current_status: i32 = msg_send![av_capture_device_class, authorizationStatusForMediaType: media_type];
        
        let status_desc = match current_status {
            0 => "NotDetermined",
            1 => "Denied",
            2 => "Restricted",
            3 => "Authorized",
            _ => "Unknown",
        };
        
        let status_msg = format!("[Permissions] 📊 Camera status: {} ({})", current_status, status_desc);
        log_and_emit(&status_msg);
        log_and_emit("[Permissions] ℹ️  Status meanings: 0=NotDetermined (popup should show), 1=Denied, 2=Restricted, 3=Authorized");
        
        // AVAuthorizationStatusAuthorized = 3
        if current_status == 3 {
            log_and_emit("[Permissions] ✅ Camera already authorized");
            return Ok(Some(true));
        }
        
        // Exactly like tauri-plugin-macos-permissions:
        // Pass None as completionHandler to let macOS handle the callback asynchronously
        // This ensures the app appears in System Settings > Privacy & Security > Camera
        type CompletionBlock = Option<extern "C" fn(BOOL)>;
        let completion_block: CompletionBlock = None;
        
        let request_msg = format!("[Permissions] 📞 Calling requestAccessForMediaType for camera (status: {} - {})...", current_status, status_desc);
        log_and_emit(&request_msg);
        log_and_emit("[Permissions] ℹ️  Using None as completionHandler (exactly like tauri-plugin-macos-permissions)");
        log_and_emit("[Permissions] ⚠️  If status is NotDetermined (0), macOS SHOULD show popup. If not, check:");
        log_and_emit("[Permissions]    1. Info.plist contains NSCameraUsageDescription");
        log_and_emit("[Permissions]    2. App is correctly signed");
        log_and_emit("[Permissions]    3. Console.app logs for TCC errors");
        
        // Request access with None as completionHandler (exactly like the plugin)
        // Note: objc crate syntax - no commas, just colons for selector parts
        let _: () = msg_send![av_capture_device_class, requestAccessForMediaType:media_type completionHandler:completion_block];
        
        log_and_emit("[Permissions] ✅ requestAccessForMediaType called successfully");
        log_and_emit("[Permissions] ⏳ macOS will handle the callback asynchronously");
        log_and_emit("[Permissions] 📋 The app should now appear in System Settings > Privacy & Security > Camera");
        log_and_emit("[Permissions] 💡 To debug: run 'log stream --predicate \"subsystem == \\\"com.apple.TCC\\\"\"' in Terminal");
        
        // Return None to indicate the request was sent and we're waiting for user response
        // The frontend will check the permission status periodically
        Ok(None)
    }
}

/// Check microphone permission status (macOS only, using AVFoundation directly)
/// Uses NSString::from_str("soun") like tauri-plugin-macos-permissions
#[tauri::command]
#[cfg(target_os = "macos")]
pub fn check_microphone_permission() -> Result<bool, String> {
    use objc::{msg_send, sel, sel_impl};
    use objc::runtime::{Object, Class};
    use std::ffi::CString;
    
    unsafe {
        // Import AVFoundation classes
        let av_capture_device_class = Class::get("AVCaptureDevice").ok_or_else(|| {
            "AVCaptureDevice class not found".to_string()
        })?;
        
        // Create NSString from "soun" (like tauri-plugin-macos-permissions)
        let ns_string_class = Class::get("NSString").ok_or_else(|| {
            "NSString class not found".to_string()
        })?;
        let c_str = CString::new("soun").map_err(|e| format!("Failed to create CString: {}", e))?;
        let media_type: *mut Object = msg_send![ns_string_class, stringWithUTF8String: c_str.as_ptr()];
        
        let status: i32 = msg_send![av_capture_device_class, authorizationStatusForMediaType: media_type];
        
        // AVAuthorizationStatusAuthorized = 3
        Ok(status == 3)
    }
}

/// Request microphone permission (macOS only, using AVFoundation directly)
/// Exactly like tauri-plugin-macos-permissions: uses NSString::from_str("soun") and passes None as completionHandler
#[tauri::command]
#[cfg(target_os = "macos")]
pub async fn request_microphone_permission(app_handle: tauri::AppHandle) -> Result<Option<bool>, String> {
    use objc::{msg_send, sel, sel_impl};
    use objc::runtime::{Object, Class, BOOL};
    use std::ffi::CString;
    use tauri::Emitter;
    
    // Helper to log and emit to frontend
    let log_and_emit = |message: &str| {
        eprintln!("{}", message);
        let _ = app_handle.emit("rust-log", message);
    };
    
    unsafe {
        // Import AVFoundation classes
        let av_capture_device_class = Class::get("AVCaptureDevice").ok_or_else(|| {
            "AVCaptureDevice class not found".to_string()
        })?;
        
        // Create NSString from "soun" (exactly like tauri-plugin-macos-permissions)
        let ns_string_class = Class::get("NSString").ok_or_else(|| {
            "NSString class not found".to_string()
        })?;
        let c_str = CString::new("soun").map_err(|e| format!("Failed to create CString: {}", e))?;
        let media_type: *mut Object = msg_send![ns_string_class, stringWithUTF8String: c_str.as_ptr()];
        
        // Check current status first
        let current_status: i32 = msg_send![av_capture_device_class, authorizationStatusForMediaType: media_type];
        
        let status_desc = match current_status {
            0 => "NotDetermined",
            1 => "Denied",
            2 => "Restricted",
            3 => "Authorized",
            _ => "Unknown",
        };
        
        let status_msg = format!("[Permissions] 📊 Microphone status: {} ({})", current_status, status_desc);
        log_and_emit(&status_msg);
        log_and_emit("[Permissions] ℹ️  Status meanings: 0=NotDetermined (popup should show), 1=Denied, 2=Restricted, 3=Authorized");
        
        // AVAuthorizationStatusAuthorized = 3
        if current_status == 3 {
            log_and_emit("[Permissions] ✅ Microphone already authorized");
            return Ok(Some(true));
        }
        
        // Exactly like tauri-plugin-macos-permissions:
        // Pass None as completionHandler to let macOS handle the callback asynchronously
        // This ensures the app appears in System Settings > Privacy & Security > Microphone
        type CompletionBlock = Option<extern "C" fn(BOOL)>;
        let completion_block: CompletionBlock = None;
        
        let request_msg = format!("[Permissions] 📞 Calling requestAccessForMediaType for microphone (status: {} - {})...", current_status, status_desc);
        log_and_emit(&request_msg);
        log_and_emit("[Permissions] ℹ️  Using None as completionHandler (exactly like tauri-plugin-macos-permissions)");
        log_and_emit("[Permissions] ⚠️  If status is NotDetermined (0), macOS SHOULD show popup. If not, check:");
        log_and_emit("[Permissions]    1. Info.plist contains NSMicrophoneUsageDescription");
        log_and_emit("[Permissions]    2. App is correctly signed");
        log_and_emit("[Permissions]    3. Console.app logs for TCC errors");
        
        // Request access with None as completionHandler (exactly like the plugin)
        // Note: objc crate syntax - no commas, just colons for selector parts
        let _: () = msg_send![av_capture_device_class, requestAccessForMediaType:media_type completionHandler:completion_block];
        
        log_and_emit("[Permissions] ✅ requestAccessForMediaType called successfully");
        log_and_emit("[Permissions] ⏳ macOS will handle the callback asynchronously");
        log_and_emit("[Permissions] 📋 The app should now appear in System Settings > Privacy & Security > Microphone");
        log_and_emit("[Permissions] 💡 To debug: run 'log stream --predicate \"subsystem == \\\"com.apple.TCC\\\"\"' in Terminal");
        
        // Return None to indicate the request was sent and we're waiting for user response
        // The frontend will check the permission status periodically
        Ok(None)
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
