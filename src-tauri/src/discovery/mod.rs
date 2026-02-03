//! Robot Discovery Module
//!
//! Provides robust multi-method robot discovery:
//! 1. Cache (last known IP) - Ultra fast (~2s)
//! 2. mDNS via mdns-sd - Automatic discovery (~3s)
//! 3. Static peers - User-configured IPs
//! 4. Manual IP - Direct connection fallback
//!
//! This replaces the old system command-based WiFi scanning with a native
//! Rust implementation that's faster, more reliable, and cross-platform.

use mdns_sd::{ServiceDaemon, ServiceEvent};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

/// Information about a discovered robot
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RobotInfo {
    pub name: String,
    pub ip: String,
    pub port: u16,
    pub discovery_method: String, // "cache", "mdns", "static", "manual"
    pub hostname: Option<String>,
}

/// Discovery configuration and cache
pub struct DiscoveryState {
    /// Last successfully connected IP (cache for fast reconnection)
    pub last_known_ip: Arc<RwLock<Option<String>>>,
    /// User-configured static peers (IPs that always get checked)
    pub static_peers: Arc<RwLock<Vec<String>>>,
}

impl DiscoveryState {
    pub fn new() -> Self {
        Self {
            last_known_ip: Arc::new(RwLock::new(None)),
            static_peers: Arc::new(RwLock::new(vec![
                "192.168.1.18".to_string(), // Common Reachy IP
            ])),
        }
    }
}

impl Default for DiscoveryState {
    fn default() -> Self {
        Self::new()
    }
}

/// Check if a robot is available at a specific IP
async fn check_robot_at_ip(ip: &str, port: u16, timeout_secs: u64) -> Result<RobotInfo, String> {
    let url = format!("http://{}:{}/api/daemon/status", ip, port);
    
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;
    
    match client.get(&url).send().await {
        Ok(response) => {
            if response.status().is_success() {
                Ok(RobotInfo {
                    name: format!("Reachy at {}", ip),
                    ip: ip.to_string(),
                    port,
                    discovery_method: "check".to_string(),
                    hostname: None,
                })
            } else {
                Err(format!("HTTP {}", response.status()))
            }
        }
        Err(e) => Err(format!("Connection failed: {}", e)),
    }
}

/// Discover robots via mDNS (Multicast DNS Service Discovery)
/// This is the automatic discovery method that works on local networks
async fn discover_via_mdns(timeout: Duration) -> Result<Vec<RobotInfo>, String> {
    // Create mDNS daemon
    let mdns = ServiceDaemon::new()
        .map_err(|e| format!("Failed to start mDNS daemon: {}", e))?;
    
    // Browse for HTTP services on the local network
    // We look for _http._tcp.local which is a standard mDNS service type
    let receiver = mdns
        .browse("_http._tcp.local.")
        .map_err(|e| format!("mDNS browse failed: {}", e))?;
    
    let mut robots = Vec::new();
    let mut seen_ips = std::collections::HashSet::new();
    let start = Instant::now();
    
    println!("[discovery] 🔍 mDNS discovery started (timeout: {:?})", timeout);
    
    while start.elapsed() < timeout {
        // Check for new service events with a short timeout
        match receiver.recv_timeout(Duration::from_millis(100)) {
            Ok(event) => {
                match event {
                    ServiceEvent::ServiceResolved(info) => {
                        let fullname = info.get_fullname();
                        let hostname = info.get_hostname();
                        
                        // Filter for Reachy services
                        // Look for "reachy" in the service name or hostname
                        if fullname.to_lowercase().contains("reachy")
                            || hostname.to_lowercase().contains("reachy")
                        {
                            // Get the first IPv4 address
                            if let Some(addr) = info.get_addresses().iter().next() {
                                let ip = addr.to_string();
                                
                                // Avoid duplicates
                                if !seen_ips.contains(&ip) {
                                    seen_ips.insert(ip.clone());
                                    
                                    println!(
                                        "[discovery] ✅ mDNS found: {} at {}:{}",
                                        hostname,
                                        ip,
                                        info.get_port()
                                    );
                                    
                                    robots.push(RobotInfo {
                                        name: hostname.trim_end_matches('.').to_string(),
                                        ip: ip.clone(),
                                        port: info.get_port(),
                                        discovery_method: "mdns".to_string(),
                                        hostname: Some(hostname.to_string()),
                                    });
                                }
                            }
                        }
                    }
                    ServiceEvent::SearchStarted(_) => {
                        println!("[discovery] 🔍 mDNS search started");
                    }
                    _ => {}
                }
            }
            Err(_) => {
                // Timeout on recv - continue waiting
            }
        }
    }
    
    println!(
        "[discovery] 🏁 mDNS discovery finished ({} robots found)",
        robots.len()
    );
    
    Ok(robots)
}

