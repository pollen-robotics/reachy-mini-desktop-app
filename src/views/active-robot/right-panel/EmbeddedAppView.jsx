import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Box, Typography, IconButton, Tooltip } from '@mui/material';
import StopCircleOutlinedIcon from '@mui/icons-material/StopCircleOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useActiveRobotContext } from '../context';
import { openAppWindow, closeAppWindow } from '../../../utils/windowManager';
import useAppStore from '../../../store/useAppStore';
import { buildApiUrl, fetchWithTimeout, DAEMON_CONFIG } from '../../../config/daemon';

/**
 * Build the iframe URL with theme query parameters so apps can adapt their styling.
 *
 * Apps receive:
 *   ?embedded=1          — signals the app is rendered inside the desktop panel
 *   &theme=dark|light    — current theme
 *   &accent=FF9500       — primary accent color (hex without #)
 *   &bg=1a1a1a|fafafc    — panel background color
 *   &fg=f5f5f5|333333    — foreground text color
 */
function buildEmbeddedUrl(baseUrl, darkMode) {
  try {
    const url = new URL(baseUrl);
    url.searchParams.set('embedded', '1');
    url.searchParams.set('theme', darkMode ? 'dark' : 'light');
    url.searchParams.set('accent', 'FF9500');
    url.searchParams.set('bg', darkMode ? '1a1a1a' : 'fafafc');
    url.searchParams.set('fg', darkMode ? 'f5f5f5' : '333333');
    url.searchParams.set('_t', Date.now()); // cache-bust: apps often reuse the same port
    return url.toString();
  } catch {
    return baseUrl;
  }
}

/**
 * Bust the WebView cache for an app's static resources.
 *
 * Different apps reuse the same localhost port, so the WebView may serve
 * stale CSS/JS from a previously-run app.  We fetch the index HTML with
 * `cache: 'reload'` (bypasses cache, updates it with the fresh response),
 * extract <script src> and <link rel="stylesheet" href> URLs, and pre-fetch
 * those too.  By the time the iframe loads, the cache holds the correct files.
 */
async function bustCacheForApp(baseUrl) {
  try {
    const res = await fetch(baseUrl, { cache: 'reload' });
    const html = res.ok ? await res.text() : '';

    // Extract src/href from <script src="..."> and <link ... href="...">
    const resourceUrls = [];
    const scriptRe = /<script[^>]+src=["']([^"']+)["']/gi;
    const linkRe = /<link[^>]+href=["']([^"']+)["']/gi;
    for (const re of [scriptRe, linkRe]) {
      let m;
      while ((m = re.exec(html)) !== null) {
        resourceUrls.push(m[1]);
      }
    }

    // Pre-fetch each resource to refresh the cache
    await Promise.all(
      resourceUrls.map(path => {
        const url = new URL(path, baseUrl).toString();
        return fetch(url, { cache: 'reload' }).catch(() => {});
      })
    );
  } catch {
    // Best-effort — if this fails the iframe still loads normally
  }
}

/**
 * Embedded App View — displays a running app's web UI in an iframe
 * inside the right panel, with a toolbar for stop / pop-out actions.
 */
export default function EmbeddedAppView({ darkMode = false }) {
  const { robotState, actions } = useActiveRobotContext();
  const { embeddedAppUrl, currentAppName } = robotState;
  const [cacheReady, setCacheReady] = useState(false);
  const bustKeyRef = useRef(null);

  // Bust cache before showing iframe — ensures subresources match the current app
  useEffect(() => {
    if (!embeddedAppUrl) {
      setCacheReady(false);
      bustKeyRef.current = null;
      return;
    }

    const key = `${embeddedAppUrl}::${currentAppName}`;
    if (bustKeyRef.current === key) return; // already busted for this app
    bustKeyRef.current = key;
    setCacheReady(false);

    bustCacheForApp(embeddedAppUrl).then(() => {
      // Only mark ready if this is still the current bust (prevents race condition
      // when apps switch quickly: old promise resolving must not unlock the new app)
      if (bustKeyRef.current === key) setCacheReady(true);
    });
  }, [embeddedAppUrl, currentAppName]);

  const iframeSrc = useMemo(
    () => (embeddedAppUrl && cacheReady ? buildEmbeddedUrl(embeddedAppUrl, darkMode) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [embeddedAppUrl, darkMode, currentAppName, cacheReady]
  );

  const handleClose = async () => {
    const store = useAppStore.getState();

    // Dismiss the embedded view immediately (prevents auto-reopen)
    store.dismissEmbeddedApp();
    store.setIsStoppingApp(true);

    try {
      const response = await fetchWithTimeout(
        buildApiUrl('/api/apps/stop-current-app'),
        { method: 'POST' },
        DAEMON_CONFIG.TIMEOUTS.APP_STOP,
        { silent: true }
      );

      if (!response.ok) throw new Error(`Stop failed: ${response.status}`);
      await response.json();

      // Close any Tauri window that might be open for this app
      const appInfo = store.currentApp?.info;
      if (appInfo?.name) {
        closeAppWindow(appInfo.name).catch(() => {});
      }
    } catch {
      // Stop failed — status polling will eventually clean up
    } finally {
      // Always unlock regardless of success/failure
      const s = useAppStore.getState();
      s.setCurrentApp(null);
      s.unlockApp();
      s.setIsStoppingApp(false);
    }
  };

  const handlePopOut = async () => {
    if (!embeddedAppUrl || !currentAppName) return;
    await openAppWindow(currentAppName, embeddedAppUrl);
    useAppStore.getState().dismissEmbeddedApp();
  };

  if (!iframeSrc) return null;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
      }}
    >
      {/* Toolbar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 2,
          py: 0.75,
          flexShrink: 0,
          borderBottom: `1px solid ${darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
          bgcolor: darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
        }}
      >
        {/* Green dot — running indicator */}
        <Box
          sx={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            bgcolor: '#22c55e',
            flexShrink: 0,
          }}
        />

        <Typography
          sx={{
            flex: 1,
            fontSize: 12,
            fontWeight: 600,
            color: darkMode ? '#ccc' : '#555',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            ml: 0.5,
          }}
        >
          {currentAppName || 'App'}
        </Typography>

        <Tooltip title="Open in separate window" arrow placement="top">
          <IconButton
            size="small"
            onClick={handlePopOut}
            sx={{
              width: 24,
              height: 24,
              color: darkMode ? '#888' : '#999',
              '&:hover': {
                color: darkMode ? '#ddd' : '#333',
                bgcolor: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
              },
            }}
          >
            <OpenInNewIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>

        <Tooltip title="Stop app" arrow placement="top">
          <IconButton
            size="small"
            onClick={handleClose}
            sx={{
              width: 24,
              height: 24,
              color: darkMode ? '#888' : '#999',
              '&:hover': {
                color: '#ef4444',
                bgcolor: 'rgba(239, 68, 68, 0.08)',
              },
            }}
          >
            <StopCircleOutlinedIcon sx={{ fontSize: 15 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Iframe container */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          bgcolor: darkMode ? '#1a1a1a' : '#fafafc',
        }}
      >
        <iframe
          src={iframeSrc}
          title={currentAppName || 'App'}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            display: 'block',
            colorScheme: darkMode ? 'dark' : 'light',
          }}
        />
      </Box>
    </Box>
  );
}
