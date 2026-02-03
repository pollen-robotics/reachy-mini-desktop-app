//! Network Detection Module
//!
//! Provides network context information including VPN detection.
//! This helps the app adapt its discovery strategy based on network conditions.

use default_net::get_default_interface;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct NetworkContext {
    pub is_vpn_detected: bool,
    pub interface_name: String,
    pub interface_type: String,
    pub recommended_mode: String, // "auto" or "manual"
}

/// Detect if a VPN is currently active
/// 
/// This checks the network interface name for common VPN patterns:
/// - utun* (macOS VPN)
/// - tun*, tap* (Linux/Windows OpenVPN, WireGuard)
/// - vpn*, tailscale*, nordvpn*, etc. (Various VPN services)
#[tauri::command]
pub fn detect_vpn() -> Result<NetworkContext, String> {
    let interface = get_default_interface()
        .map_err(|e| format!("Failed to get network interface: {}", e))?;
    
    let name = interface.name.to_lowercase();
    
    // Common VPN interface patterns
    let is_vpn = name.contains("utun")       // macOS
        || name.contains("tun")              // Linux/Windows OpenVPN
        || name.contains("tap")              // Windows TAP driver
        || name.contains("vpn")              // Generic VPN
        || name.contains("tailscale")        // Tailscale
        || name.contains("nordvpn")          // NordVPN
        || name.contains("expressvpn")       // ExpressVPN
        || name.contains("protonvpn")        // ProtonVPN
        || name.contains("wireguard")        // WireGuard
        || name.contains("wg");              // WireGuard short name
    
    let interface_type = if is_vpn {
        "vpn".to_string()
    } else if name.contains("eth") || name.contains("en") {
        "ethernet".to_string()
    } else if name.contains("wlan") || name.contains("wi-fi") || name.contains("wifi") {
        "wifi".to_string()
    } else {
        "unknown".to_string()
    };
    
    let recommended_mode = if is_vpn {
        "manual".to_string() // VPN detected → recommend manual IP
    } else {
        "auto".to_string() // No VPN → automatic discovery works well
    };
    
    if is_vpn {
        println!("[network] ⚠️  VPN detected on interface: {}", interface.name);
    } else {
        println!("[network] ✅ No VPN detected (interface: {})", interface.name);
    }
    
    Ok(NetworkContext {
        is_vpn_detected: is_vpn,
        interface_name: interface.name.clone(),
        interface_type,
        recommended_mode,
    })
}

/// Get detailed network interface information (for debugging)
#[tauri::command]
pub fn get_network_info() -> Result<String, String> {
    let interface = get_default_interface()
        .map_err(|e| format!("Failed to get network interface: {}", e))?;
    
    let info = format!(
        "Interface: {}\nMAC: {}\nIPv4: {:?}\nIPv6: {:?}",
        interface.name,
        interface.mac_addr.map_or("N/A".to_string(), |m| m.to_string()),
        interface.ipv4.iter().map(|ip| ip.addr.to_string()).collect::<Vec<_>>(),
        interface.ipv6.iter().map(|ip| ip.addr.to_string()).collect::<Vec<_>>()
    );
    
    Ok(info)
}
