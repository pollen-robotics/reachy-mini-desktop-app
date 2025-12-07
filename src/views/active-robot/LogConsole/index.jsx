import React, { useMemo, useRef } from 'react';
import { Box, Typography, IconButton, Tooltip } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useVirtualizer } from '@tanstack/react-virtual';
import useAppStore from '../../../store/useAppStore';
import { FONT_SIZES, PADDING, EMPTY_ARRAY, TEXT_SELECT_STYLES } from './constants';
import { useLogProcessing } from './useLogProcessing';
import { LogItem } from './LogItem';
import { useLogConsoleHeight, useFixedItemHeight } from './useLogConsoleHeight';
import { useVirtualizerScroll } from './useVirtualizerScroll';

/**
 * LogConsole Component
 * 
 * A virtualized log console component that displays logs from multiple sources (daemon, frontend, apps).
 * Supports auto-scrolling, filtering, and multiple display modes.
 * 
 * @param {Object} props
 * @param {Array} props.logs - Array of daemon logs
 * @param {boolean} [props.darkMode=false] - Dark mode enabled
 * @param {boolean} [props.includeStoreLogs=true] - Include logs from Zustand store
 * @param {Object} [props.sx={}] - Additional MUI sx styles
 * @param {number|string|null} [props.maxHeight=null] - Maximum height in pixels
 * @param {number|string|null} [props.height=null] - Fixed height in pixels or '100%' or 'auto'
 * @param {number|null} [props.lines=null] - Number of lines to display (calculates height automatically)
 * @param {boolean} [props.showTimestamp=true] - Show timestamp for each log
 * @param {boolean} [props.compact=false] - Compact mode (smaller font and spacing)
 * @param {boolean} [props.simpleStyle=false] - Simple style mode (minimal formatting)
 * @param {string} [props.emptyMessage='No logs'] - Message to display when no logs
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
}) {
  // Select logs from store - will trigger re-render when logs change
  const frontendLogs = useAppStore(state => includeStoreLogs ? state.frontendLogs : EMPTY_ARRAY);
  const appLogs = useAppStore(state => includeStoreLogs ? state.appLogs : EMPTY_ARRAY);
  
  // Process and normalize all logs
  const normalizedLogs = useLogProcessing(logs, frontendLogs, appLogs, includeStoreLogs, simpleStyle);

  // Calculate heights
  const fontSize = compact ? FONT_SIZES.COMPACT : FONT_SIZES.NORMAL;
  const fixedItemHeight = useFixedItemHeight(compact);
  const containerHeight = useLogConsoleHeight({ lines, height, maxHeight, compact, simpleStyle });
  
  // Parent ref for virtualizer
  const parentRef = useRef(null);
  
  // Create virtualizer instance - NO paddingEnd, spacing handled by marginBottom on items
  const virtualizer = useVirtualizer({
    count: normalizedLogs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => fixedItemHeight,
    overscan: 5,
  });
  
  // Use auto-scroll hook
  const { handleScroll } = useVirtualizerScroll({
    virtualizer,
    totalCount: normalizedLogs.length,
    enabled: true,
    compact,
    simpleStyle,
    scrollElementRef: parentRef, // Pass direct ref as fallback
  });

  // Copy all logs to clipboard
  const handleCopyLogs = async () => {
    try {
      const logsText = normalizedLogs.map(log => {
        if (showTimestamp && log.timestamp) {
          return `[${log.timestamp}] ${log.message}`;
        }
        return log.message;
      }).join('\n');
      
      await navigator.clipboard.writeText(logsText);
    } catch (error) {
      console.error('Failed to copy logs:', error);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = normalizedLogs.map(log => {
        if (showTimestamp && log.timestamp) {
          return `[${log.timestamp}] ${log.message}`;
        }
        return log.message;
      }).join('\n');
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
      } catch (err) {
        console.error('Fallback copy failed:', err);
      }
      document.body.removeChild(textArea);
    }
  };
  
  // Memoize sx styles to prevent recalculation on every render
  const boxSx = useMemo(() => ({
        width: '100%',
    // If containerHeight is null (height='100%'), use '100%', otherwise use calculated height
    height: containerHeight === null ? '100%' : (height === 'auto' ? 'auto' : `${containerHeight}px`),
        maxHeight: maxHeight || undefined,
        borderRadius: simpleStyle ? 0 : (compact ? '6px' : '12px'),
        bgcolor: simpleStyle ? 'transparent' : (darkMode ? '#1a1a1a' : '#ffffff'),
        border: simpleStyle ? 'none' : (darkMode ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid rgba(0, 0, 0, 0.15)'),
        overflow: 'hidden',
    overflowY: normalizedLogs.length === 0 ? 'hidden' : 'auto', // No scroll when empty
    overflowX: 'hidden', // No horizontal scroll - use ellipsis instead
    position: 'relative', // For absolute positioning of empty state
        display: 'flex',
        flexDirection: 'column',
        fontFamily: simpleStyle ? 'monospace' : 'SF Mono, Monaco, Menlo, monospace',
        fontSize,
    ...TEXT_SELECT_STYLES,
        transition: 'box-shadow 0.3s ease',
          '&::-webkit-scrollbar': { width: simpleStyle ? '5px' : (compact ? '4px' : '4px') },
          '&::-webkit-scrollbar-track': { background: 'transparent' },
          '&::-webkit-scrollbar-thumb': { background: 'transparent', borderRadius: simpleStyle ? '2.5px' : '2px' },
          '&:hover::-webkit-scrollbar-thumb': { background: simpleStyle ? (darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)') : (darkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)') },
        ...sx,
  }), [height, containerHeight, maxHeight, simpleStyle, compact, darkMode, fontSize, normalizedLogs.length, sx]);

  return (
    <Box
      className="log-console"
      sx={{
        ...boxSx,
        position: 'relative',
        '&:hover .copy-logs-button': {
          opacity: 1,
        },
      }}
    >
      {/* Copy button - hidden by default, visible on hover */}
      {normalizedLogs.length > 0 && (
        <Tooltip title="Copy all logs" arrow placement="left">
          <IconButton
            className="copy-logs-button"
            onClick={handleCopyLogs}
            sx={{
              position: 'absolute',
              top: 8,
              right: 8,
              zIndex: 10,
              opacity: 0,
              transition: 'opacity 0.2s ease-in-out',
              bgcolor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
              '&:hover': {
                bgcolor: darkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)',
                opacity: 1,
              },
              width: 28,
              height: 28,
              padding: 0.5,
            }}
          >
            <ContentCopyIcon 
              sx={{ 
                fontSize: 14, 
                color: darkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)',
              }} 
            />
          </IconButton>
        </Tooltip>
      )}
      {normalizedLogs.length === 0 ? (
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          width: '100%', 
          height: '100%',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}>
          <Typography sx={{ 
            fontSize: simpleStyle ? 11 : fontSize, 
            color: darkMode ? (simpleStyle ? '#888' : '#666') : (simpleStyle ? '#999' : '#999'), 
            fontFamily: 'inherit', 
            textAlign: 'center', 
            fontStyle: simpleStyle ? 'italic' : 'normal',
            lineHeight: 1,
          }}>
            {emptyMessage}
          </Typography>
        </Box>
      ) : (
        <Box
          ref={parentRef}
          onScroll={handleScroll}
          sx={{
            height: '100%', 
            width: '100%',
            overflow: 'auto',
            overflowX: 'hidden',
            position: 'relative',
                  paddingLeft: simpleStyle ? `${PADDING.SIMPLE}px` : `${PADDING[compact ? 'COMPACT' : 'NORMAL'].horizontal}px`,
                  paddingRight: simpleStyle ? `${PADDING.SIMPLE}px` : `${PADDING[compact ? 'COMPACT' : 'NORMAL'].horizontal}px`,
                  paddingTop: simpleStyle ? `${PADDING.SIMPLE}px` : `${PADDING[compact ? 'COMPACT' : 'NORMAL'].vertical}px`,
                  paddingBottom: simpleStyle ? `${PADDING.SIMPLE}px` : `${PADDING[compact ? 'COMPACT' : 'NORMAL'].vertical}px`,
          }}
        >
          <Box
            sx={{
              height: `${virtualizer.getTotalSize()}px`,
                  width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const log = normalizedLogs[virtualItem.index];
              if (!log) return null;
              
              return (
                <Box
                  key={virtualItem.key}
                  data-index={virtualItem.index}
                  ref={(node) => virtualizer.measureElement(node)}
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
