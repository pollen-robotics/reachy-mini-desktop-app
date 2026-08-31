//! Common types for the flasher module

use serde::{Deserialize, Serialize};

/// Represents a block device (SD card, USB drive, etc.)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockDevice {
    /// Device path (e.g., /dev/sdb, /dev/disk2, \\.\PhysicalDrive1)
    pub path: String,
    /// Device name (e.g., sdb, disk2)
    pub name: String,
    /// Size in bytes
    pub size: u64,
    /// Human-readable size (e.g., "32 GB")
    pub size_formatted: String,
    /// Device model/description
    pub model: String,
    /// Whether the device is removable
    pub is_removable: bool,
    /// Whether this is a system disk (should not be flashed!)
    pub is_system: bool,
    /// Bus type (USB, SD, SATA, NVMe, etc.)
    pub bus_type: Option<String>,
    /// Mount points (if any)
    pub mount_points: Vec<String>,
}

/// Flash operation progress
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlashProgress {
    /// Current phase
    pub phase: FlashPhase,
    /// Bytes processed
    pub bytes_processed: u64,
    /// Total bytes
    pub total_bytes: u64,
    /// Progress percentage (0-100)
    pub percentage: f32,
    /// Speed in bytes/second
    pub speed_bps: u64,
    /// Estimated time remaining in seconds
    pub eta_seconds: Option<u64>,
}

/// Flash operation phases
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum FlashPhase {
    /// Preparing (unmounting, locking volumes)
    Preparing,
    /// Downloading image (if from URL)
    Downloading,
    /// Decompressing image
    Decompressing,
    /// Writing to device
    Writing,
    /// Verifying written data
    Verifying,
    /// Completed successfully
    Completed,
    /// Failed with error
    Failed(String),
    /// Cancelled by user
    Cancelled,
}

/// Flash operation options
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlashOptions {
    /// Whether to verify after writing
    pub verify: bool,
    /// Whether to decompress automatically
    pub auto_decompress: bool,
    /// Expected SHA256 hash (optional)
    pub expected_hash: Option<String>,
}

impl Default for FlashOptions {
    fn default() -> Self {
        Self {
            verify: true,
            auto_decompress: true,
            expected_hash: None,
        }
    }
}

/// Format file size to human-readable string
pub fn format_size(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = KB * 1024;
    const GB: u64 = MB * 1024;
    const TB: u64 = GB * 1024;

    if bytes >= TB {
        format!("{:.1} TB", bytes as f64 / TB as f64)
    } else if bytes >= GB {
        format!("{:.1} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.1} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.1} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} B", bytes)
    }
}
