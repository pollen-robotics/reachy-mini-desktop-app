//! Local Proxy Module
//!
//! Forwards HTTP and WebSocket connections from localhost to a remote host.
//! Supports multiple ports (8000 for daemon API, 8042 for video streams).
//! This bypasses browser Private Network Access (PNA) restrictions.
//!
//! The proxy only runs when in WiFi mode (when a target host is set).

use std::sync::Arc;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{RwLock, Mutex};
use tokio::io::AsyncWriteExt;
use tokio::task::JoinHandle;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::handshake::server::{Request, Response};
use futures_util::{StreamExt, SinkExt};

/// Ports to proxy (local -> remote with same port)
/// - 8000: Daemon API (HTTP + WebSocket)
/// - 8042: Video streams
/// - 7447: Zenoh (DDS)
/// - 8443: WebRTC signaling (GStreamer WebRTC)
const PROXY_PORTS: &[u16] = &[8000, 8042, 7447, 8443];

/// Shared state for the proxy
pub struct LocalProxyState {
    pub target_host: RwLock<Option<String>>,
    /// Handles to running proxy tasks (so we can abort them)
    proxy_handles: Mutex<Vec<JoinHandle<()>>>,
}

impl LocalProxyState {
    pub fn new() -> Self {
        Self {
            target_host: RwLock::new(None),
            proxy_handles: Mutex::new(Vec::new()),
        }
    }
}

impl Default for LocalProxyState {
    fn default() -> Self {
        Self::new()
    }
}

/// Start the local proxy servers on all configured ports.
async fn start_local_proxy(state: Arc<LocalProxyState>) {
    let mut handles = state.proxy_handles.lock().await;

    // Don't start if already running
    if !handles.is_empty() {
        println!("[proxy] ⚠️  Proxy already running");
        return;
    }

    for &port in PROXY_PORTS {
        let state_clone = state.clone();
        let handle = tokio::spawn(async move {
            start_port_proxy(state_clone, port).await;
        });
        handles.push(handle);
    }

    println!("[proxy] 🚀 Proxy started for WiFi mode");
}

/// Stop all running proxy servers
async fn stop_local_proxy(state: &Arc<LocalProxyState>) {
    let mut handles = state.proxy_handles.lock().await;

    if handles.is_empty() {
        return;
    }

    // Abort all proxy tasks
    for handle in handles.drain(..) {
        handle.abort();
    }

    println!("[proxy] 🛑 Proxy stopped");
}

/// Start a proxy server for a specific port
async fn start_port_proxy(state: Arc<LocalProxyState>, port: u16) {
    let bind_addr = format!("127.0.0.1:{}", port);
    let listener = match TcpListener::bind(&bind_addr).await {
        Ok(l) => {
            println!("[proxy] ✅ Listening on http://localhost:{}", port);
            l
        }
        Err(e) => {
            if e.kind() == std::io::ErrorKind::AddrInUse {
                println!("[proxy] ⏭️  Port {} already in use - skipping", port);
            } else {
                eprintln!("[proxy] ❌ Failed to bind to port {}: {}", port, e);
            }
            return;
        }
    };

    loop {
        match listener.accept().await {
            Ok((stream, addr)) => {
                let state_clone = state.clone();
                tokio::spawn(async move {
                    if let Err(e) = handle_connection(stream, state_clone, addr, port).await {
                        eprintln!("[proxy] ❌ Connection error from {} on port {}: {}", addr, port, e);
                    }
                });
            }
            Err(e) => {
                eprintln!("[proxy] ❌ Accept error on port {}: {}", port, e);
            }
        }
    }
}

