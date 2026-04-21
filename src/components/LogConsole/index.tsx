import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Box, Typography, IconButton, Tooltip, InputBase, CircularProgress } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import { useVirtualizer } from '@tanstack/react-virtual';
import useAppStore from '../../store/useAppStore';
import { FONT_SIZES, PADDING, EMPTY_ARRAY, TEXT_SELECT_STYLES } from './constants';
import { useLogProcessing } from './useLogProcessing';
import { LogItem } from './LogItem';
import { useLogConsoleHeight, useFixedItemHeight } from './useLogConsoleHeight';
import { useVirtualizerScroll } from './useVirtualizerScroll';
import { CATEGORY_META } from '../../utils/logging/constants';
import type { LogCategory, LogEntry, LogMode } from '../../types/store';

interface FilterChipProps {
  label: string;
  color: string;
  active: boolean;
  onClick: () => void;
  darkMode: boolean;
}

function FilterChip({ label, color, active, onClick, darkMode }: FilterChipProps) {
  return (
    <Box
      onClick={onClick}
      sx={{
        fontSize: 9,
        fontWeight: 600,
        px: 0.75,
        py: 0.15,
        borderRadius: '4px',
        cursor: 'pointer',
        transition: 'all 0.15s',
        userSelect: 'none',
        color: active ? color : darkMode ? '#555' : '#bbb',
        bgcolor: active ? `${color}18` : 'transparent',
        border: `1px solid ${active ? `${color}40` : darkMode ? '#333' : '#ddd'}`,
        '&:hover': {
          bgcolor: `${color}15`,
          borderColor: `${color}30`,
        },
      }}
    >
      {label}
    </Box>
  );
}

interface ModeToggleProps {
  mode: LogMode;
  onChange: (mode: LogMode) => void;
  darkMode: boolean;
}

