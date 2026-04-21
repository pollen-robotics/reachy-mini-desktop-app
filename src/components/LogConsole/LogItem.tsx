import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { TEXT_SELECT_STYLES } from './constants';
import { CATEGORY_META } from '../../utils/logging/constants';
import type { LogEntry, LogMode, LogCategory } from '../../types/store';

const WRAP_STYLES = {
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  minWidth: 0,
} as const;

const getLogColor = (log: LogEntry, darkMode: boolean): string => {
  const { level, category } = log;
  const msg = log.message || '';

  const isError =
    level === 'error' ||
    msg.includes('FAILED') ||
    msg.includes('ERROR') ||
    msg.includes('❌') ||
    msg.includes('[ERROR]');
  const isWarning =
    (level as string) === 'warning' || msg.includes('WARNING') || msg.includes('[WARNING]');
  const isSuccess = (level as string) === 'success' || msg.includes('✓');

  if (isError) return darkMode ? '#ff5555' : '#cc0000';
  if (isWarning) return darkMode ? '#fbbf24' : '#d97706';
  if (isSuccess) return darkMode ? '#55ff55' : '#00aa00';

  const meta = category ? CATEGORY_META[category] : undefined;
  if (meta) return meta.color;

  return darkMode ? '#f0f0f0' : '#1a1a1a';
};

export interface LogItemProps {
  log: LogEntry | null | undefined;
  index: number;
  totalCount: number;
  darkMode: boolean;
  fontSize: number;
  compact: boolean;
  showTimestamp: boolean;
  simpleStyle: boolean;
  logMode: LogMode;
}

/**
 * Render a single log item.
 * Supports both simple and full (dev) rendering.
 */
export const LogItem = React.memo(
  ({
    log,
    index,
    totalCount,
    darkMode,
    fontSize,
    compact,
    showTimestamp,
    simpleStyle,
    logMode,
  }: LogItemProps) => {
    const itemSpacing = compact ? 1.6 : 2.4;

    const memoizedValues = useMemo(() => {
      if (!log) return null;

      const isApp = log.source === 'app';
      const displayMessage = isApp && log.appName ? `[app] ${log.message}` : log.message;
      const color = getLogColor(log, darkMode);

      return { displayMessage, color };
    }, [log, darkMode]);

    if (!log || !memoizedValues) return null;

    const { displayMessage, color } = memoizedValues;

    // Simple style (inline in small console, minimal)
    if (simpleStyle) {
      return (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 1,
            marginBottom: index < totalCount - 1 ? `${itemSpacing}px` : 0,
          }}
        >
          <Box
            sx={{
              width: 4,
              height: 4,
              borderRadius: '50%',
              bgcolor: '#FF9500',
              mt: 0.75,
              flexShrink: 0,
            }}
          />
          <Typography
            sx={{
              fontSize,
              fontFamily: 'monospace',
              color: darkMode ? '#d1d5db' : '#666',
              lineHeight: 1.6,
              flex: 1,
              ...WRAP_STYLES,
              ...TEXT_SELECT_STYLES,
            }}
          >
            {log.message}
          </Typography>
        </Box>
      );
    }

    // Simple log mode - cleaner rendering with colored dot + message
    if (logMode === 'simple') {
      return (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 1,
            marginBottom: index < totalCount - 1 ? `${itemSpacing}px` : 0,
          }}
        >
          <Box
            sx={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              bgcolor: color,
              mt: '5px',
              flexShrink: 0,
            }}
          />
          <Typography
            sx={{
              fontSize,
              fontFamily: 'inherit',
              color: darkMode ? '#d1d5db' : '#555',
              lineHeight: 1.6,
              flex: 1,
              ...WRAP_STYLES,
              ...TEXT_SELECT_STYLES,
            }}
          >
            {displayMessage}
          </Typography>
          {showTimestamp && (
            <Typography
              sx={{
                fontSize: fontSize - 1,
                color: darkMode ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.35)',
                fontFamily: 'inherit',
                lineHeight: 1.6,
                flexShrink: 0,
                whiteSpace: 'nowrap',
                ...TEXT_SELECT_STYLES,
              }}
            >
              {log.timestamp}
            </Typography>
          )}
        </Box>
      );
    }

    // Dev mode - full formatting with category badge, colored message, timestamp
    const catMeta = (log.category ? CATEGORY_META[log.category as LogCategory] : undefined) || {
      label: log.category || '?',
      color: '#888',
    };

    // Make the badge height match the message line height exactly so the
    // overall item height stays in sync with the virtualizer's `estimateSize`.
    const messageLineHeight = compact ? 1.4 : 1.6;
    const badgeHeight = fontSize * messageLineHeight;

    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 0.75,
          width: '100%',
          minWidth: 0,
          marginBottom: index < totalCount - 1 ? `${itemSpacing}px` : 0,
        }}
      >
        {/* Category badge */}
        <Box
          sx={{
            fontSize: 8,
            fontWeight: 700,
            fontFamily: 'inherit',
            px: 0.6,
            height: `${badgeHeight}px`,
            boxSizing: 'border-box',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '3px',
            bgcolor: `${catMeta.color}18`,
            color: catMeta.color,
            border: `1px solid ${catMeta.color}30`,
            whiteSpace: 'nowrap',
            flexShrink: 0,
            lineHeight: 1,
            textTransform: 'uppercase',
            letterSpacing: '0.3px',
            minWidth: 40,
            textAlign: 'center',
          }}
        >
          {catMeta.label}
        </Box>

        {/* Message */}
        <Typography
          sx={{
            fontSize,
            color,
            fontFamily: 'inherit',
            lineHeight: compact ? 1.4 : 1.6,
            fontWeight: 400,
            flex: 1,
            ...WRAP_STYLES,
            ...TEXT_SELECT_STYLES,
          }}
        >
          {displayMessage}
        </Typography>

        {/* Timestamp */}
        {showTimestamp && (
          <Typography
            sx={{
              fontSize: fontSize - 1,
              color: darkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)',
              fontFamily: 'inherit',
              lineHeight: compact ? 1.4 : 1.6,
              flexShrink: 0,
              whiteSpace: 'nowrap',
              ...TEXT_SELECT_STYLES,
            }}
          >
            {log.timestamp}
          </Typography>
        )}
      </Box>
    );
  }
);

LogItem.displayName = 'LogItem';
