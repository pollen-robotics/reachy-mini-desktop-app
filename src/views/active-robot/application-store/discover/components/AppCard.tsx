import React, { memo } from 'react';
import { Box, Typography, Button, Avatar, Chip, CircularProgress } from '@mui/material';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import VerifiedIcon from '@mui/icons-material/Verified';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { useActiveRobotContext } from '../../../context';
import {
  ACCENT,
  DURATION,
  FONT_WEIGHT,
  RADIUS,
  TYPO,
  accentAlpha,
  blackAlpha,
  transition,
  whiteAlpha,
} from '@styles/tokens';
import { useAppPalette } from '@styles';

interface AppLike {
  name: string;
  description?: string;
  url?: string;
  isOfficial?: boolean;
  isInstalled?: boolean;
  extra?: {
    id?: string;
    author?: string;
    likes?: number;
    lastModified?: string | number | Date;
    createdAt?: string | number | Date;
    isPythonApp?: boolean;
    private?: boolean;
    cardData?: {
      emoji?: string;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface AppCardProps {
  app: AppLike;
  /** @deprecated Theme mode is now read from `useAppPalette()`. Prop kept for back-compat but ignored. */
  darkMode?: boolean;
  isBusy: boolean;
  isInstalling: boolean;
  installFailed: boolean;
  isInstalled: boolean;
  handleInstall: (app: AppLike) => void;
  selectedCategory?: string | null;
  searchQuery?: string;
  index?: number;
}

// TODO(style-migration): purple/indigo/blue accents are not in the palette yet.
const PRIVATE_COLOR = '#8b5cf6';
const PRIVATE_BG_DARK = 'rgba(139, 92, 246, 0.15)';
const PRIVATE_BG_LIGHT = 'rgba(139, 92, 246, 0.1)';
const WEB_COLOR = '#6366f1';
const WEB_BG_DARK = 'rgba(99, 102, 241, 0.15)';
const WEB_BG_LIGHT = 'rgba(99, 102, 241, 0.1)';
const WEB_HOVER_BG = 'rgba(99, 102, 241, 0.08)';
const OFFICIAL_AVATAR_BG = 'rgba(59, 130, 246, 0.15)';
const ERROR_BORDER = 'rgba(239, 68, 68, 0.4)';
const ERROR_BORDER_HOVER = 'rgba(239, 68, 68, 0.6)';
const ERROR_HOVER_BG = 'rgba(239, 68, 68, 0.08)';

function AppCard({
  app,
  isBusy,
  isInstalling,
  installFailed,
  isInstalled,
  handleInstall,
}: AppCardProps): React.ReactElement {
  const palette = useAppPalette();
  const { shellApi } = useActiveRobotContext();
  const open = shellApi.open;
  const cardData = app.extra?.cardData || {};
  const author = app.extra?.id?.split('/')?.[0] || app.extra?.author || null;
  const likes = app.extra?.likes || 0;
  const lastModified = app.extra?.lastModified || app.extra?.createdAt || null;
  const isPythonApp = app.extra?.isPythonApp !== false;
  const isOfficial = app.isOfficial === true;
  const isPrivate = app.extra?.private === true;
  const emoji = [...(cardData.emoji || (isPythonApp ? '📦' : '🌐'))][0];
  const spaceUrl = app.url || `https://huggingface.co/spaces/${app.extra?.id || app.name}`;

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
        width: '100%',
        minWidth: 0,
        flexShrink: 0,
        borderRadius: RADIUS.xxl,
        position: 'relative',
        overflow: 'hidden',
        bgcolor: palette.isDark ? '#1a1a1a' : '#ffffff',
        border: installFailed
          ? `1px solid ${ERROR_BORDER}`
          : isInstalling
            ? `1px solid ${accentAlpha(0.4)}`
            : `1px solid ${palette.borderStrong}`,
        cursor: 'pointer',
        transition: transition(['transform', 'border-color'], DURATION.base),
        '&:hover': {
          transform: 'translateY(-2px)',
          borderColor: installFailed
            ? ERROR_BORDER_HOVER
            : isInstalling
              ? accentAlpha(0.6)
              : palette.isDark
                ? whiteAlpha(0.18)
                : blackAlpha(0.18),
        },
      }}
      onClick={
        app.url
          ? async () => {
              try {
                await open(app.url as string);
              } catch (err) {
                console.error('Failed to open space URL:', err);
              }
            }
          : undefined
      }
    >
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0, flex: 1 }}>
            {author && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                <Avatar
                  sx={{
                    width: 20,
                    height: 20,
                    bgcolor: isOfficial
                      ? OFFICIAL_AVATAR_BG
                      : palette.isDark
                        ? whiteAlpha(0.1)
                        : blackAlpha(0.08),
                    fontSize: TYPO.tiny,
                    fontWeight: FONT_WEIGHT.semibold,
                    color: isOfficial ? ACCENT.main : palette.textPrimary,
                    flexShrink: 0,
                  }}
                >
                  {author.charAt(0).toUpperCase()}
                </Avatar>
                <Typography
                  sx={{
                    fontSize: TYPO.xs,
                    fontWeight: FONT_WEIGHT.medium,
                    color: palette.textSecondary,
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
                icon={<VerifiedIcon sx={{ fontSize: TYPO.xs }} />}
                label="Official"
                size="small"
                sx={{
                  bgcolor: accentAlpha(palette.isDark ? 0.15 : 0.1),
                  color: ACCENT.main,
                  fontWeight: FONT_WEIGHT.semibold,
                  fontSize: TYPO.micro,
                  height: 18,
                  flexShrink: 0,
                  '& .MuiChip-icon': { color: ACCENT.main, ml: 0.5 },
                  '& .MuiChip-label': { px: 0.5 },
                }}
              />
            )}
            {isPrivate && (
              <Chip
                icon={<LockOutlinedIcon sx={{ fontSize: TYPO.xs }} />}
                label="Private"
                size="small"
                sx={{
                  bgcolor: palette.isDark ? PRIVATE_BG_DARK : PRIVATE_BG_LIGHT,
                  color: PRIVATE_COLOR,
                  fontWeight: FONT_WEIGHT.semibold,
                  fontSize: TYPO.micro,
                  height: 18,
                  flexShrink: 0,
                  '& .MuiChip-icon': { color: PRIVATE_COLOR, ml: 0.5 },
                  '& .MuiChip-label': { px: 0.5 },
                }}
              />
            )}
            {!isPythonApp && (
              <Chip
                label="Web"
                size="small"
                sx={{
                  bgcolor: palette.isDark ? WEB_BG_DARK : WEB_BG_LIGHT,
                  color: WEB_COLOR,
                  fontWeight: FONT_WEIGHT.semibold,
                  fontSize: TYPO.micro,
                  height: 18,
                  flexShrink: 0,
                  '& .MuiChip-label': { px: 0.75 },
                }}
              />
            )}
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <FavoriteBorderIcon sx={{ fontSize: TYPO.lg, color: palette.textSecondary }} />
            <Typography
              sx={{
                fontSize: TYPO.sm,
                fontWeight: FONT_WEIGHT.semibold,
                color: palette.textSecondary,
                lineHeight: 1,
              }}
            >
              {likes || 0}
            </Typography>
          </Box>
        </Box>
      )}

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
              borderBottom: `1px solid ${palette.border}`,
            }}
          />
        </Box>
      )}

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
        <Box
          sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}
        >
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 0.5,
              flex: 1,
              alignItems: 'flex-start',
            }}
          >
            <Typography
              sx={{
                fontSize: TYPO.lg,
                fontWeight: FONT_WEIGHT.bold,
                color: palette.textPrimary,
                letterSpacing: '-0.3px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                width: '100%',
              }}
            >
              {app.name}
            </Typography>

            <Typography
              sx={{
                fontSize: TYPO.sm,
                color: palette.textSecondary,
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

            {formattedDate && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <AccessTimeIcon sx={{ fontSize: TYPO.sm, color: palette.textSecondary }} />
                <Typography
                  sx={{
                    fontSize: TYPO.tiny,
                    fontWeight: FONT_WEIGHT.medium,
                    color: palette.textSecondary,
                  }}
                >
                  {formattedDate}
                </Typography>
              </Box>
            )}
          </Box>

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
                <CheckCircleOutlineIcon sx={{ fontSize: TYPO.md }} />
              ) : isInstalling ? (
                <CircularProgress size={14} sx={{ color: ACCENT.main }} />
              ) : (
                <DownloadOutlinedIcon sx={{ fontSize: TYPO.md }} />
              )
            }
            sx={{
              mt: 'auto',
              width: '100%',
              py: 1,
              fontSize: TYPO.sm,
              fontWeight: FONT_WEIGHT.semibold,
              textTransform: 'none',
              borderRadius: RADIUS.lg,
              bgcolor: 'transparent',
              color: isInstalled
                ? palette.textMuted
                : installFailed
                  ? palette.statusError
                  : ACCENT.main,
              border: isInstalled
                ? `1px solid ${palette.borderStrong}`
                : installFailed
                  ? `1px solid ${palette.statusError}`
                  : `1px solid ${ACCENT.main}`,
              transition: transition('all', DURATION.base),
              '&:hover': {
                bgcolor: isInstalled
                  ? 'transparent'
                  : installFailed
                    ? ERROR_HOVER_BG
                    : accentAlpha(0.08),
                borderColor: isInstalled
                  ? palette.borderStrong
                  : installFailed
                    ? palette.statusError
                    : ACCENT.main,
              },
              '&:disabled': {
                bgcolor: 'transparent',
                color: palette.textDisabled,
                borderColor: palette.border,
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
          <Button
            variant="outlined"
            size="small"
            endIcon={<OpenInNewIcon sx={{ fontSize: TYPO.md }} />}
            onClick={async e => {
              e.stopPropagation();
              try {
                await open(spaceUrl);
              } catch (err) {
                console.error('Failed to open web app URL:', err);
              }
            }}
            sx={{
              mt: 'auto',
              width: '100%',
              py: 1,
              fontSize: TYPO.sm,
              fontWeight: FONT_WEIGHT.semibold,
              textTransform: 'none',
              borderRadius: RADIUS.lg,
              bgcolor: 'transparent',
              color: WEB_COLOR,
              border: `1px solid ${WEB_COLOR}`,
              transition: transition('all', DURATION.base),
              '&:hover': {
                bgcolor: WEB_HOVER_BG,
                borderColor: WEB_COLOR,
              },
            }}
          >
            Open
          </Button>
        )}
      </Box>
    </Box>
  );
}

export default memo(AppCard);
