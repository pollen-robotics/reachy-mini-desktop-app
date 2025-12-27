// WiFi scanning and mDNS discovery module
// - Scans available WiFi networks using system commands
// - Discovers Reachy robots on the network using mDNS (cross-platform)
// Uses async + spawn_blocking to avoid blocking the UI

use serde::Serialize;
use std::process::Command;
use std::time::Duration;
use std::net::SocketAddr;

#[derive(Debug, Serialize, Clone)]
pub struct WifiNetwork {
    pub ssid: String,
    pub signal_strength: Option<i32>, // dBm or percentage
    pub is_reachy_hotspot: bool,
}

/// Get the current WiFi SSID the computer is connected to
/// Returns None if not connected to WiFi
#[tauri::command]
pub async fn get_current_wifi_ssid() -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(|| get_current_ssid_sync())
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

/// Synchronous current SSID detection
fn get_current_ssid_sync() -> Result<Option<String>, String> {
    #[cfg(target_os = "macos")]
    {
        get_current_ssid_macos()
    }
    
    #[cfg(target_os = "windows")]
    {
        get_current_ssid_windows()
    }
    
    #[cfg(target_os = "linux")]
    {
        get_current_ssid_linux()
    }
    
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        Ok(None)
    }
}

#[cfg(target_os = "macos")]
fn get_current_ssid_macos() -> Result<Option<String>, String> {
    // Use networksetup to get current WiFi network
    let output = Command::new("networksetup")
        .args(["-getairportnetwork", "en0"])
        .output()
        .map_err(|e| format!("Failed to run networksetup: {}", e))?;
    
    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        // Output format: "Current Wi-Fi Network: NetworkName"
        if let Some(pos) = stdout.find(": ") {
            let ssid = stdout[pos + 2..].trim().to_string();
            if !ssid.is_empty() && ssid != "You are not associated with an AirPort network." {
                return Ok(Some(ssid));
            }
        }
    }
    Ok(None)
}

#[cfg(target_os = "windows")]
fn get_current_ssid_windows() -> Result<Option<String>, String> {
    let output = Command::new("netsh")
        .args(["wlan", "show", "interfaces"])
        .output()
        .map_err(|e| format!("Failed to run netsh: {}", e))?;
    
    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with("SSID") && !trimmed.starts_with("SSID BSSID") {
                if let Some(pos) = trimmed.find(':') {
                    let ssid = trimmed[pos + 1..].trim().to_string();
                    if !ssid.is_empty() {
                        return Ok(Some(ssid));
                    }
                }
            }
        }
    }
    Ok(None)
}

#[cfg(target_os = "linux")]
fn get_current_ssid_linux() -> Result<Option<String>, String> {
    // Try nmcli first
    let output = Command::new("nmcli")
        .args(["-t", "-f", "active,ssid", "dev", "wifi"])
        .output();
    
    if let Ok(output) = output {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                // Format: "yes:NetworkName" for active connection
                if line.starts_with("yes:") {
                    let ssid = line[4..].to_string();
                    if !ssid.is_empty() {
                        return Ok(Some(ssid));
                    }
                }
            }
        }
    }
    
    // Fallback to iwgetid
    let output = Command::new("iwgetid")
        .args(["-r"])
        .output();
    
    if let Ok(output) = output {
        if output.status.success() {
            let ssid = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !ssid.is_empty() {
                return Ok(Some(ssid));
            }
        }
    }
    
    Ok(None)
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

// ============================================================================
// mDNS Robot Discovery
// ============================================================================

/// Result of robot discovery - always contains an IP address (not hostname)
#[derive(Debug, Serialize, Clone)]
pub struct DiscoveredRobot {
    /// IP address of the robot (IPv4)
    pub ip: String,
    /// Port number (usually 8000)
    pub port: u16,
    /// Original hostname that was resolved (for debugging)
    pub hostname: String,
    /// How the robot was discovered
    pub discovery_method: String,
}

