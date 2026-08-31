//! macOS device detection
//!
//! Uses diskutil to enumerate block devices.

use crate::flasher::types::{format_size, BlockDevice};
use std::process::Command;

/// Get list of block devices on macOS using diskutil
pub fn get_block_devices() -> Result<Vec<BlockDevice>, String> {
    // Get list of all disks
    let output = Command::new("diskutil")
        .args(["list", "-plist"])
        .output()
        .map_err(|e| format!("Failed to run diskutil: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "diskutil failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    // Parse plist output
    let stdout = String::from_utf8_lossy(&output.stdout);
    let disks = parse_disk_list(&stdout)?;

    let mut devices = Vec::new();

    for disk_id in disks {
        if let Ok(device) = get_disk_info(&disk_id) {
            devices.push(device);
        }
    }

    Ok(devices)
}

/// Parse disk list from plist output
fn parse_disk_list(plist: &str) -> Result<Vec<String>, String> {
    let mut disks = Vec::new();

    // Simple parsing - look for /dev/diskN entries
    // We only want whole disks, not partitions (diskNsM)
    for line in plist.lines() {
        let trimmed = line.trim();
        if trimmed.contains("/dev/disk") && !trimmed.contains("s") {
            // Extract disk identifier
            if let Some(start) = trimmed.find("/dev/disk") {
                let rest = &trimmed[start..];
                if let Some(end) = rest.find('<') {
                    let disk_path = rest[..end].trim();
                    if !disk_path.contains('s') || disk_path.ends_with(|c: char| c.is_ascii_digit()) {
                        // Only add if it's a whole disk (disk0, disk1, etc.)
                        let disk_id = disk_path.strip_prefix("/dev/").unwrap_or(disk_path);
                        if disk_id.starts_with("disk") && !disk_id.contains('s') {
                            disks.push(disk_id.to_string());
                        }
                    }
                }
            }
        }
    }

    // Fallback: use diskutil list to get disk identifiers
    if disks.is_empty() {
        let output = Command::new("diskutil")
            .args(["list"])
            .output()
            .map_err(|e| format!("Failed to run diskutil list: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            if line.starts_with("/dev/disk") {
                if let Some(disk_path) = line.split_whitespace().next() {
                    let disk_id = disk_path.strip_prefix("/dev/").unwrap_or(disk_path);
                    // Only whole disks, not partitions
                    if disk_id.starts_with("disk") && !disk_id.contains('s') {
                        disks.push(disk_id.to_string());
                    }
                }
            }
        }
    }

    Ok(disks)
}

/// Get detailed info for a specific disk
fn get_disk_info(disk_id: &str) -> Result<BlockDevice, String> {
    let output = Command::new("diskutil")
        .args(["info", disk_id])
        .output()
        .map_err(|e| format!("Failed to get disk info: {}", e))?;

    if !output.status.success() {
        return Err(format!("diskutil info failed for {}", disk_id));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);

    let mut size: u64 = 0;
    let mut model = String::new();
    let mut is_removable = false;
    let mut is_internal = false;
    let mut bus_type: Option<String> = None;
    let mut mount_point: Option<String> = None;

    for line in stdout.lines() {
        let trimmed = line.trim();

        if trimmed.starts_with("Disk Size:") {
            // Parse size: "Disk Size: 31.9 GB (31914983424 Bytes)"
            if let Some(bytes_start) = trimmed.find('(') {
                if let Some(bytes_end) = trimmed.find(" Bytes") {
                    let bytes_str = &trimmed[bytes_start + 1..bytes_end];
                    size = bytes_str.parse().unwrap_or(0);
                }
            }
        } else if trimmed.starts_with("Device / Media Name:") {
            model = trimmed
                .strip_prefix("Device / Media Name:")
                .unwrap_or("")
                .trim()
                .to_string();
        } else if trimmed.starts_with("Removable Media:") {
            is_removable = trimmed.contains("Removable");
        } else if trimmed.starts_with("Device Location:") {
            is_internal = trimmed.contains("Internal");
        } else if trimmed.starts_with("Protocol:") {
            let protocol = trimmed
                .strip_prefix("Protocol:")
                .unwrap_or("")
                .trim();
            bus_type = match protocol {
                "USB" => Some("USB".to_string()),
                "Secure Digital" | "SD" => Some("SD".to_string()),
                "SATA" => Some("SATA".to_string()),
                "NVMe" | "NVM Express" => Some("NVMe".to_string()),
                "Apple Fabric" => Some("Internal".to_string()),
                _ => Some(protocol.to_string()),
            };
        } else if trimmed.starts_with("Mount Point:") {
            let mp = trimmed
                .strip_prefix("Mount Point:")
                .unwrap_or("")
                .trim();
            if !mp.is_empty() && mp != "Not mounted" {
                mount_point = Some(mp.to_string());
            }
        }
    }

    // Determine if this is a system disk
    let is_system = is_internal && !is_removable && (
        mount_point.as_ref().map(|m| m == "/" || m.starts_with("/System")).unwrap_or(false)
        || disk_id == "disk0"
        || disk_id == "disk1"  // Often the synthesized APFS container
    );

    let path = format!("/dev/{}", disk_id);
    let mount_points = mount_point.map(|m| vec![m]).unwrap_or_default();

    Ok(BlockDevice {
        path,
        name: disk_id.to_string(),
        size,
        size_formatted: format_size(size),
        model,
        is_removable,
        is_system,
        bus_type,
        mount_points,
    })
}
