//! Local Proxy Module
//!
//! Forwards HTTP, WebSocket, and UDP connections from localhost to a remote host.
//! Supports multiple TCP ports (8000 for daemon API, 8443 for WebRTC signaling).
//! Also proxies UDP for WebRTC media streams (RTP audio on port 5000).
//! This bypasses browser Private Network Access (PNA) restrictions.
//!
//! The proxy only runs when in WiFi mode (when a target host is set).
//!
//! When the target host changes (switching robots), all existing connections are
//! killed via a generation counter so that HTTP keep-alive pipes don't forward
//! requests to the old robot.

use futures_util::{SinkExt, StreamExt};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::io::AsyncWriteExt;
use tokio::net::{TcpListener, TcpStream, UdpSocket};
use tokio::sync::{oneshot, watch, Mutex, RwLock};
use tokio::task::JoinHandle;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::handshake::server::{Request, Response};

/// Critical TCP port: the daemon HTTP API. If this one can't bind, the whole
/// WiFi pipeline is broken, so we surface an error to the frontend. All other
/// ports are best-effort (a missing WebRTC signaling port degrades audio but
/// doesn't prevent basic control).
const CRITICAL_TCP_PORT: u16 = 8000;

/// Maximum time we wait for each listener task to confirm its bind. `bind()`
/// itself is synchronous at the kernel level (<1ms on localhost), so this is
/// mostly a safety net in case the Tokio runtime is momentarily starved.
const BIND_CONFIRMATION_TIMEOUT: Duration = Duration::from_millis(500);

/// Outcome reported by each proxy task once it has attempted to bind.
#[derive(Debug)]
struct BindReport {
    port: u16,
    protocol: &'static str,
    /// `Ok(())` on successful bind; `Err(reason)` on failure.
    result: Result<(), String>,
    /// `true` if the failure was due to the port being taken by another
    /// process. Kept separate so we can surface a tailored error.
    address_in_use: bool,
}

/// TCP ports to proxy (local -> remote with same port)
/// 8000: Dashboard/Daemon API
/// 8042: Applications
/// 7447: Zenoh
/// 8443: WebRTC signaling
const TCP_PROXY_PORTS: &[u16] = &[8000, 8042, 7447, 8443];

/// UDP ports to proxy for WebRTC media streams
/// 5000: RTP audio input to robot (from webrtc_daemon.py)
/// 8443: WebRTC media (in case webrtcsink uses UDP on this port)
const UDP_PROXY_PORTS: &[u16] = &[5000, 8443];

/// Timeout for UDP client mappings (clean up inactive clients after this duration)
const UDP_CLIENT_TIMEOUT: Duration = Duration::from_secs(300);

/// Type alias for UDP client map to reduce complexity
/// Maps client address to (remote socket, last activity timestamp)
type UdpClientMap = Arc<Mutex<HashMap<SocketAddr, (Arc<UdpSocket>, Instant)>>>;

/// Read the current target host from shared state. Returns None if not set.
async fn get_target_host(state: &LocalProxyState) -> Option<String> {
    state.target_host.read().await.clone()
}

/// Public accessor for the current target host (exposed to the frontend via
/// `get_local_proxy_target`). Kept as a thin wrapper around the private
/// `get_target_host` so the internal proxy code stays untouched.
pub async fn get_target_host_public(state: &LocalProxyState) -> Option<String> {
    get_target_host(state).await
}

/// Shared state for the proxy
pub struct LocalProxyState {
    pub target_host: RwLock<Option<String>>,
    /// Handles to running proxy tasks (so we can abort them)
    proxy_handles: Mutex<Vec<JoinHandle<()>>>,
    /// Generation counter — incremented on each stop to kill stale connection handlers.
    /// Connection handlers select on `changed()` and terminate when it fires,
    /// ensuring HTTP keep-alive pipes don't survive a target switch.
    generation: watch::Sender<u64>,
}

impl LocalProxyState {
    pub fn new() -> Self {
        let (tx, _rx) = watch::channel(0u64);
        Self {
            target_host: RwLock::new(None),
            proxy_handles: Mutex::new(Vec::new()),
            generation: tx,
        }
    }

