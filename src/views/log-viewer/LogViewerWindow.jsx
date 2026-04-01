import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Typography, ToggleButton, ToggleButtonGroup, IconButton } from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import VerticalAlignBottomIcon from '@mui/icons-material/VerticalAlignBottom';
import { categorizeLogSource } from '../../components/LogConsole/utils';

const CATEGORIES = {
  all: { label: 'All', color: '#888' },
  daemon: { label: 'Daemon', color: '#60a5fa' },
  api: { label: 'API', color: '#34d399' },
  app: { label: 'App', color: '#c084fc' },
};

const MAX_LOGS = 2000;

function parseLevel(line) {
  if (line.includes(' - ERROR - ') || line.includes(' ERROR ')) return 'error';
  if (line.includes(' - WARNING - ') || line.includes(' WARNING ')) return 'warning';
  if (line.includes(' - DEBUG - ')) return 'debug';
  return 'info';
}

const LEVEL_COLORS = {
  error: '#ef4444',
  warning: '#f59e0b',
  debug: '#666',
  info: '#d4d4d4',
};

const CAT_BADGE_COLORS = {
  daemon: 'rgba(96, 165, 250, 0.15)',
  api: 'rgba(52, 211, 153, 0.15)',
  app: 'rgba(192, 132, 252, 0.15)',
};

const CAT_TEXT_COLORS = {
  daemon: '#60a5fa',
  api: '#34d399',
  app: '#c084fc',
};

