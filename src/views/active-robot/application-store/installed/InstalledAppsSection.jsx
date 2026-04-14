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

// ✅ Timeout for app to transition from "starting" to "running"
const APP_STARTING_TIMEOUT = 60000; // 60 seconds max for app to fully start

/**
 * Hook to check if a URL is accessible
 * Polls the URL until it responds successfully or times out
 * Uses no-cors mode which always succeeds if the server is reachable
 * @param {string} url - URL to check
 * @param {boolean} enabled - Whether to start checking
 * @param {function} onTimeout - Callback when timeout is reached (30s)
 * @param {number} timeoutMs - Timeout in milliseconds (default 30000)
 */
function useUrlAccessibility(url, enabled = false, onTimeout = null, timeoutMs = 30000) {
  const [isAccessible, setIsAccessible] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  // Use ref for callback to avoid re-triggering effect when callback changes
  const onTimeoutRef = useRef(onTimeout);
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
    let succeeded = false; // Track success locally to avoid stale state issues
    let pollTimeoutId = null;
    let globalTimeoutId = null;
    const startTime = Date.now();

    const markSuccess = () => {
      if (!cancelled && !succeeded) {
        succeeded = true;
        setIsAccessible(true);
        setIsChecking(false);
        // Clear the global timeout since we succeeded
        if (globalTimeoutId) {
          clearTimeout(globalTimeoutId);
          globalTimeoutId = null;
        }
      }
    };

    const checkUrl = async () => {
      // Check if we've exceeded the timeout
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
        // Remap hostname to daemon host (supports USB localhost and WiFi remote)
        const targetUrl = new URL(url);
        targetUrl.hostname = getDaemonHostname();

        // Use AbortController for timeout on individual requests
        const controller = new AbortController();
        const requestTimeout = setTimeout(() => controller.abort(), 5000);

        // Use no-cors mode - it will succeed if the server is reachable
        // The response is opaque but we don't need to read it
        await fetch(targetUrl.toString(), {
          method: 'HEAD',
          mode: 'no-cors',
          signal: controller.signal,
          cache: 'no-store',
        });

        clearTimeout(requestTimeout);

        // If fetch didn't throw, the server is reachable
        markSuccess();
      } catch (error) {
        // AbortError means timeout - server not responding yet
        // TypeError usually means network error - server not up yet

        // Retry if not cancelled and not succeeded
        if (!cancelled && !succeeded) {
          pollTimeoutId = setTimeout(checkUrl, 2000);
        }
      }
    };

    // Start checking after a small delay (give server time to start)
    pollTimeoutId = setTimeout(checkUrl, 1000);

    // Global timeout fallback
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
      succeeded = true; // Prevent any pending callbacks from firing
      if (pollTimeoutId) clearTimeout(pollTimeoutId);
      if (globalTimeoutId) clearTimeout(globalTimeoutId);
    };
  }, [url, enabled, timeoutMs]); // Removed onTimeout from deps, using ref instead

  return { isAccessible, isChecking };
}

/**
 * Hook to detect if an app is stuck in "starting" state
 * Triggers onTimeout callback if app doesn't reach "running" within timeout
 * @param {boolean} isStarting - Whether app is in "starting" state
 * @param {boolean} isRunning - Whether app is in "running" state
 * @param {function} onTimeout - Callback when timeout is reached
 * @param {number} timeoutMs - Timeout in milliseconds (default APP_STARTING_TIMEOUT)
 */
