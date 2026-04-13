//! Module for managing cross-platform permissions (camera, microphone, local network, etc.)
//!
//! Note: Camera/microphone permissions are managed by tauri-plugin-macos-permissions.
//!
//! Local Network (macOS Sequoia+): There is no API to silently check permission
//! status (Apple FB8711182). UDP connect() does not trigger the privacy check;
//! only real I/O (send_to) or Bonjour operations do. We use a state machine:
//! - UNKNOWN: check returns None, no I/O is performed (avoids auto-triggering popup)
//! - REQUESTED: user clicked the card, we do send_to to trigger the dialog and verify
//! - GRANTED/DENIED: confirmed state, cached for subsequent checks

/// Log configured permissions at app startup (macOS only)
#[cfg(target_os = "macos")]
pub fn request_all_permissions() {
    log::info!("macOS permissions configured:");
    log::info!("   Camera: NSCameraUsageDescription declared in Info.plist");
    log::info!("   Microphone: NSMicrophoneUsageDescription declared in Info.plist");
    log::info!("   Location: NSLocationWhenInUseUsageDescription declared in Info.plist");
    log::info!("   Filesystem: Entitlements configured");
    log::info!("   USB: Entitlements configured");
    log::info!("Permissions will be requested automatically when needed:");
    log::info!("   - Camera/microphone: macOS will show dialog when first accessed by apps");
    log::info!("   - Location: requested before WiFi scanning to unredact SSIDs");
    log::info!("   - Filesystem/USB: Already granted via entitlements");
    log::info!("Note: Permissions granted to the main app will propagate to child processes");
    log::info!("   (Python daemon and its apps)");
    log::info!("Note: App will appear in System Settings > Privacy after first permission request");
}

