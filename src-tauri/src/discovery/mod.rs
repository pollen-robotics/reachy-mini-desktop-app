//! Robot Discovery Module
//!
//! Discovers Reachy Mini robots on the local network using two methods,
//! merged and deduplicated:
//!
//! 1. **Static peers** - well-known hostnames probed in parallel via HTTP
//!    (`reachy-mini.local`, `reachy-mini.home`). Always resolved fresh by the
//!    OS resolver, so they pick up DHCP / network changes automatically.
//! 2. **mDNS** via `mdns-sd` - browses `_reachy-mini._tcp.local.` and
//!    `_http._tcp.local.` so custom-named robots and Pi-imager defaults both
//!    appear. The library handles its own RFC 6762 cache (TTLs, Goodbye
//!    Packets, Cache Flush bit), we don't double-cache.
//!
//! ### Design notes
//!
//! - **No app-level IP cache.** A previous version cached the last-known IP
//!   in `last_known_ip` for a "fast path" on the next scan. This caused a
//!   nasty failure mode where the cached IP became stale (DHCP renew, robot
//!   reboot on a different subnet, network switch) and the user got silent
//!   timeouts on `Connect` until the app was restarted. The cache only saved
//!   ~2s on the very first scan, so the trade-off was bad. We now rely on
//!   the static peers + mDNS lib for deduplication and freshness, in line
//!   with how Avahi / dns-sd / Bonjour are normally consumed.
//!
//! - **Dedup by canonical instance name.** mDNS service instances have a
//!   stable identity (`<instance>._reachy-mini._tcp.local.`) that survives
//!   IP changes. We dedup on that (lowercased) so a robot whose IP changes
//!   between two scans doesn't appear twice in the UI.
//!
//! - **Frontend prefers hostname.** The `RobotInfo.hostname` field carries
//!   the `*.local` name when available; the JS layer uses it for `displayHost`
//!   so all subsequent connections go through Bonjour resolution rather than
//!   carrying an IP forward in app state.

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
    pub discovery_method: String, // "mdns", "static", "manual"
    pub hostname: Option<String>,
}

/// Shared discovery state.
///
/// Holds the long-lived resources (HTTP client, mDNS daemon) and the
/// user-configurable static peer list. There is intentionally no app-level
/// IP cache here - see the module-level docs for the rationale.
pub struct DiscoveryState {
    /// User-configured static peers (hostnames or IPs) probed every scan.
    pub static_peers: Arc<RwLock<Vec<String>>>,
    /// Shared HTTP client (reuses TCP connections across discovery cycles).
    pub http_client: reqwest::Client,
    /// Persistent mDNS daemon (lives for the entire app lifetime).
    pub mdns_daemon: ServiceDaemon,
}

