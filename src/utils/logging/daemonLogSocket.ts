/**
 * Shared WebSocket helper to stream daemon logs.
 *
 * Both `useDaemonLogStream` (inside the main window) and the standalone
 * `LogViewerWindow` open an identical WebSocket with auto-reconnect. Centralize
 * the setup so the URL, reconnect policy, and teardown cannot drift.
 *
 * Returns an opaque disposer; callers own their line-processing logic.
 */

const RECONNECT_DELAY_MS = 3000;
const DAEMON_LOGS_PATH = '/logs/ws/daemon';
const DAEMON_PORT = 8000;

export interface DaemonLogSocketHandle {
  /** Close the socket and stop further reconnect attempts. */
  dispose: () => void;
}

export interface DaemonLogSocketOptions {
  /**
   * Host (optionally with `http://`/`https://` prefix) of the remote daemon.
   * Anything else than a bare host is stripped.
   */
  host: string;
  onMessage: (line: string) => void;
}

/**
 * Open a resilient WebSocket to the daemon logs endpoint.
 * Auto-reconnects every {@link RECONNECT_DELAY_MS} ms on close/error until
 * `dispose()` is called. Socket errors are intentionally swallowed: both
 * current consumers rely on the auto-reconnect loop and do not expose per-
 * error UI.
 */
export function connectDaemonLogWebSocket(options: DaemonLogSocketOptions): DaemonLogSocketHandle {
  const { host, onMessage } = options;
  const cleanHost = host.replace(/^https?:\/\//, '');
  const wsUrl = `ws://${cleanHost}:${DAEMON_PORT}${DAEMON_LOGS_PATH}`;

  let stopped = false;
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  const connect = (): void => {
    if (stopped) return;
    try {
      const socket = new WebSocket(wsUrl);
      socket.onmessage = (event: MessageEvent<string>) => {
        if (!event.data || typeof event.data !== 'string' || !event.data.trim()) return;
        onMessage(event.data);
      };
      socket.onclose = () => {
        ws = null;
        if (!stopped) {
          reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
        }
      };
      socket.onerror = () => {};
      ws = socket;
    } catch {
      if (!stopped) {
        reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
      }
    }
  };

  connect();

  return {
    dispose: () => {
      stopped = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
      }
      if (ws) {
        ws.close();
        ws = null;
      }
    },
  };
}
