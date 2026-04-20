import React, { memo, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Avatar,
  Chip,
  CircularProgress,
  Popover,
  IconButton,
  Tooltip,
} from '@mui/material';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import VerifiedIcon from '@mui/icons-material/Verified';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { QRCodeSVG } from 'qrcode.react';
import { useActiveRobotContext } from '../../../context';
import useAppStore from '../../../../../store/useAppStore';

/**
 * App card component for Discover Modal
 * Supports both Python apps (installable) and Web apps (open in browser)
 */
function AppCard({
  app,
  darkMode,
  isBusy,
  isInstalling,
  installFailed,
  isInstalled,
  handleInstall,
  selectedCategory,
  searchQuery,
  index,
}) {
  const { shellApi } = useActiveRobotContext();
  const open = shellApi.open;
  const [qrAnchor, setQrAnchor] = useState(null);
  // Bookmark state for live (non-Python) apps.
  const bookmarkLiveApp = useAppStore(state => state.bookmarkLiveApp);
  const isBookmarked = useAppStore(state =>
    state.bookmarkedLiveApps.some(a => a.name === app.name)
  );
  // Extract data from HF Space API
  const cardData = app.extra?.cardData || {};
  const author = app.extra?.id?.split('/')?.[0] || app.extra?.author || null;
  const likes = app.extra?.likes || 0;
  const lastModified = app.extra?.lastModified || app.extra?.createdAt || null;
  const isPythonApp = app.extra?.isPythonApp !== false;
  const isOfficial = app.isOfficial === true;
  const emoji = [...(cardData.emoji || (isPythonApp ? '📦' : '🌐'))][0];
  const spaceUrl = app.url || `https://huggingface.co/spaces/${app.extra?.id || app.name}`;

  // Format date
  const formattedDate = lastModified
    ? new Date(lastModified).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        width: 'calc((100% - 20px) / 2)', // 2 per row: (100% - gap) / 2
        minWidth: 0,
        flexShrink: 0,
        borderRadius: '16px',
        position: 'relative',
        overflow: 'hidden',
        bgcolor: darkMode ? '#1a1a1a' : '#ffffff',
        border: installFailed
          ? '1px solid rgba(239, 68, 68, 0.4)'
          : isInstalling
            ? '1px solid rgba(255, 149, 0, 0.4)'
            : `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)'}`,
        cursor: 'pointer',
        transition: 'transform 0.2s ease, border-color 0.2s ease',
        '&:hover': {
          transform: 'translateY(-2px)',
          borderColor: installFailed
            ? 'rgba(239, 68, 68, 0.6)'
            : isInstalling
              ? 'rgba(255, 149, 0, 0.6)'
              : darkMode
                ? 'rgba(255, 255, 255, 0.18)'
                : 'rgba(0, 0, 0, 0.18)',
        },
      }}
      onClick={
        app.url
          ? async () => {
              try {
                await open(app.url);
              } catch (err) {
                console.error('Failed to open space URL:', err);
              }
            }
          : undefined
      }
    >
      {/* Top Bar with Author (left) and Likes (right) - Full width */}
      {(author || likes !== undefined) && (
        <Box
          sx={{
            position: 'relative',
            zIndex: 2,
            width: '100%',
            px: 2.5,
            pt: 1.25,
            pb: 0,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          {/* Author + Badges - Left */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0, flex: 1 }}>
            {author && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                <Avatar
                  sx={{
                    width: 20,
                    height: 20,
                    bgcolor: isOfficial
                      ? 'rgba(59, 130, 246, 0.15)'
                      : darkMode
                        ? 'rgba(255, 255, 255, 0.1)'
                        : 'rgba(0, 0, 0, 0.08)',
                    fontSize: 10,
                    fontWeight: 600,
                    color: isOfficial ? '#FF9500' : darkMode ? '#ffffff' : '#1a1a1a',
                    flexShrink: 0,
                  }}
                >
                  {author.charAt(0).toUpperCase()}
                </Avatar>
                <Typography
                  sx={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: darkMode ? '#aaaaaa' : '#666666',
                    fontFamily: 'monospace',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {author}
                </Typography>
              </Box>
            )}
            {isOfficial && (
              <Chip
                icon={<VerifiedIcon sx={{ fontSize: 11 }} />}
                label="Official"
                size="small"
                sx={{
                  bgcolor: darkMode ? 'rgba(255, 149, 0, 0.15)' : 'rgba(255, 149, 0, 0.1)',
                  color: '#FF9500',
                  fontWeight: 600,
                  fontSize: 9,
                  height: 18,
                  flexShrink: 0,
                  '& .MuiChip-icon': { color: '#FF9500', ml: 0.5 },
                  '& .MuiChip-label': { px: 0.5 },
                }}
              />
            )}
            {!isPythonApp && (
              <Chip
                label="Web"
                size="small"
                sx={{
                  bgcolor: darkMode ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.1)',
                  color: '#6366f1',
                  fontWeight: 600,
                  fontSize: 9,
                  height: 18,
                  flexShrink: 0,
                  '& .MuiChip-label': { px: 0.75 },
                }}
              />
            )}
          </Box>

          {/* Likes - Right - Always show, even if 0 */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <FavoriteBorderIcon sx={{ fontSize: 16, color: darkMode ? '#aaaaaa' : '#666666' }} />
            <Typography
              sx={{
                fontSize: 12,
                fontWeight: 600,
                color: darkMode ? '#aaaaaa' : '#666666',
                lineHeight: 1,
              }}
            >
              {likes || 0}
            </Typography>
          </Box>
        </Box>
      )}

      {/* Separator */}
      {(author || likes !== undefined) && (
        <Box
          sx={{
            position: 'relative',
            zIndex: 2,
            px: 2.5,
            pt: 1,
            pb: 0,
          }}
        >
          <Box
            sx={{
              borderBottom: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'}`,
            }}
          />
        </Box>
      )}

      {/* Content */}
      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          px: 2.5,
          py: 2.5,
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          gap: 2,
        }}
      >
        {/* Title + Description + Date (left) + Emoji (right) */}
        <Box
          sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}
        >
          {/* Left side: Title + Description + Date */}
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 0.5,
              flex: 1,
              alignItems: 'flex-start',
            }}
          >
            {/* Title */}
            <Typography
              sx={{
                fontSize: 16,
                fontWeight: 700,
                color: darkMode ? '#ffffff' : '#1a1a1a',
                letterSpacing: '-0.3px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                width: '100%',
              }}
            >
              {app.name}
            </Typography>

            {/* Description */}
            <Typography
              sx={{
                fontSize: 12,
                color: darkMode ? '#aaaaaa' : '#666666',
                lineHeight: 1.5,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                textAlign: 'left',
                width: '100%',
              }}
            >
              {app.description || 'No description'}
            </Typography>

            {/* Date */}
            {formattedDate && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <AccessTimeIcon sx={{ fontSize: 12, color: darkMode ? '#aaaaaa' : '#666666' }} />
                <Typography
                  sx={{
                    fontSize: 10,
                    fontWeight: 500,
                    color: darkMode ? '#aaaaaa' : '#666666',
                  }}
                >
                  {formattedDate}
                </Typography>
              </Box>
            )}
          </Box>

          {/* Right side: Emoji */}
          <Typography
            component="span"
            sx={{
              fontSize: 24,
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            {emoji}
          </Typography>
        </Box>

        {/* Action Button: Install (Python) or Open (Web) */}
        {isPythonApp ? (
          <Button
            variant="outlined"
            color="primary"
            size="small"
            disabled={isBusy || isInstalled}
            onClick={e => {
              e.stopPropagation();
              if (!isInstalled) {
                handleInstall(app);
              }
            }}
            endIcon={
              isInstalled ? (
                <CheckCircleOutlineIcon sx={{ fontSize: 14 }} />
              ) : isInstalling ? (
                <CircularProgress size={14} sx={{ color: '#FF9500' }} />
              ) : (
                <DownloadOutlinedIcon sx={{ fontSize: 14 }} />
              )
            }
            sx={{
              mt: 'auto',
              width: '100%',
              py: 1,
              fontSize: 12,
              fontWeight: 600,
              textTransform: 'none',
              borderRadius: '10px',
              bgcolor: 'transparent',
              color: isInstalled
                ? darkMode
                  ? 'rgba(255, 255, 255, 0.5)'
                  : 'rgba(0, 0, 0, 0.5)'
                : installFailed
                  ? '#ef4444'
                  : '#FF9500',
              border: isInstalled
                ? darkMode
                  ? '1px solid rgba(255, 255, 255, 0.2)'
                  : '1px solid rgba(0, 0, 0, 0.2)'
                : installFailed
                  ? '1px solid #ef4444'
                  : isInstalling
                    ? '1px solid #FF9500'
                    : '1px solid #FF9500',
              transition: 'all 0.2s ease',
              '&:hover': {
                bgcolor: isInstalled
                  ? 'transparent'
                  : installFailed
                    ? 'rgba(239, 68, 68, 0.08)'
                    : 'rgba(255, 149, 0, 0.08)',
                borderColor: isInstalled
                  ? darkMode
                    ? 'rgba(255, 255, 255, 0.2)'
                    : 'rgba(0, 0, 0, 0.2)'
                  : installFailed
                    ? '#ef4444'
                    : '#FF9500',
              },
              '&:disabled': {
                bgcolor: 'transparent',
                color: darkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)',
                borderColor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.12)',
              },
            }}
          >
            {isInstalled
              ? 'Installed'
              : isInstalling
                ? 'Installing...'
                : installFailed
                  ? 'Retry Install'
                  : 'Install'}
          </Button>
        ) : (
          <Box sx={{ mt: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
            {/* Bookmark toggle */}
            <Tooltip title={isBookmarked ? 'Remove from panel' : 'Add to panel'} arrow>
              <IconButton
                size="small"
                onClick={e => {
                  e.stopPropagation();
                  const store = useAppStore.getState();
                  if (isBookmarked) {
                    store.unbookmarkLiveApp(app.name);
                  } else {
                    store.bookmarkLiveApp(app);
                  }
                }}
                sx={{
                  width: 32,
                  height: 32,
                  color: isBookmarked ? '#6366f1' : darkMode ? '#666' : '#aaa',
                  transition: 'color 0.15s ease',
                  '&:hover': {
                    color: '#6366f1',
                    bgcolor: 'rgba(99, 102, 241, 0.08)',
                  },
                }}
              >
                {isBookmarked ? (
                  <BookmarkIcon sx={{ fontSize: 18 }} />
                ) : (
                  <BookmarkBorderIcon sx={{ fontSize: 18 }} />
                )}
              </IconButton>
            </Tooltip>

            {/* Open in browser (also auto-bookmarks on first Open) */}
            <Button
              variant="outlined"
              size="small"
              endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
              onClick={async e => {
                e.stopPropagation();
                try {
                  // Auto-bookmark on first open so it shows in the panel
                  if (!isBookmarked) bookmarkLiveApp(app);
                  await open(spaceUrl);
                } catch (err) {
                  console.error('Failed to open web app URL:', err);
                }
              }}
              sx={{
                flex: 1,
                py: 1,
                fontSize: 12,
                fontWeight: 600,
                textTransform: 'none',
                borderRadius: '10px',
                bgcolor: 'transparent',
                color: '#6366f1',
                border: '1px solid #6366f1',
                transition: 'all 0.2s ease',
                '&:hover': {
                  bgcolor: 'rgba(99, 102, 241, 0.08)',
                  borderColor: '#6366f1',
                },
              }}
            >
              Open
            </Button>

            {/* QR thumbnail — click to enlarge in a popover for phone scanning */}
            <Box
              onClick={e => {
                e.stopPropagation();
                setQrAnchor(e.currentTarget);
              }}
              sx={{
                flexShrink: 0,
                p: 0.5,
                borderRadius: '8px',
                bgcolor: '#ffffff',
                border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.1)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'transform 0.15s ease, border-color 0.15s ease',
                '&:hover': {
                  transform: 'scale(1.05)',
                  borderColor: '#6366f1',
                },
              }}
            >
              <QRCodeSVG value={spaceUrl} size={48} level="L" />
            </Box>

            <Popover
              open={Boolean(qrAnchor)}
              anchorEl={qrAnchor}
              onClose={() => setQrAnchor(null)}
              anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
              transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              onClick={e => e.stopPropagation()}
              slotProps={{
                paper: {
                  sx: {
                    p: 2,
                    borderRadius: '14px',
                    bgcolor: darkMode ? '#1a1a1a' : '#ffffff',
                    border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.1)'}`,
                    boxShadow: darkMode
                      ? '0 8px 24px rgba(0, 0, 0, 0.6)'
                      : '0 8px 24px rgba(0, 0, 0, 0.15)',
                  },
                },
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 1.25,
                  maxWidth: 260,
                }}
              >
                <Typography
                  sx={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: darkMode ? '#aaa' : '#666',
                  }}
                >
                  Scan to open on your phone
                </Typography>
                <Box
                  sx={{
                    p: 1.5,
                    borderRadius: '10px',
                    bgcolor: '#ffffff',
                  }}
                >
                  <QRCodeSVG value={spaceUrl} size={220} level="M" />
                </Box>
                <Typography
                  sx={{
                    fontSize: 10,
                    color: darkMode ? '#888' : '#888',
                    fontFamily: 'monospace',
                    wordBreak: 'break-all',
                    textAlign: 'center',
                    maxWidth: '100%',
                  }}
                >
                  {spaceUrl}
                </Typography>
              </Box>
            </Popover>
          </Box>
        )}
      </Box>
    </Box>
  );
}

export default memo(AppCard);
