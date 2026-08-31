//! Flasher Module - Cross-platform SD card / USB image flashing
//!
//! This module provides functionality to:
//! - Detect available block devices (SD cards, USB drives)
//! - Flash OS images to these devices
//! - Verify written data
//!
//! ## Platform Support
//! - Linux: Uses lsblk + direct device access (requires root/polkit)
//! - macOS: Uses diskutil + authopen/osascript for privilege escalation
//! - Windows: Uses WMI + Win32 APIs (requires Administrator)
//!
//! ## Safety Features
//! - System disk detection and exclusion
//! - Size limits to prevent accidental selection of main drives
//! - Verification after writing

pub mod devices;
pub mod types;
pub mod writer;

use std::path::PathBuf;
use std::sync::Arc;
use types::{BlockDevice, FlashOptions, FlashProgress};
use writer::FlashState;

// Global flash state (singleton for the app)
lazy_static::lazy_static! {
    static ref FLASH_STATE: Arc<FlashState> = Arc::new(FlashState::new());
}

/// Get list of available devices for flashing
/// Filters out system disks and very large drives
#[tauri::command]
pub async fn get_flash_devices() -> Result<Vec<BlockDevice>, String> {
    // Run blocking operation in separate thread
    tokio::task::spawn_blocking(|| {
        let all_devices = devices::get_block_devices()?;
        Ok(devices::filter_safe_devices(all_devices))
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

/// Get list of ALL devices (including system disks)
/// Use with caution - for advanced users only
#[tauri::command]
pub async fn get_all_flash_devices() -> Result<Vec<BlockDevice>, String> {
    tokio::task::spawn_blocking(devices::get_block_devices)
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

/// Request authorization before flashing
/// Shows platform-specific permission dialog
#[tauri::command]
pub fn request_flash_authorization(device_path: String) -> Result<bool, String> {
    writer::request_authorization(&device_path)
}

/// Start flashing an image to a device
/// Returns immediately - use get_flash_progress to monitor
#[tauri::command]
pub async fn start_flash(
    image_path: String,
    device_path: String,
    verify: Option<bool>,
) -> Result<(), String> {
    let options = FlashOptions {
        verify: verify.unwrap_or(true),
        auto_decompress: true,
        expected_hash: None,
    };

    let path = PathBuf::from(&image_path);
    if !path.exists() {
        return Err(format!("Image file not found: {}", image_path));
    }

    // Start flash in background
    let state = Arc::clone(&FLASH_STATE);
    let _ = writer::flash_image(path, device_path, options, state).await?;

    Ok(())
}

/// Get current flash progress
#[tauri::command]
pub fn get_flash_progress() -> FlashProgress {
    FLASH_STATE.get_progress()
}

/// Cancel an ongoing flash operation
#[tauri::command]
pub fn cancel_flash() {
    writer::cancel_flash(&FLASH_STATE);
}

/// Check if a flash operation is in progress
#[tauri::command]
pub fn is_flash_in_progress() -> bool {
    let phase = FLASH_STATE.phase.lock().unwrap().clone();
    matches!(
        phase,
        types::FlashPhase::Preparing
            | types::FlashPhase::Downloading
            | types::FlashPhase::Decompressing
            | types::FlashPhase::Writing
            | types::FlashPhase::Verifying
    )
}
