//! Block device detection module
//!
//! Platform-specific implementations for detecting available storage devices.
//! Filters out system disks to prevent accidental data loss.

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

use super::types::BlockDevice;

/// Get list of available block devices for flashing
///
/// Returns only safe devices:
/// - Removable devices (USB, SD cards)
/// - Non-system disks
/// - Reasonable size (< 256GB by default to avoid accidental selection of main drives)
#[cfg(target_os = "linux")]
pub fn get_block_devices() -> Result<Vec<BlockDevice>, String> {
    linux::get_block_devices()
}

#[cfg(target_os = "macos")]
pub fn get_block_devices() -> Result<Vec<BlockDevice>, String> {
    macos::get_block_devices()
}

#[cfg(target_os = "windows")]
pub fn get_block_devices() -> Result<Vec<BlockDevice>, String> {
    windows::get_block_devices()
}

/// Maximum size for auto-detection (256 GB)
/// Larger drives require explicit confirmation
pub const MAX_AUTO_SIZE: u64 = 256 * 1024 * 1024 * 1024;

/// Filter devices to only show safe targets
pub fn filter_safe_devices(devices: Vec<BlockDevice>) -> Vec<BlockDevice> {
    devices
        .into_iter()
        .filter(|d| {
            // Never show system disks
            if d.is_system {
                return false;
            }
            // Prefer removable devices
            if !d.is_removable && d.size > MAX_AUTO_SIZE {
                return false;
            }
            // Skip very small devices (< 100MB, likely not real storage)
            if d.size < 100 * 1024 * 1024 {
                return false;
            }
            true
        })
        .collect()
}
