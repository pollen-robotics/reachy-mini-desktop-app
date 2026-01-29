//! macOS flash implementation
//!
//! Uses Security.framework for privilege escalation via authopen.

use super::{FlashState, CHUNK_SIZE};
use crate::flasher::types::{FlashOptions, FlashPhase, FlashProgress};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::atomic::Ordering;
use std::sync::Arc;
use tokio::sync::mpsc;

/// Request authorization for device access
/// On macOS, we use Authorization Services
pub fn request_authorization(device_path: &str) -> Result<bool, String> {
    // Use raw disk path for better performance
    let raw_device = device_path.replace("/dev/disk", "/dev/rdisk");

    // Try to authorize using authopen
    // This will show the macOS authentication dialog
    let status = Command::new("authopen")
        .args(["-c", "-w", &raw_device])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();

    match status {
        Ok(s) if s.success() => Ok(true),
        Ok(_) => {
            // User cancelled or denied
            Ok(false)
        }
        Err(e) => Err(format!("Authorization failed: {}", e)),
    }
}

/// Flash image to device on macOS
pub async fn flash_image(
    image_path: &PathBuf,
    device_path: &str,
    options: &FlashOptions,
    state: &Arc<FlashState>,
    tx: &mpsc::Sender<FlashProgress>,
) -> Result<(), String> {
    // Use raw disk path for better performance
    let raw_device = device_path.replace("/dev/disk", "/dev/rdisk");

    // 1. Unmount the disk
    state.set_phase(FlashPhase::Preparing);
    let _ = tx.send(state.get_progress()).await;

    unmount_device(device_path)?;

    // Small delay after unmount
    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

    // 2. Get image size
    let image_size = std::fs::metadata(image_path)
        .map_err(|e| format!("Failed to get image size: {}", e))?
        .len();

    state.total_bytes.store(image_size, Ordering::SeqCst);

    // 3. Open image file
    let mut image_file = std::fs::File::open(image_path)
        .map_err(|e| format!("Failed to open image: {}", e))?;

    // 4. Write using dd with authopen for privilege escalation
    // This is the safest cross-platform approach on macOS
    state.set_phase(FlashPhase::Writing);
    let _ = tx.send(state.get_progress()).await;

    // Try direct write first (if we have permissions)
    let direct_write_result = try_direct_write(&mut image_file, &raw_device, state, tx).await;

    if direct_write_result.is_err() {
        // Fall back to dd with sudo prompt
        image_file.seek(SeekFrom::Start(0)).ok();
        write_with_dd(image_path, &raw_device, state, tx).await?;
    }

    // 5. Sync
    let _ = Command::new("sync").output();

    // 6. Verify if requested
    if options.verify {
        state.set_phase(FlashPhase::Verifying);
        let _ = tx.send(state.get_progress()).await;

        verify_image(image_path, &raw_device, state, tx).await?;
    }

    // 7. Eject
    let _ = Command::new("diskutil")
        .args(["eject", device_path])
        .output();

    // 8. Done
    state.set_phase(FlashPhase::Completed);
    let _ = tx.send(state.get_progress()).await;

    Ok(())
}

/// Try direct write (works if we already have permissions)
async fn try_direct_write(
    image_file: &mut std::fs::File,
    device_path: &str,
    state: &Arc<FlashState>,
    tx: &mpsc::Sender<FlashProgress>,
) -> Result<(), String> {
    let mut device = std::fs::OpenOptions::new()
        .write(true)
        .open(device_path)
        .map_err(|e| format!("Direct write failed: {}", e))?;

    let image_size = state.total_bytes.load(Ordering::SeqCst);
    let mut buffer = vec![0u8; CHUNK_SIZE];
    let mut written: u64 = 0;

    loop {
        if state.is_cancelled.load(Ordering::SeqCst) {
            return Err("Flash cancelled".to_string());
        }

        let bytes_read = image_file
            .read(&mut buffer)
            .map_err(|e| format!("Failed to read image: {}", e))?;

        if bytes_read == 0 {
            break;
        }

        device
            .write_all(&buffer[..bytes_read])
            .map_err(|e| format!("Failed to write: {}", e))?;

        written += bytes_read as u64;
        state.written_bytes.store(written, Ordering::SeqCst);

        if written % (image_size / 10).max(CHUNK_SIZE as u64) < CHUNK_SIZE as u64 {
            let _ = tx.send(state.get_progress()).await;
        }
    }

    device.flush().ok();
    Ok(())
}