function formatTime() {
  const now = new Date();
  return now.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function LogViewerWindow() {
  const [logs, setLogs] = useState([]);
  const [filters, setFilters] = useState(['all']);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef(null);

  // Handle filter toggle
  const handleFilter = useCallback(
    (_, newFilters) => {
      if (!newFilters || newFilters.length === 0) return;
      // If 'all' is being added, select only 'all'
      if (newFilters.includes('all') && !filters.includes('all')) {
        setFilters(['all']);
        return;
      }
      // If a specific filter is added while 'all' is selected, deselect 'all'
      const withoutAll = newFilters.filter(f => f !== 'all');
      setFilters(withoutAll.length > 0 ? withoutAll : ['all']);
    },
    [filters]
  );

  const addLog = useCallback(line => {
    const cat = categorizeLogSource(line);
    const level = parseLevel(line);
    const time = formatTime();
    setLogs(prev => {
      const next = [...prev, { line, cat, level, time }];
      return next.length > MAX_LOGS ? next.slice(-MAX_LOGS) : next;
    });
  }, []);

  // Read connection info from URL params (passed by the opener)
  const urlParams = new URLSearchParams(window.location.search);
  const connectionMode = urlParams.get('mode');
  const remoteHost = urlParams.get('host');

  // Source 1: Sidecar events (lite/USB mode — Tauri events are cross-window)
  useEffect(() => {
    let unlistenStderr;
    let unlistenStdout;
    const setup = async () => {
      try {
        const { listen: tauriListen } = await import('@tauri-apps/api/event');
        unlistenStderr = await tauriListen('sidecar-stderr', event => {
          if (event.payload) addLog(event.payload);
        });
        unlistenStdout = await tauriListen('sidecar-stdout', event => {
          if (event.payload) addLog(event.payload);
        });
      } catch {
        // Not in Tauri
      }
    };
    setup();
    return () => {
      if (unlistenStderr) unlistenStderr();
      if (unlistenStdout) unlistenStdout();
    };
  }, [addLog]);

  // Source 2: Direct WebSocket to daemon (wireless mode)
  useEffect(() => {
    if (connectionMode !== 'wifi' || !remoteHost) return;

    let ws = null;
    let stopped = false;
    let reconnectTimer;

    const connectWs = () => {
      if (stopped) return;
      const cleanHost = remoteHost.replace(/^https?:\/\//, '');
      const wsUrl = `ws://${cleanHost}:8000/logs/ws/daemon`;
      try {
        ws = new WebSocket(wsUrl);
        ws.onmessage = event => {
          if (event.data && event.data.trim()) {
            addLog(event.data);
          }
        };
        ws.onclose = () => {
          ws = null;
          if (!stopped) {
            reconnectTimer = setTimeout(connectWs, 3000);
          }
        };
        ws.onerror = () => {};
      } catch {
        if (!stopped) {
          reconnectTimer = setTimeout(connectWs, 3000);
        }
      }
    };

    connectWs();

    return () => {
      stopped = true;
      clearTimeout(reconnectTimer);
      if (ws) {
        ws.close();
        ws = null;
      }
    };
  }, [addLog, connectionMode, remoteHost]);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // Detect manual scroll
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 40;
    setAutoScroll(atBottom);
  }, []);

  // Filter logs
  const visibleLogs = filters.includes('all') ? logs : logs.filter(l => filters.includes(l.cat));

  return (
    <Box
      sx={{
        width: '100%',
        height: '100vh',
        bgcolor: '#0d1117',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
      }}
    >
      {/* Toolbar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 1.5,
          py: 0.75,
          bgcolor: '#161b22',
          borderBottom: '1px solid #21262d',
          minHeight: 40,
          // Allow window dragging on the toolbar
          WebkitAppRegion: 'drag',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, WebkitAppRegion: 'no-drag' }}>
          <ToggleButtonGroup size="small" value={filters} onChange={handleFilter}>
            {Object.entries(CATEGORIES).map(([key, { label, color }]) => (
              <ToggleButton
                key={key}
                value={key}
                sx={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'none',
                  px: 1.5,
                  py: 0.25,
                  color: '#8b949e',
                  borderColor: '#30363d',
                  '&.Mui-selected': {
                    color: color,
                    bgcolor: `${color}18`,
                    borderColor: `${color}40`,
                    '&:hover': {
                      bgcolor: `${color}25`,
                    },
                  },
                  '&:hover': {
                    bgcolor: 'rgba(255,255,255,0.04)',
                  },
                }}
              >
                {label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          <Typography sx={{ fontSize: 11, color: '#484f58', ml: 1 }}>
            {visibleLogs.length} / {logs.length}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, WebkitAppRegion: 'no-drag' }}>
          <IconButton
            size="small"
            onClick={() => {
              setAutoScroll(true);
              if (scrollRef.current) {
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
              }
            }}
            sx={{
              color: autoScroll ? '#58a6ff' : '#484f58',
              '&:hover': { bgcolor: 'rgba(255,255,255,0.06)' },
            }}
          >
            <VerticalAlignBottomIcon sx={{ fontSize: 16 }} />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => setLogs([])}
            sx={{
              color: '#484f58',
              '&:hover': { bgcolor: 'rgba(255,255,255,0.06)', color: '#ef4444' },
            }}
          >
            <DeleteOutlineIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Box>
      </Box>

      {/* Log area */}
      <Box
        ref={scrollRef}
        onScroll={handleScroll}
        sx={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          px: 0,
          py: 0.5,
          // Scrollbar styling
          '&::-webkit-scrollbar': { width: 8 },
          '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
          '&::-webkit-scrollbar-thumb': {
            bgcolor: '#30363d',
            borderRadius: 4,
            '&:hover': { bgcolor: '#484f58' },
          },
        }}
      >
        {visibleLogs.length === 0 ? (
          <Typography
            sx={{
              fontSize: 12,
              color: '#484f58',
              textAlign: 'center',
              mt: 4,
              fontStyle: 'italic',
            }}
          >
            Waiting for logs...
          </Typography>
        ) : (
          visibleLogs.map((entry, i) => (
            <Box
              key={i}
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                px: 1.5,
                py: '2px',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' },
                borderLeft: `2px solid ${CAT_TEXT_COLORS[entry.cat] || '#444'}22`,
              }}
            >
              {/* Timestamp */}
              <Typography
                component="span"
                sx={{
                  fontSize: 11,
                  color: '#484f58',
                  minWidth: 65,
                  flexShrink: 0,
                  mr: 1,
                  userSelect: 'all',
                }}
              >
                {entry.time}
              </Typography>

              {/* Category badge */}
              <Typography
                component="span"
                sx={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: CAT_TEXT_COLORS[entry.cat],
                  bgcolor: CAT_BADGE_COLORS[entry.cat],
                  px: 0.75,
                  py: '1px',
                  borderRadius: '3px',
                  minWidth: 40,
                  textAlign: 'center',
                  flexShrink: 0,
                  mr: 1,
                  mt: '1px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                {entry.cat}
              </Typography>

              {/* Message */}
              <Typography
                component="span"
                sx={{
                  fontSize: 11.5,
                  color: LEVEL_COLORS[entry.level],
                  wordBreak: 'break-all',
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.5,
                  userSelect: 'all',
                }}
              >
                {entry.line}
              </Typography>
            </Box>
          ))
        )}
      </Box>
    </Box>
  );
}
