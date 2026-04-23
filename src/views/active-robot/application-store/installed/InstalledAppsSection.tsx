import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Tooltip,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import PlayArrowOutlinedIcon from '@mui/icons-material/PlayArrowOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import StopCircleOutlinedIcon from '@mui/icons-material/StopCircleOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import LaunchIcon from '@mui/icons-material/Launch';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import DiscoverAppsButton from '../discover/Button';
import ReachiesCarousel from '@components/ReachiesCarousel';
import { getDaemonHostname } from '../../../../config/daemon';
import useAppStore from '../../../../store/useAppStore';
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

const APP_STARTING_TIMEOUT = 60000;

// TODO(style-migration): tinted status surfaces (success/error overlays) are not yet in the palette.
const SUCCESS_BG_DARK = 'rgba(34, 197, 94, 0.05)';
const SUCCESS_BG_LIGHT = 'rgba(34, 197, 94, 0.03)';
const SUCCESS_ICON_BG_DARK = 'rgba(34, 197, 94, 0.1)';
const SUCCESS_ICON_BG_LIGHT = 'rgba(34, 197, 94, 0.08)';
const SUCCESS_BORDER = 'rgba(34, 197, 94, 0.3)';
const SUCCESS_GLOW = '0 0 0 1px rgba(34, 197, 94, 0.2)';

const ERROR_BG_DARK = 'rgba(239, 68, 68, 0.06)';
const ERROR_BG_LIGHT = 'rgba(239, 68, 68, 0.04)';
const ERROR_STOP_HOVER = 'rgba(239, 68, 68, 0.08)';
const ERROR_STOP_DISABLED_BORDER = 'rgba(239, 68, 68, 0.5)';
const ERROR_STOP_DISABLED_BG_DARK = 'rgba(239, 68, 68, 0.05)';
const ERROR_STOP_DISABLED_BG_LIGHT = 'rgba(239, 68, 68, 0.03)';
const ERROR_CHIP_BG = 'rgba(239, 68, 68, 0.1)';
const ERROR_CHIP_HOVER_BG = 'rgba(239, 68, 68, 0.06)';
const ERROR_GLOW = '0 0 0 1px rgba(239, 68, 68, 0.2)';

