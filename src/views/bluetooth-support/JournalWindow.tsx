import React, { useState, useEffect, useRef } from 'react';
import { Box, Typography, Button } from '@mui/material';
import { listen, emit } from '../../utils/tauriCompat';

const MAX_LINES = 2000;

type UnlistenFn = () => void;

/**
 * JournalWindow — Standalone window that receives journal lines via Tauri events.
 * Rendered when the app is loaded with #journal hash.
 */
export default function JournalWindow(): React.ReactElement {
  const [lines, setLines] = useState<string[]>([]);
  const [streaming, setStreaming] = useState<boolean>(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const autoScrollRef = useRef<boolean>(true);

  // Track if user has scrolled up (disable auto-scroll)
  const handleScroll = (): void => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    autoScrollRef.current = atBottom;
  };

  // Auto-scroll only if user hasn't scrolled up
  useEffect(() => {
    if (autoScrollRef.current) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [lines]);

  // Listen for journal events from the main window
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    const setup = async (): Promise<void> => {
      const unlistenData = await listen<string>('journal:data', event => {
        const chunk = event.payload;
        console.log('[JournalWindow] Received data:', chunk?.length, 'bytes');
        const newLines = chunk.split('\n').filter(l => l.length > 0);
        setLines(prev => [...prev, ...newLines].slice(-MAX_LINES));
      });

      const unlistenStatus = await listen<string>('journal:status', event => {
        console.log('[JournalWindow] Status:', event.payload);
        setStreaming(event.payload === 'started');
      });

      unlisten = () => {
        unlistenData();
        unlistenStatus();
      };
    };

    setup();
    // Ask main window for current status
    emit('journal:request-status');

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const handleStop = (): void => {
    emit('journal:stop');
  };

  const [copied, setCopied] = useState<boolean>(false);

  const handleClear = (): void => {
    setLines([]);
  };

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <Box
      sx={{
        width: '100%',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: '#1a1a1a',
        color: '#d4d4d4',
        fontFamily: 'monospace',
      }}
    >
      {/* Toolbar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 0.75,
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          bgcolor: '#111',
          // Allow dragging the window from the toolbar
          WebkitAppRegion: 'drag',
        }}
      >
        <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#f5f5f5', flex: 1 }}>
          Journal
          {streaming && (
            <Box
              component="span"
              sx={{
                ml: 1,
                fontSize: 10,
                color: '#22c55e',
                fontWeight: 400,
              }}
            >
              LIVE
            </Box>
          )}
        </Typography>
        <Typography sx={{ fontSize: 10, color: '#666', mr: 1 }}>{lines.length} lines</Typography>
        <Button
          size="small"
          onClick={handleCopy}
          disabled={lines.length === 0}
          sx={{
            fontSize: 10,
            color: copied ? '#22c55e' : '#888',
            textTransform: 'none',
            minWidth: 0,
            py: 0.25,
            px: 1,
            WebkitAppRegion: 'no-drag',
            '&:hover': { color: '#f5f5f5' },
          }}
        >
          {copied ? 'Copied' : 'Copy All'}
        </Button>
        <Button
          size="small"
          onClick={handleClear}
          sx={{
            fontSize: 10,
            color: '#888',
            textTransform: 'none',
            minWidth: 0,
            py: 0.25,
            px: 1,
            WebkitAppRegion: 'no-drag',
            '&:hover': { color: '#f5f5f5' },
          }}
        >
          Clear
        </Button>
        {streaming && (
          <Button
            size="small"
            onClick={handleStop}
            sx={{
              fontSize: 10,
              color: '#ef4444',
              textTransform: 'none',
              minWidth: 0,
              py: 0.25,
              px: 1,
              WebkitAppRegion: 'no-drag',
              '&:hover': { color: '#dc2626' },
            }}
          >
            Stop
          </Button>
        )}
      </Box>

      {/* Log content */}
      <Box
        ref={containerRef}
        onScroll={handleScroll}
        sx={{
          flex: 1,
          overflow: 'auto',
          px: 1.5,
          py: 1,
          fontSize: 11,
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          WebkitUserSelect: 'text !important',
          userSelect: 'text !important',
          cursor: 'text',
          '&::-webkit-scrollbar': { width: 6 },
          '&::-webkit-scrollbar-thumb': {
            bgcolor: 'rgba(255,255,255,0.15)',
            borderRadius: 3,
          },
        }}
      >
        {lines.length === 0 ? (
          <Typography sx={{ fontSize: 11, color: '#555', fontStyle: 'italic' }}>
            Waiting for journal data...
          </Typography>
        ) : (
          lines.map((line, i) => (
            <Box key={i} sx={{ color: '#d4d4d4' }}>
              {line}
            </Box>
          ))
        )}
        <div ref={endRef} />
      </Box>
    </Box>
  );
}