/// Write using dd (fallback with privilege escalation)
async fn write_with_dd(
    image_path: &std::path::Path,
    device_path: &str,
    state: &Arc<FlashState>,
    tx: &mpsc::Sender<FlashProgress>,
) -> Result<(), String> {
    let image_size = state.total_bytes.load(Ordering::SeqCst);

    // Use dd with osascript for privilege escalation
    // This will show the macOS authentication dialog
    let script = format!(
        r#"do shell script "dd if='{}' of='{}' bs=4m" with administrator privileges"#,
        image_path.display(),
        device_path
    );

    let mut child = Command::new("osascript")
        .args(["-e", &script])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start dd: {}", e))?;

    // Poll for completion (dd doesn't give progress easily)
    // We'll estimate based on time
    let start = std::time::Instant::now();
    let estimated_speed: u64 = 50 * 1024 * 1024; // Estimate 50 MB/s

    loop {
        if state.is_cancelled.load(Ordering::SeqCst) {
            let _ = child.kill();
            return Err("Flash cancelled".to_string());
        }

        match child.try_wait() {
            Ok(Some(status)) => {
                if status.success() {
                    state.written_bytes.store(image_size, Ordering::SeqCst);
                    let _ = tx.send(state.get_progress()).await;
                    return Ok(());
                } else {
                    let stderr = child.stderr.take();
                    let error = if let Some(mut err) = stderr {
                        let mut buf = String::new();
                        let _ = std::io::Read::read_to_string(&mut err, &mut buf);
                        buf
                    } else {
                        "Unknown error".to_string()
                    };
                    return Err(format!("dd failed: {}", error));
                }
            }
            Ok(None) => {
                // Still running - estimate progress
                let elapsed = start.elapsed().as_secs();
                let estimated_written = elapsed * estimated_speed;
                let capped = estimated_written.min(image_size - 1);
                state.written_bytes.store(capped, Ordering::SeqCst);
                let _ = tx.send(state.get_progress()).await;

                tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
            }
            Err(e) => {
                return Err(format!("Failed to wait for dd: {}", e));
            }
        }
    }
}

/// Unmount a disk
fn unmount_device(device_path: &str) -> Result<(), String> {
    let output = Command::new("diskutil")
        .args(["unmountDisk", device_path])
        .output()
        .map_err(|e| format!("Failed to unmount: {}", e))?;

    if !output.status.success() {
        // Try force unmount
        let _ = Command::new("diskutil")
            .args(["unmountDisk", "force", device_path])
            .output();
    }

    Ok(())
}

/// Verify written data
async fn verify_image(
    image_path: &std::path::Path,
    device_path: &str,
    state: &Arc<FlashState>,
    tx: &mpsc::Sender<FlashProgress>,
) -> Result<(), String> {
    state.verified_bytes.store(0, Ordering::SeqCst);

    let mut image_file = std::fs::File::open(image_path)
        .map_err(|e| format!("Failed to open image: {}", e))?;

    let mut device = std::fs::File::open(device_path)
        .map_err(|e| format!("Failed to open device: {}", e))?;

    let image_size = state.total_bytes.load(Ordering::SeqCst);
    let mut image_buffer = vec![0u8; CHUNK_SIZE];
    let mut device_buffer = vec![0u8; CHUNK_SIZE];
    let mut verified: u64 = 0;

    loop {
        if state.is_cancelled.load(Ordering::SeqCst) {
            return Err("Verification cancelled".to_string());
        }

        let image_read = image_file
            .read(&mut image_buffer)
            .map_err(|e| format!("Failed to read image: {}", e))?;

        if image_read == 0 {
            break;
        }

        let device_read = device
            .read(&mut device_buffer[..image_read])
            .map_err(|e| format!("Failed to read device: {}", e))?;

        if device_read != image_read || image_buffer[..image_read] != device_buffer[..image_read] {
            return Err(format!("Verification failed at byte {}", verified));
        }

        verified += image_read as u64;
        state.verified_bytes.store(verified, Ordering::SeqCst);

        if verified % (image_size / 10).max(CHUNK_SIZE as u64) < CHUNK_SIZE as u64 {
            let _ = tx.send(state.get_progress()).await;
        }
    }

    Ok(())
}
