/// Module pour gérer les permissions macOS (caméra, micro, etc.)
/// Ces permissions sont demandées au démarrage de l'app pour qu'elles se propagent
/// aux processus enfants (daemon Python et ses apps)
/// 
/// Note: Les demandes de permissions sont asynchrones. On déclenche simplement la demande,
/// macOS affichera la popup et l'utilisateur pourra répondre. Les processus enfants
/// hériteront automatiquement des permissions accordées.

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

/// Check if camera and microphone permissions are granted
/// Returns a tuple (camera_granted, microphone_granted)
/// Uses AVFoundation to check authorization status without triggering a request
#[tauri::command]
#[cfg(target_os = "macos")]
pub fn check_permissions() -> Result<(bool, bool), String> {
    use objc::runtime::{Class, Object};
    use objc::{msg_send, sel, sel_impl};
    use std::ffi::CString;
    
    // Get AVMediaType constants from AVFoundation
    // AVMediaTypeVideo = @"vide"
    // AVMediaTypeAudio = @"soun"
    let av_media_type_video = unsafe {
        let ns_string_class = Class::get("NSString").ok_or("NSString class not found")?;
        let video_str = CString::new("vide").map_err(|e| format!("Failed to create CString: {}", e))?;
        let video_type: *const Object = msg_send![ns_string_class, stringWithUTF8String: video_str.as_ptr()];
        video_type
    };
    
    let av_media_type_audio = unsafe {
        let ns_string_class = Class::get("NSString").ok_or("NSString class not found")?;
        let audio_str = CString::new("soun").map_err(|e| format!("Failed to create CString: {}", e))?;
        let audio_type: *const Object = msg_send![ns_string_class, stringWithUTF8String: audio_str.as_ptr()];
        audio_type
    };
    
    // Get AVCaptureDevice class
    let av_capture_device_class = Class::get("AVCaptureDevice")
        .ok_or("AVCaptureDevice class not found")?;
    
    // Check camera permission
    // authorizationStatusForMediaType: returns NSInteger (i64)
    let camera_status: i64 = unsafe {
        msg_send![av_capture_device_class, authorizationStatusForMediaType: av_media_type_video]
    };
    
    // Check microphone permission
    let microphone_status: i64 = unsafe {
        msg_send![av_capture_device_class, authorizationStatusForMediaType: av_media_type_audio]
    };
    
    // AVAuthorizationStatus enum values:
    // 0 = NotDetermined (not yet asked)
    // 1 = Restricted (restricted by parental controls)
    // 2 = Denied (user denied)
    // 3 = Authorized (user granted)
    
    // Always use strict mode: only Authorized (3) = granted
    // This ensures consistent behavior between dev and production
    let camera_granted = camera_status == 3;
    let microphone_granted = microphone_status == 3;
    
    // Debug logging
    let is_debug = cfg!(debug_assertions);
    if is_debug {
        println!("🔐 Permission check (dev mode, strict): camera={} (status: {}), microphone={} (status: {})", 
            camera_granted, camera_status, microphone_granted, microphone_status);
    }
    
    Ok((camera_granted, microphone_granted))
}

/// Request camera permission directly (triggers macOS permission dialog)
#[tauri::command]
#[cfg(target_os = "macos")]
pub fn request_camera_permission() -> Result<bool, String> {
    use objc::runtime::{Class, Object};
    use objc::{msg_send, sel, sel_impl};
    use std::ffi::CString;
    use block::ConcreteBlock;
    
    let av_capture_device_class = Class::get("AVCaptureDevice")
        .ok_or("AVCaptureDevice class not found")?;
    
    let av_media_type_video = unsafe {
        let ns_string_class = Class::get("NSString").ok_or("NSString class not found")?;
        let video_str = CString::new("vide").map_err(|e| format!("Failed to create CString: {}", e))?;
        let video_type: *const Object = msg_send![ns_string_class, stringWithUTF8String: video_str.as_ptr()];
        video_type
    };
    
    // Check current status
    let status: i64 = unsafe {
        msg_send![av_capture_device_class, authorizationStatusForMediaType: av_media_type_video]
    };
    
    // Only request if not yet determined
    if status == 0 {
        // Create completion block that does nothing (async request)
        let block = ConcreteBlock::new(|| {});
        let block_ptr = block.copy();
        
        unsafe {
            let _: () = msg_send![av_capture_device_class, requestAccessForMediaType: av_media_type_video completionHandler: block_ptr];
        }
        
        Ok(true) // Request triggered
    } else {
        Ok(false) // Already asked or authorized/denied
    }
}