#[cfg(not(target_os = "macos"))]
#[allow(dead_code)]
pub fn request_all_permissions() {
    // No-op on non-macOS platforms
    log::info!("Permission requests are only needed on macOS");
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
        return Err(format!(
            "Failed to open System Settings: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
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
        return Err(format!(
            "Failed to open System Settings: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
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
            return Err(format!(
                "Failed to open System Settings: {}",
                String::from_utf8_lossy(&fallback.stderr)
            ));
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
        return Err(format!(
            "Failed to open System Settings: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(())
}

/// Open System Settings to Privacy & Security > Local Network (macOS Sequoia+)
#[tauri::command]
#[cfg(target_os = "macos")]
pub fn open_local_network_settings() -> Result<(), String> {
    use std::process::Command;

    let output = Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_LocalNetwork")
        .output()
        .map_err(|e| format!("Failed to open System Settings: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "Failed to open System Settings: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(())
}

// Local Network permission state machine (macOS only).
// 0 = UNKNOWN (never requested), 1 = GRANTED, 2 = DENIED, 3 = REQUESTED (dialog may be showing)
#[cfg(target_os = "macos")]
static LOCAL_NETWORK_STATE: std::sync::atomic::AtomicU8 = std::sync::atomic::AtomicU8::new(0);

// NWBrowser FFI (compiled from nw_local_network.m).
// This is the Apple-recommended approach (TN3179) for detecting local network
// permission: NWBrowser reports .ready when granted, .waiting(PolicyDenied)
// when denied, and times out while the dialog is still visible.
#[cfg(target_os = "macos")]
extern "C" {
    /// Probe local network permission using NWBrowser.
    /// Returns: 0 = timeout (dialog showing), 1 = granted, 2 = denied
    fn nw_probe_local_network(timeout_secs: f64) -> i32;
}

#[cfg(target_os = "macos")]
fn probe_local_network(timeout_secs: f64) -> Result<Option<bool>, String> {
    use std::sync::atomic::Ordering;

    let result = unsafe { nw_probe_local_network(timeout_secs) };

    match result {
        1 => {
            log::info!("[permissions] NWBrowser: .ready (permission granted)");
            LOCAL_NETWORK_STATE.store(1, Ordering::Relaxed);
            Ok(Some(true))
        }
        2 => {
            log::info!("[permissions] NWBrowser: PolicyDenied (permission denied)");
            LOCAL_NETWORK_STATE.store(2, Ordering::Relaxed);
            Ok(Some(false))
        }
        _ => {
            log::debug!("[permissions] NWBrowser: timeout (dialog may be showing)");
            Ok(None)
        }
    }
}

/// Check Local Network permission status (macOS Sequoia/Tahoe+)
///
/// Returns: true if granted, false if denied, None if pending.
///
/// On UNKNOWN state (first call after app launch), performs a quick probe
/// to detect if the permission was already granted in a previous session.
/// Without this, the app would show the permission card on every restart
/// because the in-memory state resets, causing an infinite restart loop.
#[tauri::command]
#[cfg(target_os = "macos")]
pub async fn check_local_network_permission() -> Result<Option<bool>, String> {
    use std::sync::atomic::Ordering;

    match LOCAL_NETWORK_STATE.load(Ordering::Relaxed) {
        1 => Ok(Some(true)),
        2 => {
            // Denied, but re-probe in case the user toggled it back on in
            // System Settings.
            LOCAL_NETWORK_STATE.store(3, Ordering::Relaxed);
            tokio::task::spawn_blocking(|| probe_local_network(0.5))
                .await
                .map_err(|e| format!("spawn_blocking failed: {}", e))?
        }
        3 => {
            // Request was made; probe to detect the user's choice
            tokio::task::spawn_blocking(|| probe_local_network(0.5))
                .await
                .map_err(|e| format!("spawn_blocking failed: {}", e))?
        }
        _ => {
            // UNKNOWN: first check after launch. Probe to detect if the
            // permission was already granted in a previous session.
            LOCAL_NETWORK_STATE.store(3, Ordering::Relaxed);
            tokio::task::spawn_blocking(|| probe_local_network(1.0))
                .await
                .map_err(|e| format!("spawn_blocking failed: {}", e))?
        }
    }
}

/// Request Local Network permission (macOS Sequoia/Tahoe+)
///
/// Creates an NWBrowser which triggers the macOS privacy dialog if the
/// permission is undetermined. Blocks (on a dedicated thread) for up to
/// 3 seconds waiting for the user's response.
#[tauri::command]
#[cfg(target_os = "macos")]
pub async fn request_local_network_permission() -> Result<Option<bool>, String> {
    LOCAL_NETWORK_STATE.store(3, std::sync::atomic::Ordering::Relaxed);
    tokio::task::spawn_blocking(|| probe_local_network(3.0))
        .await
        .map_err(|e| format!("spawn_blocking failed: {}", e))?
}

// ============================================================================
// Location Permission (macOS) - needed for WiFi SSID scanning
// ============================================================================

/// Check Location Services permission status (no dialog).
#[tauri::command]
#[cfg(target_os = "macos")]
pub async fn check_location_permission() -> Result<Option<bool>, String> {
    extern "C" {
        fn corewlan_location_status() -> i32;
    }

    tokio::task::spawn_blocking(|| {
        let status = unsafe { corewlan_location_status() };
        // If notDetermined (0), the CLLocationManager delegate may not have fired yet.
        // The delegate typically fires within ~5ms of manager creation. We wait up to
        // 300ms so the real persisted status is reflected before returning to the JS side.
        // This prevents the permissions screen from flashing on every app restart.
        let status = if status == 0 {
            std::thread::sleep(std::time::Duration::from_millis(300));
            unsafe { corewlan_location_status() }
        } else {
            status
        };
        // 0 = notDetermined, 1 = restricted, 2 = denied, 3 = authorizedAlways, 4 = authorizedWhenInUse
        match status {
            3 | 4 => Ok(Some(true)),
            1 | 2 => Ok(Some(false)),
            _ => Ok(None),
        }
    })
    .await
    .map_err(|e| format!("spawn_blocking failed: {}", e))?
}

#[tauri::command]
#[cfg(not(target_os = "macos"))]
pub async fn check_location_permission() -> Result<Option<bool>, String> {
    Ok(Some(true))
}

/// Request Location Services permission via CoreLocation.
/// This is needed so that CoreWLAN can return actual SSIDs instead of nil.
/// Dispatches to the main queue via the persistent CLLocationManager in corewlan_scan.m.
#[tauri::command]
#[cfg(target_os = "macos")]
pub async fn request_location_permission() -> Result<Option<bool>, String> {
    extern "C" {
        fn corewlan_request_location() -> i32;
        fn corewlan_location_status() -> i32;
    }

    tokio::task::spawn_blocking(|| {
        // This dispatches to the main queue and requests permission if needed
        let _request_status = unsafe { corewlan_request_location() };

        // Re-check after the main-queue block has executed
        let status = unsafe { corewlan_location_status() };
        log::info!(
            "[permissions] CLLocationManager authorizationStatus = {}",
            status
        );

        // 0 = notDetermined, 1 = restricted, 2 = denied, 3 = authorizedAlways, 4 = authorizedWhenInUse
        match status {
            3 | 4 => Ok(Some(true)),
            1 | 2 => Ok(Some(false)),
            _ => Ok(None), // dialog pending
        }
    })
    .await
    .map_err(|e| format!("spawn_blocking failed: {}", e))?
}

#[tauri::command]
#[cfg(not(target_os = "macos"))]
pub async fn request_location_permission() -> Result<Option<bool>, String> {
    // Location permission is only relevant on macOS for WiFi scanning
    Ok(Some(true))
}

/// Open System Settings to Privacy & Security > Location Services (macOS)
///
/// macOS 13+ (Ventura) replaced the old `x-apple.systempreferences:` deep links
/// with a new extension-based scheme. The old `Privacy_LocationServices` fragment
/// no longer works on macOS 13+. We try the new scheme first, then fall back to
/// the generic Privacy & Security pane.
#[tauri::command]
#[cfg(target_os = "macos")]
pub fn open_location_settings() -> Result<(), String> {
    use std::process::Command;

    // macOS 13+ (Ventura, Sonoma, Sequoia…): Privacy & Security pane.
    // There is no dedicated deep-link to Location Services in macOS 13+;
    // opening Privacy & Security is the best we can do.
    let new_url = "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension";
    let output = Command::new("open")
        .arg(new_url)
        .output()
        .map_err(|e| format!("Failed to open System Settings: {}", e))?;

    if output.status.success() {
        return Ok(());
    }

    // Fallback: legacy URL (macOS 12 and earlier)
    let legacy_url =
        "x-apple.systempreferences:com.apple.preference.security?Privacy_LocationServices";
    let fallback = Command::new("open")
        .arg(legacy_url)
        .output()
        .map_err(|e| format!("Failed to open System Settings: {}", e))?;

    if !fallback.status.success() {
        return Err(format!(
            "Failed to open System Settings: {}",
            String::from_utf8_lossy(&fallback.stderr)
        ));
    }

    Ok(())
}

#[tauri::command]
#[cfg(not(target_os = "macos"))]
pub fn open_location_settings() -> Result<(), String> {
    Ok(())
}

// ============================================================================
// Bluetooth Permission (macOS) - needed for BLE-based WiFi setup
// ============================================================================

/// Check Bluetooth authorization status (macOS 10.15+).
/// Returns: true if allowedAlways, false if restricted/denied, None if notDetermined.
#[tauri::command]
#[cfg(target_os = "macos")]
pub async fn check_bluetooth_permission() -> Result<Option<bool>, String> {
    // In debug/dev builds the binary is not bundled or signed with Bluetooth entitlements.
    // CBCentralManager crashes without a valid app bundle, so we report "granted" to skip
    // the permission gate and allow normal dev/debugging workflows.
    #[cfg(debug_assertions)]
    {
        log::warn!("[dev] Skipping Bluetooth permission check in debug build — reporting granted");
        Ok(Some(true))
    }

    #[cfg(not(debug_assertions))]
    {
        extern "C" {
            fn bluetooth_authorization_status() -> i32;
        }

        tokio::task::spawn_blocking(|| {
            let status = unsafe { bluetooth_authorization_status() };
            log::debug!("[permissions] Bluetooth authorization status: {}", status);
            match status {
                3 => Ok(Some(true)),
                1 | 2 => Ok(Some(false)),
                _ => Ok(None),
            }
        })
        .await
        .map_err(|e| format!("spawn_blocking failed: {}", e))?
    }
}

#[tauri::command]
#[cfg(not(target_os = "macos"))]
pub async fn check_bluetooth_permission() -> Result<Option<bool>, String> {
    Ok(Some(true))
}

/// Request Bluetooth permission by instantiating CBCentralManager.
/// The system will show the permission dialog on first call.
#[tauri::command]
#[cfg(target_os = "macos")]
pub async fn request_bluetooth_permission() -> Result<Option<bool>, String> {
    // Skip in debug builds — see check_bluetooth_permission for rationale.
    #[cfg(debug_assertions)]
    {
        log::warn!(
            "[dev] Skipping Bluetooth permission request in debug build — reporting granted"
        );
        Ok(Some(true))
    }

    #[cfg(not(debug_assertions))]
    {
        extern "C" {
            fn bluetooth_request_permission();
            fn bluetooth_authorization_status() -> i32;
        }

        tokio::task::spawn_blocking(|| {
            unsafe { bluetooth_request_permission() };
            let status = unsafe { bluetooth_authorization_status() };
            match status {
                3 => Ok(Some(true)),
                1 | 2 => Ok(Some(false)),
                _ => Ok(None),
            }
        })
        .await
        .map_err(|e| format!("spawn_blocking failed: {}", e))?
    }
}

#[tauri::command]
#[cfg(not(target_os = "macos"))]
pub async fn request_bluetooth_permission() -> Result<Option<bool>, String> {
    Ok(Some(true))
}

/// Open System Settings to Bluetooth (macOS).
#[tauri::command]
#[cfg(target_os = "macos")]
pub fn open_bluetooth_settings() -> Result<(), String> {
    use std::process::Command;

    // macOS 13+ (Ventura+): Bluetooth settings pane
    let output = Command::new("open")
        .arg("x-apple.systempreferences:com.apple.BluetoothSettings")
        .output()
        .map_err(|e| format!("Failed to open Bluetooth Settings: {}", e))?;

    if output.status.success() {
        return Ok(());
    }

    // Fallback: legacy URL (macOS 12 and earlier)
    let fallback = Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.bluetooth")
        .output()
        .map_err(|e| format!("Failed to open Bluetooth Settings: {}", e))?;

    if !fallback.status.success() {
        return Err(format!(
            "Failed to open Bluetooth Settings: {}",
            String::from_utf8_lossy(&fallback.stderr)
        ));
    }

    Ok(())
}

#[tauri::command]
#[cfg(not(target_os = "macos"))]
pub fn open_bluetooth_settings() -> Result<(), String> {
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

#[tauri::command]
#[cfg(target_os = "windows")]
pub fn open_local_network_settings() -> Result<(), String> {
    use std::process::Command;
    // Open Windows Settings > Network & Internet (no direct local network privacy setting)
    Command::new("cmd")
        .args(["/C", "start", "ms-settings:network"])
        .spawn()
        .map_err(|e| format!("Failed to open Settings: {}", e))?;
    Ok(())
}

/// Windows doesn't have Local Network permission - always granted
#[tauri::command]
#[cfg(target_os = "windows")]
pub async fn check_local_network_permission() -> Result<Option<bool>, String> {
    Ok(Some(true))
}

#[tauri::command]
#[cfg(target_os = "windows")]
pub async fn request_local_network_permission() -> Result<Option<bool>, String> {
    Ok(Some(true))
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
    let _ = Command::new("gnome-control-center").arg("privacy").spawn();
    Ok(())
}

#[tauri::command]
#[cfg(target_os = "linux")]
pub fn open_microphone_settings() -> Result<(), String> {
    use std::process::Command;
    // Try GNOME Sound settings
    let _ = Command::new("gnome-control-center").arg("sound").spawn();
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
    let _ = Command::new("gnome-control-center").arg("privacy").spawn();
    Ok(())
}

#[tauri::command]
#[cfg(target_os = "linux")]
pub fn open_local_network_settings() -> Result<(), String> {
    // Linux doesn't have centralized local network privacy settings
    // Best effort: open GNOME network settings
    use std::process::Command;
    let _ = Command::new("gnome-control-center").arg("network").spawn();
    Ok(())
}

/// Linux doesn't have Local Network permission - always granted
#[tauri::command]
#[cfg(target_os = "linux")]
pub async fn check_local_network_permission() -> Result<Option<bool>, String> {
    Ok(Some(true))
}

#[tauri::command]
#[cfg(target_os = "linux")]
pub async fn request_local_network_permission() -> Result<Option<bool>, String> {
    Ok(Some(true))
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

#[tauri::command]
#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
pub fn open_local_network_settings() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
pub async fn check_local_network_permission() -> Result<Option<bool>, String> {
    Ok(Some(true))
}

#[tauri::command]
#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
pub async fn request_local_network_permission() -> Result<Option<bool>, String> {
    Ok(Some(true))
}