/// Main discovery command - tries multiple methods in order
#[tauri::command]
pub async fn discover_robots(
    state: tauri::State<'_, DiscoveryState>,
) -> Result<Vec<RobotInfo>, String> {
    let mut robots = Vec::new();
    let port = 8000; // Default Reachy daemon port
    
    println!("[discovery] 🚀 Starting robot discovery");
    
    // STEP 1: Check cache (last known IP) - Ultra fast path
    {
        let last_ip = state.last_known_ip.read().await;
        if let Some(ip) = last_ip.as_ref() {
            println!("[discovery] 📦 Checking cached IP: {}", ip);
            match check_robot_at_ip(ip, port, 2).await {
                Ok(mut robot) => {
                    robot.discovery_method = "cache".to_string();
                    println!("[discovery] ⚡ Cache hit! Robot found at {}", ip);
                    return Ok(vec![robot]);
                }
                Err(e) => {
                    println!("[discovery] ❌ Cache miss: {}", e);
                }
            }
        }
    }
    
    // STEP 2: Check static peers (user-configured IPs)
    {
        let peers = state.static_peers.read().await;
        println!("[discovery] 🔍 Checking {} static peer(s)", peers.len());
        
        for ip in peers.iter() {
            match check_robot_at_ip(ip, port, 3).await {
                Ok(mut robot) => {
                    robot.discovery_method = "static".to_string();
                    println!("[discovery] ✅ Static peer found at {}", ip);
                    
                    // Update cache
                    *state.last_known_ip.write().await = Some(ip.clone());
                    
                    robots.push(robot);
                    // Return immediately on first success
                    return Ok(robots);
                }
                Err(e) => {
                    println!("[discovery] ⏭️  Static peer {} not available: {}", ip, e);
                }
            }
        }
    }
    
    // STEP 3: mDNS discovery (automatic, works on LAN without VPN)
    println!("[discovery] 🔍 Starting mDNS discovery");
    match discover_via_mdns(Duration::from_secs(5)).await {
        Ok(mdns_robots) => {
            if !mdns_robots.is_empty() {
                println!("[discovery] ✅ mDNS found {} robot(s)", mdns_robots.len());
                
                // Update cache with first robot
                if let Some(robot) = mdns_robots.first() {
                    *state.last_known_ip.write().await = Some(robot.ip.clone());
                }
                
                robots.extend(mdns_robots);
                return Ok(robots);
            } else {
                println!("[discovery] 📭 mDNS found no robots");
            }
        }
        Err(e) => {
            println!("[discovery] ⚠️  mDNS discovery failed: {}", e);
        }
    }
    
    // No robots found via any automatic method
    if robots.is_empty() {
        println!("[discovery] ❌ No robots found via automatic discovery");
        println!("[discovery] 💡 Hint: Use manual IP connection mode");
    }
    
    Ok(robots)
}

/// Connect to a robot at a specific IP (manual connection)
#[tauri::command]
pub async fn connect_to_ip(
    ip: String,
    state: tauri::State<'_, DiscoveryState>,
) -> Result<RobotInfo, String> {
    let port = 8000;
    
    println!("[discovery] 🎯 Manual connection to IP: {}", ip);
    
    match check_robot_at_ip(&ip, port, 5).await {
        Ok(mut robot) => {
            robot.discovery_method = "manual".to_string();
            println!("[discovery] ✅ Manual connection successful: {}", ip);
            
            // Save to cache and static peers
            *state.last_known_ip.write().await = Some(ip.clone());
            
            // Add to static peers if not already there
            let mut peers = state.static_peers.write().await;
            if !peers.contains(&ip) {
                peers.insert(0, ip); // Insert at beginning for priority
                if peers.len() > 5 {
                    peers.truncate(5); // Keep only last 5 IPs
                }
            }
            
            Ok(robot)
        }
        Err(e) => {
            println!("[discovery] ❌ Manual connection failed: {}", e);
            Err(format!("Could not connect to {}: {}", ip, e))
        }
    }
}

/// Add a static peer IP (user configuration)
#[tauri::command]
pub async fn add_static_peer(
    ip: String,
    state: tauri::State<'_, DiscoveryState>,
) -> Result<(), String> {
    let mut peers = state.static_peers.write().await;
    
    if !peers.contains(&ip) {
        peers.push(ip.clone());
        println!("[discovery] ➕ Added static peer: {}", ip);
        Ok(())
    } else {
        Err("IP already in static peers".to_string())
    }
}

/// Remove a static peer IP
#[tauri::command]
pub async fn remove_static_peer(
    ip: String,
    state: tauri::State<'_, DiscoveryState>,
) -> Result<(), String> {
    let mut peers = state.static_peers.write().await;
    
    if let Some(pos) = peers.iter().position(|x| x == &ip) {
        peers.remove(pos);
        println!("[discovery] ➖ Removed static peer: {}", ip);
        Ok(())
    } else {
        Err("IP not found in static peers".to_string())
    }
}

/// Get the list of static peer IPs
#[tauri::command]
pub async fn get_static_peers(
    state: tauri::State<'_, DiscoveryState>,
) -> Result<Vec<String>, String> {
    let peers = state.static_peers.read().await;
    Ok(peers.clone())
}

/// Clear all cached data (useful for testing or troubleshooting)
#[tauri::command]
pub async fn clear_discovery_cache(
    state: tauri::State<'_, DiscoveryState>,
) -> Result<(), String> {
    *state.last_known_ip.write().await = None;
    println!("[discovery] 🧹 Discovery cache cleared");
    Ok(())
}
