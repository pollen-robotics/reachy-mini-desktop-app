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

use crate::daemon::DAEMON_PORT;
use futures_util::future::join_all;
use mdns_sd::{ServiceDaemon, ServiceEvent};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
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
                // mDNS/DNS hostnames (resolved by router or Bonjour)
                "reachy-mini.home".to_string(), // Router DNS (.home TLD)
                "reachy-mini.local".to_string(), // Bonjour/mDNS (.local TLD)
                // Common static IPs
                "192.168.1.18".to_string(), // Default Reachy IP
            ])),
        }
    }
}

impl Default for DiscoveryState {
    fn default() -> Self {
        Self::new()
    }
}

/// Resolve a host string to an IP address.
/// If it's already an IP, returns it as-is. Otherwise does DNS lookup.
/// Prefers IPv4 over IPv6 for local network reliability.
async fn resolve_to_ip(host: &str, port: u16) -> Option<String> {
    // Already a valid IP?
    if host.parse::<std::net::IpAddr>().is_ok() {
        return Some(host.to_string());
    }
    // DNS resolve — prefer IPv4
    let addr = format!("{}:{}", host, port);
    if let Ok(addrs) = tokio::net::lookup_host(&addr).await {
        let all: Vec<_> = addrs.collect();
        // Pick first IPv4, fall back to first result
        let best = all.iter().find(|a| a.is_ipv4()).or(all.first());
        if let Some(socket_addr) = best {
            return Some(socket_addr.ip().to_string());
        }
    }
    None
}

/// Check if a robot is available at a specific host (IP or hostname)
async fn check_robot_at_ip(host: &str, port: u16, timeout_secs: u64) -> Result<RobotInfo, String> {
    let url = format!("http://{}:{}/api/daemon/status", host, port);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    match client.get(&url).send().await {
        Ok(response) => {
            if response.status().is_success() {
                // Resolve hostname to actual IP for proper deduplication
                let resolved_ip = resolve_to_ip(host, port)
                    .await
                    .unwrap_or_else(|| host.to_string());
                let is_hostname = host.parse::<std::net::IpAddr>().is_err();

                Ok(RobotInfo {
                    name: host.trim_end_matches('.').to_string(),
                    ip: resolved_ip,
                    port,
                    discovery_method: "check".to_string(),
                    hostname: if is_hostname {
                        Some(host.to_string())
                    } else {
                        None
                    },
                })
            } else {
                Err(format!("HTTP {}", response.status()))
            }
        }
        Err(e) => Err(format!("Connection failed: {}", e)),
    }
}

/// Pick the best IP from an mDNS address set: prefer IPv4, fall back to first.
fn pick_best_addr(addrs: &std::collections::HashSet<std::net::IpAddr>) -> Option<String> {
    addrs
        .iter()
        .find(|a| a.is_ipv4())
        .or_else(|| addrs.iter().next())
        .map(|a| a.to_string())
}

