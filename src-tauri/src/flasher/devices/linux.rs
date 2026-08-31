//! Linux device detection
//!
//! Uses lsblk JSON output for reliable parsing across distributions.

use crate::flasher::types::{format_size, BlockDevice};
use std::collections::HashSet;
use std::process::Command;

/// Get list of block devices on Linux using lsblk
pub fn get_block_devices() -> Result<Vec<BlockDevice>, String> {
    // Use JSON output for reliable parsing
    let output = Command::new("lsblk")
        .args(["-dpJo", "NAME,SIZE,MODEL,RM,TRAN,MOUNTPOINT", "-b"])
        .output()
        .map_err(|e| format!("Failed to run lsblk: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "lsblk failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let json: serde_json::Value =
        serde_json::from_str(&stdout).map_err(|e| format!("Failed to parse lsblk JSON: {}", e))?;

    let blockdevices = json["blockdevices"]
        .as_array()
        .ok_or("Invalid lsblk JSON structure")?;

    let system_disks = get_system_disks();
    let mut devices = Vec::new();

    for dev in blockdevices {
        let path = dev["name"].as_str().unwrap_or("");

        // Skip non-standard devices
        if !is_valid_device_path(path) {
            continue;
        }

        // Skip mmcblk boot/rpmb partitions
        if path.contains("boot") || path.contains("rpmb") {
            continue;
        }

        let dev_name = path.strip_prefix("/dev/").unwrap_or(path);

        // Check if system disk
        let is_system = system_disks
            .iter()
            .any(|sys| sys.starts_with(dev_name) || dev_name.starts_with(sys));

        // Parse size
        let size: u64 = match &dev["size"] {
            serde_json::Value::Number(n) => n.as_u64().unwrap_or(0),
            serde_json::Value::String(s) => s.parse().unwrap_or(0),
            _ => 0,
        };

        if size == 0 {
            continue;
        }

        let model = dev["model"]
            .as_str()
            .unwrap_or("")
            .trim()
            .to_string();

        // RM field: removable
        let is_removable = match &dev["rm"] {
            serde_json::Value::Bool(b) => *b,
            serde_json::Value::String(s) => s == "1",
            serde_json::Value::Number(n) => n.as_u64() == Some(1),
            _ => false,
        };

        // Transport type
        let tran = dev["tran"].as_str().unwrap_or("");
        let bus_type = parse_bus_type(tran, path);

        // Mount points
        let mount_points = get_mount_points(path);

        devices.push(BlockDevice {
            path: path.to_string(),
            name: dev_name.to_string(),
            size,
            size_formatted: format_size(size),
            model,
            is_removable,
            is_system,
            bus_type,
            mount_points,
        });
    }

    Ok(devices)
}

/// Check if device path is valid for flashing
fn is_valid_device_path(path: &str) -> bool {
    path.starts_with("/dev/sd")
        || path.starts_with("/dev/hd")
        || path.starts_with("/dev/vd")
        || path.starts_with("/dev/nvme")
        || path.starts_with("/dev/mmcblk")
}

/// Parse bus type from transport string
fn parse_bus_type(tran: &str, path: &str) -> Option<String> {
    match tran.to_uppercase().as_str() {
        "USB" => Some("USB".to_string()),
        "MMC" => Some("SD".to_string()),
        "SATA" => Some("SATA".to_string()),
        "NVME" => Some("NVMe".to_string()),
        "SAS" => Some("SAS".to_string()),
        "" => {
            // Fallback for devices without TRAN
            if path.contains("mmcblk") {
                Some("SD".to_string())
            } else if path.contains("nvme") {
                Some("NVMe".to_string())
            } else {
                None
            }
        }
        other => Some(other.to_string()),
    }
}

/// Get system disk names to exclude
fn get_system_disks() -> HashSet<String> {
    let mut system_disks = HashSet::new();

    for mount in &["/", "/boot", "/boot/efi", "/home"] {
        if let Ok(output) = Command::new("findmnt")
            .args(["-n", "-o", "SOURCE", mount])
            .output()
        {
            let source = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !source.is_empty() {
                // Get parent device name
                if let Ok(pkname_output) = Command::new("lsblk")
                    .args(["-no", "PKNAME", &source])
                    .output()
                {
                    let pkname = String::from_utf8_lossy(&pkname_output.stdout)
                        .trim()
                        .to_string();
                    if !pkname.is_empty() {
                        system_disks.insert(pkname);
                    }
                }
                // Also add the device itself
                if let Some(name) = source.split('/').next_back() {
                    // Remove partition number (sda1 -> sda)
                    let base_name: String = name
                        .chars()
                        .take_while(|c| !c.is_ascii_digit())
                        .collect();
                    if !base_name.is_empty() {
                        system_disks.insert(base_name);
                    }
                }
            }
        }
    }

    system_disks
}

/// Get mount points for a device
fn get_mount_points(device_path: &str) -> Vec<String> {
    let mut mount_points = Vec::new();

    if let Ok(output) = Command::new("lsblk")
        .args(["-ln", "-o", "MOUNTPOINT", device_path])
        .output()
    {
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            let mp = line.trim();
            if !mp.is_empty() && mp != "[SWAP]" {
                mount_points.push(mp.to_string());
            }
        }
    }

    mount_points
}
