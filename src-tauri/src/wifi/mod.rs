// WiFi scanning module
// Scans available WiFi networks using system commands
// Uses async + spawn_blocking to avoid blocking the UI

use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
pub struct WifiNetwork {
    pub ssid: String,
    pub signal_strength: Option<i32>, // dBm or percentage
    pub is_reachy_hotspot: bool,
}

/// Scan available WiFi networks on the local machine (async, non-blocking)
/// Returns a list of SSIDs with signal strength
#[tauri::command]
pub async fn scan_local_wifi_networks() -> Result<Vec<WifiNetwork>, String> {
    // Run the blocking scan operation in a separate thread pool
    // This prevents blocking the main Tauri event loop / UI
    tokio::task::spawn_blocking(|| {
        scan_wifi_sync()
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Synchronous WiFi scan (runs in spawn_blocking thread)
fn scan_wifi_sync() -> Result<Vec<WifiNetwork>, String> {
    #[cfg(target_os = "macos")]
    {
        scan_macos()
    }
    
    #[cfg(target_os = "windows")]
    {
        scan_windows()
    }
    
    #[cfg(target_os = "linux")]
    {
        scan_linux()
    }
    
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        Err("WiFi scanning not supported on this platform".to_string())
    }
}

/// Check if a network name looks like a Reachy hotspot
fn is_reachy_hotspot(ssid: &str) -> bool {
    let ssid_lower = ssid.to_lowercase();
    ssid_lower.contains("reachy-mini") || 
    ssid_lower.contains("reachy_mini") ||
    ssid_lower.contains("reachymini")
}

// ============================================================================
// macOS Implementation
// ============================================================================

#[cfg(target_os = "macos")]
fn scan_macos() -> Result<Vec<WifiNetwork>, String> {
    use std::process::Command;
    
    // Use system_profiler which works on modern macOS (airport is deprecated)
    // Note: Don't use -detailLevel basic, it hides "Other Local Wi-Fi Networks"
    let output = Command::new("system_profiler")
        .arg("SPAirPortDataType")
        .output()
        .map_err(|e| format!("Failed to run system_profiler: {}", e))?;
    
    if !output.status.success() {
        return Err(format!(
            "system_profiler command failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut networks = Vec::new();
    let mut seen_ssids = std::collections::HashSet::new();
    let mut in_other_networks = false;
    let mut current_ssid: Option<String> = None;
    let mut current_signal: Option<i32> = None;
    
    // Parse system_profiler output
    // Format:
    //   Other Local Wi-Fi Networks:
    //     NetworkName:
    //       PHY Mode: ...
    //       Signal / Noise: -50 dBm / -86 dBm
    for line in stdout.lines() {
        let trimmed = line.trim();
        
        // Start parsing when we hit "Other Local Wi-Fi Networks:"
        if trimmed.contains("Other Local Wi-Fi Networks:") {
            in_other_networks = true;
            continue;
        }
        
        // Stop parsing if we hit another major section
        if in_other_networks && !trimmed.is_empty() && !line.starts_with(' ') && !line.starts_with('\t') {
            // Save last network if exists
            if let Some(ssid) = current_ssid.take() {
                if !seen_ssids.contains(&ssid) {
                    seen_ssids.insert(ssid.clone());
                    networks.push(WifiNetwork {
                        is_reachy_hotspot: is_reachy_hotspot(&ssid),
                        ssid,
                        signal_strength: current_signal.take(),
                    });
                }
            }
            break;
        }
        
        if in_other_networks {
            // Check if this is a network name (ends with colon, moderate indentation)
            // Network names have ~12 spaces of indentation
            let leading_spaces = line.len() - line.trim_start().len();
            
            if trimmed.ends_with(':') && !trimmed.contains('/') && leading_spaces >= 10 && leading_spaces <= 16 {
                // Save previous network
                if let Some(ssid) = current_ssid.take() {
                    if !seen_ssids.contains(&ssid) {
                        seen_ssids.insert(ssid.clone());
                        networks.push(WifiNetwork {
                            is_reachy_hotspot: is_reachy_hotspot(&ssid),
                            ssid,
                            signal_strength: current_signal.take(),
                        });
                    }
                }
                
                // Start new network
                let ssid = trimmed.trim_end_matches(':').to_string();
                if !ssid.is_empty() && !ssid.contains("Wi-Fi") {
                    current_ssid = Some(ssid);
                    current_signal = None;
                }
            }
            
            // Parse signal strength
            if trimmed.starts_with("Signal / Noise:") {
                // Format: "Signal / Noise: -50 dBm / -86 dBm"
                if let Some(signal_part) = trimmed.split(':').nth(1) {
                    if let Some(dbm_str) = signal_part.split('/').next() {
                        let clean = dbm_str.trim().replace("dBm", "").trim().to_string();
                        current_signal = clean.parse().ok();
                    }
                }
            }
        }
    }
    
    // Don't forget the last network
    if let Some(ssid) = current_ssid {
        if !seen_ssids.contains(&ssid) {
            networks.push(WifiNetwork {
                is_reachy_hotspot: is_reachy_hotspot(&ssid),
                ssid,
                signal_strength: current_signal,
            });
        }
    }
    
    // Sort: Reachy hotspots first, then by signal strength
    networks.sort_by(|a, b| {
        if a.is_reachy_hotspot != b.is_reachy_hotspot {
            return b.is_reachy_hotspot.cmp(&a.is_reachy_hotspot);
        }
        // Higher signal (less negative) is better
        match (&a.signal_strength, &b.signal_strength) {
            (Some(a_sig), Some(b_sig)) => b_sig.cmp(a_sig), // -50 > -70
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => std::cmp::Ordering::Equal,
        }
    });
    
    Ok(networks)
}

// ============================================================================
// Windows Implementation
// ============================================================================

#[cfg(target_os = "windows")]
fn scan_windows() -> Result<Vec<WifiNetwork>, String> {
    use std::process::Command;
    
    let output = Command::new("netsh")
        .args(["wlan", "show", "networks", "mode=Bssid"])
        .output()
        .map_err(|e| format!("Failed to run netsh command: {}", e))?;
    
    if !output.status.success() {
        return Err(format!(
            "netsh command failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut networks = Vec::new();
    let mut current_ssid: Option<String> = None;
    let mut current_signal: Option<i32> = None;
    
    for line in stdout.lines() {
        let trimmed = line.trim();
        
        // Parse SSID line
        if trimmed.starts_with("SSID") && trimmed.contains(':') {
            // Save previous network if exists
            if let Some(ssid) = current_ssid.take() {
                if !ssid.is_empty() {
                    networks.push(WifiNetwork {
                        is_reachy_hotspot: is_reachy_hotspot(&ssid),
                        ssid,
                        signal_strength: current_signal.take(),
                    });
                }
            }
            
            // Extract new SSID
            if let Some(pos) = trimmed.find(':') {
                current_ssid = Some(trimmed[pos + 1..].trim().to_string());
            }
        }
        
        // Parse Signal line (percentage)
        if trimmed.starts_with("Signal") && trimmed.contains(':') {
            if let Some(pos) = trimmed.find(':') {
                let signal_str = trimmed[pos + 1..].trim().replace('%', "");
                current_signal = signal_str.parse().ok();
            }
        }
    }
    
    // Don't forget the last network
    if let Some(ssid) = current_ssid {
        if !ssid.is_empty() {
            networks.push(WifiNetwork {
                is_reachy_hotspot: is_reachy_hotspot(&ssid),
                ssid,
                signal_strength: current_signal,
            });
        }
    }
    
    // Sort: Reachy hotspots first, then by signal
    networks.sort_by(|a, b| {
        if a.is_reachy_hotspot != b.is_reachy_hotspot {
            return b.is_reachy_hotspot.cmp(&a.is_reachy_hotspot);
        }
        match (&b.signal_strength, &a.signal_strength) {
            (Some(b_sig), Some(a_sig)) => b_sig.cmp(a_sig),
            _ => std::cmp::Ordering::Equal,
        }
    });
    
    Ok(networks)
}

// ============================================================================
// Linux Implementation
// ============================================================================

#[cfg(target_os = "linux")]
fn scan_linux() -> Result<Vec<WifiNetwork>, String> {
    use std::process::Command;
    
    // Try nmcli first (most common on modern distros)
    let output = Command::new("nmcli")
        .args(["-t", "-f", "SSID,SIGNAL", "device", "wifi", "list", "--rescan", "yes"])
        .output();
    
    match output {
        Ok(output) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let mut networks = Vec::new();
            let mut seen_ssids = std::collections::HashSet::new();
            
            for line in stdout.lines() {
                let parts: Vec<&str> = line.split(':').collect();
                if parts.len() >= 2 {
                    let ssid = parts[0].trim().to_string();
                    if !ssid.is_empty() && !seen_ssids.contains(&ssid) {
                        seen_ssids.insert(ssid.clone());
                        let signal: Option<i32> = parts[1].trim().parse().ok();
                        networks.push(WifiNetwork {
                            is_reachy_hotspot: is_reachy_hotspot(&ssid),
                            ssid,
                            signal_strength: signal,
                        });
                    }
                }
            }
            
            // Sort: Reachy hotspots first
            networks.sort_by(|a, b| b.is_reachy_hotspot.cmp(&a.is_reachy_hotspot));
            
            return Ok(networks);
        }
        _ => {}
    }
    
    // Fallback to iwlist (requires sudo/root)
    let output = Command::new("iwlist")
        .args(["scan"])
        .output()
        .map_err(|e| format!("Failed to run iwlist: {}", e))?;
    
    if !output.status.success() {
        return Err("WiFi scanning requires nmcli or root privileges for iwlist".to_string());
    }
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut networks = Vec::new();
    let mut current_ssid: Option<String> = None;
    let mut current_signal: Option<i32> = None;
    
    for line in stdout.lines() {
        let trimmed = line.trim();
        
        if trimmed.starts_with("ESSID:") {
            if let Some(ssid) = current_ssid.take() {
                networks.push(WifiNetwork {
                    is_reachy_hotspot: is_reachy_hotspot(&ssid),
                    ssid,
                    signal_strength: current_signal.take(),
                });
            }
            
            // Extract SSID (remove quotes)
            let ssid = trimmed
                .replace("ESSID:", "")
                .replace('"', "")
                .trim()
                .to_string();
            if !ssid.is_empty() {
                current_ssid = Some(ssid);
            }
        }
        
        if trimmed.contains("Signal level=") {
            // Parse signal level (dBm)
            if let Some(pos) = trimmed.find("Signal level=") {
                let signal_str = &trimmed[pos + 13..];
                let signal_str = signal_str.split_whitespace().next().unwrap_or("");
                current_signal = signal_str.replace("dBm", "").parse().ok();
            }
        }
    }
    
    // Last network
    if let Some(ssid) = current_ssid {
        networks.push(WifiNetwork {
            is_reachy_hotspot: is_reachy_hotspot(&ssid),
            ssid,
            signal_strength: current_signal,
        });
    }
    
    // Sort: Reachy hotspots first
    networks.sort_by(|a, b| b.is_reachy_hotspot.cmp(&a.is_reachy_hotspot));
    
    Ok(networks)
}