/// Discover robots via mDNS (Multicast DNS Service Discovery)
/// Browses both `_reachy-mini._tcp.local.` (new specific service) and
/// `_http._tcp.local.` (old generic HTTP, filtered for "reachy") concurrently.
async fn discover_via_mdns(timeout: Duration) -> Result<Vec<RobotInfo>, String> {
    let mdns = ServiceDaemon::new().map_err(|e| format!("Failed to start mDNS daemon: {}", e))?;

    // Browse both service types concurrently
    let receiver_reachy = mdns
        .browse("_reachy-mini._tcp.local.")
        .map_err(|e| format!("mDNS browse (_reachy-mini) failed: {}", e))?;
    let receiver_http = mdns
        .browse("_http._tcp.local.")
        .map_err(|e| format!("mDNS browse (_http) failed: {}", e))?;

    let mut robots = Vec::new();
    let mut seen_ips = HashSet::new();
    let start = Instant::now();

    log::info!(
        "[discovery] mDNS discovery started (timeout: {:?})",
        timeout
    );

    while start.elapsed() < timeout {
        // Check _reachy-mini._tcp events
        if let Ok(event) = receiver_reachy.recv_timeout(Duration::from_millis(50)) {
            if let ServiceEvent::ServiceResolved(info) = event {
                if let Some(ip) = pick_best_addr(info.get_addresses()) {
                    if !seen_ips.contains(&ip) {
                        seen_ips.insert(ip.clone());

                        // Name priority: robot_name TXT property > instance name from fullname > hostname
                        let name = if let Some(robot_name) = info.get_property_val_str("robot_name")
                        {
                            robot_name.to_string()
                        } else {
                            // Extract instance name: "instance._reachy-mini._tcp.local." → "instance"
                            info.get_fullname()
                                .split("._reachy-mini._tcp.")
                                .next()
                                .unwrap_or(info.get_hostname().trim_end_matches('.'))
                                .to_string()
                        };

                        log::info!(
                            "[discovery] mDNS (_reachy-mini) found: {} at {}:{}",
                            name,
                            ip,
                            info.get_port()
                        );

                        robots.push(RobotInfo {
                            name,
                            ip: ip.clone(),
                            port: info.get_port(),
                            discovery_method: "mdns".to_string(),
                            hostname: Some(info.get_hostname().to_string()),
                        });
                    }
                }
            }
        }

        // Check _http._tcp events (filtered for "reachy")
        if let Ok(event) = receiver_http.recv_timeout(Duration::from_millis(50)) {
            if let ServiceEvent::ServiceResolved(info) = event {
                let fullname = info.get_fullname();
                let hostname = info.get_hostname();

                if fullname.to_lowercase().contains("reachy")
                    || hostname.to_lowercase().contains("reachy")
                {
                    if let Some(ip) = pick_best_addr(info.get_addresses()) {
                        if !seen_ips.contains(&ip) {
                            seen_ips.insert(ip.clone());

                            // Extract instance name: "instance._http._tcp.local." → "instance"
                            let name = fullname
                                .split("._http._tcp.")
                                .next()
                                .unwrap_or(hostname.trim_end_matches('.'))
                                .to_string();

                            log::info!(
                                "[discovery] mDNS (_http) found: {} at {}:{}",
                                name,
                                ip,
                                info.get_port()
                            );

                            robots.push(RobotInfo {
                                name,
                                ip: ip.clone(),
                                port: info.get_port(),
                                discovery_method: "mdns".to_string(),
                                hostname: Some(hostname.to_string()),
                            });
                        }
                    }
                }
            }
        }
    }

    log::info!(
        "[discovery] mDNS discovery finished ({} robots found)",
        robots.len()
    );

    Ok(robots)
}

/// Deduplication tracker for discovered robots (by IP and hostname).
struct DeduplicatedRobots {
    robots: Vec<RobotInfo>,
    seen_ips: HashSet<String>,
    seen_hostnames: HashSet<String>,
}

impl DeduplicatedRobots {
    fn new() -> Self {
        Self {
            robots: Vec::new(),
            seen_ips: HashSet::new(),
            seen_hostnames: HashSet::new(),
        }
    }

    /// Register a robot's identity for dedup without adding it to the list.
    /// Used when a duplicate is skipped but we still want to track its hostname.
    fn register(&mut self, robot: &RobotInfo) {
        self.seen_ips.insert(robot.ip.clone());
        if let Some(h) = &robot.hostname {
            self.seen_hostnames
                .insert(h.trim_end_matches('.').to_lowercase());
        }
    }

    /// Returns true if this robot (by IP or hostname) was already seen.
    fn is_known(&self, robot: &RobotInfo) -> bool {
        if self.seen_ips.contains(&robot.ip) {
            return true;
        }
        if let Some(h) = &robot.hostname {
            let key = h.trim_end_matches('.').to_lowercase();
            if self.seen_hostnames.contains(&key) {
                return true;
            }
        }
        false
    }

    /// Try to add a robot. Returns true if added, false if duplicate.
    fn try_add(&mut self, robot: RobotInfo) -> bool {
        if self.is_known(&robot) {
            self.register(&robot); // still learn its hostname
            return false;
        }
        self.register(&robot);
        self.robots.push(robot);
        true
    }
}