interface InstalledApp {
  name: string;
  displayName?: string;
  icon?: string;
  url?: string;
  extra?: {
    id?: string;
    author?: string;
    cardData?: {
      emoji?: string;
    };
    custom_app_url?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface CurrentApp {
  info?: { name?: string };
  state?: string;
  error?: string;
  [key: string]: unknown;
}

interface JobInfo {
  type?: string;
  status?: string;
  logs?: string[];
  [key: string]: unknown;
}

interface UrlAccessibilityResult {
  isAccessible: boolean;
  isChecking: boolean;
}

function useUrlAccessibility(
  url: string | undefined,
  enabled: boolean = false,
  onTimeout: (() => void) | null = null,
  timeoutMs: number = 30000
): UrlAccessibilityResult {
  const [isAccessible, setIsAccessible] = useState<boolean>(false);
  const [isChecking, setIsChecking] = useState<boolean>(false);

  const onTimeoutRef = useRef<(() => void) | null>(onTimeout);
  onTimeoutRef.current = onTimeout;

  useEffect(() => {
    if (!enabled || !url) {
      setIsAccessible(false);
      setIsChecking(false);
      return;
    }

    setIsChecking(true);
    setIsAccessible(false);

    let cancelled = false;
    let succeeded = false;
    let pollTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let globalTimeoutId: ReturnType<typeof setTimeout> | null = null;
    const startTime = Date.now();

    const markSuccess = (): void => {
      if (!cancelled && !succeeded) {
        succeeded = true;
        setIsAccessible(true);
        setIsChecking(false);
        if (globalTimeoutId) {
          clearTimeout(globalTimeoutId);
          globalTimeoutId = null;
        }
      }
    };

    const checkUrl = async (): Promise<void> => {
      if (Date.now() - startTime > timeoutMs) {
        if (!cancelled && !succeeded) {
          setIsChecking(false);
          if (onTimeoutRef.current) {
            onTimeoutRef.current();
          }
        }
        return;
      }

      try {
        const targetUrl = new URL(url);
        targetUrl.hostname = getDaemonHostname();

        const controller = new AbortController();
        const requestTimeout = setTimeout(() => controller.abort(), 5000);

        await fetch(targetUrl.toString(), {
          method: 'HEAD',
          mode: 'no-cors',
          signal: controller.signal,
          cache: 'no-store',
        });

        clearTimeout(requestTimeout);

        markSuccess();
      } catch {
        if (!cancelled && !succeeded) {
          pollTimeoutId = setTimeout(checkUrl, 2000);
        }
      }
    };

    pollTimeoutId = setTimeout(checkUrl, 1000);

    globalTimeoutId = setTimeout(() => {
      if (!cancelled && !succeeded) {
        setIsChecking(false);
        if (onTimeoutRef.current) {
          onTimeoutRef.current();
        }
      }
    }, timeoutMs + 1000);

    return () => {
      cancelled = true;
      succeeded = true;
      if (pollTimeoutId) clearTimeout(pollTimeoutId);
      if (globalTimeoutId) clearTimeout(globalTimeoutId);
    };
  }, [url, enabled, timeoutMs]);

  return { isAccessible, isChecking };
}

function useAppStartingTimeout(
  isStarting: boolean,
  isRunning: boolean,
  onTimeout: () => void,
  timeoutMs: number = APP_STARTING_TIMEOUT
): void {
  const startTimeRef = useRef<number | null>(null);
  const timeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasTimedOutRef = useRef<boolean>(false);
  const onTimeoutRef = useRef<() => void>(onTimeout);
  onTimeoutRef.current = onTimeout;

  useEffect(() => {
    if (isRunning) {
      startTimeRef.current = null;
      hasTimedOutRef.current = false;
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }
      return;
    }

    if (isStarting && !startTimeRef.current && !hasTimedOutRef.current) {
      startTimeRef.current = Date.now();

      timeoutIdRef.current = setTimeout(() => {
        if (startTimeRef.current && !hasTimedOutRef.current) {
          console.warn(
            `[AppStartingTimeout] App stuck in "starting" state for ${timeoutMs / 1000}s`
          );
          hasTimedOutRef.current = true;
          if (onTimeoutRef.current) {
            onTimeoutRef.current();
          }
        }
      }, timeoutMs);
    }

    if (!isStarting && !isRunning) {
      startTimeRef.current = null;
      hasTimedOutRef.current = false;
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }
    }

    return () => {
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }
    };
  }, [isStarting, isRunning, timeoutMs]);
}

interface AppStartingTimeoutWatcherProps {
  isStarting: boolean;
  isRunning: boolean;
  onTimeout?: () => void;
  appName: string;
}

function AppStartingTimeoutWatcher({
  isStarting,
  isRunning,
  onTimeout,
  appName,
}: AppStartingTimeoutWatcherProps): null {
  useAppStartingTimeout(isStarting, isRunning, () => {
    console.error(`[${appName}] App stuck in starting state - triggering timeout`);
    if (onTimeout) {
      onTimeout();
    }
  });

  return null;
}

interface OpenAppButtonProps {
  appName: string;
  customAppUrl?: string;
  isStartingOrRunning: boolean;
  isRunning: boolean;
  isPoppedOut?: boolean;
  onTimeout?: () => void;
}