function ModeToggle({ mode, onChange, darkMode }: ModeToggleProps) {
  return (
    <Box
      sx={{
        display: 'inline-flex',
        borderRadius: '4px',
        overflow: 'hidden',
        border: `1px solid ${darkMode ? '#333' : '#ddd'}`,
      }}
    >
      {(
        [
          { value: 'simple', label: 'Simple' },
          { value: 'dev', label: 'Dev' },
        ] as const
      ).map(opt => (
        <Box
          key={opt.value}
          onClick={() => onChange(opt.value)}
          sx={{
            fontSize: 9,
            fontWeight: 600,
            px: 0.75,
            py: 0.15,
            cursor: 'pointer',
            userSelect: 'none',
            transition: 'all 0.15s',
            color: mode === opt.value ? (darkMode ? '#fff' : '#111') : darkMode ? '#555' : '#bbb',
            bgcolor:
              mode === opt.value
                ? darkMode
                  ? 'rgba(255,255,255,0.08)'
                  : 'rgba(0,0,0,0.05)'
                : 'transparent',
            '&:hover': { bgcolor: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' },
          }}
        >
          {opt.label}
        </Box>
      ))}
    </Box>
  );
}

export interface LogConsoleProps {
  logs?: unknown[] | null;
  darkMode?: boolean;
  includeStoreLogs?: boolean;
  sx?: SxProps<Theme>;
  maxHeight?: number | string | null;
  height?: number | string | null;
  lines?: number | null;
  showTimestamp?: boolean;
  compact?: boolean;
  simpleStyle?: boolean;
  emptyMessage?: string;
  onExpand?: (() => void) | null;
  fullSize?: boolean;
  /**
   * When set, overrides the store `logMode` for this instance and hides the
   * Simple/Dev toggle from the full-size header. Useful for views that must
   * always render in a specific mode (e.g. startup fullscreen pinned to Dev).
   */
  forceMode?: LogMode;
}

/**
 * LogConsole Component
 *
 * Two layouts:
 *   - Inline (default): compact header with "Logs" + expand/copy
 *   - Full-size (fullSize=true): toggle Simple/Dev, and in Dev mode
 *     category filters + search appear on the same line
 */
function LogConsole({
  logs,
  darkMode = false,
  includeStoreLogs = true,
  sx = {},
  maxHeight = null,
  height = null,
  lines = null,
  showTimestamp = true,
  compact = false,
  simpleStyle = false,
  emptyMessage = 'No logs',
  onExpand = null,
  fullSize = false,
  forceMode,
}: LogConsoleProps) {
  const frontendLogs = useAppStore(state =>
    includeStoreLogs ? state.frontendLogs : (EMPTY_ARRAY as unknown as LogEntry[])
  );
  const appLogs = useAppStore(state =>
    includeStoreLogs ? state.appLogs : (EMPTY_ARRAY as unknown as LogEntry[])
  );

  const logMode = useAppStore(s => s.logMode);
  const setLogMode = useAppStore(s => s.setLogMode);
  const logSearch = useAppStore(s => s.logSearch);
  const setLogSearch = useAppStore(s => s.setLogSearch);
  const categoryFilters = useAppStore(s => s.logCategoryFilters);
  const toggleCategory = useAppStore(s => s.toggleLogCategory);

  const effectiveMode: LogMode = simpleStyle ? 'simple' : (forceMode ?? logMode);
  const isDevMode = effectiveMode === 'dev';

  const normalizedLogs = useLogProcessing(
    logs as unknown[] | null | undefined,
    frontendLogs as unknown[],
    appLogs as unknown[],
    includeStoreLogs,
    simpleStyle,
    {
      mode: effectiveMode,
      categoryFilters: isDevMode ? categoryFilters : null,
      search: isDevMode ? logSearch : '',
    }
  );

  const fontSize = compact ? FONT_SIZES.COMPACT : FONT_SIZES.NORMAL;
  const fixedItemHeight = useFixedItemHeight(compact);
  const containerHeight = useLogConsoleHeight({ lines, height, maxHeight, compact, simpleStyle });

  const parentRef = useRef<HTMLDivElement | null>(null);

  // Hide the Simple <-> Dev toggle flash behind a short spinner overlay.
  // Only applies to full-size layouts (that's where the toggle lives).
  //
  // Flow (to avoid any frame showing the "new" logs before the spinner):
  //   1. User clicks the toggle -> `handleModeChange` flips `showOverlay` to
  //      true with `enableFade` disabled, so the overlay snaps in instantly
  //      (no opacity transition) in the same render as the click.
  //   2. Inside `requestAnimationFrame`, we call `setLogMode` so the actual
  //      switch happens on the next frame, by which time the overlay is
  //      already painted on top.
  //   3. Once `effectiveMode` reflects the new value, we hold briefly then
  //      re-enable the fade and hide the overlay smoothly.
  const [showOverlay, setShowOverlay] = useState<boolean>(false);
  const [enableFade, setEnableFade] = useState<boolean>(false);
  const prevModeRef = useRef<LogMode>(effectiveMode);

  const handleModeChange = useCallback(
    (next: LogMode) => {
      if (next === logMode) return;
      if (!fullSize) {
        setLogMode(next);
        return;
      }
      setEnableFade(false);
      setShowOverlay(true);
      // Defer the mode switch to the next frame so the overlay paints first.
      requestAnimationFrame(() => {
        setLogMode(next);
      });
    },
    [logMode, setLogMode, fullSize]
  );

  useEffect(() => {
    if (!fullSize) return;
    if (prevModeRef.current === effectiveMode) return;
    prevModeRef.current = effectiveMode;
    if (!showOverlay) return;

    // Hold the spinner briefly so the new virtualizer has time to settle,
    // then fade the overlay out.
    const holdTimer = window.setTimeout(() => {
      setEnableFade(true);
      // Use a second frame so the `transition` property is applied before
      // the opacity change, guaranteeing a visible fade-out.
      requestAnimationFrame(() => {
        setShowOverlay(false);
      });
    }, 180);
    return () => window.clearTimeout(holdTimer);
  }, [effectiveMode, fullSize, showOverlay]);

  const virtualizer = useVirtualizer({
    count: normalizedLogs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => fixedItemHeight,
    overscan: 5,
  });

  // Read once per render so `useVirtualizerScroll` can detect when measured
  // items (multi-line logs) grow the total content height without the item
  // count changing, and re-pin the viewport to the new bottom.
  const virtualizerTotalSize = virtualizer.getTotalSize();

  const { handleScroll } = useVirtualizerScroll({
    virtualizer: virtualizer as unknown as import('@tanstack/react-virtual').Virtualizer<
      HTMLElement,
      Element
    >,
    totalCount: normalizedLogs.length,
    totalSize: virtualizerTotalSize,
    enabled: true,
    compact,
    simpleStyle,
    scrollElementRef: parentRef,
  });

  const handleCopyLogs = useCallback(async () => {
    const text = normalizedLogs
      .map(log =>
        showTimestamp && log.timestamp ? `[${log.timestamp}] ${log.message}` : log.message
      )
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch {
        /* noop */
      }
      document.body.removeChild(ta);
    }
  }, [normalizedLogs, showTimestamp]);

  const boxSx = useMemo(
    () => ({
      width: '100%',
      height:
        containerHeight === null ? '100%' : height === 'auto' ? 'auto' : `${containerHeight}px`,
      maxHeight: maxHeight || undefined,
      borderRadius: simpleStyle ? 0 : compact ? '6px' : '12px',
      bgcolor: simpleStyle ? 'transparent' : darkMode ? '#1a1a1a' : '#ffffff',
      border: simpleStyle
        ? 'none'
        : darkMode
          ? '1px solid rgba(255, 255, 255, 0.15)'
          : '1px solid rgba(0, 0, 0, 0.15)',
      overflow: 'hidden',
      overflowY: normalizedLogs.length === 0 ? 'hidden' : 'auto',
      overflowX: 'hidden',
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: simpleStyle ? 'monospace' : 'SF Mono, Monaco, Menlo, monospace',
      fontSize,
      ...TEXT_SELECT_STYLES,
      transition: 'box-shadow 0.3s ease',
      '&::-webkit-scrollbar': { width: 6 },
      '&::-webkit-scrollbar-track': { background: 'transparent' },
      '&::-webkit-scrollbar-thumb': {
        background: darkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)',
        borderRadius: 3,
      },
      '&:hover::-webkit-scrollbar-thumb': {
        background: darkMode ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)',
      },
      ...(sx as object),
    }),
    [
      height,
      containerHeight,
      maxHeight,
      simpleStyle,
      compact,
      darkMode,
      fontSize,
      normalizedLogs.length,
      sx,
    ]
  );

  // Inline (small) header
  const renderInlineHeader = () => (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 1,
        py: 0.25,
        borderBottom: `1px solid ${darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
        flexShrink: 0,
        minHeight: 24,
      }}
    >
      <Typography
        sx={{
          fontSize: 9,
          fontWeight: 600,
          color: darkMode ? '#666' : '#aaa',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        Logs
      </Typography>
      <Box className="log-console-actions" sx={{ display: 'flex', gap: 0.25 }}>
        {onExpand && (
          <IconButton
            onClick={onExpand}
            sx={{
              width: 20,
              height: 20,
              padding: 0.25,
              '&:hover': { bgcolor: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' },
            }}
          >
            <OpenInFullIcon sx={{ fontSize: 10, color: darkMode ? '#666' : '#aaa' }} />
          </IconButton>
        )}
        <IconButton
          onClick={handleCopyLogs}
          sx={{
            width: 20,
            height: 20,
            padding: 0.25,
            '&:hover': { bgcolor: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' },
          }}
        >
          <ContentCopyIcon sx={{ fontSize: 10, color: darkMode ? '#666' : '#aaa' }} />
        </IconButton>
      </Box>
    </Box>
  );

  // Full-size header: [Logs] [Simple|Dev]  ...dev filters...  [Search] [Copy]
  const renderFullSizeHeader = () => (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        px: 1.5,
        py: 0.75,
        borderBottom: `1px solid ${darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
        flexShrink: 0,
      }}
    >
      <Typography
        sx={{
          fontSize: 10,
          fontWeight: 600,
          color: darkMode ? '#666' : '#aaa',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        Logs
      </Typography>

      {!forceMode && <ModeToggle mode={logMode} onChange={handleModeChange} darkMode={darkMode} />}

      {/* Dev-only: category filters + search (hidden when the mode is forced from outside) */}
      {isDevMode && !forceMode && (
        <>
          {Object.entries(CATEGORY_META).map(([key, meta]) => (
            <FilterChip
              key={key}
              label={meta.label}
              color={meta.color}
              active={categoryFilters.includes(key as LogCategory)}
              onClick={() => toggleCategory(key as LogCategory)}
              darkMode={darkMode}
            />
          ))}

          {/* Search */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              bgcolor: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
              borderRadius: '5px',
              px: 0.75,
              py: 0.2,
              border: `1px solid ${darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
              minWidth: 140,
              maxWidth: 220,
            }}
          >
            <SearchIcon sx={{ fontSize: 12, color: darkMode ? '#555' : '#aaa' }} />
            <InputBase
              value={logSearch}
              onChange={e => setLogSearch(e.target.value)}
              placeholder="Search..."
              sx={{
                fontSize: 10,
                color: darkMode ? '#ccc' : '#333',
                fontFamily: 'SF Mono, Monaco, Menlo, monospace',
                '& input': { p: 0 },
                '& input::placeholder': { color: darkMode ? '#555' : '#aaa', opacity: 1 },
                flex: 1,
              }}
            />
            {logSearch && (
              <ClearIcon
                onClick={() => setLogSearch('')}
                sx={{
                  fontSize: 11,
                  cursor: 'pointer',
                  color: darkMode ? '#555' : '#aaa',
                  '&:hover': { color: darkMode ? '#aaa' : '#555' },
                }}
              />
            )}
          </Box>
        </>
      )}

      <Box sx={{ flex: 1 }} />

      {/* Copy */}
      <Tooltip title="Copy all logs" arrow placement="top">
        <IconButton
          onClick={handleCopyLogs}
          sx={{
            width: 24,
            height: 24,
            padding: 0.5,
            bgcolor: darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
            '&:hover': { bgcolor: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)' },
          }}
        >
          <ContentCopyIcon sx={{ fontSize: 12, color: darkMode ? '#666' : '#aaa' }} />
        </IconButton>
      </Tooltip>
    </Box>
  );

  const transitionOverlayBg = darkMode ? '#1a1a1a' : '#ffffff';

  return (
    <Box
      className="log-console"
      sx={{
        ...(boxSx as object),
        position: 'relative',
      }}
    >
      {!simpleStyle && (fullSize ? renderFullSizeHeader() : renderInlineHeader())}

      {fullSize && (
        <Box
          aria-hidden={!showOverlay}
          sx={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            // Sit below the full-size header (~36px) so the toggle stays visible.
            top: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: transitionOverlayBg,
            opacity: showOverlay ? 1 : 0,
            pointerEvents: showOverlay ? 'auto' : 'none',
            // Snap in instantly (no enter transition), only fade on the way out.
            transition: enableFade ? 'opacity 180ms ease' : 'none',
            zIndex: 5,
          }}
        >
          <CircularProgress
            size={28}
            thickness={3}
            sx={{ color: darkMode ? 'rgba(255, 255, 255, 0.45)' : 'rgba(0, 0, 0, 0.35)' }}
          />
        </Box>
      )}

      {normalizedLogs.length === 0 ? (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
            minHeight: 40,
          }}
        >
          <Typography
            sx={{
              fontSize: simpleStyle ? 11 : fontSize,
              color: darkMode ? '#666' : '#999',
              fontFamily: 'inherit',
              textAlign: 'center',
              fontStyle: simpleStyle ? 'italic' : 'normal',
              lineHeight: 1,
            }}
          >
            {emptyMessage}
          </Typography>
        </Box>
      ) : (
        <Box
          ref={parentRef}
          onScroll={handleScroll}
          sx={{
            flex: 1,
            width: '100%',
            overflow: 'auto',
            overflowX: 'hidden',
            position: 'relative',
            paddingLeft: simpleStyle
              ? `${PADDING.SIMPLE}px`
              : `${PADDING[compact ? 'COMPACT' : 'NORMAL'].horizontal}px`,
            paddingRight: simpleStyle
              ? `${PADDING.SIMPLE}px`
              : `${PADDING[compact ? 'COMPACT' : 'NORMAL'].horizontal}px`,
            paddingTop: simpleStyle
              ? `${PADDING.SIMPLE}px`
              : `${PADDING[compact ? 'COMPACT' : 'NORMAL'].vertical}px`,
            paddingBottom: simpleStyle
              ? `${PADDING.SIMPLE}px`
              : `${PADDING[compact ? 'COMPACT' : 'NORMAL'].vertical}px`,
            '&::-webkit-scrollbar': { width: 6 },
            '&::-webkit-scrollbar-track': { background: 'transparent' },
            '&::-webkit-scrollbar-thumb': {
              background: darkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)',
              borderRadius: 3,
              '&:hover': { background: darkMode ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)' },
            },
          }}
        >
          <Box sx={{ height: `${virtualizerTotalSize}px`, width: '100%', position: 'relative' }}>
            {virtualizer.getVirtualItems().map(virtualItem => {
              const log = normalizedLogs[virtualItem.index];
              if (!log) return null;
              return (
                <Box
                  key={virtualItem.key}
                  data-index={virtualItem.index}
                  ref={(node: HTMLDivElement | null) => virtualizer.measureElement(node)}
                  sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <LogItem
                    log={log}
                    index={virtualItem.index}
                    totalCount={normalizedLogs.length}
                    darkMode={darkMode}
                    fontSize={fontSize}
                    compact={compact}
                    showTimestamp={showTimestamp}
                    simpleStyle={simpleStyle}
                    logMode={simpleStyle ? 'simple' : logMode}
                  />
                </Box>
              );
            })}
          </Box>
        </Box>
      )}
    </Box>
  );
}

export default React.memo(LogConsole);
