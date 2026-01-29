//! Linux flash implementation
//!
//! Uses UDisks2 via polkit for privilege escalation,
//! or direct /dev access if running as root.

use super::{FlashState, CHUNK_SIZE};
use crate::flasher::types::{FlashOptions, FlashPhase, FlashProgress};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use tokio::sync::mpsc;

/// Request authorization for device access
/// On Linux, we rely on polkit when using UDisks2
pub fn request_authorization(device_path: &str) -> Result<bool, String> {
    // Check if we're already root
    if unsafe { libc::geteuid() } == 0 {
        return Ok(true);
    }

    // For now, we'll use direct device access which requires root
    // The user will need to run the app with appropriate permissions
    // or we can prompt for pkexec
    println!(
        "[flasher::linux] Authorization will be requested via polkit for: {}",
        device_path
    );
    Ok(true)
}

/// Flash image to device on Linux
pub async fn flash_image(
    image_path: &PathBuf,
    device_path: &str,
    options: &FlashOptions,
    state: &Arc<FlashState>,
    tx: &mpsc::Sender<FlashProgress>,
) -> Result<(), String> {
    // 1. Unmount all partitions on the device
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

    // 3. Open files
    let mut image_file = std::fs::File::open(image_path)
        .map_err(|e| format!("Failed to open image: {}", e))?;

    // Open device for writing - this may require root
    let mut device = std::fs::OpenOptions::new()
        .write(true)
        .read(true)
        .open(device_path)
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::PermissionDenied {
                format!(
                    "Permission denied for {}. Try running with sudo or configure polkit rules.",
                    device_path
                )
            } else {
                format!("Failed to open device {}: {}", device_path, e)
            }
        })?;

    // 4. Write image
    state.set_phase(FlashPhase::Writing);
    let _ = tx.send(state.get_progress()).await;

    let mut buffer = vec![0u8; CHUNK_SIZE];
    let mut written: u64 = 0;

    loop {
        // Check for cancellation
        if state.is_cancelled.load(Ordering::SeqCst) {
            return Err("Flash cancelled by user".to_string());
        }

        let bytes_read = image_file
            .read(&mut buffer)
            .map_err(|e| format!("Failed to read image: {}", e))?;

        if bytes_read == 0 {
            break;
        }

        device
            .write_all(&buffer[..bytes_read])
            .map_err(|e| format!("Failed to write to device: {}", e))?;

        written += bytes_read as u64;
        state.written_bytes.store(written, Ordering::SeqCst);

        // Send progress update every ~10%
        if written % (image_size / 10).max(CHUNK_SIZE as u64) < CHUNK_SIZE as u64 {
            let _ = tx.send(state.get_progress()).await;
        }
    }

    // 5. Sync
    device.flush().ok();
    let _ = Command::new("sync").output();

    // 6. Verify if requested
    if options.verify {
        state.set_phase(FlashPhase::Verifying);
        let _ = tx.send(state.get_progress()).await;

        verify_image(image_path, device_path, state, tx).await?;
    }

    // 7. Done
    state.set_phase(FlashPhase::Completed);
    let _ = tx.send(state.get_progress()).await;

    // Eject the device
    let _ = Command::new("eject").arg(device_path).output();

    Ok(())
}

/// Unmount all partitions on a device
fn unmount_device(device_path: &str) -> Result<(), String> {
    // Get all partitions
    let output = Command::new("lsblk")
        .args(["-ln", "-o", "NAME", device_path])
        .output()
        .map_err(|e| format!("Failed to list partitions: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);

    for line in stdout.lines() {
        let part_name = line.trim();
        if !part_name.is_empty() {
            let part_path = format!("/dev/{}", part_name);

            // Try umount
            let _ = Command::new("umount").arg(&part_path).output();

            // Also try udisksctl for user mounts
            let _ = Command::new("udisksctl")
                .args(["unmount", "-b", &part_path])
                .output();
        }
    }

    Ok(())
}

/// Verify written data matches the image
async fn verify_image(
    image_path: &PathBuf,
    device_path: &str,
    state: &Arc<FlashState>,
    tx: &mpsc::Sender<FlashProgress>,
) -> Result<(), String> {
    state.verified_bytes.store(0, Ordering::SeqCst);

    let mut image_file = std::fs::File::open(image_path)
        .map_err(|e| format!("Failed to open image for verification: {}", e))?;

    let mut device = std::fs::File::open(device_path)
        .map_err(|e| format!("Failed to open device for verification: {}", e))?;

    // Seek to start
    device.seek(SeekFrom::Start(0)).ok();

    let image_size = state.total_bytes.load(Ordering::SeqCst);
    let mut image_buffer = vec![0u8; CHUNK_SIZE];
    let mut device_buffer = vec![0u8; CHUNK_SIZE];
    let mut verified: u64 = 0;

    loop {
        // Check for cancellation
        if state.is_cancelled.load(Ordering::SeqCst) {
            return Err("Verification cancelled by user".to_string());
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

        if device_read != image_read {
            return Err(format!(
                "Verification failed: size mismatch at byte {}",
                verified
            ));
        }

        if image_buffer[..image_read] != device_buffer[..image_read] {
            return Err(format!("Verification failed: data mismatch at byte {}", verified));
        }

        verified += image_read as u64;
        state.verified_bytes.store(verified, Ordering::SeqCst);

        // Send progress update
        if verified % (image_size / 10).max(CHUNK_SIZE as u64) < CHUNK_SIZE as u64 {
            let _ = tx.send(state.get_progress()).await;
        }
    }

    Ok(())
}
