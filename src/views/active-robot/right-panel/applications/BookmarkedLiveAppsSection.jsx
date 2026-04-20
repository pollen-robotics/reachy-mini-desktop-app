import React, { useState } from 'react';
import { Box, Typography, IconButton, Tooltip, Popover } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import BookmarkRemoveOutlinedIcon from '@mui/icons-material/BookmarkRemoveOutlined';
import { QRCodeSVG } from 'qrcode.react';
import useAppStore from '../../../../store/useAppStore';
import { useActiveRobotContext } from '../../context';

/**
 * Compact card for a bookmarked live app in the right panel.
 * Matches the visual language of InstalledAppsSection items but
 * with a simpler action set: Open (browser) + QR + Remove.
 */
function LiveAppCard({ app, darkMode }) {
  const { shellApi } = useActiveRobotContext();
  const unbookmarkLiveApp = useAppStore(state => state.unbookmarkLiveApp);
  const [qrAnchor, setQrAnchor] = useState(null);

  const spaceUrl = app.url || `https://huggingface.co/spaces/${app.extra?.id || app.name}`;
  const cardData = app.extra?.cardData || {};
  const emoji = [...(cardData.emoji || '🌐')][0];
  const author = app.extra?.id?.split('/')?.[0] || app.extra?.author || null;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        px: 1.5,
        py: 1,
        borderRadius: '12px',
        bgcolor: darkMode ? 'rgba(99, 102, 241, 0.06)' : 'rgba(99, 102, 241, 0.04)',
        border: `1px solid ${darkMode ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.12)'}`,
        transition: 'border-color 0.15s ease',
        '&:hover': {
          borderColor: darkMode ? 'rgba(99, 102, 241, 0.3)' : 'rgba(99, 102, 241, 0.25)',
        },
      }}
    >
      {/* Emoji */}
      <Typography sx={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>{emoji}</Typography>

      {/* Name + author */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          sx={{
            fontSize: 12,
            fontWeight: 600,
            color: darkMode ? '#f5f5f5' : '#1a1a1a',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {app.name}
        </Typography>
        {author && (
          <Typography
            sx={{
              fontSize: 10,
              color: darkMode ? '#888' : '#999',
              fontFamily: 'monospace',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {author}
          </Typography>
        )}
      </Box>

      {/* QR code — sized so it's actually scannable without opening
          the popover. Click still enlarges for reliable phone scans. */}
      <Box
        onClick={e => {
          e.stopPropagation();
          setQrAnchor(e.currentTarget);
        }}
        sx={{
          flexShrink: 0,
          p: 0.75,
          borderRadius: '8px',
          bgcolor: '#fff',
          border: `1px solid ${darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'transform 0.15s ease, border-color 0.15s ease',
          '&:hover': { transform: 'scale(1.05)', borderColor: '#6366f1' },
        }}
      >
        <QRCodeSVG value={spaceUrl} size={64} level="L" />
      </Box>
      <Popover
        open={Boolean(qrAnchor)}
        anchorEl={qrAnchor}
        onClose={() => setQrAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: {
              p: 2,
              borderRadius: '14px',
              bgcolor: darkMode ? '#1a1a1a' : '#ffffff',
              border: `1px solid ${darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'}`,
              boxShadow: darkMode ? '0 8px 24px rgba(0,0,0,0.6)' : '0 8px 24px rgba(0,0,0,0.15)',
            },
          },
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 600, color: darkMode ? '#aaa' : '#666' }}>
            Scan to open on your phone
          </Typography>
          <Box sx={{ p: 1.5, borderRadius: '10px', bgcolor: '#ffffff' }}>
            <QRCodeSVG value={spaceUrl} size={200} level="M" />
          </Box>
          <Typography
            sx={{
              fontSize: 9,
              color: '#888',
              fontFamily: 'monospace',
              wordBreak: 'break-all',
              textAlign: 'center',
              maxWidth: 220,
            }}
          >
            {spaceUrl}
          </Typography>
        </Box>
      </Popover>

      {/* Actions stacked vertically so they visually balance the
          taller QR box next to them. */}
      <Box
        sx={{
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 0.5,
        }}
      >
        <Tooltip title="Open in browser" arrow placement="left">
          <IconButton
            size="small"
            onClick={async () => {
              try {
                await shellApi.open(spaceUrl);
              } catch (err) {
                console.error('Failed to open live app:', err);
              }
            }}
            sx={{
              width: 32,
              height: 32,
              color: '#6366f1',
              border: '1px solid #6366f1',
              borderRadius: '8px',
              '&:hover': { bgcolor: 'rgba(99, 102, 241, 0.08)' },
            }}
          >
            <OpenInNewIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>

        <Tooltip title="Remove from panel" arrow placement="left">
          <IconButton
            size="small"
            onClick={() => unbookmarkLiveApp(app.name)}
            sx={{
              width: 32,
              height: 32,
              color: darkMode ? '#666' : '#bbb',
              borderRadius: '8px',
              '&:hover': { color: '#ef4444', bgcolor: 'rgba(239, 68, 68, 0.08)' },
            }}
          >
            <BookmarkRemoveOutlinedIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}

/**
 * Section rendered above InstalledAppsSection in the right panel.
 * Shows bookmarked live apps with Open + QR + Remove actions.
 */
export default function BookmarkedLiveAppsSection({ darkMode = false }) {
  const bookmarkedLiveApps = useAppStore(state => state.bookmarkedLiveApps);

  if (!bookmarkedLiveApps || bookmarkedLiveApps.length === 0) return null;

  return (
    <Box sx={{ mb: 1.5 }}>
      {/* Section header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, px: 0.5 }}>
        <Typography
          sx={{
            fontSize: 11,
            fontWeight: 700,
            color: '#6366f1',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Live Apps
        </Typography>
        <Box
          sx={{
            fontSize: 10,
            fontWeight: 600,
            color: darkMode ? '#888' : '#aaa',
            bgcolor: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
            px: 0.75,
            py: 0.125,
            borderRadius: '4px',
          }}
        >
          {bookmarkedLiveApps.length}
        </Box>
      </Box>

      {/* Cards */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {bookmarkedLiveApps.map(app => (
          <LiveAppCard key={app.name} app={app} darkMode={darkMode} />
        ))}
      </Box>
    </Box>
  );
}