/// Main discovery command - tries multiple methods, merges and deduplicates results
#[tauri::command]
pub async fn discover_robots(
    state: tauri::State<'_, DiscoveryState>,
) -> Result<Vec<RobotInfo>, String> {
    let mut discovered = DeduplicatedRobots::new();
    let port = DAEMON_PORT;

    log::info!("[discovery] Starting robot discovery");

    // STEP 1: Check cache (last known IP) - Ultra fast path
    {
        let last_ip = state.last_known_ip.read().await;
        if let Some(ip) = last_ip.as_ref() {
            log::info!("[discovery] Checking cached IP: {}", ip);
            match check_robot_at_ip(ip, port, 2).await {
                Ok(mut robot) => {
                    robot.discovery_method = "cache".to_string();
                    log::info!("[discovery] Cache hit at {} (resolved: {})", ip, robot.ip);
                    discovered.try_add(robot);
                }
                Err(e) => {
                    log::info!("[discovery] Cache miss: {}", e);
                }
            }
        }
    }

    // STEP 2: Check static peers concurrently
    {
        let peers = state.static_peers.read().await;
        let peers_to_check: Vec<_> = peers.clone();

        log::info!(
            "[discovery] Checking {} static peer(s) concurrently",
            peers_to_check.len()
        );

        let results = join_all(
            peers_to_check
                .iter()
                .map(|ip| check_robot_at_ip(ip, port, 3)),
        )
        .await;

        for (peer, result) in peers_to_check.iter().zip(results) {
            match result {
                Ok(mut robot) => {
                    robot.discovery_method = "static".to_string();
                    if discovered.try_add(robot) {
                        log::info!("[discovery] Static peer found at {}", peer);
                    } else {
                        log::debug!("[discovery] Static peer {} already known, skipping", peer);
                    }
                }
                Err(e) => {
                    log::debug!("[discovery] Static peer {} not available: {}", peer, e);
                }
            }
        }
    }

    // STEP 3: mDNS discovery (automatic, works on LAN without VPN)
    log::info!("[discovery] Starting mDNS discovery");
    match discover_via_mdns(Duration::from_secs(5)).await {
        Ok(mdns_robots) => {
            for robot in mdns_robots {
                if discovered.try_add(robot) {
                    let added = discovered.robots.last().unwrap();
                    log::info!("[discovery] mDNS found: {} at {}", added.name, added.ip);
                } // silently skip duplicates from mDNS
            }
        }
        Err(e) => {
            log::warn!("[discovery] mDNS discovery failed: {}", e);
        }
    }

    // Update cache with first robot found
    if let Some(robot) = discovered.robots.first() {
        *state.last_known_ip.write().await = Some(robot.ip.clone());
    }

    let robots = discovered.robots;
    if robots.is_empty() {
        log::info!("[discovery] No robots found");
    } else {
        log::info!("[discovery] Discovery complete: {} robot(s):", robots.len());
        for (i, robot) in robots.iter().enumerate() {
            log::info!(
                "[discovery]   [{}] name={:?} ip={} method={} hostname={:?}",
                i, robot.name, robot.ip, robot.discovery_method, robot.hostname
            );
        }
    }

    Ok(robots)
}

/// Connect to a robot at a specific IP (manual connection)
#[tauri::command]
pub async fn connect_to_ip(
    ip: String,
    state: tauri::State<'_, DiscoveryState>,
) -> Result<RobotInfo, String> {
    let port = DAEMON_PORT;

    log::info!("[discovery] Manual connection to IP: {}", ip);

    match check_robot_at_ip(&ip, port, 5).await {
        Ok(mut robot) => {
            robot.discovery_method = "manual".to_string();
            log::info!("[discovery] Manual connection successful: {}", ip);

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
            log::error!("[discovery] Manual connection failed: {}", e);
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
        log::info!("[discovery] Added static peer: {}", ip);
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
        log::info!("[discovery] Removed static peer: {}", ip);
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
pub async fn clear_discovery_cache(state: tauri::State<'_, DiscoveryState>) -> Result<(), String> {
    *state.last_known_ip.write().await = None;
    log::info!("[discovery] Discovery cache cleared");
    Ok(())
}