function useAppStartingTimeout(isStarting, isRunning, onTimeout, timeoutMs = APP_STARTING_TIMEOUT) {
  const startTimeRef = useRef(null);
  const timeoutIdRef = useRef(null);
  const hasTimedOutRef = useRef(false);
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  useEffect(() => {
    // Reset when app starts running (success)
    if (isRunning) {
      startTimeRef.current = null;
      hasTimedOutRef.current = false;
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }
      return;
    }

    // Start timer when app enters "starting" state
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

    // Cleanup when app is no longer starting (stopped or error)
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

/**
 * Invisible component that watches for app starting timeout
 * Must be rendered as a child component to use hooks properly in a loop
 */
function AppStartingTimeoutWatcher({ isStarting, isRunning, onTimeout, appName }) {
  useAppStartingTimeout(isStarting, isRunning, () => {
    console.error(`[${appName}] App stuck in starting state - triggering timeout`);
    if (onTimeout) {
      onTimeout();
    }
  });

  return null; // This component renders nothing
}

/**
 * Open App Button with loading state
 * Shows spinner while URL is not yet accessible
 * If URL doesn't respond within 30s, triggers onTimeout callback
 */
function OpenAppButton({
  appName,
  customAppUrl,
  isStartingOrRunning,
  isRunning,
  darkMode,
  onTimeout,
}) {
  const [hasTimedOut, setHasTimedOut] = useState(false);

  // Handle timeout - mark as timed out and notify parent
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
    60000 // 60 seconds timeout (doubled for slow app startups)
  );

  // Reset state when app stops/starts
  useEffect(() => {
    if (!isStartingOrRunning) {
      setHasTimedOut(false);
      // Reset dismissed flag so next app launch can auto-open
      useAppStore.getState().resetEmbeddedAppDismissed();
    }
  }, [isStartingOrRunning]);

  // Auto-open the embedded view as soon as the URL becomes accessible
  useEffect(() => {
    if (!isAccessible || !customAppUrl) return;
    const store = useAppStore.getState();
    // Don't auto-open if user dismissed, or if already embedded
    if (store.embeddedAppDismissed) return;
    if (store.rightPanelView === 'embedded-app') return;
    try {
      const url = new URL(customAppUrl);
      url.hostname = getDaemonHostname();
      store.openEmbeddedApp(url.toString());
    } catch {
      // URL parsing failed — user can still open manually
    }
  }, [isAccessible, customAppUrl]);

  // Don't show button if no URL
  if (!customAppUrl) return null;

  // Don't show button if app is not starting or running
  if (!isStartingOrRunning) return null;

  // Don't show button if timed out (app will be in error state)
  if (hasTimedOut) return null;

  // Don't show button if already embedded
  const store = useAppStore.getState();
  if (store.rightPanelView === 'embedded-app' && store.embeddedAppUrl) return null;

  const handleClick = async e => {
    e.stopPropagation();
    try {
      const url = new URL(customAppUrl);
      url.hostname = getDaemonHostname();
      useAppStore.getState().openEmbeddedApp(url.toString());
    } catch (err) {
      console.error('Failed to open app web interface:', err);
    }
  };

  // Ghost mode: URL not accessible yet (still checking)
  const isGhostMode = isChecking && !isAccessible;

  return (
    <Tooltip
      title={isGhostMode ? 'Waiting for app to be ready...' : 'Open web interface'}
      arrow
      placement="top"
    >
      <span>
        {' '}
        {/* Wrapper needed for disabled button tooltip */}
        <Button
          size="small"
          disabled={isGhostMode}
          onClick={handleClick}
          endIcon={
            isGhostMode ? (
              <CircularProgress size={12} sx={{ color: darkMode ? '#555' : '#bbb' }} />
            ) : (
              <OpenInNewIcon sx={{ fontSize: 13 }} />
            )
          }
          sx={{
            minWidth: 'auto',
            px: 1.5,
            py: 0.75,
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'none',
            borderRadius: '8px',
            flexShrink: 0,
            bgcolor: 'transparent',
            color: isGhostMode ? (darkMode ? '#555' : '#bbb') : '#FF9500',
            border: `1px solid ${isGhostMode ? (darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.12)') : '#FF9500'}`,
            transition: 'all 0.2s ease',
            '&:hover': {
              bgcolor: 'rgba(255, 149, 0, 0.08)',
              borderColor: '#FF9500',
            },
            '&:disabled': {
              bgcolor: darkMode ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
              color: darkMode ? '#555' : '#bbb',
              borderColor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.12)',
            },
          }}
        >
          Open
        </Button>
      </span>
    </Tooltip>
  );
}

/**
 * Opens an external URL in the system browser
 * Works in both Tauri and web contexts
 */