/// Request microphone permission directly (triggers macOS permission dialog)
#[tauri::command]
#[cfg(target_os = "macos")]
pub fn request_microphone_permission() -> Result<bool, String> {
    use objc::runtime::{Class, Object};
    use objc::{msg_send, sel, sel_impl};
    use std::ffi::CString;
    use block::ConcreteBlock;
    
    let av_capture_device_class = Class::get("AVCaptureDevice")
        .ok_or("AVCaptureDevice class not found")?;
    
    let av_media_type_audio = unsafe {
        let ns_string_class = Class::get("NSString").ok_or("NSString class not found")?;
        let audio_str = CString::new("soun").map_err(|e| format!("Failed to create CString: {}", e))?;
        let audio_type: *const Object = msg_send![ns_string_class, stringWithUTF8String: audio_str.as_ptr()];
        audio_type
    };
    
    // Check current status
    let status: i64 = unsafe {
        msg_send![av_capture_device_class, authorizationStatusForMediaType: av_media_type_audio]
    };
    
    // Only request if not yet determined
    if status == 0 {
        // Create completion block that does nothing (async request)
        let block = ConcreteBlock::new(|| {});
        let block_ptr = block.copy();
        
        unsafe {
            let _: () = msg_send![av_capture_device_class, requestAccessForMediaType: av_media_type_audio completionHandler: block_ptr];
        }
        
        Ok(true) // Request triggered
    } else {
        Ok(false) // Already asked or authorized/denied
    }
}

#[cfg(not(target_os = "macos"))]
pub fn request_all_permissions() {
    // No-op on non-macOS platforms
    println!("ℹ️  Permission requests are only needed on macOS");
}

#[tauri::command]
#[cfg(not(target_os = "macos"))]
pub fn check_permissions() -> Result<(bool, bool), String> {
    // On non-macOS, permissions are not needed
    Ok((true, true))
}

/// Open System Settings to Privacy & Security > Camera
/// Also triggers a permission request to make the app appear in the list
#[tauri::command]
#[cfg(target_os = "macos")]
pub fn open_camera_settings() -> Result<(), String> {
    use std::process::Command;
    use objc::runtime::{Class, Object};
    use objc::{msg_send, sel, sel_impl};
    use std::ffi::CString;
    use block::ConcreteBlock;
    
    // First, trigger a permission request so the app appears in System Settings
    // This is safe because we're just checking/requesting, not accessing
    if let Some(av_capture_device_class) = Class::get("AVCaptureDevice") {
        let av_media_type_video = unsafe {
            let ns_string_class = Class::get("NSString").ok_or("NSString class not found")?;
            let video_str = CString::new("vide").map_err(|e| format!("Failed to create CString: {}", e))?;
            let video_type: *const Object = msg_send![ns_string_class, stringWithUTF8String: video_str.as_ptr()];
            video_type
        };
        
        // Check current status first
        let status: i64 = unsafe {
            msg_send![av_capture_device_class, authorizationStatusForMediaType: av_media_type_video]
        };
        
        // Only request if not yet determined (to avoid unnecessary dialogs)
        if status == 0 {
            // Create an empty completion block
            let block = ConcreteBlock::new(|| {});
            let block_ptr = block.copy();
            
            unsafe {
                let _: () = msg_send![av_capture_device_class, requestAccessForMediaType: av_media_type_video completionHandler: block_ptr];
            }
        }
    }
    
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
/// Also triggers a permission request to make the app appear in the list
#[tauri::command]
#[cfg(target_os = "macos")]
pub fn open_microphone_settings() -> Result<(), String> {
    use std::process::Command;
    use objc::runtime::{Class, Object};
    use objc::{msg_send, sel, sel_impl};
    use std::ffi::CString;
    use block::ConcreteBlock;
    
    // First, trigger a permission request so the app appears in System Settings
    // This is safe because we're just checking/requesting, not accessing
    if let Some(av_capture_device_class) = Class::get("AVCaptureDevice") {
        let av_media_type_audio = unsafe {
            let ns_string_class = Class::get("NSString").ok_or("NSString class not found")?;
            let audio_str = CString::new("soun").map_err(|e| format!("Failed to create CString: {}", e))?;
            let audio_type: *const Object = msg_send![ns_string_class, stringWithUTF8String: audio_str.as_ptr()];
            audio_type
        };
        
        // Check current status first
        let status: i64 = unsafe {
            msg_send![av_capture_device_class, authorizationStatusForMediaType: av_media_type_audio]
        };
        
        // Only request if not yet determined (to avoid unnecessary dialogs)
        if status == 0 {
            // Create an empty completion block
            let block = ConcreteBlock::new(|| {});
            let block_ptr = block.copy();
            
            unsafe {
                let _: () = msg_send![av_capture_device_class, requestAccessForMediaType: av_media_type_audio completionHandler: block_ptr];
            }
        }
    }
    
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

#[tauri::command]
#[cfg(not(target_os = "macos"))]
pub fn request_camera_permission() -> Result<bool, String> {
    Ok(false)
}

#[tauri::command]
#[cfg(not(target_os = "macos"))]
pub fn request_microphone_permission() -> Result<bool, String> {
    Ok(false)
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
