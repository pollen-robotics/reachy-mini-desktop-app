import { useEffect, useRef } from 'react';
import useAppStore from '../store/useAppStore';
import {
  categorizeDaemonLine,
  parseDaemonLogLevel,
  connectDaemonLogWebSocket,
  formatClockTime,
} from '../utils/logging';
import type { DaemonLogSocketHandle } from '../utils/logging';
import type { LogEntry } from '../types/store';

/**
 * Opens a resilient WebSocket to the remote robot's daemon `/logs/ws/daemon`
 * endpoint (WiFi mode only) and streams each line into the shared
 * `state.logs` buffer via `appendLogs`.
 *
 * Returning nothing is intentional: every consumer (LogConsole, the
 * standalone LogViewerWindow, etc.) reads from the store so the connection is
 * opened exactly once per session even when multiple surfaces display logs.
 *
 * The hook is a no-op outside WiFi mode and when `enabledCategories` is empty,
 * which lets callers throttle the WS (e.g. skip it entirely in simple-only
 * surfaces that never display daemon logs).
 */

export type DaemonLogSource = 'api' | 'app' | 'daemon';

export default function useDaemonLogStream(enabledCategories: DaemonLogSource[]): void {
  const connectionMode = useAppStore(s => s.connectionMode);
  const remoteHost = useAppStore(s => s.remoteHost);
  const appendLogs = useAppStore(s => s.appendLogs);
  const socketRef = useRef<DaemonLogSocketHandle | null>(null);

  const shouldConnect = enabledCategories.length > 0 && connectionMode === 'wifi' && !!remoteHost;

  useEffect(() => {
    if (!shouldConnect) {
      if (socketRef.current) {
        socketRef.current.dispose();
        socketRef.current = null;
      }
      return undefined;
    }

    const handle = connectDaemonLogWebSocket({
      host: remoteHost as string,
      onMessage: line => {
        const now = Date.now();
        const entry: LogEntry = {
          message: line,
          source: 'daemon',
          category: categorizeDaemonLine(line) === 'app' ? 'app' : 'daemon',
          level: parseDaemonLogLevel(line),
          timestamp: formatClockTime(now),
          timestampNumeric: now,
        };
        appendLogs([entry]);
      },
    });
    socketRef.current = handle;

    return () => {
      handle.dispose();
      socketRef.current = null;
    };
  }, [shouldConnect, remoteHost, appendLogs]);
}