    /// Subscribe to the generation counter. The returned receiver will fire
    /// on `changed()` when the proxy is stopped (i.e. target is switching).
    fn subscribe_generation(&self) -> watch::Receiver<u64> {
        let mut rx = self.generation.subscribe();
        // Mark current value as seen so changed() only fires on NEW increments
        rx.borrow_and_update();
        rx
    }
}

impl Default for LocalProxyState {
    fn default() -> Self {
        Self::new()
    }
}

/// Start the local proxy servers on all configured ports.
///
/// Returns `Ok(())` if the critical TCP port ({@link CRITICAL_TCP_PORT}) is
/// bound successfully. Failures on non-critical ports are logged and ignored
/// so that e.g. a pre-existing WebRTC port conflict doesn't block the basic
/// control path.
async fn start_local_proxy(state: Arc<LocalProxyState>) -> Result<(), String> {
    let mut handles = state.proxy_handles.lock().await;

    // Don't start if already running
    if !handles.is_empty() {
        log::warn!("[proxy] Proxy already running");
        return Ok(());
    }

    let mut ready_rxs: Vec<oneshot::Receiver<BindReport>> = Vec::new();

    // Start TCP proxies
    for &port in TCP_PROXY_PORTS {
        let state_clone = state.clone();
        let (tx, rx) = oneshot::channel();
        ready_rxs.push(rx);
        let handle = tokio::spawn(async move {
            start_tcp_proxy(state_clone, port, tx).await;
        });
        handles.push(handle);
    }

    // Start UDP proxies for WebRTC media
    for &port in UDP_PROXY_PORTS {
        let state_clone = state.clone();
        let (tx, rx) = oneshot::channel();
        ready_rxs.push(rx);
        let handle = tokio::spawn(async move {
            start_udp_proxy(state_clone, port, tx).await;
        });
        handles.push(handle);
    }

    // Drop the guard before awaiting receivers so we don't hold the mutex for
    // any longer than necessary.
    drop(handles);

    // Collect every bind outcome (or a synthetic timeout report if a task
    // didn't respond in time). The bind itself is effectively synchronous at
    // the kernel level, so this loop normally completes in a few ms.
    let mut reports: Vec<BindReport> = Vec::with_capacity(ready_rxs.len());
    for rx in ready_rxs {
        match tokio::time::timeout(BIND_CONFIRMATION_TIMEOUT, rx).await {
            Ok(Ok(report)) => reports.push(report),
            Ok(Err(_)) => {
                // Sender dropped without reporting (unreachable in practice
                // unless a proxy task panics before bind). Surface as a
                // generic failure; we don't know the port here, so treat it
                // as a critical error.
                return Err(
                    "Proxy listener task aborted before binding".to_string(),
                );
            }
            Err(_) => {
                return Err(format!(
                    "Proxy listener bind timeout ({:?})",
                    BIND_CONFIRMATION_TIMEOUT
                ));
            }
        }
    }

    // Separate critical vs non-critical outcomes.
    let critical = reports
        .iter()
        .find(|r| r.protocol == "tcp" && r.port == CRITICAL_TCP_PORT);

    match critical {
        None => {
            // This would mean the critical port wasn't even in the TCP_PROXY_PORTS
            // array. Defensive check: if the constant ever drifts, don't silently
            // ship a half-configured proxy.
            log::error!(
                "[proxy] Critical port {} not present in TCP_PROXY_PORTS",
                CRITICAL_TCP_PORT
            );
            stop_local_proxy(&state).await;
            return Err(format!(
                "Critical proxy port {} not configured",
                CRITICAL_TCP_PORT
            ));
        }
        Some(report) if report.result.is_err() => {
            let reason = report.result.as_ref().err().cloned().unwrap_or_default();
            log::error!(
                "[proxy] Critical TCP port {} failed to bind: {}",
                report.port,
                reason
            );
            stop_local_proxy(&state).await;
            if report.address_in_use {
                return Err(format!(
                    "Port {} is already in use. Another app (or a previous Reachy session) still holds it - close it and retry.",
                    report.port
                ));
            }
            return Err(format!(
                "Failed to bind required proxy port {}: {}",
                report.port, reason
            ));
        }
        Some(_) => {}
    }

    // Warn loudly about non-critical failures so they show up in diagnostics
    // even though we proceed.
    for report in reports
        .iter()
        .filter(|r| !(r.protocol == "tcp" && r.port == CRITICAL_TCP_PORT))
    {
        if let Err(reason) = &report.result {
            log::warn!(
                "[proxy] Non-critical {}/{} not bound ({}); feature relying on this port will be degraded",
                report.protocol,
                report.port,
                reason
            );
        }
    }

    log::info!(
        "[proxy] Proxy started (TCP: {:?}, UDP: {:?})",
        TCP_PROXY_PORTS,
        UDP_PROXY_PORTS
    );
    Ok(())
}