/// Handle a connection - detect if WebSocket or HTTP and route accordingly
async fn handle_connection(
    mut stream: TcpStream,
    state: Arc<LocalProxyState>,
    addr: std::net::SocketAddr,
    port: u16,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Get target host
    let target_host = {
        let host = state.target_host.read().await;
        match host.as_ref() {
            Some(h) => h.clone(),
            None => {
                eprintln!("[proxy] ❌ No target host configured");
                let response = "HTTP/1.1 502 Bad Gateway\r\nContent-Length: 23\r\n\r\nNo target host configured";
                stream.write_all(response.as_bytes()).await?;
                return Ok(());
            }
        }
    };

    // Peek at the first bytes to read the HTTP request
    let mut buf = vec![0u8; 8192];
    let n = stream.peek(&mut buf).await?;
    let request_str = String::from_utf8_lossy(&buf[..n]);

    // Check if this is a WebSocket upgrade request
    let is_websocket = request_str.to_lowercase().contains("upgrade: websocket");

    if is_websocket {
        handle_websocket(stream, &target_host, addr, port).await
    } else {
        handle_http(stream, &target_host, addr, port).await
    }
}

/// Handle WebSocket connections
async fn handle_websocket(
    stream: TcpStream,
    target_host: &str,
    addr: std::net::SocketAddr,
    port: u16,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    use tokio_tungstenite::tungstenite::protocol::CloseFrame;
    use tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode;

    // Capture the request path during handshake
    let request_path = Arc::new(RwLock::new(String::from("/")));
    let request_path_clone = request_path.clone();

    // Accept with callback to capture path
    let mut local_ws = tokio_tungstenite::accept_hdr_async(stream, |req: &Request, resp: Response| {
        let path = req.uri().path_and_query()
            .map(|pq| pq.to_string())
            .unwrap_or_else(|| "/".to_string());

        // Store in a thread-local or use blocking lock
        if let Ok(mut p) = request_path_clone.try_write() {
            *p = path;
        }
        Ok(resp)
    }).await?;

    // Get the captured path
    let path = request_path.read().await.clone();
    println!("[proxy] 🔌 WS {} -> ws://{}:{}{}", addr, target_host, port, path);

    // Build remote URL with the same path and port
    let remote_url = format!("ws://{}:{}{}", target_host, port, path);

    // Connect to remote - if this fails, properly close the local WebSocket
    let remote_ws = match connect_async(&remote_url).await {
        Ok((ws, _)) => ws,
        Err(e) => {
            eprintln!("[proxy] ❌ WS remote connection failed: {}", e);
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
    }

    Ok(())
}

/// Handle HTTP connections by forwarding to remote
async fn handle_http(
    mut local_stream: TcpStream,
    target_host: &str,
    addr: std::net::SocketAddr,
    port: u16,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Connect to remote server on the same port
    let remote_addr = format!("{}:{}", target_host, port);
    let mut remote_stream = match TcpStream::connect(&remote_addr).await {
        Ok(s) => s,
        Err(e) => {
            // Friendly error message - service may still be starting up
            let (status, message) = if e.kind() == std::io::ErrorKind::ConnectionRefused {
                ("503 Service Unavailable", "No content yet - service starting up")
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
        println!("[proxy] 📡 HTTP {} -> {}:{} | {}", addr, target_host, port, first_line);
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
                    eprintln!("[proxy] ❌ HTTP client->server error: {}", e);
                }
            }
        }
        result = server_to_client => {
            if let Err(e) = result {
                if e.kind() != std::io::ErrorKind::NotConnected {
                    eprintln!("[proxy] ❌ HTTP server->client error: {}", e);
                }
            }
        }
    }

    Ok(())
}

/// Set the target host for the proxy and start the proxy
pub async fn set_target_host(state: &Arc<LocalProxyState>, host: String) {
    // Set the target host
    {
        let mut target = state.target_host.write().await;
        println!("[proxy] 🎯 Target host set to: {}", host);
        *target = Some(host);
    }

    // Start the proxy
    start_local_proxy(state.clone()).await;
}

/// Clear the target host and stop the proxy
pub async fn clear_target_host(state: &Arc<LocalProxyState>) {
    // Stop the proxy first
    stop_local_proxy(state).await;

    // Clear the target host
    let mut target = state.target_host.write().await;
    println!("[proxy] 🚫 Target host cleared");
    *target = None;
}
