//! Windows device detection
//!
//! Uses WMI queries to enumerate physical drives.

use crate::flasher::types::{format_size, BlockDevice};
use std::process::Command;

/// Get list of block devices on Windows using PowerShell/WMI
pub fn get_block_devices() -> Result<Vec<BlockDevice>, String> {
    // Use PowerShell to query WMI for disk information
    // This provides more reliable data than direct Win32 API calls
    let script = r#"
        Get-WmiObject -Class Win32_DiskDrive | ForEach-Object {
            $disk = $_
            $partitions = Get-WmiObject -Query "ASSOCIATORS OF {Win32_DiskDrive.DeviceID='$($disk.DeviceID)'} WHERE AssocClass=Win32_DiskDriveToDiskPartition"
            $mountPoints = @()
            foreach ($partition in $partitions) {
                $logicalDisks = Get-WmiObject -Query "ASSOCIATORS OF {Win32_DiskPartition.DeviceID='$($partition.DeviceID)'} WHERE AssocClass=Win32_LogicalDiskToPartition"
                foreach ($logicalDisk in $logicalDisks) {
                    $mountPoints += $logicalDisk.DeviceID
                }
            }
            [PSCustomObject]@{
                DeviceID = $disk.DeviceID
                Index = $disk.Index
                Size = $disk.Size
                Model = $disk.Model
                MediaType = $disk.MediaType
                InterfaceType = $disk.InterfaceType
                MountPoints = ($mountPoints -join ',')
            }
        } | ConvertTo-Json -Compress
    "#;

    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", script])
        .output()
        .map_err(|e| format!("Failed to run PowerShell: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "PowerShell failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stdout = stdout.trim();

    // Handle empty output
    if stdout.is_empty() || stdout == "null" {
        return Ok(Vec::new());
    }

    // Parse JSON - might be single object or array
    let json: serde_json::Value = serde_json::from_str(stdout)
        .map_err(|e| format!("Failed to parse JSON: {} - Output: {}", e, stdout))?;

    let disks: Vec<serde_json::Value> = if json.is_array() {
        json.as_array().unwrap().clone()
    } else {
        vec![json]
    };

    let system_drives = get_system_drives();
    let mut devices = Vec::new();

    for disk in disks {
        let device_id = disk["DeviceID"].as_str().unwrap_or("").to_string();
        let index = disk["Index"].as_u64().unwrap_or(0) as u32;
        let size = disk["Size"].as_u64().unwrap_or(0);
        let model = disk["Model"].as_str().unwrap_or("").trim().to_string();
        let media_type = disk["MediaType"].as_str().unwrap_or("");
        let interface_type = disk["InterfaceType"].as_str().unwrap_or("");
        let mount_points_str = disk["MountPoints"].as_str().unwrap_or("");

        // Skip if no size
        if size == 0 {
            continue;
        }

        // Parse mount points
        let mount_points: Vec<String> = mount_points_str
            .split(',')
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .collect();

        // Determine if removable
        let is_removable = media_type.contains("Removable")
            || interface_type == "USB"
            || model.to_lowercase().contains("usb");

        // Determine if system disk
        let is_system = mount_points.iter().any(|mp| system_drives.contains(mp))
            || index == 0;  // Disk 0 is typically the system disk

        // Determine bus type
        let bus_type = match interface_type {
            "USB" => Some("USB".to_string()),
            "SCSI" => Some("SCSI".to_string()),
            "IDE" => Some("IDE".to_string()),
            "1394" => Some("FireWire".to_string()),
            _ => {
                if model.to_lowercase().contains("nvme") {
                    Some("NVMe".to_string())
                } else if model.to_lowercase().contains("sd card") {
                    Some("SD".to_string())
                } else {
                    None
                }
            }
        };

        // Windows device path format
        let path = format!(r"\\.\PhysicalDrive{}", index);

        devices.push(BlockDevice {
            path,
            name: format!("PhysicalDrive{}", index),
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

/// Get system drive letters (C:, etc.)
fn get_system_drives() -> Vec<String> {
    let mut drives = vec!["C:".to_string()];

    // Get Windows directory drive
    if let Ok(windir) = std::env::var("WINDIR") {
        if let Some(drive) = windir.chars().next() {
            let drive_letter = format!("{}:", drive.to_ascii_uppercase());
            if !drives.contains(&drive_letter) {
                drives.push(drive_letter);
            }
        }
    }

    drives
}
