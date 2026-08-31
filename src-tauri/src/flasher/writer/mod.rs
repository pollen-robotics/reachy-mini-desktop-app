//! Image writing module
//!
//! Platform-specific implementations for writing images to block devices.
//! Handles privilege escalation, volume locking, and progress reporting.

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

use super::types::{FlashOptions, FlashPhase, FlashProgress};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use tokio::sync::mpsc;

/// Shared state for flash operations
pub struct FlashState {
    pub total_bytes: AtomicU64,
    pub written_bytes: AtomicU64,
    pub verified_bytes: AtomicU64,
    pub phase: std::sync::Mutex<FlashPhase>,
    pub is_cancelled: AtomicBool,
    pub error: std::sync::Mutex<Option<String>>,
    pub start_time: std::sync::Mutex<Option<std::time::Instant>>,
}

impl FlashState {
    pub fn new() -> Self {
        Self {
            total_bytes: AtomicU64::new(0),
            written_bytes: AtomicU64::new(0),
            verified_bytes: AtomicU64::new(0),
            phase: std::sync::Mutex::new(FlashPhase::Preparing),
            is_cancelled: AtomicBool::new(false),
            error: std::sync::Mutex::new(None),
            start_time: std::sync::Mutex::new(None),
        }
    }

    pub fn reset(&self) {
        self.total_bytes.store(0, Ordering::SeqCst);
        self.written_bytes.store(0, Ordering::SeqCst);
        self.verified_bytes.store(0, Ordering::SeqCst);
        *self.phase.lock().unwrap() = FlashPhase::Preparing;
        self.is_cancelled.store(false, Ordering::SeqCst);
        *self.error.lock().unwrap() = None;
        *self.start_time.lock().unwrap() = Some(std::time::Instant::now());
    }

    pub fn set_phase(&self, phase: FlashPhase) {
        *self.phase.lock().unwrap() = phase;
    }

    pub fn get_progress(&self) -> FlashProgress {
        let phase = self.phase.lock().unwrap().clone();
        let total = self.total_bytes.load(Ordering::SeqCst);
        let written = self.written_bytes.load(Ordering::SeqCst);
        let verified = self.verified_bytes.load(Ordering::SeqCst);

        let bytes_processed = if phase == FlashPhase::Verifying {
            verified
        } else {
            written
        };

        let percentage = if total > 0 {
            (bytes_processed as f32 / total as f32) * 100.0
        } else {
            0.0
        };

        // Calculate speed and ETA
        let (speed_bps, eta_seconds) = if let Some(start) = *self.start_time.lock().unwrap() {
            let elapsed = start.elapsed().as_secs_f64();
            if elapsed > 0.0 && bytes_processed > 0 {
                let speed = bytes_processed as f64 / elapsed;
                let remaining = total.saturating_sub(bytes_processed);
                let eta = if speed > 0.0 {
                    Some((remaining as f64 / speed) as u64)
                } else {
                    None
                };
                (speed as u64, eta)
            } else {
                (0, None)
            }
        } else {
            (0, None)
        };

        FlashProgress {
            phase,
            bytes_processed,
            total_bytes: total,
            percentage,
            speed_bps,
            eta_seconds,
        }
    }

    pub fn cancel(&self) {
        self.is_cancelled.store(true, Ordering::SeqCst);
        self.set_phase(FlashPhase::Cancelled);
    }

    pub fn set_error(&self, error: String) {
        *self.error.lock().unwrap() = Some(error.clone());
        self.set_phase(FlashPhase::Failed(error));
    }
}

impl Default for FlashState {
    fn default() -> Self {
        Self::new()
    }
}

/// Flash an image to a device
///
/// Returns a channel receiver for progress updates
pub async fn flash_image(
    image_path: PathBuf,
    device_path: String,
    options: FlashOptions,
    state: Arc<FlashState>,
) -> Result<mpsc::Receiver<FlashProgress>, String> {
    let (tx, rx) = mpsc::channel(100);

    // Spawn the flash operation in a background task
    let state_clone = Arc::clone(&state);
    let tx_clone = tx.clone();

    tokio::spawn(async move {
        let result = flash_image_internal(&image_path, &device_path, &options, &state_clone, tx_clone).await;

        if let Err(e) = result {
            state_clone.set_error(e);
        }
    });

    Ok(rx)
}

/// Internal flash implementation
async fn flash_image_internal(
    image_path: &PathBuf,
    device_path: &str,
    options: &FlashOptions,
    state: &Arc<FlashState>,
    tx: mpsc::Sender<FlashProgress>,
) -> Result<(), String> {
    state.reset();

    // Send initial progress
    let _ = tx.send(state.get_progress()).await;

    // Platform-specific flash
    #[cfg(target_os = "linux")]
    {
        linux::flash_image(image_path, device_path, options, state, &tx).await
    }

    #[cfg(target_os = "macos")]
    {
        macos::flash_image(image_path, device_path, options, state, &tx).await
    }

    #[cfg(target_os = "windows")]
    {
        windows::flash_image(image_path, device_path, options, state, &tx).await
    }
}

/// Request authorization before flashing
/// Shows platform-specific permission dialog
#[cfg(target_os = "linux")]
pub fn request_authorization(device_path: &str) -> Result<bool, String> {
    linux::request_authorization(device_path)
}

#[cfg(target_os = "macos")]
pub fn request_authorization(device_path: &str) -> Result<bool, String> {
    macos::request_authorization(device_path)
}

#[cfg(target_os = "windows")]
pub fn request_authorization(_device_path: &str) -> Result<bool, String> {
    // Windows: authorization happens during flash (UAC prompt)
    Ok(true)
}

/// Cancel an ongoing flash operation
pub fn cancel_flash(state: &Arc<FlashState>) {
    state.cancel();
}

/// Chunk size for read/write operations (4 MB)
pub const CHUNK_SIZE: usize = 4 * 1024 * 1024;