/// Stop all running proxy servers and signal active connections to terminate.
async fn stop_local_proxy(state: &Arc<LocalProxyState>) {
    let mut handles = state.proxy_handles.lock().await;

    if handles.is_empty() {
        return;
    }

    // Bump generation — this wakes all connection handlers via their
    // watch::Receiver::changed() branch, causing them to drop their
    // TCP/WebSocket pipes to the old target host.
    state.generation.send_modify(|v| *v += 1);

    // Abort listener tasks (they hold the TcpListener / UdpSocket)
    for handle in handles.drain(..) {
        handle.abort();
    }

    log::info!("[proxy] Proxy stopped (all connections killed)");
}

/// Start a TCP proxy server for a specific port. `ready_tx` receives a
/// `BindReport` as soon as the bind attempt resolves (success or failure), so
/// the orchestrator can confirm the listener is actually live before declaring
/// the proxy ready.
async fn start_tcp_proxy(
    state: Arc<LocalProxyState>,
    port: u16,
    ready_tx: oneshot::Sender<BindReport>,
) {
    let bind_addr = format!("127.0.0.1:{}", port);
    let listener = match TcpListener::bind(&bind_addr).await {
        Ok(l) => {
            log::info!("[proxy] TCP listening on localhost:{}", port);
            let _ = ready_tx.send(BindReport {
                port,
                protocol: "tcp",
                result: Ok(()),
                address_in_use: false,
            });
            l
        }
        Err(e) => {
            let address_in_use = e.kind() == std::io::ErrorKind::AddrInUse;
            if address_in_use {
                log::warn!("[proxy] TCP port {} already in use", port);
            } else {
                log::error!("[proxy] Failed to bind TCP port {}: {}", port, e);
            }
            let _ = ready_tx.send(BindReport {
                port,
                protocol: "tcp",
                result: Err(e.to_string()),
                address_in_use,
            });
            return;
        }
    };

    loop {
        match listener.accept().await {
            Ok((stream, addr)) => {
                let state_clone = state.clone();
                let shutdown_rx = state.subscribe_generation();
                tokio::spawn(async move {
                    if let Err(e) =
                        handle_tcp_connection(stream, state_clone, addr, port, shutdown_rx).await
                    {
                        log::error!("[proxy] TCP error from {} on port {}: {}", addr, port, e);
                    }
                });
            }
            Err(e) => {
                log::error!("[proxy] TCP accept error on port {}: {}", port, e);
            }
        }
    }
}

