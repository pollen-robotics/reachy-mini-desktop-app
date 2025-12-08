import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { TEXT_SELECT_STYLES, ELLIPSIS_STYLES } from './constants';

/**
 * Render a single log item
 * Uses marginBottom for spacing between items (better for scrollMax)
 * 
 * @param {Object} props
 * @param {Object} props.log - Log object with message, source, timestamp, etc.
 * @param {number} props.index - Index of the log in the list
 * @param {number} props.totalCount - Total number of logs
 * @param {boolean} props.darkMode - Dark mode enabled
 * @param {number} props.fontSize - Font size in pixels
 * @param {boolean} props.compact - Compact mode
 * @param {boolean} props.showTimestamp - Show timestamp
 * @param {boolean} props.simpleStyle - Simple style mode
 */
export const LogItem = React.memo(({ 
  log, 
  index, 
  totalCount,
  darkMode, 
  fontSize, 
  compact, 
  showTimestamp, 
  simpleStyle 
}) => {
  if (!log) return null;

  // Calculate spacing between items (marginBottom on all items except last)
  const itemSpacing = compact ? 1.6 : 2.4; // 0.2 * 8 or 0.3 * 8

  // Simple style: message with colored dot
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
        <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: '#FF9500', mt: 0.75, flexShrink: 0 }} />
        <Typography sx={{ 
          fontSize, 
          fontFamily: 'monospace', 
          color: darkMode ? '#d1d5db' : '#666', 
          lineHeight: 1.6, 
          flex: 1,
          ...ELLIPSIS_STYLES,
          ...TEXT_SELECT_STYLES,
        }}>
          {log.message}
        </Typography>
      </Box>
    );
  }
  
  // Default style: full formatting with colors and timestamps
  // Memoize calculations to avoid recalculating on every render
  const { isFrontend, isApp, displayMessage, logLevel, isSuccess, isError, isWarning, isCommand } = useMemo(() => {
  const isFrontend = log.source === 'frontend';
  const isApp = log.source === 'app';
  const message = log.message;
  const logLevel = log.level || 'info';
  
  const isSuccess = message.includes('SUCCESS') || message.includes('✓');
  const isError = logLevel === 'error' || message.includes('FAILED') || message.includes('ERROR') || message.includes('❌') || message.includes('[ERROR]');
  const isWarning = logLevel === 'warning' || message.includes('WARNING') || message.includes('[WARNING]');
    const isCommand = message.includes('→') || message.includes('📥');
    
    const displayMessage = isApp && log.appName ? `[app] ${message}` : message;
  
    return { isFrontend, isApp, displayMessage, logLevel, isSuccess, isError, isWarning, isCommand };
  }, [log.source, log.message, log.level, log.appName]);
  
  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: showTimestamp ? 'row' : 'column', 
      alignItems: 'flex-start', 
      gap: 1, 
      width: '100%', 
      minWidth: 0,
      marginBottom: index < totalCount - 1 ? `${itemSpacing}px` : 0,
    }}>
      <Typography sx={{ 
        fontSize, 
        color: darkMode ? 
          (isError ? '#ff5555' : 
           isWarning ? '#fbbf24' :
           isSuccess ? '#55ff55' : 
           isCommand ? '#ff9500' : 
           isFrontend ? '#5db3ff' :
           isApp ? '#a78bfa' :
           '#f0f0f0') :
          (isError ? '#cc0000' : 
           isWarning ? '#d97706' :
           isSuccess ? '#00aa00' : 
           isCommand ? '#ff6600' : 
           isFrontend ? '#0055cc' :
           isApp ? '#7c3aed' :
           '#1a1a1a'), 
        fontFamily: 'inherit', 
        lineHeight: compact ? 1.4 : 1.6, 
        fontWeight: isFrontend ? 500 : 400, 
        opacity: 1, 
        flex: 1, 
        ...ELLIPSIS_STYLES,
        ...TEXT_SELECT_STYLES,
      }}>
        {displayMessage}
      </Typography>
      {showTimestamp && (
        <Typography sx={{ 
          fontSize: fontSize - 1, 
          color: darkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)', 
          fontFamily: 'inherit', 
          lineHeight: compact ? 1.4 : 1.6, 
          fontWeight: 400, 
          opacity: 0.8, 
          flexShrink: 0, 
          whiteSpace: 'nowrap', 
          ...TEXT_SELECT_STYLES,
        }}>
          {log.timestamp}
        </Typography>
      )}
    </Box>
  );
});

LogItem.displayName = 'LogItem';