/// Discover Reachy robots on the network using mDNS
/// 
/// This function uses multiple discovery strategies:
/// 1. System DNS resolution (uses OS mDNS cache - fastest)
/// 2. Pure Rust mDNS browsing (cross-platform fallback)
/// 3. Known IP fallbacks (hotspot mode + common static IPs)
/// 
/// The returned IP address can be used directly for all subsequent connections,
/// avoiding mDNS resolution issues in WebView.
#[tauri::command]
pub async fn discover_reachy_robot() -> Result<Option<DiscoveredRobot>, String> {
    // Run discovery in a blocking task to not block the UI
    tokio::task::spawn_blocking(|| {
        discover_robot_sync()
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Synchronous robot discovery (runs in spawn_blocking thread)
fn discover_robot_sync() -> Result<Option<DiscoveredRobot>, String> {
    // Hostnames to try resolving via system DNS / mDNS
    let mdns_hostnames = vec![
        "reachy-mini.local",   // Standard mDNS hostname (.local)
        "reachy-mini.home",    // Some routers use .home domain
    ];
    
    let daemon_port: u16 = 8000;
    let timeout = Duration::from_secs(5); // Increased for slow networks / mDNS cache miss
    
    // =========================================================================
    // Strategy 1: System DNS resolution (fastest, uses OS mDNS cache)
    // =========================================================================
    // This leverages macOS Bonjour / Windows mDNS / Linux Avahi via system resolver
    // Much faster than pure Rust mDNS browsing when hostname is cached
    
    for hostname in &mdns_hostnames {
        println!("[Discovery] Trying system DNS for: {}", hostname);
        
        if let Ok(Some(ip)) = resolve_via_system_dns(hostname) {
            // Verify the daemon is actually running on this IP
            if probe_daemon(&ip, daemon_port) {
                println!("[Discovery] ✓ Found robot at {} (resolved from {})", ip, hostname);
                return Ok(Some(DiscoveredRobot {
                    ip: ip.clone(),
                    port: daemon_port,
                    hostname: hostname.to_string(),
                    discovery_method: "system_dns".to_string(),
                }));
            } else {
                println!("[Discovery] IP {} resolved but daemon not responding", ip);
            }
        }
    }
    
    // =========================================================================
    // Strategy 2: Pure Rust mDNS service browsing (cross-platform fallback)
    // =========================================================================
    // Used when system DNS fails (no mDNSResponder, cache miss, etc.)
    
    println!("[Discovery] System DNS failed, trying mDNS service browsing...");
    
    // Create mDNS daemon (pure Rust, cross-platform)
    if let Ok(mdns) = mdns_sd::ServiceDaemon::new() {
        for hostname in &mdns_hostnames {
            let hostname_with_dot = format!("{}.", hostname);
            
            match resolve_mdns_hostname(&mdns, &hostname_with_dot, timeout) {
                Ok(Some(ip)) => {
                    if probe_daemon(&ip, daemon_port) {
                        println!("[Discovery] ✓ Found robot at {} (via mDNS browsing)", ip);
                        let _ = mdns.shutdown();
                        return Ok(Some(DiscoveredRobot {
                            ip: ip.clone(),
                            port: daemon_port,
                            hostname: hostname.to_string(),
                            discovery_method: "mdns_browse".to_string(),
                        }));
                    }
                }
                Ok(None) => {}
                Err(e) => {
                    println!("[Discovery] mDNS error for {}: {}", hostname, e);
                }
            }
        }
        let _ = mdns.shutdown();
    }
    
    // No robot found via any method
    println!("[Discovery] No robot found via mDNS");
    Ok(None)
}

/// Resolve a .local hostname to an IP address using pure Rust mDNS browsing
/// 
/// This uses mdns-sd to browse for services and find Reachy devices.
/// Note: This is a fallback - system DNS (resolve_via_system_dns) is preferred
/// because it's faster and uses the OS mDNS cache.
fn resolve_mdns_hostname(
    mdns: &mdns_sd::ServiceDaemon, 
    _hostname: &str, // Not used directly - we browse for services instead
    timeout: Duration
) -> Result<Option<String>, String> {
    use mdns_sd::ServiceEvent;
    
    // Browse for workstation services (_workstation._tcp) which most Linux/macOS machines advertise
    // This is more reliable than _http._tcp which the daemon may not advertise
    let service_types = vec![
        "_workstation._tcp.local.",  // Standard service advertised by most machines
        "_http._tcp.local.",         // HTTP service (fallback)
    ];
    
    for service_type in service_types {
        let receiver = match mdns.browse(service_type) {
            Ok(r) => r,
            Err(_) => continue,
        };
        
        let start = std::time::Instant::now();
        
        while start.elapsed() < timeout {
            match receiver.recv_timeout(Duration::from_millis(200)) {
                Ok(ServiceEvent::ServiceResolved(info)) => {
                    let service_hostname = info.get_hostname();
                    
                    // Check if this is a Reachy device
                    if service_hostname.to_lowercase().contains("reachy-mini") {
                        // Get IPv4 addresses
                        let addresses = info.get_addresses_v4();
                        if let Some(ip) = addresses.iter().next() {
                            return Ok(Some(ip.to_string()));
                        }
                    }
                }
                Ok(_) => {
                    // Other events (SearchStarted, ServiceFound, etc.) - continue
                }
                Err(_) => {
                    // Timeout - continue loop, will exit on timeout check
                }
            }
        }
    }
    
    Ok(None)
}

/// Fallback: Try to resolve hostname via system DNS (may use mDNS on macOS)
fn resolve_via_system_dns(hostname: &str) -> Result<Option<String>, String> {
    use std::net::ToSocketAddrs;
    
    let addr_str = format!("{}:80", hostname);
    
    match addr_str.to_socket_addrs() {
        Ok(addrs) => {
            for addr in addrs {
                if let SocketAddr::V4(v4) = addr {
                    return Ok(Some(v4.ip().to_string()));
                }
            }
            Ok(None)
        }
        Err(_) => Ok(None)
    }
}

/// Check if daemon is responding on the given IP:port
/// 
/// Uses TCP connect probe which is faster than HTTP but confirms the port is open.
/// Timeout is set to 1.5s to handle slow networks while keeping discovery responsive.
fn probe_daemon(ip: &str, port: u16) -> bool {
    use std::net::TcpStream;
    
    let addr = format!("{}:{}", ip, port);
    
    // TCP connect probe - confirms port is open and accepting connections
    // 1.5s timeout balances between responsiveness and handling slow networks
    match TcpStream::connect_timeout(
        &addr.parse().unwrap_or_else(|_| SocketAddr::from(([0, 0, 0, 0], port))),
        Duration::from_millis(1500)
    ) {
        Ok(_) => true,
        Err(_) => false,
    }
}