/// Start a UDP proxy server for a specific port. See `start_tcp_proxy` for
/// the `ready_tx` contract.
async fn start_udp_proxy(
    state: Arc<LocalProxyState>,
    port: u16,
    ready_tx: oneshot::Sender<BindReport>,
) {
    let bind_addr = format!("127.0.0.1:{}", port);
    let local_socket = match UdpSocket::bind(&bind_addr).await {
        Ok(s) => {
            log::info!("[proxy] UDP listening on localhost:{}", port);
            let _ = ready_tx.send(BindReport {
                port,
                protocol: "udp",
                result: Ok(()),
                address_in_use: false,
            });
            Arc::new(s)
        }
        Err(e) => {
            let address_in_use = e.kind() == std::io::ErrorKind::AddrInUse;
            if address_in_use {
                log::warn!("[proxy] UDP port {} already in use", port);
            } else {
                log::error!("[proxy] Failed to bind UDP port {}: {}", port, e);
            }
            let _ = ready_tx.send(BindReport {
                port,
                protocol: "udp",
                result: Err(e.to_string()),
                address_in_use,
            });
            return;
        }
    };

    // Track client connections: client_addr -> (remote_socket, last_activity)
    let clients: UdpClientMap = Arc::new(Mutex::new(HashMap::new()));

    // Spawn cleanup task for stale client mappings
    let clients_cleanup = clients.clone();
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(60)).await;
            let mut clients = clients_cleanup.lock().await;
            let now = Instant::now();
            clients.retain(|addr, (_, last_activity)| {
                let keep = now.duration_since(*last_activity) < UDP_CLIENT_TIMEOUT;
                if !keep {
                    log::info!("[proxy] UDP cleanup: removing stale client {}", addr);
                }
                keep
            });
        }
    });

    let mut buf = vec![0u8; 65535]; // Max UDP packet size

    loop {
        // Receive packet from a client
        let (len, client_addr) = match local_socket.recv_from(&mut buf).await {
            Ok(r) => r,
            Err(e) => {
                log::error!("[proxy] UDP recv error on port {}: {}", port, e);
                continue;
            }
        };

        let target_host = match get_target_host(&state).await {
            Some(h) => h,
            None => continue,
        };

        let remote_addr: SocketAddr = match format!("{}:{}", target_host, port).parse() {
            Ok(addr) => addr,
            Err(e) => {
                log::error!("[proxy] UDP invalid remote address: {}", e);
                continue;
            }
        };

        // Get or create a socket for this client
        let remote_socket = {
            let mut clients_map = clients.lock().await;

            if let Some((socket, last_activity)) = clients_map.get_mut(&client_addr) {
                *last_activity = Instant::now();
                socket.clone()
            } else {
                // Create a new socket for this client to communicate with remote
                let new_socket = match UdpSocket::bind("0.0.0.0:0").await {
                    Ok(s) => Arc::new(s),
                    Err(e) => {
                        log::error!("[proxy] UDP failed to create client socket: {}", e);
                        continue;
                    }
                };

                log::info!(
                    "[proxy] UDP new client {} -> {}:{}",
                    client_addr,
                    target_host,
                    port
                );

                // Spawn a task to forward responses from remote back to this client
                let response_socket = new_socket.clone();
                let local_socket_clone = local_socket.clone();
                let client_addr_clone = client_addr;
                let clients_clone = clients.clone();

                tokio::spawn(async move {
                    let mut resp_buf = vec![0u8; 65535];
                    loop {
                        match response_socket.recv_from(&mut resp_buf).await {
                            Ok((len, _remote)) => {
                                // Update last activity
                                {
                                    let mut clients_map = clients_clone.lock().await;
                                    if let Some((_, last_activity)) =
                                        clients_map.get_mut(&client_addr_clone)
                                    {
                                        *last_activity = Instant::now();
                                    }
                                }

                                // Forward response back to original client
                                if let Err(e) = local_socket_clone
                                    .send_to(&resp_buf[..len], client_addr_clone)
                                    .await
                                {
                                    log::error!(
                                        "[proxy] UDP failed to send response to {}: {}",
                                        client_addr_clone,
                                        e
                                    );
                                    break;
                                }
                            }
                            Err(e) => {
                                log::error!("[proxy] UDP recv from remote error: {}", e);
                                break;
                            }
                        }
                    }
                });

                clients_map.insert(client_addr, (new_socket.clone(), Instant::now()));
                new_socket
            }
        };

        // Forward the packet to remote
        if let Err(e) = remote_socket.send_to(&buf[..len], remote_addr).await {
            log::error!("[proxy] UDP failed to forward to {}: {}", remote_addr, e);
        }
    }
}

