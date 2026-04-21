import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Box, Typography, ToggleButton, ToggleButtonGroup, IconButton } from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import VerticalAlignBottomIcon from '@mui/icons-material/VerticalAlignBottom';
import { useShallow } from 'zustand/react/shallow';
import useAppStore from '../../store/useAppStore';
import { useWindowSync } from '../windows/hooks/useWindowSync';
import { normalizeLog } from '../../components/LogConsole/utils';
import type { AppState, LogEntry as StoreLogEntry } from '../../types/store';
import {
  VIEWER_CATEGORY_META,
  LOG_LIMITS,
  categorizeDaemonLine,
  parseDaemonLogLevel,
  formatClockTime,
  type ViewerCategory,
  type ViewerEntryCategory,
} from '../../utils/logging';
import type { LogLevel } from '../../types/api';

interface ViewerLogEntry {
  line: string;
  cat: ViewerEntryCategory;
  level: LogLevel;
  time: string;
  /** Sort key. Milliseconds since epoch when known, otherwise ingestion time. */
  ts: number;
}

const MAX_LOGS = LOG_LIMITS.VIEWER;

const LEVEL_COLORS: Record<LogLevel, string> = {
  error: '#ef4444',
  warning: '#f59e0b',
  debug: '#666',
  success: '#22c55e',
  info: '#d4d4d4',
};

const CAT_BADGE_BG: Record<ViewerEntryCategory, string> = {
  daemon: 'rgba(96, 165, 250, 0.15)',
  api: 'rgba(52, 211, 153, 0.15)',
  app: 'rgba(192, 132, 252, 0.15)',
  frontend: 'rgba(93, 179, 255, 0.15)',
};

const CAT_BADGE_FG: Record<ViewerEntryCategory, string> = {
  daemon: VIEWER_CATEGORY_META.daemon.color,
  api: VIEWER_CATEGORY_META.api.color,
  app: VIEWER_CATEGORY_META.app.color,
  frontend: VIEWER_CATEGORY_META.frontend.color,
};

const daemonEntryToViewer = (raw: unknown): ViewerLogEntry => {
  const normalized = normalizeLog(raw);
  const ts = normalized.timestampNumeric || Date.now();
  return {
    line: normalized.message,
    cat: categorizeDaemonLine(normalized.message),
    level: parseDaemonLogLevel(normalized.message),
    time: normalized.timestamp || formatClockTime(ts),
    ts,
  };
};

const frontendEntryToViewer = (entry: StoreLogEntry): ViewerLogEntry => {
  const ts = entry.timestampNumeric || Date.now();
  return {
    line: entry.message,
    cat: 'frontend',
    level: entry.level ?? 'info',
    time: entry.timestamp || formatClockTime(ts),
    ts,
  };
};

const appEntryToViewer = (entry: StoreLogEntry): ViewerLogEntry => {
  const ts = entry.timestampNumeric || Date.now();
  const prefix = entry.appName ? `[${entry.appName}] ` : '';
  return {
    line: `${prefix}${entry.message}`,
    cat: 'app',
    level: entry.level ?? 'info',
    time: entry.timestamp || formatClockTime(ts),
    ts,
  };
};

const selectLogSources = (
  state: AppState
): {
  daemonLogs: AppState['logs'];
  frontendLogs: AppState['frontendLogs'];
  appLogs: AppState['appLogs'];
} => ({
  daemonLogs: state.logs,
  frontendLogs: state.frontendLogs,
  appLogs: state.appLogs,
});

export default function LogViewerWindow(): React.ReactElement {
  // Hydrate the local (secondary-window) store from the main window. The
  // main window emits changes for `logs` (daemon, including remote WiFi lines
  // now that `useDaemonLogStream` pushes them into the shared buffer),
  // `frontendLogs`, and `appLogs` via the `windowSync` middleware; on mount we
  // also request a one-shot snapshot so the viewer doesn't start empty if
  // opened mid-session.
  useWindowSync();

  const { daemonLogs, frontendLogs, appLogs } = useAppStore(useShallow(selectLogSources));

  const [filters, setFilters] = useState<ViewerCategory[]>(['all']);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  // Local "clear" baseline: entries whose `ts` is <= this value are hidden.
  // We don't mutate the store (the main-window console stays intact).
  const [clearBeforeTs, setClearBeforeTs] = useState<number>(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const handleFilter = useCallback(
    (_: React.MouseEvent<HTMLElement>, newFilters: ViewerCategory[] | null) => {
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

  const allLogs = useMemo(() => {
    const merged: ViewerLogEntry[] = [];
    for (const entry of daemonLogs) merged.push(daemonEntryToViewer(entry));
    for (const entry of frontendLogs) merged.push(frontendEntryToViewer(entry));
    for (const entry of appLogs) merged.push(appEntryToViewer(entry));
    merged.sort((a, b) => a.ts - b.ts);
    const filtered = clearBeforeTs > 0 ? merged.filter(e => e.ts > clearBeforeTs) : merged;
    return filtered.length > MAX_LOGS ? filtered.slice(-MAX_LOGS) : filtered;
  }, [daemonLogs, frontendLogs, appLogs, clearBeforeTs]);

  const visibleLogs = useMemo(
    () =>
      filters.includes('all')
        ? allLogs
        : allLogs.filter(l => filters.includes(l.cat as ViewerCategory)),
    [allLogs, filters]
  );

  // Local clear: hide all entries up to "now" in this viewer only. The
  // main-window console keeps its history untouched.
  const handleClear = useCallback(() => {
    setClearBeforeTs(Date.now());
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [visibleLogs, autoScroll]);

  // Detect manual scroll
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 40;
    setAutoScroll(atBottom);
  }, []);

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
            {(
              Object.entries(VIEWER_CATEGORY_META) as [
                ViewerCategory,
                { label: string; color: string },
              ][]
            ).map(([key, { label, color }]) => (
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
            {visibleLogs.length} / {allLogs.length}
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
            onClick={handleClear}
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
                borderLeft: `2px solid ${CAT_BADGE_FG[entry.cat] || '#444'}22`,
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
                  color: CAT_BADGE_FG[entry.cat],
                  bgcolor: CAT_BADGE_BG[entry.cat],
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