function OpenAppButton({
  customAppUrl,
  isStartingOrRunning,
  isPoppedOut,
  onTimeout,
}: OpenAppButtonProps): React.ReactElement | null {
  const palette = useAppPalette();
  const [hasTimedOut, setHasTimedOut] = useState<boolean>(false);

  const handleTimeout = useCallback(() => {
    setHasTimedOut(true);
    if (onTimeout) {
      onTimeout();
    }
  }, [onTimeout]);

  const { isAccessible, isChecking } = useUrlAccessibility(
    customAppUrl,
    isStartingOrRunning && !!customAppUrl && !hasTimedOut,
    handleTimeout,
    60000
  );

  useEffect(() => {
    if (!isStartingOrRunning) {
      setHasTimedOut(false);
      (
        useAppStore.getState() as unknown as { resetEmbeddedAppDismissed: () => void }
      ).resetEmbeddedAppDismissed();
    }
  }, [isStartingOrRunning]);

  useEffect(() => {
    if (!isAccessible || !customAppUrl) return;
    const store = useAppStore.getState() as unknown as {
      embeddedAppDismissed: boolean;
      rightPanelView: string;
      openEmbeddedApp: (url: string) => void;
    };
    if (store.embeddedAppDismissed) return;
    if (store.rightPanelView === 'embedded-app') return;
    try {
      const url = new URL(customAppUrl);
      url.hostname = getDaemonHostname();
      store.openEmbeddedApp(url.toString());
    } catch {
      // URL parsing failed - user can still open manually
    }
  }, [isAccessible, customAppUrl]);

  if (!customAppUrl) return null;

  if (!isStartingOrRunning) return null;

  if (hasTimedOut) return null;

  const store = useAppStore.getState() as unknown as {
    rightPanelView: string;
    embeddedAppUrl: string | null;
  };
  if (store.rightPanelView === 'embedded-app' && store.embeddedAppUrl) return null;

  const handleClick = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation();
    try {
      const url = new URL(customAppUrl);
      url.hostname = getDaemonHostname();
      (
        useAppStore.getState() as unknown as { openEmbeddedApp: (url: string) => void }
      ).openEmbeddedApp(url.toString());
    } catch (err) {
      console.error('Failed to open app web interface:', err);
    }
  };

  if (isPoppedOut) return null;

  const isGhostMode = isChecking && !isAccessible;

  return (
    <Tooltip
      title={isGhostMode ? 'Waiting for app to be ready...' : 'Open web interface'}
      arrow
      placement="top"
    >
      <span>
        {' '}
        <Button
          size="small"
          disabled={isGhostMode}
          onClick={handleClick}
          endIcon={
            isGhostMode ? (
              <CircularProgress size={12} sx={{ color: palette.textDisabled }} />
            ) : (
              <OpenInNewIcon sx={{ fontSize: TYPO.body }} />
            )
          }
          sx={{
            minWidth: 'auto',
            px: 1.5,
            py: 0.75,
            fontSize: TYPO.xs,
            fontWeight: FONT_WEIGHT.semibold,
            textTransform: 'none',
            borderRadius: RADIUS.md,
            flexShrink: 0,
            bgcolor: 'transparent',
            color: isGhostMode ? palette.textDisabled : ACCENT.main,
            border: `1px solid ${isGhostMode ? palette.border : ACCENT.main}`,
            transition: transition('all', DURATION.base),
            '&:hover': {
              bgcolor: accentAlpha(0.08),
              borderColor: ACCENT.main,
            },
            '&:disabled': {
              bgcolor: palette.isDark ? whiteAlpha(0.02) : blackAlpha(0.02),
              color: palette.textDisabled,
              borderColor: palette.border,
            },
          }}
        >
          Open
        </Button>
      </span>
    </Tooltip>
  );
}