/// Handle a TCP connection - detect if WebSocket or HTTP and route accordingly
async fn handle_tcp_connection(
    mut stream: TcpStream,
    state: Arc<LocalProxyState>,
    addr: std::net::SocketAddr,
    port: u16,
    shutdown_rx: watch::Receiver<u64>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let target_host = match get_target_host(&state).await {
        Some(h) => h,
        None => {
            let body = "No target host configured";
            let response = format!(
                "HTTP/1.1 502 Bad Gateway\r\nContent-Length: {}\r\n\r\n{}",
                body.len(),
                body
            );
            stream.write_all(response.as_bytes()).await?;
            return Ok(());
        }
    };

    // Peek at the first bytes to detect the request type
    let mut buf = vec![0u8; 8192];
    let n = stream.peek(&mut buf).await?;
    let request_str = String::from_utf8_lossy(&buf[..n]);

    // Check if this is a WebSocket upgrade request
    let is_websocket = request_str.to_lowercase().contains("upgrade: websocket");

    if is_websocket {
        handle_websocket(stream, &target_host, addr, port, shutdown_rx).await
    } else {
        handle_http(stream, &target_host, addr, port, shutdown_rx).await
    }
}

/// Handle WebSocket connections
async fn handle_websocket(
    stream: TcpStream,
    target_host: &str,
    addr: std::net::SocketAddr,
    port: u16,
    mut shutdown_rx: watch::Receiver<u64>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    use tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode;
    use tokio_tungstenite::tungstenite::protocol::CloseFrame;

    // Capture the request path during handshake
    let request_path = Arc::new(RwLock::new(String::from("/")));
    let request_path_clone = request_path.clone();

    // Accept with callback to capture path
    // The Response error type is imposed by tokio-tungstenite's callback API
    #[allow(clippy::result_large_err)]
    let mut local_ws =
        tokio_tungstenite::accept_hdr_async(stream, |req: &Request, resp: Response| {
            let path = req
                .uri()
                .path_and_query()
                .map(|pq| pq.to_string())
                .unwrap_or_else(|| "/".to_string());

            // Store in a thread-local or use blocking lock
            if let Ok(mut p) = request_path_clone.try_write() {
                *p = path;
            }
            Ok(resp)
        })
        .await?;

    // Get the captured path
    let path = request_path.read().await.clone();
    log::info!(
        "[proxy] WS {} -> ws://{}:{}{}",
        addr,
        target_host,
        port,
        path
    );

    // Build remote URL with the same path and port
    let remote_url = format!("ws://{}:{}{}", target_host, port, path);

    // Connect to remote - if this fails, properly close the local WebSocket
    let remote_ws = match connect_async(&remote_url).await {
        Ok((ws, _)) => ws,
        Err(e) => {
            log::error!("[proxy] WS remote connection failed: {}", e);
            // Send a proper close frame to the local client
            let close_frame = CloseFrame {
                code: CloseCode::Error,
                reason: format!("Remote connection failed: {}", e).into(),
            };
            let _ = local_ws.close(Some(close_frame)).await;
            return Err(e.into());
        }
    };

    // Split both WebSockets
    let (mut local_write, mut local_read) = local_ws.split();
    let (mut remote_write, mut remote_read) = remote_ws.split();

    // Forward messages bidirectionally
    let local_to_remote = async {
        while let Some(msg) = local_read.next().await {
            match msg {
                Ok(msg) => {
                    if msg.is_close() {
                        break;
                    }
                    if remote_write.send(msg).await.is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    };

    let remote_to_local = async {
        while let Some(msg) = remote_read.next().await {
            match msg {
                Ok(msg) => {
                    if msg.is_close() {
                        break;
                    }
                    if local_write.send(msg).await.is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    };

    tokio::select! {
        _ = local_to_remote => {},
        _ = remote_to_local => {},
        _ = shutdown_rx.changed() => {
            log::info!("[proxy] WS {} killed (target changed)", addr);
        },
    }

    Ok(())
}

/// Handle HTTP connections by forwarding to remote
async fn handle_http(
    mut local_stream: TcpStream,
    target_host: &str,
    addr: std::net::SocketAddr,
    port: u16,
    mut shutdown_rx: watch::Receiver<u64>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Connect to remote server on the same port
    let remote_addr = format!("{}:{}", target_host, port);
    let mut remote_stream = match TcpStream::connect(&remote_addr).await {
        Ok(s) => s,
        Err(e) => {
            // Friendly error message - service may still be starting up
            let (status, message) = if e.kind() == std::io::ErrorKind::ConnectionRefused {
                (
                    "503 Service Unavailable",
                    "No content yet - service starting up",
                )
            } else {
                ("502 Bad Gateway", "Remote service unavailable")
            };
            let response = format!(
                "HTTP/1.1 {}\r\nContent-Type: text/plain\r\nContent-Length: {}\r\n\r\n{}",
                status,
                message.len(),
                message
            );
            local_stream.write_all(response.as_bytes()).await?;
            return Ok(());
        }
    };

    // Log the request (peek at first line)
    let mut peek_buf = vec![0u8; 256];
    if let Ok(n) = local_stream.peek(&mut peek_buf).await {
        let first_line = String::from_utf8_lossy(&peek_buf[..n])
            .lines()
            .next()
            .unwrap_or("")
            .to_string();
        log::info!(
            "[proxy] HTTP {} -> {}:{} | {}",
            addr,
            target_host,
            port,
            first_line
        );
    }

    // Bidirectional copy between local and remote
    let (mut local_read, mut local_write) = local_stream.split();
    let (mut remote_read, mut remote_write) = remote_stream.split();

    let client_to_server = tokio::io::copy(&mut local_read, &mut remote_write);
    let server_to_client = tokio::io::copy(&mut remote_read, &mut local_write);

    tokio::select! {
        result = client_to_server => {
            if let Err(e) = result {
                if e.kind() != std::io::ErrorKind::NotConnected {
                    log::error!("[proxy] HTTP client->server error: {}", e);
                }
            }
        }
        result = server_to_client => {
            if let Err(e) = result {
                if e.kind() != std::io::ErrorKind::NotConnected {
                    log::error!("[proxy] HTTP server->client error: {}", e);
                }
            }
        }
        _ = shutdown_rx.changed() => {
            log::info!("[proxy] HTTP {} killed (target changed)", addr);
        }
    }

    Ok(())
}

/// Validate that a host is on a private/local network (prevents SSRF to public hosts).
fn is_private_network_host(host: &str) -> bool {
    if host == "localhost" || host == "127.0.0.1" || host == "::1" {
        return true;
    }

    if host.ends_with(".local") {
        return true;
    }

    if let Ok(ip) = host.parse::<std::net::IpAddr>() {
        return match ip {
            std::net::IpAddr::V4(v4) => v4.is_private() || v4.is_loopback() || v4.is_link_local(),
            std::net::IpAddr::V6(v6) => {
                v6.is_loopback()
                    || v6.segments()[0] == 0xfe80  // link-local
                    || (v6.segments()[0] & 0xfe00) == 0xfc00 // unique local (fc00::/7)
            }
        };
    }

    false
}

/// Set the target host for the proxy and start the proxy.
/// Validates that the host is a private/local network address.
/// If the proxy is already running (e.g. switching between robots),
/// it is stopped first — this kills all existing TCP/WebSocket connections
/// via the generation counter, preventing stale HTTP keep-alive pipes
/// from forwarding requests to the old robot.
pub async fn set_target_host(state: &Arc<LocalProxyState>, host: String) -> Result<(), String> {
    if host.is_empty() {
        return Err("Proxy target host cannot be empty".to_string());
    }

    if !is_private_network_host(&host) {
        return Err(format!(
            "Proxy target must be a local/private network address, got: {}",
            host
        ));
    }

    // Stop existing proxy first to kill stale connections to the previous host.
    stop_local_proxy(state).await;

    {
        let mut target = state.target_host.write().await;
        log::info!("[proxy] Target host set to: {}", host);
        *target = Some(host);
    }

    // Propagate bind failures. If the critical port can't be taken we must
    // NOT leave a target configured because future commands would silently
    // hit the conflicting service on localhost:8000.
    if let Err(e) = start_local_proxy(state.clone()).await {
        let mut target = state.target_host.write().await;
        *target = None;
        return Err(e);
    }
    Ok(())
}

/// Clear the target host and stop the proxy
pub async fn clear_target_host(state: &Arc<LocalProxyState>) {
    // Stop the proxy first
    stop_local_proxy(state).await;

    // Clear the target host
    let mut target = state.target_host.write().await;
    log::info!("[proxy] Target host cleared");
    *target = None;
}