const openExternalUrl = async url => {
  try {
    const { open } = await import('@tauri-apps/plugin-shell');
    await open(url);
  } catch {
    // Fallback to window.open for web version
    window.open(url, '_blank', 'noopener,noreferrer');
  }
};

/**
 * Section displaying installed apps with call-to-actions for discovery and creation
 *
 * Compact flat card design:
 * - Description always visible under app name/author
 * - Actions always visible (Start/Stop, Open if custom_app_url)
 * - Three-dot context menu on hover for secondary actions (HF link, Uninstall)
 * - Visual indicator when app is running (green accent)
 */
export default function InstalledAppsSection({
  installedApps,
  darkMode,
  expandedApp,
  setExpandedApp,
  startingApp,
  currentApp,
  isBusy,
  isJobRunning,
  isAppRunning = false,
  isStoppingApp = false,
  handleStartApp,
  handleUninstall,
  handleUpdate,
  hasUpdate,
  isCheckingUpdates,
  hasCheckedOnce,
  getJobInfo,
  stopCurrentApp,
  onOpenDiscover,
  onOpenCreateTutorial,
}) {
  const { robotStatus } = useAppStore();
  const isSleeping = robotStatus === 'sleeping';

  const [menuAnchorEl, setMenuAnchorEl] = useState(null);
  const [menuAppName, setMenuAppName] = useState(null);

  const handleMenuOpen = (event, appName) => {
    event.stopPropagation();
    setMenuAnchorEl(event.currentTarget);
    setMenuAppName(appName);
  };

  const handleMenuClose = () => {
    setMenuAnchorEl(null);
    setMenuAppName(null);
  };

  // Check if any app is currently running or starting (based on currentApp state)
  const isAnyAppActive =
    currentApp &&
    currentApp.state &&
    (currentApp.state === 'running' || currentApp.state === 'starting');

  return (
    <Box sx={{ px: 3, mb: 0 }}>
      {/* No apps installed yet - Full height, centered */}
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
            border: darkMode
              ? '1px dashed rgba(255, 255, 255, 0.3)'
              : '1px dashed rgba(0, 0, 0, 0.3)',
            gap: 1.5,
            minHeight: '280px',
          }}
        >
          {/* Reachies Carousel - Scrolling images */}
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
              darkMode={darkMode}
            />
          </Box>

          <Typography
            sx={{
              fontSize: 14,
              color: darkMode ? '#aaa' : '#666',
              fontWeight: 700,
              textAlign: 'center',
            }}
          >
            No apps installed yet...
          </Typography>

          <DiscoverAppsButton
            onClick={onOpenDiscover}
            darkMode={darkMode}
            disabled={isBusy || isAnyAppActive}
          />

          <Typography
            component="button"
            onClick={onOpenCreateTutorial}
            sx={{
              fontSize: 11,
              fontWeight: 500,
              color: darkMode ? '#666' : '#999',
              textDecoration: 'underline',
              textDecorationColor: darkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)',
              textUnderlineOffset: '2px',
              cursor: 'pointer',
              bgcolor: 'transparent',
              border: 'none',
              p: 0,
              mt: -0.5,
              transition: 'all 0.2s ease',
              '&:hover': {
                color: darkMode ? '#888' : '#777',
                textDecorationColor: darkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)',
              },
            }}
          >
            or build your own
          </Typography>
        </Box>
      )}

      {/* Installed Apps List */}
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
              border: darkMode
                ? '1px solid rgba(255, 255, 255, 0.08)'
                : '1px solid rgba(0, 0, 0, 0.08)',
              p: 2,
            }}
          >
            {installedApps.map(app => {
              const isRemoving = isJobRunning(app.name, 'remove');
              const displayName = app.displayName || app.name;

              const isThisAppCurrent =
                currentApp && currentApp.info && currentApp.info.name === app.name;
              const appState = isThisAppCurrent && currentApp.state ? currentApp.state : null;
              const isCurrentlyRunning = appState === 'running';
              const isAppStarting = appState === 'starting';
              const isAppError = appState === 'error';
              const hasAppError = isThisAppCurrent && (currentApp.error || isAppError);

              const isStarting = startingApp === app.name || isAppStarting;
              const isStartingOrRunning = isStarting || isCurrentlyRunning;

              const author = app.extra?.id?.split('/')?.[0] || app.extra?.author || null;

              const isMenuOpen = menuAppName === app.name;

              return (
                <Box
                  key={app.name}
                  sx={{
                    borderRadius: '14px',
                    bgcolor: darkMode ? 'rgba(255, 255, 255, 0.02)' : 'white',
                    border: `1px solid ${
                      hasAppError
                        ? '#ef4444'
                        : isCurrentlyRunning
                          ? '#22c55e'
                          : darkMode
                            ? 'rgba(255, 255, 255, 0.08)'
                            : 'rgba(0, 0, 0, 0.08)'
                    }`,
                    transition: 'opacity 0.25s ease, filter 0.25s ease, border-color 0.2s ease',
                    overflow: 'hidden',
                    boxShadow: hasAppError
                      ? '0 0 0 1px rgba(239, 68, 68, 0.2)'
                      : isCurrentlyRunning
                        ? '0 0 0 1px rgba(34, 197, 94, 0.2)'
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
                        ? darkMode
                          ? 'rgba(239, 68, 68, 0.06)'
                          : 'rgba(239, 68, 68, 0.04)'
                        : isCurrentlyRunning
                          ? darkMode
                            ? 'rgba(34, 197, 94, 0.05)'
                            : 'rgba(34, 197, 94, 0.03)'
                          : 'transparent',
                    }}
                  >
                    {/* Left: Emoji + Info */}
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
                            borderRadius: '12px',
                            bgcolor: isCurrentlyRunning
                              ? darkMode
                                ? 'rgba(34, 197, 94, 0.1)'
                                : 'rgba(34, 197, 94, 0.08)'
                              : darkMode
                                ? 'rgba(255, 255, 255, 0.04)'
                                : 'rgba(0, 0, 0, 0.03)',
                            border: `1px solid ${
                              isCurrentlyRunning
                                ? 'rgba(34, 197, 94, 0.3)'
                                : darkMode
                                  ? 'rgba(255, 255, 255, 0.08)'
                                  : 'rgba(0, 0, 0, 0.08)'
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
                              fontSize: 13,
                              fontWeight: 600,
                              color: darkMode ? '#f5f5f5' : '#333',
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
                                fontSize: 9,
                                fontWeight: 700,
                                bgcolor: 'rgba(239, 68, 68, 0.1)',
                                color: '#ef4444',
                                '& .MuiChip-label': { px: 0.75 },
                              }}
                            />
                          )}
                        </Box>

                        {/* Status line: error message, job status, or author */}
                        {(() => {
                          if (hasAppError && currentApp?.error) {
                            const firstLine = currentApp.error.split('\n')[0];
                            return (
                              <Typography
                                sx={{
                                  fontSize: 9,
                                  fontWeight: 500,
                                  color: '#ef4444',
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
                                  fontSize: 9,
                                  color: jobInfo.type === 'remove' ? '#ef4444' : '#FF9500',
                                  fontWeight: 500,
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
                                  fontSize: 9,
                                  fontWeight: 500,
                                  color: darkMode ? '#666' : '#999',
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
                      </Box>
                    </Box>

                    {/* Right: Action buttons */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
                      {/* Three-dot menu - visible on hover, disabled while stopping */}
                      <IconButton
                        className="more-menu-btn"
                        size="small"
                        disabled={isStoppingApp && isThisAppCurrent}
                        onClick={e => handleMenuOpen(e, app.name)}
                        sx={{
                          width: 28,
                          height: 28,
                          display: isMenuOpen ? 'inline-flex' : 'none',
                          color: darkMode ? '#888' : '#999',
                          transition: 'color 0.15s ease, background-color 0.15s ease',
                          '&:hover': {
                            color: darkMode ? '#ccc' : '#666',
                            bgcolor: darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                          },
                        }}
                      >
                        <MoreVertIcon sx={{ fontSize: 16 }} />
                      </IconButton>

                      {/* Update badge */}
                      {(() => {
                        const isUpdating = isJobRunning(app.name, 'update');

                        if (isUpdating) {
                          return (
                            <Tooltip title="Updating..." arrow placement="top">
                              <CircularProgress
                                size={14}
                                thickness={5}
                                sx={{ color: '#FF9500', flexShrink: 0 }}
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
                                    color: '#FF9500',
                                    border: '1px solid #FF9500',
                                    borderRadius: '8px',
                                    transition: 'all 0.2s ease',
                                    '&:hover': {
                                      bgcolor: 'rgba(255, 149, 0, 0.1)',
                                    },
                                    '&:disabled': {
                                      color: darkMode ? '#555' : '#999',
                                      borderColor: darkMode
                                        ? 'rgba(255, 255, 255, 0.1)'
                                        : 'rgba(0, 0, 0, 0.12)',
                                    },
                                  }}
                                >
                                  <ArrowUpwardIcon sx={{ fontSize: 14 }} />
                                </IconButton>
                              </span>
                            </Tooltip>
                          );
                        }

                        return null;
                      })()}

                      {/* Open button */}
                      <OpenAppButton
                        appName={app.name}
                        customAppUrl={app.extra?.custom_app_url}
                        isStartingOrRunning={isStartingOrRunning}
                        isRunning={isCurrentlyRunning}
                        darkMode={darkMode}
                        onTimeout={() => {
                          console.error(`[${app.name}] Web interface timeout - stopping app`);
                          if (isThisAppCurrent) {
                            stopCurrentApp();
                          }
                        }}
                      />

                      {/* Start/Stop button */}
                      {isStoppingApp && isThisAppCurrent ? (
                        <Tooltip title="Stopping app..." arrow placement="top">
                          <span>
                            <IconButton
                              size="small"
                              disabled
                              sx={{
                                width: 32,
                                height: 32,
                                color: '#ef4444',
                                border: '1px solid #ef4444',
                                borderRadius: '8px',
                                transition: 'all 0.2s ease',
                                '&:disabled': {
                                  color: '#ef4444',
                                  borderColor: 'rgba(239, 68, 68, 0.5)',
                                  bgcolor: darkMode
                                    ? 'rgba(239, 68, 68, 0.05)'
                                    : 'rgba(239, 68, 68, 0.03)',
                                },
                              }}
                            >
                              <CircularProgress size={14} thickness={5} sx={{ color: '#ef4444' }} />
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
                              color: '#ef4444',
                              border: '1px solid #ef4444',
                              borderRadius: '8px',
                              transition: 'all 0.2s ease',
                              '&:hover': {
                                bgcolor: 'rgba(239, 68, 68, 0.08)',
                              },
                              '&:disabled': {
                                color: darkMode ? '#555' : '#999',
                                borderColor: darkMode
                                  ? 'rgba(255, 255, 255, 0.1)'
                                  : 'rgba(0, 0, 0, 0.12)',
                              },
                            }}
                          >
                            <StopCircleOutlinedIcon sx={{ fontSize: 16 }} />
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
                                color: '#FF9500',
                                border: '1px solid #FF9500',
                                borderRadius: '8px',
                                transition: 'all 0.2s ease',
                                '&:disabled': {
                                  color: '#FF9500',
                                  borderColor: 'rgba(255, 149, 0, 0.5)',
                                  bgcolor: darkMode
                                    ? 'rgba(255, 149, 0, 0.05)'
                                    : 'rgba(255, 149, 0, 0.03)',
                                },
                              }}
                            >
                              <CircularProgress size={14} thickness={5} sx={{ color: '#FF9500' }} />
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
                          endIcon={<PlayArrowOutlinedIcon sx={{ fontSize: 13 }} />}
                          sx={{
                            minWidth: 'auto',
                            px: 1.5,
                            py: 0.75,
                            fontSize: 11,
                            fontWeight: 600,
                            textTransform: 'none',
                            borderRadius: '8px',
                            flexShrink: 0,
                            bgcolor: 'transparent',
                            color: '#FF9500',
                            border: '1px solid #FF9500',
                            transition: 'all 0.2s ease',
                            '&:hover': {
                              bgcolor: 'rgba(255, 149, 0, 0.08)',
                              borderColor: '#FF9500',
                            },
                            '&:disabled': {
                              bgcolor: darkMode
                                ? 'rgba(255, 255, 255, 0.02)'
                                : 'rgba(0, 0, 0, 0.02)',
                              color: darkMode ? '#555' : '#999',
                              borderColor: darkMode
                                ? 'rgba(255, 255, 255, 0.1)'
                                : 'rgba(0, 0, 0, 0.12)',
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

            {/* Context menu for app actions */}
            <Menu
              anchorEl={menuAnchorEl}
              open={Boolean(menuAnchorEl)}
              onClose={handleMenuClose}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
              slotProps={{
                paper: {
                  sx: {
                    bgcolor: darkMode ? '#1a1a1a' : '#fff',
                    border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`,
                    borderRadius: '10px',
                    boxShadow: darkMode
                      ? '0 8px 24px rgba(0, 0, 0, 0.5)'
                      : '0 8px 24px rgba(0, 0, 0, 0.12)',
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
                const isRemoving = isJobRunning(menuAppName, 'remove');
                const isThisAppCurrent =
                  currentApp && currentApp.info && currentApp.info.name === menuAppName;
                const appState = isThisAppCurrent && currentApp.state ? currentApp.state : null;
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
                        fontSize: 12,
                        py: 1,
                        color: darkMode ? '#ccc' : '#444',
                        '&:hover': {
                          bgcolor: darkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
                        },
                      }}
                    >
                      <ListItemIcon>
                        <LaunchIcon sx={{ fontSize: 15, color: darkMode ? '#888' : '#999' }} />
                      </ListItemIcon>
                      <ListItemText
                        primary="View on HuggingFace"
                        primaryTypographyProps={{ fontSize: 12 }}
                      />
                    </MenuItem>
                  ),
                  <MenuItem
                    key="uninstall"
                    disabled={isRemoving || isCurrentlyRunning}
                    onClick={() => {
                      handleUninstall(menuAppName);
                      handleMenuClose();
                    }}
                    sx={{
                      fontSize: 12,
                      py: 1,
                      color: '#ef4444',
                      '&:hover': {
                        bgcolor: 'rgba(239, 68, 68, 0.06)',
                      },
                      '&.Mui-disabled': {
                        color: darkMode ? '#555' : '#bbb',
                      },
                    }}
                  >
                    <ListItemIcon>
                      {isRemoving ? (
                        <CircularProgress size={15} sx={{ color: '#ef4444' }} />
                      ) : (
                        <DeleteOutlineIcon sx={{ fontSize: 15, color: '#ef4444' }} />
                      )}
                    </ListItemIcon>
                    <ListItemText
                      primary={isRemoving ? 'Uninstalling...' : 'Uninstall'}
                      primaryTypographyProps={{ fontSize: 12 }}
                    />
                  </MenuItem>,
                ];
              })()}
            </Menu>

            {/* Compact version: Discover apps / Build your own */}
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1.5,
                px: 2,
                py: 1.5,
                borderRadius: '12px',
                bgcolor: 'transparent',
                border: darkMode
                  ? '1px dashed rgba(255, 255, 255, 0.2)'
                  : '1px dashed rgba(0, 0, 0, 0.2)',
                mt: 1,
              }}
            >
              <DiscoverAppsButton onClick={onOpenDiscover} darkMode={darkMode} disabled={isBusy} />

              <Typography
                component="button"
                onClick={onOpenCreateTutorial}
                sx={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: darkMode ? '#666' : '#999',
                  textDecoration: 'underline',
                  textDecorationColor: darkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)',
                  textUnderlineOffset: '2px',
                  cursor: 'pointer',
                  bgcolor: 'transparent',
                  border: 'none',
                  p: 0,
                  transition: 'color 0.2s ease, textDecorationColor 0.2s ease',
                  '&:hover': {
                    color: darkMode ? '#888' : '#777',
                    textDecorationColor: darkMode
                      ? 'rgba(255, 255, 255, 0.3)'
                      : 'rgba(0, 0, 0, 0.3)',
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