const openExternalUrl = async (url: string): Promise<void> => {
  try {
    const { open } = await import('@tauri-apps/plugin-shell');
    await open(url);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
};

interface InstalledAppsSectionProps {
  installedApps: InstalledApp[];
  /** @deprecated Theme mode is now read from `useAppPalette()`. Prop kept for back-compat but ignored. */
  darkMode?: boolean;
  expandedApp?: string | null;
  setExpandedApp?: (name: string | null) => void;
  startingApp: string | null;
  currentApp: CurrentApp | null;
  isBusy: boolean;
  isJobRunning: (appName: string, type?: string) => boolean;
  isAppRunning?: boolean;
  isStoppingApp?: boolean;
  handleStartApp: (appName: string) => void;
  handleUninstall: (appName: string) => void;
  handleUpdate?: (appName: string) => void;
  hasUpdate?: (appName: string) => boolean;
  isCheckingUpdates?: boolean;
  hasCheckedOnce?: boolean;
  getJobInfo: (appName: string, type?: string) => JobInfo | null | undefined;
  stopCurrentApp: () => void;
  onOpenDiscover: () => void;
  onOpenCreateTutorial: () => void;
}

export default function InstalledAppsSection({
  installedApps,
  startingApp,
  currentApp,
  isBusy,
  isJobRunning,
  isStoppingApp = false,
  handleStartApp,
  handleUninstall,
  handleUpdate,
  hasUpdate,
  getJobInfo,
  stopCurrentApp,
  onOpenDiscover,
  onOpenCreateTutorial,
}: InstalledAppsSectionProps): React.ReactElement {
  const palette = useAppPalette();
  const { robotStatus, openWindows } = useAppStore() as unknown as {
    robotStatus: string;
    openWindows: string[];
  };
  const isSleeping = robotStatus === 'sleeping';

  const [menuAnchorEl, setMenuAnchorEl] = useState<HTMLElement | null>(null);
  const [menuAppName, setMenuAppName] = useState<string | null>(null);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, appName: string): void => {
    event.stopPropagation();
    setMenuAnchorEl(event.currentTarget);
    setMenuAppName(appName);
  };

  const handleMenuClose = (): void => {
    setMenuAnchorEl(null);
    setMenuAppName(null);
  };

  const isAnyAppActive =
    currentApp &&
    currentApp.state &&
    (currentApp.state === 'running' || currentApp.state === 'starting');

  return (
    <Box sx={{ px: 3, mb: 0 }}>
      {installedApps.length === 0 && (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            px: 3,
            py: 3.5,
            borderRadius: '14px',
            bgcolor: 'transparent',
            border: `1px dashed ${palette.isDark ? whiteAlpha(0.3) : blackAlpha(0.3)}`,
            gap: 1.5,
            minHeight: '280px',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mb: 0.25,
            }}
          >
            <ReachiesCarousel
              width={100}
              height={100}
              interval={750}
              transitionDuration={150}
              zoom={1.6}
              verticalAlign="60%"
              darkMode={palette.isDark}
            />
          </Box>

          <Typography
            sx={{
              fontSize: TYPO.md,
              color: palette.textSecondary,
              fontWeight: FONT_WEIGHT.bold,
              textAlign: 'center',
            }}
          >
            No apps installed yet...
          </Typography>

          <DiscoverAppsButton onClick={onOpenDiscover} disabled={isBusy || !!isAnyAppActive} />

          <Typography
            component="button"
            onClick={onOpenCreateTutorial}
            sx={{
              fontSize: TYPO.xs,
              fontWeight: FONT_WEIGHT.medium,
              color: palette.textMuted,
              textDecoration: 'underline',
              textDecorationColor: palette.isDark ? whiteAlpha(0.2) : blackAlpha(0.2),
              textUnderlineOffset: '2px',
              cursor: 'pointer',
              bgcolor: 'transparent',
              border: 'none',
              p: 0,
              mt: -0.5,
              transition: transition('all', DURATION.base),
              '&:hover': {
                color: palette.textSecondary,
                textDecorationColor: palette.isDark ? whiteAlpha(0.3) : blackAlpha(0.3),
              },
            }}
          >
            or build your own
          </Typography>
        </Box>
      )}

      {installedApps.length > 0 && (
        <>
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              mb: 0,
              minHeight: '280px',
              borderRadius: '14px',
              bgcolor: 'transparent',
              border: `1px solid ${palette.border}`,
              p: 2,
            }}
          >
            {installedApps.map(app => {
              const isRemoving = isJobRunning(app.name, 'remove');
              const displayName = app.displayName || app.name;

              const isThisAppCurrent =
                !!currentApp && !!currentApp.info && currentApp.info.name === app.name;
              const appState = isThisAppCurrent && currentApp?.state ? currentApp.state : null;
              const isCurrentlyRunning = appState === 'running';
              const isAppStarting = appState === 'starting';
              const isAppError = appState === 'error';
              const hasAppError = isThisAppCurrent && !!(currentApp?.error || isAppError);

              const isStarting = startingApp === app.name || isAppStarting;
              const isStartingOrRunning = isStarting || isCurrentlyRunning;

              const author = app.extra?.id?.split('/')?.[0] || app.extra?.author || null;
              const isPoppedOut = openWindows.includes(
                'app-' + app.name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()
              );

              const isMenuOpen = menuAppName === app.name;

              return (
                <Box
                  key={app.name}
                  sx={{
                    borderRadius: '14px',
                    bgcolor: palette.isDark ? whiteAlpha(0.02) : 'white',
                    border: `1px solid ${
                      hasAppError
                        ? palette.statusError
                        : isCurrentlyRunning
                          ? palette.statusSuccess
                          : palette.border
                    }`,
                    transition: `${transition(['opacity', 'filter'], DURATION.medium)}, ${transition('border-color', DURATION.base)}`,
                    overflow: 'hidden',
                    boxShadow: hasAppError
                      ? ERROR_GLOW
                      : isCurrentlyRunning
                        ? SUCCESS_GLOW
                        : 'none',
                    opacity: isRemoving ? 0.5 : isBusy && !isCurrentlyRunning ? 0.4 : 1,
                    filter: isBusy && !isCurrentlyRunning ? 'grayscale(50%)' : 'none',
                    '&:hover .more-menu-btn': {
                      display: 'inline-flex',
                    },
                  }}
                >
                  <AppStartingTimeoutWatcher
                    isStarting={isAppStarting}
                    isRunning={isCurrentlyRunning}
                    appName={app.name}
                    onTimeout={() => {
                      console.error(`[${app.name}] App startup timeout - stopping app`);
                      if (isThisAppCurrent) {
                        stopCurrentApp();
                      }
                    }}
                  />

                  <Box
                    sx={{
                      p: 2,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 1,
                      bgcolor: hasAppError
                        ? palette.isDark
                          ? ERROR_BG_DARK
                          : ERROR_BG_LIGHT
                        : isCurrentlyRunning
                          ? palette.isDark
                            ? SUCCESS_BG_DARK
                            : SUCCESS_BG_LIGHT
                          : 'transparent',
                    }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.5,
                        flex: 1,
                        minWidth: 0,
                        overflow: 'hidden',
                      }}
                    >
                      <Box sx={{ flexShrink: 0 }}>
                        <Box
                          sx={{
                            fontSize: 28,
                            width: 52,
                            height: 52,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: RADIUS.xl,
                            bgcolor: isCurrentlyRunning
                              ? palette.isDark
                                ? SUCCESS_ICON_BG_DARK
                                : SUCCESS_ICON_BG_LIGHT
                              : palette.isDark
                                ? whiteAlpha(0.04)
                                : blackAlpha(0.03),
                            border: `1px solid ${
                              isCurrentlyRunning ? SUCCESS_BORDER : palette.border
                            }`,
                          }}
                        >
                          {[...(app.extra?.cardData?.emoji || app.icon || '📦')][0]}
                        </Box>
                      </Box>

                      <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.3 }}>
                          <Typography
                            sx={{
                              fontSize: TYPO.body,
                              fontWeight: FONT_WEIGHT.semibold,
                              color: palette.textPrimary,
                              letterSpacing: '-0.2px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              flex: 1,
                              minWidth: 0,
                            }}
                          >
                            {displayName}
                          </Typography>

                          {hasAppError && (
                            <Chip
                              label={currentApp?.error ? 'Crashed' : 'Error'}
                              size="small"
                              sx={{
                                height: 16,
                                fontSize: TYPO.micro,
                                fontWeight: FONT_WEIGHT.bold,
                                bgcolor: ERROR_CHIP_BG,
                                color: palette.statusError,
                                '& .MuiChip-label': { px: 0.75 },
                              }}
                            />
                          )}
                        </Box>

                        {(() => {
                          if (hasAppError && currentApp?.error) {
                            const firstLine = currentApp.error.split('\n')[0];
                            return (
                              <Typography
                                sx={{
                                  fontSize: TYPO.micro,
                                  fontWeight: FONT_WEIGHT.medium,
                                  color: palette.statusError,
                                  fontFamily: 'monospace',
                                  letterSpacing: '0.2px',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {firstLine}
                              </Typography>
                            );
                          }

                          const jobInfo = getJobInfo(app.name);

                          if (jobInfo) {
                            return (
                              <Typography
                                sx={{
                                  fontSize: TYPO.micro,
                                  color:
                                    jobInfo.type === 'remove' ? palette.statusError : ACCENT.main,
                                  fontWeight: FONT_WEIGHT.medium,
                                  fontFamily: 'monospace',
                                  letterSpacing: '0.2px',
                                }}
                              >
                                {jobInfo.type === 'remove'
                                  ? 'Removing...'
                                  : jobInfo.type === 'update'
                                    ? 'Updating...'
                                    : 'Installing...'}
                              </Typography>
                            );
                          }
                          if (author) {
                            return (
                              <Typography
                                sx={{
                                  fontSize: TYPO.micro,
                                  fontWeight: FONT_WEIGHT.medium,
                                  color: palette.textMuted,
                                  fontFamily: 'monospace',
                                  letterSpacing: '0.2px',
                                }}
                              >
                                {author}
                              </Typography>
                            );
                          }
                          return null;
                        })()}

                        {isPoppedOut && (
                          <Typography
                            sx={{
                              fontSize: TYPO.micro,
                              fontWeight: FONT_WEIGHT.medium,
                              color: palette.textMuted,
                              fontStyle: 'italic',
                              letterSpacing: '0.2px',
                            }}
                          >
                            Viewing in separate window
                          </Typography>
                        )}
                      </Box>
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
                      <IconButton
                        className="more-menu-btn"
                        size="small"
                        disabled={isStoppingApp && isThisAppCurrent}
                        onClick={e => handleMenuOpen(e, app.name)}
                        sx={{
                          width: 28,
                          height: 28,
                          display: isMenuOpen ? 'inline-flex' : 'none',
                          color: palette.textMuted,
                          transition: transition(['color', 'background-color'], DURATION.fast),
                          '&:hover': {
                            color: palette.textSecondary,
                            bgcolor: palette.isDark ? whiteAlpha(0.08) : blackAlpha(0.06),
                          },
                        }}
                      >
                        <MoreVertIcon sx={{ fontSize: TYPO.lg }} />
                      </IconButton>

                      {(() => {
                        const isUpdating = isJobRunning(app.name, 'update');

                        if (isUpdating) {
                          return (
                            <Tooltip title="Updating..." arrow placement="top">
                              <CircularProgress
                                size={14}
                                thickness={5}
                                sx={{ color: ACCENT.main, flexShrink: 0 }}
                              />
                            </Tooltip>
                          );
                        }

                        if (hasUpdate && hasUpdate(app.name)) {
                          return (
                            <Tooltip title="Update available" arrow placement="top">
                              <span>
                                <IconButton
                                  size="small"
                                  disabled={isCurrentlyRunning || isBusy || isSleeping}
                                  onClick={e => {
                                    e.stopPropagation();
                                    if (handleUpdate) handleUpdate(app.name);
                                  }}
                                  sx={{
                                    width: 32,
                                    height: 32,
                                    color: ACCENT.main,
                                    border: `1px solid ${ACCENT.main}`,
                                    borderRadius: RADIUS.md,
                                    transition: transition('all', DURATION.base),
                                    '&:hover': {
                                      bgcolor: accentAlpha(0.1),
                                    },
                                    '&:disabled': {
                                      color: palette.textDisabled,
                                      borderColor: palette.border,
                                    },
                                  }}
                                >
                                  <ArrowUpwardIcon sx={{ fontSize: TYPO.md }} />
                                </IconButton>
                              </span>
                            </Tooltip>
                          );
                        }

                        return null;
                      })()}

                      <OpenAppButton
                        appName={app.name}
                        customAppUrl={app.extra?.custom_app_url}
                        isStartingOrRunning={isStartingOrRunning}
                        isRunning={isCurrentlyRunning}
                        isPoppedOut={isPoppedOut}
                        onTimeout={() => {
                          console.error(`[${app.name}] Web interface timeout - stopping app`);
                          if (isThisAppCurrent) {
                            stopCurrentApp();
                          }
                        }}
                      />

                      {isStoppingApp && isThisAppCurrent ? (
                        <Tooltip title="Stopping app..." arrow placement="top">
                          <span>
                            <IconButton
                              size="small"
                              disabled
                              sx={{
                                width: 32,
                                height: 32,
                                color: palette.statusError,
                                border: `1px solid ${palette.statusError}`,
                                borderRadius: RADIUS.md,
                                transition: transition('all', DURATION.base),
                                '&:disabled': {
                                  color: palette.statusError,
                                  borderColor: ERROR_STOP_DISABLED_BORDER,
                                  bgcolor: palette.isDark
                                    ? ERROR_STOP_DISABLED_BG_DARK
                                    : ERROR_STOP_DISABLED_BG_LIGHT,
                                },
                              }}
                            >
                              <CircularProgress
                                size={14}
                                thickness={5}
                                sx={{ color: palette.statusError }}
                              />
                            </IconButton>
                          </span>
                        </Tooltip>
                      ) : isCurrentlyRunning ? (
                        <Tooltip title="Stop app" arrow placement="top">
                          <IconButton
                            size="small"
                            disabled={isBusy && !isCurrentlyRunning}
                            onClick={e => {
                              e.stopPropagation();
                              stopCurrentApp();
                            }}
                            sx={{
                              width: 32,
                              height: 32,
                              color: palette.statusError,
                              border: `1px solid ${palette.statusError}`,
                              borderRadius: RADIUS.md,
                              transition: transition('all', DURATION.base),
                              '&:hover': {
                                bgcolor: ERROR_STOP_HOVER,
                              },
                              '&:disabled': {
                                color: palette.textDisabled,
                                borderColor: palette.border,
                              },
                            }}
                          >
                            <StopCircleOutlinedIcon sx={{ fontSize: TYPO.lg }} />
                          </IconButton>
                        </Tooltip>
                      ) : isStarting ? (
                        <Tooltip title="App is starting..." arrow placement="top">
                          <span>
                            <IconButton
                              size="small"
                              disabled
                              sx={{
                                width: 32,
                                height: 32,
                                color: ACCENT.main,
                                border: `1px solid ${ACCENT.main}`,
                                borderRadius: RADIUS.md,
                                transition: transition('all', DURATION.base),
                                '&:disabled': {
                                  color: ACCENT.main,
                                  borderColor: accentAlpha(0.5),
                                  bgcolor: accentAlpha(palette.isDark ? 0.05 : 0.03),
                                },
                              }}
                            >
                              <CircularProgress
                                size={14}
                                thickness={5}
                                sx={{ color: ACCENT.main }}
                              />
                            </IconButton>
                          </span>
                        </Tooltip>
                      ) : (
                        <Button
                          size="small"
                          disabled={isBusy || isRemoving}
                          onClick={e => {
                            e.stopPropagation();
                            handleStartApp(app.name);
                          }}
                          endIcon={<PlayArrowOutlinedIcon sx={{ fontSize: TYPO.body }} />}
                          sx={{
                            minWidth: 'auto',
                            px: 1.5,
                            py: 0.75,
                            fontSize: TYPO.xs,
                            fontWeight: FONT_WEIGHT.semibold,
                            textTransform: 'none',
                            borderRadius: RADIUS.md,
                            flexShrink: 0,
                            bgcolor: 'transparent',
                            color: ACCENT.main,
                            border: `1px solid ${ACCENT.main}`,
                            transition: transition('all', DURATION.base),
                            '&:hover': {
                              bgcolor: accentAlpha(0.08),
                              borderColor: ACCENT.main,
                            },
                            '&:disabled': {
                              bgcolor: palette.isDark ? whiteAlpha(0.02) : blackAlpha(0.02),
                              color: palette.textDisabled,
                              borderColor: palette.border,
                            },
                          }}
                        >
                          Start
                        </Button>
                      )}
                    </Box>
                  </Box>
                </Box>
              );
            })}

            <Menu
              anchorEl={menuAnchorEl}
              open={Boolean(menuAnchorEl)}
              onClose={handleMenuClose}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
              slotProps={{
                paper: {
                  sx: {
                    bgcolor: palette.isDark ? '#1a1a1a' : '#fff',
                    border: `1px solid ${palette.border}`,
                    borderRadius: RADIUS.lg,
                    boxShadow: palette.shadowMd,
                    minWidth: 180,
                    py: 0.5,
                  },
                },
              }}
            >
              {(() => {
                const menuApp = installedApps.find(a => a.name === menuAppName);
                if (!menuApp) return null;

                const hfUrl =
                  menuApp.url ||
                  (menuApp.extra?.id ? `https://huggingface.co/spaces/${menuApp.extra.id}` : null);
                const isRemoving = isJobRunning(menuAppName as string, 'remove');
                const isThisAppCurrent =
                  !!currentApp && !!currentApp.info && currentApp.info.name === menuAppName;
                const appState = isThisAppCurrent && currentApp?.state ? currentApp.state : null;
                const isCurrentlyRunning = appState === 'running';

                return [
                  hfUrl && (
                    <MenuItem
                      key="hf-link"
                      onClick={async () => {
                        await openExternalUrl(hfUrl);
                        handleMenuClose();
                      }}
                      sx={{
                        fontSize: TYPO.sm,
                        py: 1,
                        color: palette.textSecondary,
                        '&:hover': {
                          bgcolor: palette.isDark ? whiteAlpha(0.06) : blackAlpha(0.04),
                        },
                      }}
                    >
                      <ListItemIcon>
                        <LaunchIcon sx={{ fontSize: 15, color: palette.textMuted }} />
                      </ListItemIcon>
                      <ListItemText
                        primary="View on HuggingFace"
                        primaryTypographyProps={{ fontSize: TYPO.sm }}
                      />
                    </MenuItem>
                  ),
                  <MenuItem
                    key="uninstall"
                    disabled={isRemoving || isCurrentlyRunning}
                    onClick={() => {
                      handleUninstall(menuAppName as string);
                      handleMenuClose();
                    }}
                    sx={{
                      fontSize: TYPO.sm,
                      py: 1,
                      color: palette.statusError,
                      '&:hover': {
                        bgcolor: ERROR_CHIP_HOVER_BG,
                      },
                      '&.Mui-disabled': {
                        color: palette.textDisabled,
                      },
                    }}
                  >
                    <ListItemIcon>
                      {isRemoving ? (
                        <CircularProgress size={15} sx={{ color: palette.statusError }} />
                      ) : (
                        <DeleteOutlineIcon sx={{ fontSize: 15, color: palette.statusError }} />
                      )}
                    </ListItemIcon>
                    <ListItemText
                      primary={isRemoving ? 'Uninstalling...' : 'Uninstall'}
                      primaryTypographyProps={{ fontSize: TYPO.sm }}
                    />
                  </MenuItem>,
                ];
              })()}
            </Menu>

            <Box
              sx={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1.5,
                px: 2,
                py: 1.5,
                borderRadius: RADIUS.xl,
                bgcolor: 'transparent',
                border: `1px dashed ${palette.isDark ? whiteAlpha(0.2) : blackAlpha(0.2)}`,
                mt: 1,
              }}
            >
              <DiscoverAppsButton onClick={onOpenDiscover} disabled={isBusy} />

              <Typography
                component="button"
                onClick={onOpenCreateTutorial}
                sx={{
                  fontSize: TYPO.xs,
                  fontWeight: FONT_WEIGHT.medium,
                  color: palette.textMuted,
                  textDecoration: 'underline',
                  textDecorationColor: palette.isDark ? whiteAlpha(0.2) : blackAlpha(0.2),
                  textUnderlineOffset: '2px',
                  cursor: 'pointer',
                  bgcolor: 'transparent',
                  border: 'none',
                  p: 0,
                  transition: transition(['color', 'textDecorationColor'], DURATION.base),
                  '&:hover': {
                    color: palette.textSecondary,
                    textDecorationColor: palette.isDark ? whiteAlpha(0.3) : blackAlpha(0.3),
                  },
                }}
              >
                or build your own
              </Typography>
            </Box>
          </Box>
        </>
      )}
    </Box>
  );
}