impl DiscoveryState {
    pub fn new() -> Self {
        Self {
            static_peers: Arc::new(RwLock::new(vec![
                // mDNS/DNS hostnames (resolved by router or Bonjour)
                "reachy-mini.home".to_string(), // Router DNS (.home TLD)
                "reachy-mini.local".to_string(), // Bonjour/mDNS (.local TLD)
            ])),
            http_client: reqwest::Client::builder()
                .pool_max_idle_per_host(2)
                .build()
                .expect("Failed to build shared HTTP client"),
            mdns_daemon: ServiceDaemon::new().expect("Failed to start mDNS daemon"),
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
async fn check_robot_at_ip(
    client: &reqwest::Client,
    host: &str,
    port: u16,
    timeout_secs: u64,
) -> Result<RobotInfo, String> {
    let url = format!("http://{}:{}/api/daemon/status", host, port);

    match client
        .get(&url)
        .timeout(Duration::from_secs(timeout_secs))
        .send()
        .await
    {
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
fn pick_best_addr(addrs: &std::collections::HashSet<mdns_sd::ScopedIp>) -> Option<String> {
    addrs
        .iter()
        .find(|a| a.to_ip_addr().is_ipv4())
        .or_else(|| addrs.iter().next())
        .map(|a| a.to_ip_addr().to_string())
}

const MDNS_SERVICE_REACHY: &str = "_reachy-mini._tcp.local.";
const MDNS_SERVICE_HTTP: &str = "_http._tcp.local.";

/// Discover robots via mDNS (Multicast DNS Service Discovery)
/// Browses both `_reachy-mini._tcp.local.` (new specific service) and
/// `_http._tcp.local.` (old generic HTTP, filtered for "reachy") concurrently.
/// Uses a persistent daemon - only starts/stops browse queries per cycle.
async fn discover_via_mdns(
    mdns: &ServiceDaemon,
    timeout: Duration,
) -> Result<Vec<RobotInfo>, String> {
    let receiver_reachy = mdns
        .browse(MDNS_SERVICE_REACHY)
        .map_err(|e| format!("mDNS browse (_reachy-mini) failed: {}", e))?;
    let receiver_http = mdns
        .browse(MDNS_SERVICE_HTTP)
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
        if let Ok(ServiceEvent::ServiceResolved(info)) =
            receiver_reachy.recv_timeout(Duration::from_millis(50))
        {
            if let Some(ip) = pick_best_addr(info.get_addresses()) {
                if !seen_ips.contains(&ip) {
                    seen_ips.insert(ip.clone());

                    // Name priority: robot_name TXT property > instance name from fullname > hostname
                    let name = if let Some(robot_name) = info.get_property_val_str("robot_name") {
                        robot_name.to_string()
                    } else {
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

        // Check _http._tcp events (filtered for "reachy")
        if let Ok(ServiceEvent::ServiceResolved(info)) =
            receiver_http.recv_timeout(Duration::from_millis(50))
        {
            let fullname = info.get_fullname();
            let hostname = info.get_hostname();

            if fullname.to_lowercase().contains("reachy")
                || hostname.to_lowercase().contains("reachy")
            {
                if let Some(ip) = pick_best_addr(info.get_addresses()) {
                    if !seen_ips.contains(&ip) {
                        seen_ips.insert(ip.clone());

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

    // Stop browsing until next cycle (daemon stays alive)
    let _ = mdns.stop_browse(MDNS_SERVICE_REACHY);
    let _ = mdns.stop_browse(MDNS_SERVICE_HTTP);

    log::info!(
        "[discovery] mDNS discovery finished ({} robots found)",
        robots.len()
    );

    Ok(robots)
}

/// Canonical identity for a discovered robot, used as the dedup key.
///
/// Priority order matches industry conventions for mDNS service browsers:
/// 1. **Hostname** (`reachy-mini.local`) - the most stable identity, survives
///    IP changes and is what the frontend uses to address the robot anyway.
/// 2. **Instance name** (`my-cool-robot` from
///    `my-cool-robot._reachy-mini._tcp.local.`) - the canonical mDNS service
///    instance identifier per RFC 6763.
/// 3. **IP address** - last-resort fallback for static peers / manual entries
///    that have neither a hostname nor an instance name.
///
/// Returned lowercased + trimmed so `Reachy-Mini.local.` and
/// `reachy-mini.local` collapse to the same key.
fn dedup_key(robot: &RobotInfo) -> String {
    if let Some(h) = &robot.hostname {
        let trimmed = h.trim_end_matches('.').to_lowercase();
        if !trimmed.is_empty() {
            return trimmed;
        }
    }
    let trimmed_name = robot.name.trim().to_lowercase();
    if !trimmed_name.is_empty() {
        return trimmed_name;
    }
    robot.ip.clone()
}

/// Deduplication tracker for discovered robots.
///
/// A robot is a duplicate if its canonical identity (`dedup_key()`: hostname >
/// instance name > IP) *or* its resolved IP was already seen. The IP check is
/// what collapses the same robot reached under different names: the
/// `reachy-mini.local` / `reachy-mini.home` static peers, or a manually-added
/// raw IP later re-found via mDNS under its hostname. Skipped duplicates still
/// register both identities so later aliases dedup too.
struct DeduplicatedRobots {
    robots: Vec<RobotInfo>,
    seen: HashSet<String>,
    seen_ips: HashSet<String>,
}

impl DeduplicatedRobots {
    fn new() -> Self {
        Self {
            robots: Vec::new(),
            seen: HashSet::new(),
            seen_ips: HashSet::new(),
        }
    }

    /// Try to add a robot. Returns true if added, false if duplicate.
    fn try_add(&mut self, robot: RobotInfo) -> bool {
        let key = dedup_key(&robot);
        let duplicate = self.seen.contains(&key) || self.seen_ips.contains(&robot.ip);
        self.seen.insert(key);
        self.seen_ips.insert(robot.ip.clone());
        if duplicate {
            return false;
        }
        self.robots.push(robot);
        true
    }
}

/// Main discovery command - probes static peers + mDNS in sequence, merges
/// and deduplicates results.
///
/// Static peers go first so that when both methods find the same robot, the
/// entry that survives dedup is the one carrying the well-known hostname.
/// The mDNS pass then catches custom-named robots not in the peer list.
#[tauri::command]
pub async fn discover_robots(
    state: tauri::State<'_, DiscoveryState>,
) -> Result<Vec<RobotInfo>, String> {
    let mut discovered = DeduplicatedRobots::new();
    let port = DAEMON_PORT;

    log::info!("[discovery] Starting robot discovery");

    // STEP 1: Check static peers concurrently.
    // These are well-known hostnames (`reachy-mini.local`, `reachy-mini.home`)
    // that the OS resolver re-resolves on every request, so DHCP renews and
    // network switches are picked up automatically. No staleness risk.
    {
        let peers = state.static_peers.read().await;
        let peers_to_check: Vec<_> = peers.clone();

        log::info!(
            "[discovery] Checking {} static peer(s) concurrently",
            peers_to_check.len()
        );

        let client = &state.http_client;
        let results = join_all(
            peers_to_check
                .iter()
                .map(|ip| check_robot_at_ip(client, ip, port, 3)),
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

    // STEP 2: mDNS discovery (automatic, works on LAN without VPN).
    // Catches custom-named robots that aren't in the static peer list.
    // The `mdns-sd` library handles its own RFC-6762 cache (TTLs, Goodbye
    // Packets, Cache Flush bit) - we don't double-cache results app-side.
    log::info!("[discovery] Starting mDNS discovery");
    match discover_via_mdns(&state.mdns_daemon, Duration::from_secs(5)).await {
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

    let robots = discovered.robots;
    if robots.is_empty() {
        log::info!("[discovery] No robots found");
    } else {
        log::info!("[discovery] Discovery complete: {} robot(s):", robots.len());
        for (i, robot) in robots.iter().enumerate() {
            log::info!(
                "[discovery]   [{}] name={:?} ip={} method={} hostname={:?}",
                i,
                robot.name,
                robot.ip,
                robot.discovery_method,
                robot.hostname
            );
        }
    }

    Ok(robots)
}

/// Connect to a robot at a specific IP or hostname (manual connection).
///
/// On success, also adds the host to the static peer list so subsequent
/// discovery scans pick it up automatically.
#[tauri::command]
pub async fn connect_to_ip(
    ip: String,
    state: tauri::State<'_, DiscoveryState>,
) -> Result<RobotInfo, String> {
    let port = DAEMON_PORT;

    log::info!("[discovery] Manual connection to IP: {}", ip);

    match check_robot_at_ip(&state.http_client, &ip, port, 5).await {
        Ok(mut robot) => {
            robot.discovery_method = "manual".to_string();
            log::info!("[discovery] Manual connection successful: {}", ip);

            // Promote this host in the static peer list so the next scan
            // picks it up. Capped at 5 to prevent unbounded growth on power
            // users who manually try many addresses.
            let mut peers = state.static_peers.write().await;
            if !peers.contains(&ip) {
                peers.insert(0, ip);
                if peers.len() > 5 {
                    peers.truncate(5);
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

#[cfg(test)]
mod tests {
    use super::*;

    fn robot(name: &str, ip: &str, hostname: Option<&str>) -> RobotInfo {
        RobotInfo {
            name: name.to_string(),
            ip: ip.to_string(),
            port: 8000,
            discovery_method: "test".to_string(),
            hostname: hostname.map(str::to_string),
        }
    }

    #[test]
    fn dedups_local_and_home_peers_by_ip() {
        let mut d = DeduplicatedRobots::new();
        assert!(d.try_add(robot(
            "reachy-mini.local",
            "192.168.1.42",
            Some("reachy-mini.local")
        )));
        assert!(!d.try_add(robot(
            "reachy-mini.home",
            "192.168.1.42",
            Some("reachy-mini.home")
        )));
        assert_eq!(d.robots.len(), 1);
    }

    #[test]
    fn dedups_manual_ip_against_mdns_hostname() {
        let mut d = DeduplicatedRobots::new();
        // Manual/static raw-IP entry: no hostname, name = the IP.
        assert!(d.try_add(robot("192.168.1.42", "192.168.1.42", None)));
        // Same robot found via mDNS under its hostname.
        assert!(!d.try_add(robot(
            "reachy-mini",
            "192.168.1.42",
            Some("reachy-mini.local.")
        )));
        assert_eq!(d.robots.len(), 1);
    }

    #[test]
    fn dedups_hostname_across_ip_change() {
        let mut d = DeduplicatedRobots::new();
        assert!(d.try_add(robot(
            "reachy-mini",
            "192.168.1.42",
            Some("reachy-mini.local")
        )));
        // Same hostname re-advertised from a new DHCP lease.
        assert!(!d.try_add(robot(
            "reachy-mini",
            "192.168.1.99",
            Some("Reachy-Mini.local.")
        )));
        assert_eq!(d.robots.len(), 1);
    }

    #[test]
    fn keeps_distinct_robots() {
        let mut d = DeduplicatedRobots::new();
        assert!(d.try_add(robot("alpha", "192.168.1.42", Some("alpha.local"))));
        assert!(d.try_add(robot("beta", "192.168.1.43", Some("beta.local"))));
        assert_eq!(d.robots.len(), 2);
    }

    #[test]
    fn skipped_duplicate_still_registers_its_aliases() {
        let mut d = DeduplicatedRobots::new();
        assert!(d.try_add(robot(
            "reachy-mini.home",
            "192.168.1.42",
            Some("reachy-mini.home")
        )));
        // Dup by IP; its .local hostname must still be learned...
        assert!(!d.try_add(robot(
            "reachy-mini.local",
            "192.168.1.42",
            Some("reachy-mini.local")
        )));
        // ...so an mDNS record with a different advertised IP dedups by name.
        assert!(!d.try_add(robot("reachy-mini", "fe80::1", Some("reachy-mini.local."))));
        assert_eq!(d.robots.len(), 1);
    }
}
