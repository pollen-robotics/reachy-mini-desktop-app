import { useState, useEffect, useRef, useMemo } from 'react';
import useAppStore from '../store/useAppStore';
import { categorizeLogSource } from '../components/LogConsole/utils';

/**
 * Streams daemon logs from the remote robot via WebSocket.
 * Only active when at least one category is enabled and in WiFi mode.
 *
 * Returns an array of normalized log objects compatible with LogConsole,
 * filtered by the enabled categories.
 */

const MAX_REMOTE_LOGS = 2000;

function parseLevel(line) {
  if (line.includes(' - ERROR - ') || line.includes(' ERROR ')) return 'error';
  if (line.includes(' - WARNING - ') || line.includes(' WARNING ')) return 'warning';
  if (line.includes(' - DEBUG - ')) return 'debug';
  return 'info';
}

export default function useDaemonLogStream(enabledCategories) {
  const [allLogs, setAllLogs] = useState([]);
  const { connectionMode, remoteHost } = useAppStore();
  const wsRef = useRef(null);

  const shouldConnect = enabledCategories.length > 0 && connectionMode === 'wifi' && !!remoteHost;

  // WebSocket — connects once, stores ALL logs regardless of filter
  useEffect(() => {
    if (!shouldConnect) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setAllLogs([]);
      return;
    }

    let stopped = false;
    let reconnectTimer;

    const connect = () => {
      if (stopped) return;
      const cleanHost = remoteHost.replace(/^https?:\/\//, '');
      const wsUrl = `ws://${cleanHost}:8000/logs/ws/daemon`;
      try {
        const ws = new WebSocket(wsUrl);
        ws.onmessage = event => {
          if (!event.data || !event.data.trim()) return;
          const line = event.data;
          const cat = categorizeLogSource(line);
          const level = parseLevel(line);
          const now = Date.now();
          setAllLogs(prev => {
            const next = [
              ...prev,
              {
                message: line,
                timestamp: new Date(now).toLocaleTimeString('en-US', {
                  hour12: false,
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                }),
                timestampNumeric: now,
                source: cat,
                level,
              },
            ];
            return next.length > MAX_REMOTE_LOGS ? next.slice(-MAX_REMOTE_LOGS) : next;
          });
        };
        ws.onclose = () => {
          wsRef.current = null;
          if (!stopped) {
            reconnectTimer = setTimeout(connect, 3000);
          }
        };
        ws.onerror = () => {};
        wsRef.current = ws;
      } catch {
        if (!stopped) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      }
    };

    connect();

    return () => {
      stopped = true;
      clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [shouldConnect, remoteHost]);

  // Filter logs by enabled categories (cheap, no WebSocket reconnect)
  const filteredLogs = useMemo(
    () => allLogs.filter(log => enabledCategories.includes(log.source)),
    [allLogs, enabledCategories]
  );

  return filteredLogs;
}
