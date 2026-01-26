import { Box, Typography, Button, Avatar, CircularProgress, Chip } from '@mui/material';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

/**
 * Opens a URL in a browser
 * On macOS: tries Chrome → Firefox → Safari (to avoid Safari as default)
 * On other platforms: uses default browser
 */
async function openInBrowser(url) {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('open_url_in_browser', { url });
  } catch (err) {
    // On non-macOS or if Chrome/Firefox not found, fall back to default browser
    try {
      const { open } = await import('@tauri-apps/plugin-shell');
      await open(url);
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }
}

/**
 * App card component for Discover Modal
 * Uses ActiveRobotContext for decoupling from Tauri
 */
export default function AppCard({
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
  // Extract data from HF Space API
  const cardData = app.extra?.cardData || {};
  const author = app.extra?.id?.split('/')?.[0] || app.extra?.author || null;
  const likes = app.extra?.likes || 0;
  const lastModified = app.extra?.lastModified || app.extra?.createdAt || null;
  const emoji = cardData.emoji || '📦';

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
      key={`${app.name}-${selectedCategory || 'all'}-${searchQuery || ''}-${index}`}
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
        transition: 'all 0.2s ease',
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
          {/* Author - Left */}
          {author && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Avatar
                sx={{
                  width: 20,
                  height: 20,
                  bgcolor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
                  fontSize: 10,
                  fontWeight: 600,
                  color: darkMode ? '#ffffff' : '#1a1a1a',
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
                }}
              >
                {author}
              </Typography>
            </Box>
          )}

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
          height: '100%',
          justifyContent: 'center',
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
            {/* Title + Web App Badge */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
              <Typography
                sx={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: darkMode ? '#ffffff' : '#1a1a1a',
                  letterSpacing: '-0.3px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {app.name}
              </Typography>
              {app.isWebApp && (
                <Chip
                  label="Web"
                  size="small"
                  sx={{
                    height: 18,
                    fontSize: 9,
                    fontWeight: 700,
                    bgcolor: 'rgba(59, 130, 246, 0.1)',
                    color: '#3b82f6',
                    flexShrink: 0,
                    '& .MuiChip-label': { px: 0.75 },
                  }}
                />
              )}
            </Box>

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

        {/* Install/Installed/Open Button */}
        {app.isWebApp ? (
          // Web app: Show "Open" button that opens the URL
          <Button
            variant="outlined"
            color="primary"
            size="small"
            onClick={async e => {
              e.stopPropagation();
              if (app.url) {
                try {
                  await openInBrowser(app.url);
                } catch (err) {
                  console.error('Failed to open web app URL:', err);
                }
              }
            }}
            endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
            sx={{
              mt: 2.5,
              width: '100%',
              py: 1,
              fontSize: 12,
              fontWeight: 600,
              textTransform: 'none',
              borderRadius: '10px',
              bgcolor: 'transparent',
              color: '#3b82f6',
              border: '1px solid #3b82f6',
              transition: 'all 0.2s ease',
              '&:hover': {
                bgcolor: 'rgba(59, 130, 246, 0.08)',
                borderColor: '#3b82f6',
              },
            }}
          >
            Open
          </Button>
        ) : (
          // Python app: Show Install/Installed button
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
              mt: 2.5,
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
        )}
      </Box>
    </Box>
  );
}
