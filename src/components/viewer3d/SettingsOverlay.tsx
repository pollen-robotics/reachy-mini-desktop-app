import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Typography, Button, CircularProgress } from '@mui/material';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import FullscreenOverlay from '../FullscreenOverlay';
import PulseButton from '../PulseButton';
import useAppStore from '../../store/useAppStore';
import { buildApiUrl, fetchWithTimeout, DAEMON_CONFIG, getWsBaseUrl } from '../../config/daemon';
import reachyUpdateBoxSvg from '../../assets/reachy-update-box.svg';
import { invoke } from '@tauri-apps/api/core';
import { logSuccess } from '../../utils/logging';
import { useToast } from '../../hooks/useToast';
import {
  ACCENT,
  STATUS,
  STATUS_TEXT,
  DANGER,
  accentAlpha,
  blackAlpha,
  whiteAlpha,
} from '@styles/tokens';
import { useAppPalette, TYPO, FONT_WEIGHT, RADIUS, BLUR, scrollbarSx } from '@styles';

import {
  SettingsUpdateCard,
  SettingsWifiCard,
  SettingsPreferencesCard,
  SettingsCacheCard,
  SettingsDaemonCard,
  ChangeWifiOverlay,
  WifiConnectingOverlay,
} from './settings';
import type { UpdateInfo } from './settings/SettingsUpdateCard';
import type { WifiStatus } from './settings/SettingsWifiCard';

type UpdateJobStatus = 'pending' | 'in_progress' | 'done' | 'failed' | 'restarting' | string;

// TODO(ts): we track a custom `_lastStatus` field on the WebSocket instance
// for the onclose handler. Widen locally to allow writes.
type TrackedWebSocket = WebSocket & { _lastStatus?: UpdateJobStatus };

export interface SettingsOverlayProps {
  open: boolean;
  onClose: () => void;
  /** @deprecated Theme mode is now read from `useAppPalette()`. Prop kept for back-compat but ignored. */
  darkMode?: boolean;
}

export default function SettingsOverlay({
  open,
  onClose,
}: SettingsOverlayProps): React.ReactElement {
  const palette = useAppPalette();
  const { connectionMode, remoteHost, resetAll, clearApps } = useAppStore();
  const isWifiMode = connectionMode === 'wifi';

  const safelyParkRobot = async (): Promise<boolean> => {
    try {
      await fetchWithTimeout(
        buildApiUrl('/api/move/play/goto_sleep'),
        { method: 'POST' },
        DAEMON_CONFIG.TIMEOUTS.COMMAND,
        { label: 'Goto sleep before update', silent: true }
      );
      await new Promise(resolve => setTimeout(resolve, 5000));
      await fetchWithTimeout(
        buildApiUrl('/api/motors/set_mode/disabled'),
        { method: 'POST' },
        DAEMON_CONFIG.TIMEOUTS.COMMAND,
        { label: 'Disable motors before update', silent: true }
      );
      return true;
    } catch {
      return false;
    }
  };

  const textPrimary = palette.textPrimary;
  const textMuted = palette.textMuted;

  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState<boolean>(false);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);

  const [updateJobId, setUpdateJobId] = useState<string | null>(null);
  const [updateJobStatus, setUpdateJobStatus] = useState<UpdateJobStatus | null>(null);
  const [updateLogs, setUpdateLogs] = useState<string[]>([]);
  const updatePollingRef = useRef<TrackedWebSocket | null>(null);

  const getInitialPreRelease = (): boolean => {
    try {
      const stored = localStorage.getItem('preReleaseUpdates');
      return stored ? JSON.parse(stored) : false;
    } catch {
      return false;
    }
  };

  const [preRelease, setPreReleaseState] = useState<boolean>(getInitialPreRelease);

  const setPreRelease = (value: boolean): void => {
    try {
      localStorage.setItem('preReleaseUpdates', JSON.stringify(value));
    } catch (e) {
      console.error('Failed to save preRelease preference:', e);
    }
    setPreReleaseState(value);
  };

  const [wifiStatus, setWifiStatus] = useState<WifiStatus | null>(null);
  const [availableNetworks, setAvailableNetworks] = useState<unknown[]>([]);
  const [isLoadingWifi, setIsLoadingWifi] = useState<boolean>(false);
  const [selectedSSID, setSelectedSSID] = useState<string>('');
  const [wifiPassword, setWifiPassword] = useState<string>('');
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [wifiError, setWifiError] = useState<string | null>(null);

  const [showUpdateConfirm, setShowUpdateConfirm] = useState<boolean>(false);
  const [showChangeWifiOverlay, setShowChangeWifiOverlay] = useState<boolean>(false);
  // While the robot reconfigures WiFi, the app link drops for ~20s. During
  // that window we show ``WifiConnectingOverlay`` and, on timeout, fall back
  // to ``FindingRobotView`` via ``resetAll()``.
  const [wifiConnectingTo, setWifiConnectingTo] = useState<string | null>(null);
  const [showClearNetworksConfirm, setShowClearNetworksConfirm] = useState<boolean>(false);
  const [isClearingNetworks, setIsClearingNetworks] = useState<boolean>(false);
  const [showResetAppsConfirm, setShowResetAppsConfirm] = useState<boolean>(false);
  const [isResettingApps, setIsResettingApps] = useState<boolean>(false);
  const [showResetAppsVenvConfirm, setShowResetAppsVenvConfirm] = useState<boolean>(false);
  const [isResettingAppsVenv, setIsResettingAppsVenv] = useState<boolean>(false);
  const [showResetPythonEnvConfirm, setShowResetPythonEnvConfirm] = useState<boolean>(false);
  const [isResettingPythonEnv, setIsResettingPythonEnv] = useState<boolean>(false);

  const { showToast } = useToast();

  const checkForUpdate = useCallback(async (): Promise<void> => {
    if (!navigator.onLine) {
      console.warn('⚠️ No internet connection, cannot check for updates');
      showToast('No internet connection. Please check your network and try again.', 'warning');
      return;
    }

    setIsCheckingUpdate(true);
    setUpdateInfo(null);

    try {
      if (isWifiMode) {
        const response = await fetchWithTimeout(
          buildApiUrl(`/update/available?pre_release=${preRelease}`),
          {},
          DAEMON_CONFIG.TIMEOUTS.COMMAND,
          { label: 'Check update', silent: true }
        );

        if (response.ok) {
          const data = await response.json();
          const info = (data.update?.reachy_mini as UpdateInfo) || null;

          // Daemons up to 1.9.0 mis-sort the PyPI pre-release list and always
          // answer "up to date" on the beta channel, so resolve the available
          // version here instead. Their current_version is reliable.
          setUpdateInfo(
            info && preRelease
              ? ((await invoke('check_remote_daemon_update', {
                  currentVersion: info.current_version,
                  preRelease,
                })) as UpdateInfo)
              : info
          );
        }
      } else {
        const data = (await invoke('check_daemon_update', { preRelease })) as UpdateInfo;
        setUpdateInfo(data);
      }
    } catch (err) {
      console.error('Failed to check for updates:', err);
      const message = (err as { message?: string })?.message ?? '';
      const isNetworkError =
        message.toLowerCase().includes('network') ||
        message.toLowerCase().includes('timeout') ||
        message.toLowerCase().includes('connection') ||
        message.toLowerCase().includes('fetch');

      if (isNetworkError) {
        showToast('No internet connection. Please check your network and try again.', 'warning');
      } else {
        showToast('Failed to check for updates', 'error');
      }
    } finally {
      setIsCheckingUpdate(false);
    }
  }, [isWifiMode, preRelease, showToast]);

  const connectUpdateWebSocket = useCallback(
    (jobId: string): void => {
      const wsUrl = `${getWsBaseUrl()}/update/ws/logs?job_id=${jobId}`;

      const ws = new WebSocket(wsUrl) as TrackedWebSocket;

      ws.onopen = () => {};
      ws._lastStatus = 'pending';

      ws.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);

          if (data.status) {
            ws._lastStatus = data.status;
            setUpdateJobStatus(data.status);

            if (data.logs && Array.isArray(data.logs)) {
              setUpdateLogs(prev => [...prev, ...(data.logs as string[])]);
            }

            if (data.status === 'done' || data.status === 'failed') {
              ws.close();

              if (data.status === 'done') {
                setUpdateJobStatus('restarting');
                logSuccess('Update completed successfully!');

                setTimeout(() => {
                  setIsUpdating(false);
                  showToast('Update completed! Please reconnect to the robot.', 'success');
                  (useAppStore.getState() as { resetAll: () => void }).resetAll();
                }, 6000);
              } else {
                setTimeout(() => {
                  setIsUpdating(false);
                  showToast('Update failed. Check logs for details.', 'error');
                }, 500);
              }
            }
          }
        } catch {
          const logLine =
            typeof event.data === 'string' ? event.data.trim() : String(event.data).trim();
          if (logLine) {
            setUpdateLogs(prev => [...prev, logLine]);
          }
        }
      };

      ws.onerror = (error: Event) => {
        console.error('[UpdateWS] Error:', error);
      };

      ws.onclose = () => {
        const currentStatus = updatePollingRef.current?._lastStatus;
        if (currentStatus === 'in_progress' || currentStatus === 'pending') {
          setUpdateJobStatus('restarting');
          logSuccess('Update likely completed (daemon restarted, connection lost).');
          setTimeout(() => {
            setIsUpdating(false);
            showToast('Update completed! Please reconnect to the robot.', 'success');
            (useAppStore.getState() as { resetAll: () => void }).resetAll();
          }, 6000);
        }
        updatePollingRef.current = null;
      };

      updatePollingRef.current = ws;
    },
    [showToast]
  );

  useEffect(() => {
    return () => {
      if (updatePollingRef.current instanceof WebSocket) {
        updatePollingRef.current.close();
      }
    };
  }, []);

  const handleUpdateClick = useCallback((): void => {
    if (!updateInfo?.is_available || isUpdating) return;
    setShowUpdateConfirm(true);
  }, [updateInfo, isUpdating]);

  const confirmUpdate = useCallback(async (): Promise<void> => {
    if (!navigator.onLine) {
      console.warn('⚠️ No internet connection, cannot start update');
      showToast('No internet connection. Please check your network and try again.', 'warning');
      setShowUpdateConfirm(false);
      return;
    }

    setShowUpdateConfirm(false);
    setIsUpdating(true);

    try {
      const parkSuccess = await safelyParkRobot();
      if (!parkSuccess) {
        console.warn('[Update] Failed to park robot, continuing with update anyway');
      }

      if (isWifiMode) {
        let response = await fetchWithTimeout(
          buildApiUrl(`/update/start?pre_release=${preRelease}`),
          { method: 'POST' },
          DAEMON_CONFIG.TIMEOUTS.COMMAND,
          { label: 'Start update' }
        );

        // Daemons up to 1.9.0 gate /update/start on the same broken
        // pre-release lookup, so they refuse an RC that does exist. Install
        // the release tag directly: /update/start-from-ref has no such gate.
        if (!response.ok && preRelease && updateInfo?.available_version) {
          console.warn('[Update] Daemon refused the RC, retrying from the release tag');
          response = await fetchWithTimeout(
            // Every release is tagged "v<version>" on GitHub; a mismatch
            // surfaces as a failed install job in the log stream.
            buildApiUrl(`/update/start-from-ref?git_ref=v${updateInfo.available_version}`),
            { method: 'POST' },
            DAEMON_CONFIG.TIMEOUTS.COMMAND,
            { label: 'Start update from tag' }
          );
        }

        if (response.ok) {
          const data = await response.json();

          setUpdateJobId(data.job_id);
          setUpdateJobStatus('pending');
          setUpdateLogs([]);

          connectUpdateWebSocket(data.job_id);
        } else {
          const error = await response.json();
          setWifiError(`Update failed: ${error.detail || 'Unknown error'}`);
          setIsUpdating(false);
        }
      } else {
        await invoke('update_daemon', { preRelease });

        showToast('Daemon updated successfully! Reconnect to use the new version.', 'success');

        logSuccess('Daemon updated successfully! Reconnect to use the new version.');

        await new Promise(resolve => setTimeout(resolve, 2000));

        onClose();

        (useAppStore.getState() as { resetAll: () => void }).resetAll();
      }
    } catch (err) {
      console.error('Failed to start update:', err);

      const message = (err as { message?: string })?.message ?? '';
      const isNetworkError =
        message.toLowerCase().includes('network') ||
        message.toLowerCase().includes('timeout') ||
        message.toLowerCase().includes('connection') ||
        message.toLowerCase().includes('fetch');

      if (isNetworkError) {
        showToast('No internet connection. Please check your network and try again.', 'warning');
      } else {
        showToast(`Update failed: ${err}`, 'error');
      }

      setIsUpdating(false);
    }
    // safelyParkRobot is stable (defined in-scope), intentionally omitted from deps to preserve 1:1 behavior
  }, [
    isWifiMode,
    preRelease,
    updateInfo?.available_version,
    showToast,
    onClose,
    connectUpdateWebSocket,
  ]);

  const fetchWifiStatus = useCallback(async (): Promise<void> => {
    if (!isWifiMode) return;

    setIsLoadingWifi(true);
    setWifiError(null);

    try {
      const statusResponse = await fetchWithTimeout(
        buildApiUrl('/wifi/status'),
        {},
        DAEMON_CONFIG.TIMEOUTS.COMMAND,
        { label: 'WiFi status', silent: true }
      );

      if (statusResponse.ok) {
        const data = await statusResponse.json();
        setWifiStatus(data as WifiStatus);
      }

      const networksResponse = await fetchWithTimeout(
        buildApiUrl('/wifi/scan_and_list'),
        { method: 'POST' },
        DAEMON_CONFIG.TIMEOUTS.COMMAND * 2,
        { label: 'WiFi scan', silent: true }
      );

      if (networksResponse.ok) {
        const networks = await networksResponse.json();

        setAvailableNetworks(Array.isArray(networks) ? networks : []);
      } else {
        console.warn('[WiFi] Scan failed:', networksResponse.status);
      }
    } catch (err) {
      console.error('Failed to fetch WiFi status:', err);
      setWifiError('Failed to load WiFi configuration');
    } finally {
      setIsLoadingWifi(false);
    }
  }, [isWifiMode]);

  const handleClearAllNetworks = useCallback(async (): Promise<void> => {
    setIsClearingNetworks(true);

    try {
      const response = await fetchWithTimeout(
        buildApiUrl('/wifi/forget_all'),
        { method: 'POST' },
        DAEMON_CONFIG.TIMEOUTS.COMMAND * 2,
        { label: 'Clear all networks' }
      );

      if (response.ok) {
        setShowClearNetworksConfirm(false);
        onClose();

        setTimeout(() => {
          resetAll();
        }, 500);
      } else {
        const error = await response.json();
        showToast(`Failed: ${error.detail || 'Unknown error'}`, 'error');
        setIsClearingNetworks(false);
      }
    } catch (err) {
      console.error('Failed to clear networks:', err);
      showToast('Failed to clear networks', 'error');
      setIsClearingNetworks(false);
    }
  }, [onClose, showToast, resetAll]);

  const handleResetAppsClick = useCallback((): void => {
    setShowResetAppsConfirm(true);
  }, []);

  const confirmResetApps = useCallback(async (): Promise<void> => {
    setShowResetAppsConfirm(false);
    setIsResettingApps(true);

    try {
      const response = await fetchWithTimeout(
        buildApiUrl('/cache/reset-apps'),
        { method: 'POST' },
        DAEMON_CONFIG.TIMEOUTS.COMMAND,
        { label: 'Reset apps cache', silent: true }
      );

      if (response.ok) {
        const data = await response.json();
        clearApps();
        showToast(data.message || 'Apps cache reset successfully', 'success');
      } else {
        const error = await response.json();
        showToast(error.detail || 'Failed to reset apps cache', 'error');
      }
    } catch (err) {
      console.error('Failed to reset apps cache:', err);
      showToast('Connection error', 'error');
    } finally {
      setIsResettingApps(false);
    }
  }, [clearApps, showToast]);

  const handleResetAppsVenvClick = useCallback((): void => {
    setShowResetAppsVenvConfirm(true);
  }, []);
  void handleResetAppsVenvClick;

  const confirmResetAppsVenv = useCallback(async (): Promise<void> => {
    setShowResetAppsVenvConfirm(false);
    setIsResettingAppsVenv(true);
    try {
      await invoke('reset_apps_venv');
      showToast('Apps environment reset. Reconnecting...', 'success');
      onClose();
      setTimeout(() => resetAll(), 500);
    } catch (err) {
      showToast(`Failed to reset apps environment: ${err}`, 'error');
    } finally {
      setIsResettingAppsVenv(false);
    }
  }, [showToast, onClose, resetAll]);

  const handleResetPythonEnvClick = useCallback((): void => {
    setShowResetPythonEnvConfirm(true);
  }, []);
  void handleResetPythonEnvClick;

  const confirmResetPythonEnv = useCallback(async (): Promise<void> => {
    setShowResetPythonEnvConfirm(false);
    setIsResettingPythonEnv(true);
    try {
      await invoke('reset_python_env');
      showToast('Python environment reset. Reconnecting...', 'success');
      onClose();
      setTimeout(() => resetAll(), 500);
    } catch (err) {
      showToast(`Failed to reset Python environment: ${err}`, 'error');
    } finally {
      setIsResettingPythonEnv(false);
    }
  }, [showToast, onClose, resetAll]);

  const handleWifiConnect = useCallback((): void => {
    if (!selectedSSID || !wifiPassword) return;

    const ssid = selectedSSID;
    const password = wifiPassword;

    // Close the credentials form and surface the transition modal immediately.
    // The POST is fire-and-forget because the daemon's response is very likely
    // to be cut short when the robot tears down the current connection to join
    // the new SSID; we don't want to block the UI on a request that may never
    // complete. See ``WifiConnectingOverlay`` for the UX rationale.
    setShowChangeWifiOverlay(false);
    setIsConnecting(false);
    setWifiError(null);
    setWifiPassword('');
    setSelectedSSID('');
    setWifiConnectingTo(ssid);

    fetchWithTimeout(
      buildApiUrl(
        `/wifi/connect?ssid=${encodeURIComponent(ssid)}&password=${encodeURIComponent(password)}`
      ),
      { method: 'POST' },
      DAEMON_CONFIG.TIMEOUTS.COMMAND,
      { label: 'WiFi connect', silent: true }
    ).catch(err => {
      // Losing the link is expected (that's literally the point of the
      // overlay), so we swallow network errors and rely on the countdown to
      // hand the user back to the robot-selection screen.
      console.debug('[SettingsOverlay] /wifi/connect request ended (expected):', err);
    });
  }, [selectedSSID, wifiPassword]);

  const handleWifiConnectingTimeout = useCallback((): void => {
    // Drop the WiFi transition overlay, close the settings modal and wipe the
    // store so ``useViewRouter`` falls back to ``FindingRobotView``.
    setWifiConnectingTo(null);
    onClose();
    setTimeout(() => resetAll(), 250);
  }, [onClose, resetAll]);

  useEffect(() => {
    if (open) {
      checkForUpdate();
      if (isWifiMode) {
        fetchWifiStatus();
      }
    }
  }, [open, isWifiMode, checkForUpdate, fetchWifiStatus]);

  useEffect(() => {
    if (!open || !isWifiMode) return;

    const interval = setInterval(() => {
      fetchWifiStatus();
    }, 3000);

    return () => clearInterval(interval);
  }, [open, isWifiMode, fetchWifiStatus]);

  useEffect(() => {
    if (open) {
      checkForUpdate();
    }
  }, [preRelease]); // eslint-disable-line react-hooks/exhaustive-deps

  const textSecondary = palette.textSecondary;

  const inputStyles = {
    '& .MuiOutlinedInput-root': {
      bgcolor: palette.isDark ? whiteAlpha(0.04) : blackAlpha(0.02),
      borderRadius: RADIUS.lg,
      '& fieldset': {
        borderColor: palette.border,
      },
      '&:hover fieldset': {
        borderColor: palette.borderStrong,
      },
      '&.Mui-focused fieldset': {
        borderColor: 'primary.main',
        borderWidth: 1,
      },
    },
    '& .MuiInputLabel-root': {
      color: textSecondary,
      fontSize: TYPO.body,
      '&.Mui-focused': {
        color: 'primary.main',
      },
    },
    '& .MuiInputBase-input': {
      color: textPrimary,
      fontSize: TYPO.body,
    },
    '& .MuiSelect-icon': {
      color: textMuted,
    },
  };
  void inputStyles;

  const buttonStyle = {
    color: 'primary.main',
    borderColor: 'primary.main',
    textTransform: 'none' as const,
    '&:hover': {
      borderColor: 'primary.dark',
      // TODO(style-migration): `rgba(99, 102, 241, 0.08)` is an indigo tint
      // that doesn't match the app accent. Kept verbatim pending clarification.
      bgcolor: 'rgba(99, 102, 241, 0.08)',
    },
    '&:disabled': {
      borderColor: palette.border,
      color: palette.textDisabled,
    },
  };

  const cardStyle = {
    p: 2.5,
    borderRadius: RADIUS.xxl,
    bgcolor: palette.isDark ? whiteAlpha(0.03) : 'rgba(255, 255, 255, 0.8)',
    border: `1px solid ${palette.isDark ? whiteAlpha(0.06) : blackAlpha(0.06)}`,
    backdropFilter: BLUR.md,
  };

  const handleOverlayClose = useCallback((): void => {
    if (isUpdating && !isWifiMode) {
      return;
    }
    onClose();
  }, [isUpdating, isWifiMode, onClose]);

  return (
    <FullscreenOverlay
      open={open}
      onClose={handleOverlayClose}
      darkMode={palette.isDark}
      zIndex={10001}
      centeredX={true}
      debugName="Settings"
      centeredY={true}
      showCloseButton={true}
    >
      <Box
        sx={{
          width: '100%',
          maxHeight: '85vh',
          overflowY: 'auto',
          ...scrollbarSx(palette, { thumb: palette.borderStrong }),
        }}
      >
        <Box
          sx={{
            width: '90%',
            maxWidth: '680px',
            mx: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              pb: 1,
            }}
          >
            <Typography
              sx={{
                fontSize: TYPO.xxl,
                fontWeight: FONT_WEIGHT.bold,
                color: textPrimary,
                letterSpacing: '-0.3px',
              }}
            >
              Settings
            </Typography>
            {connectionMode && (
              <Typography
                sx={{
                  fontSize: TYPO.xs,
                  fontWeight: FONT_WEIGHT.semibold,
                  color: textMuted,
                  bgcolor: palette.isDark ? whiteAlpha(0.05) : blackAlpha(0.05),
                  px: 1,
                  py: 0.25,
                  borderRadius: RADIUS.xs,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                {connectionMode === 'wifi'
                  ? 'Reachy WiFi'
                  : connectionMode === 'simulation'
                    ? 'Simulation'
                    : 'USB'}
              </Typography>
            )}
            {isWifiMode && remoteHost && (
              <Typography
                sx={{
                  fontSize: TYPO.xs,
                  color: textMuted,
                  fontFamily: 'monospace',
                }}
              >
                {remoteHost}
              </Typography>
            )}
          </Box>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 2,
            }}
          >
            <SettingsUpdateCard
              darkMode={palette.isDark}
              title={isWifiMode ? 'System Update' : 'Daemon Update'}
              updateInfo={updateInfo}
              isCheckingUpdate={isCheckingUpdate}
              isUpdating={isUpdating}
              preRelease={preRelease}
              onPreReleaseChange={setPreRelease}
              onCheckUpdate={checkForUpdate}
              onUpdateClick={handleUpdateClick}
              cardStyle={cardStyle}
              buttonStyle={buttonStyle}
              isOnline={navigator.onLine}
            />

            {isWifiMode ? (
              <SettingsWifiCard
                darkMode={palette.isDark}
                wifiStatus={wifiStatus}
                isLoadingWifi={isLoadingWifi}
                onRefresh={fetchWifiStatus}
                onChangeNetwork={() => setShowChangeWifiOverlay(true)}
                onClearAllNetworks={() => setShowClearNetworksConfirm(true)}
                cardStyle={cardStyle}
              />
            ) : (
              <SettingsDaemonCard darkMode={palette.isDark} cardStyle={cardStyle} />
            )}

            <SettingsPreferencesCard darkMode={palette.isDark} cardStyle={cardStyle} />

            {isWifiMode ? (
              <SettingsDaemonCard darkMode={palette.isDark} cardStyle={cardStyle} />
            ) : (
              <SettingsCacheCard
                darkMode={palette.isDark}
                cardStyle={cardStyle}
                buttonStyle={buttonStyle}
                onResetAppsClick={handleResetAppsClick}
                isResettingApps={isResettingApps}
              />
            )}

            {isWifiMode && (
              <SettingsCacheCard
                darkMode={palette.isDark}
                cardStyle={cardStyle}
                buttonStyle={buttonStyle}
                onResetAppsClick={handleResetAppsClick}
                isResettingApps={isResettingApps}
              />
            )}
          </Box>
        </Box>
      </Box>

      <FullscreenOverlay
        open={showUpdateConfirm}
        onClose={() => setShowUpdateConfirm(false)}
        darkMode={palette.isDark}
        zIndex={10003}
        backdropOpacity={0.85}
        debugName="UpdateConfirm"
        backdropBlur={12}
      >
        <Box
          sx={{
            width: '100%',
            maxWidth: 380,
            mx: 'auto',
            px: 3,
            textAlign: 'center',
          }}
        >
          <Box sx={{ mb: 3 }}>
            <img
              src={reachyUpdateBoxSvg}
              alt="Reachy Update"
              style={{
                width: 140,
                height: 140,
              }}
            />
          </Box>

          <Typography
            variant="h5"
            sx={{
              fontWeight: FONT_WEIGHT.semibold,
              color: 'text.primary',
              mb: 2,
            }}
          >
            Start Update?
          </Typography>

          <Typography
            sx={{
              color: 'text.secondary',
              fontSize: TYPO.md,
              lineHeight: 1.6,
              mb: 4,
            }}
          >
            Update to{' '}
            <strong style={{ color: palette.textPrimary }}>{updateInfo?.available_version}</strong>
            <br />
            <br />
            {isWifiMode ? (
              <>
                The robot will restart and you will be{' '}
                <strong style={{ color: palette.textPrimary }}>disconnected</strong>.
                <br />
                Reconnect after ~2 minutes when complete.
              </>
            ) : (
              <>
                The daemon will restart automatically.
                <br />
                This will take{' '}
                <strong style={{ color: palette.textPrimary }}>
                  between 30 seconds and 5 minutes
                </strong>
                .
              </>
            )}
          </Typography>

          {isWifiMode && (
            <Box
              sx={{
                mb: 4,
                p: 2,
                borderRadius: RADIUS.xl,
                bgcolor: palette.isDark ? accentAlpha(0.15) : accentAlpha(0.1),
                border: `1px solid ${palette.isDark ? accentAlpha(0.3) : accentAlpha(0.2)}`,
                textAlign: 'center',
              }}
            >
              <Typography
                sx={{
                  fontSize: TYPO.body,
                  fontWeight: FONT_WEIGHT.semibold,
                  color: palette.isDark ? ACCENT.light : ACCENT.dark,
                  mb: 0.5,
                }}
              >
                Important
              </Typography>
              <Typography
                sx={{
                  fontSize: TYPO.sm,
                  color: palette.isDark ? ACCENT.light : ACCENT.dark,
                  lineHeight: 1.5,
                }}
              >
                Make sure your robot is <strong>plugged into a power outlet</strong> during the
                update. <strong>Losing power during update can brick your robot</strong>.
              </Typography>
            </Box>
          )}

          <Box sx={{ display: 'flex', gap: 3, justifyContent: 'center', alignItems: 'center' }}>
            <Button
              onClick={() => setShowUpdateConfirm(false)}
              variant="text"
              sx={{
                color: 'text.secondary',
                textTransform: 'none',
                textDecoration: 'underline',
                textUnderlineOffset: '3px',
                '&:hover': {
                  bgcolor: 'transparent',
                  textDecoration: 'underline',
                },
              }}
            >
              Cancel
            </Button>
            <PulseButton onClick={confirmUpdate} darkMode={palette.isDark} sx={{ minWidth: 160 }}>
              Update now
            </PulseButton>
          </Box>
        </Box>
      </FullscreenOverlay>

      <FullscreenOverlay
        open={showClearNetworksConfirm}
        onClose={() => setShowClearNetworksConfirm(false)}
        darkMode={palette.isDark}
        zIndex={10003}
        backdropOpacity={0.85}
        debugName="ClearNetworksConfirm"
        backdropBlur={12}
      >
        <Box
          sx={{
            width: '100%',
            maxWidth: 380,
            mx: 'auto',
            px: 3,
            textAlign: 'center',
          }}
        >
          <Box
            sx={{
              mb: 3,
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <Box
              sx={{
                width: 80,
                height: 80,
                borderRadius: RADIUS.circle,
                bgcolor: palette.isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)',
                border: `2px solid ${palette.isDark ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.2)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ErrorOutlineIcon sx={{ fontSize: TYPO.hero, color: STATUS.error }} />
            </Box>
          </Box>

          <Typography
            variant="h5"
            sx={{
              fontWeight: FONT_WEIGHT.semibold,
              color: 'text.primary',
              mb: 2,
            }}
          >
            Clear All Networks?
          </Typography>

          <Typography
            sx={{
              color: 'text.secondary',
              fontSize: TYPO.md,
              lineHeight: 1.6,
              mb: 3,
            }}
          >
            This will forget all saved WiFi networks on your robot.
          </Typography>

          <Box
            sx={{
              mb: 4,
              p: 2,
              borderRadius: RADIUS.xl,
              bgcolor: palette.isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)',
              border: `1px solid ${palette.isDark ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.2)'}`,
              textAlign: 'center',
            }}
          >
            <Typography
              sx={{
                fontSize: TYPO.body,
                fontWeight: FONT_WEIGHT.semibold,
                color: palette.statusErrorText,
                mb: 0.5,
              }}
            >
              You will be disconnected
            </Typography>
            <Typography
              sx={{
                fontSize: TYPO.sm,
                color: palette.statusErrorText,
                lineHeight: 1.5,
                mb: 1,
              }}
            >
              The robot will switch to <strong>Hotspot mode</strong>.<br />
              Reconnect via <strong>reachy-mini-ap</strong> network.
            </Typography>
            <Typography
              sx={{
                fontSize: TYPO.xs,
                color: palette.isDark ? 'rgba(252, 165, 165, 0.7)' : 'rgba(220, 38, 38, 0.7)',
                lineHeight: 1.5,
                fontStyle: 'italic',
              }}
            >
              If the robot doesn't appear, try restarting it.
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', gap: 3, justifyContent: 'center', alignItems: 'center' }}>
            <Button
              onClick={() => setShowClearNetworksConfirm(false)}
              variant="text"
              disabled={isClearingNetworks}
              sx={{
                color: 'text.secondary',
                textTransform: 'none',
                textDecoration: 'underline',
                textUnderlineOffset: '3px',
                '&:hover': {
                  bgcolor: 'transparent',
                  textDecoration: 'underline',
                },
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleClearAllNetworks}
              variant="contained"
              disabled={isClearingNetworks}
              sx={{
                minWidth: 160,
                bgcolor: STATUS.error,
                color: '#fff',
                textTransform: 'none',
                fontWeight: FONT_WEIGHT.semibold,
                '&:hover': {
                  bgcolor: DANGER.dark,
                },
                '&:disabled': {
                  bgcolor: palette.isDark ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.5)',
                  color: palette.isDark ? whiteAlpha(0.5) : whiteAlpha(0.8),
                },
              }}
            >
              {isClearingNetworks ? (
                <CircularProgress size={20} sx={{ color: 'inherit' }} />
              ) : (
                'Clear all'
              )}
            </Button>
          </Box>
        </Box>
      </FullscreenOverlay>

      <FullscreenOverlay
        open={showResetAppsConfirm}
        onClose={() => setShowResetAppsConfirm(false)}
        darkMode={palette.isDark}
        zIndex={10003}
        backdropOpacity={0.85}
        debugName="ResetAppsConfirm"
        backdropBlur={12}
      >
        <Box
          sx={{
            width: '100%',
            maxWidth: 380,
            mx: 'auto',
            px: 3,
            textAlign: 'center',
          }}
        >
          <Box
            sx={{
              mb: 3,
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <Box
              sx={{
                width: 80,
                height: 80,
                borderRadius: RADIUS.circle,
                bgcolor: palette.isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)',
                border: `2px solid ${palette.isDark ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.2)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ErrorOutlineIcon sx={{ fontSize: TYPO.hero, color: STATUS.error }} />
            </Box>
          </Box>

          <Typography
            variant="h5"
            sx={{
              fontWeight: FONT_WEIGHT.semibold,
              color: 'text.primary',
              mb: 2,
            }}
          >
            Reset Apps Cache?
          </Typography>

          <Typography
            sx={{
              color: 'text.secondary',
              fontSize: TYPO.md,
              lineHeight: 1.6,
              mb: 3,
            }}
          >
            This will{' '}
            <strong style={{ color: palette.textPrimary }}>
              remove all installed applications
            </strong>{' '}
            from the robot. You will need to reinstall them individually from the app store.
          </Typography>

          <Box sx={{ display: 'flex', gap: 3, justifyContent: 'center', alignItems: 'center' }}>
            <Button
              onClick={() => setShowResetAppsConfirm(false)}
              variant="text"
              sx={{
                color: 'text.secondary',
                textTransform: 'none',
                textDecoration: 'underline',
                textUnderlineOffset: '3px',
                '&:hover': {
                  bgcolor: 'transparent',
                  textDecoration: 'underline',
                },
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmResetApps}
              variant="contained"
              disabled={isResettingApps}
              sx={{
                minWidth: 160,
                bgcolor: STATUS.error,
                color: '#fff',
                textTransform: 'none',
                fontWeight: FONT_WEIGHT.semibold,
                '&:hover': {
                  bgcolor: DANGER.dark,
                },
                '&:disabled': {
                  bgcolor: palette.isDark ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.5)',
                  color: palette.isDark ? whiteAlpha(0.5) : whiteAlpha(0.8),
                },
              }}
            >
              Reset all apps
            </Button>
          </Box>
        </Box>
      </FullscreenOverlay>

      <FullscreenOverlay
        open={showResetAppsVenvConfirm}
        onClose={() => setShowResetAppsVenvConfirm(false)}
        darkMode={palette.isDark}
        zIndex={10003}
        backdropOpacity={0.85}
        debugName="ResetAppsVenvConfirm"
        backdropBlur={12}
      >
        <Box sx={{ width: '100%', maxWidth: 380, mx: 'auto', px: 3, textAlign: 'center' }}>
          <Box sx={{ mb: 3, display: 'flex', justifyContent: 'center' }}>
            <Box
              sx={{
                width: 80,
                height: 80,
                borderRadius: RADIUS.circle,
                bgcolor: palette.isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)',
                border: `2px solid ${palette.isDark ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.2)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ErrorOutlineIcon sx={{ fontSize: TYPO.hero, color: STATUS.error }} />
            </Box>
          </Box>
          <Typography
            variant="h5"
            sx={{ fontWeight: FONT_WEIGHT.semibold, color: 'text.primary', mb: 2 }}
          >
            Reset Apps Environment?
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: TYPO.md, lineHeight: 1.6, mb: 3 }}>
            This will{' '}
            <strong style={{ color: palette.textPrimary }}>
              delete the apps virtual environment
            </strong>
            . All installed apps will need to be reinstalled. The daemon will restart.
          </Typography>
          <Box sx={{ display: 'flex', gap: 3, justifyContent: 'center', alignItems: 'center' }}>
            <Button
              onClick={() => setShowResetAppsVenvConfirm(false)}
              variant="text"
              sx={{
                color: 'text.secondary',
                textTransform: 'none',
                textDecoration: 'underline',
                textUnderlineOffset: '3px',
                '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' },
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmResetAppsVenv}
              variant="contained"
              disabled={isResettingAppsVenv}
              sx={{
                minWidth: 160,
                bgcolor: STATUS.error,
                color: '#fff',
                textTransform: 'none',
                fontWeight: FONT_WEIGHT.semibold,
                '&:hover': { bgcolor: DANGER.dark },
                '&:disabled': {
                  bgcolor: palette.isDark ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.5)',
                  color: palette.isDark ? whiteAlpha(0.5) : whiteAlpha(0.8),
                },
              }}
            >
              {isResettingAppsVenv ? (
                <CircularProgress size={20} sx={{ color: 'inherit' }} />
              ) : (
                'Reset apps environment'
              )}
            </Button>
          </Box>
        </Box>
      </FullscreenOverlay>

      <FullscreenOverlay
        open={showResetPythonEnvConfirm}
        onClose={() => setShowResetPythonEnvConfirm(false)}
        darkMode={palette.isDark}
        zIndex={10003}
        backdropOpacity={0.85}
        debugName="ResetPythonEnvConfirm"
        backdropBlur={12}
      >
        <Box sx={{ width: '100%', maxWidth: 380, mx: 'auto', px: 3, textAlign: 'center' }}>
          <Box sx={{ mb: 3, display: 'flex', justifyContent: 'center' }}>
            <Box
              sx={{
                width: 80,
                height: 80,
                borderRadius: RADIUS.circle,
                bgcolor: palette.isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)',
                border: `2px solid ${palette.isDark ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.2)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ErrorOutlineIcon sx={{ fontSize: TYPO.hero, color: STATUS.error }} />
            </Box>
          </Box>
          <Typography
            variant="h5"
            sx={{ fontWeight: FONT_WEIGHT.semibold, color: 'text.primary', mb: 2 }}
          >
            Full Environment Reset?
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: TYPO.md, lineHeight: 1.6, mb: 2 }}>
            This will{' '}
            <strong style={{ color: palette.textPrimary }}>
              delete all Python files, virtual environments, and the package manager
            </strong>
            . Everything will be re-downloaded on next connection.
          </Typography>
          <Typography
            sx={{
              color: STATUS.error,
              fontSize: TYPO.body,
              fontWeight: FONT_WEIGHT.medium,
              mb: 3,
              p: 1.5,
              borderRadius: RADIUS.md,
              bgcolor: palette.isDark ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.05)',
              border: `1px solid ${palette.isDark ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.15)'}`,
            }}
          >
            This will require a full re-setup which may take a few minutes.
          </Typography>
          <Box sx={{ display: 'flex', gap: 3, justifyContent: 'center', alignItems: 'center' }}>
            <Button
              onClick={() => setShowResetPythonEnvConfirm(false)}
              variant="text"
              sx={{
                color: 'text.secondary',
                textTransform: 'none',
                textDecoration: 'underline',
                textUnderlineOffset: '3px',
                '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' },
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmResetPythonEnv}
              variant="contained"
              disabled={isResettingPythonEnv}
              sx={{
                minWidth: 160,
                bgcolor: STATUS.error,
                color: '#fff',
                textTransform: 'none',
                fontWeight: FONT_WEIGHT.semibold,
                '&:hover': { bgcolor: DANGER.dark },
                '&:disabled': {
                  bgcolor: palette.isDark ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.5)',
                  color: palette.isDark ? whiteAlpha(0.5) : whiteAlpha(0.8),
                },
              }}
            >
              {isResettingPythonEnv ? (
                <CircularProgress size={20} sx={{ color: 'inherit' }} />
              ) : (
                'Reset everything'
              )}
            </Button>
          </Box>
        </Box>
      </FullscreenOverlay>

      <ChangeWifiOverlay
        open={showChangeWifiOverlay}
        onClose={() => {
          setShowChangeWifiOverlay(false);
          setSelectedSSID('');
          setWifiPassword('');
          setWifiError(null);
        }}
        darkMode={palette.isDark}
        wifiStatus={wifiStatus}
        availableNetworks={availableNetworks}
        selectedSSID={selectedSSID}
        wifiPassword={wifiPassword}
        isConnecting={isConnecting}
        wifiError={wifiError}
        onSSIDChange={setSelectedSSID}
        onPasswordChange={setWifiPassword}
        onConnect={handleWifiConnect}
        onRefresh={fetchWifiStatus}
      />

      <WifiConnectingOverlay
        open={wifiConnectingTo !== null}
        targetSsid={wifiConnectingTo ?? ''}
        darkMode={palette.isDark}
        onTimeout={handleWifiConnectingTimeout}
      />

      {isWifiMode && updateJobId && (
        <FullscreenOverlay
          open={isUpdating}
          onClose={() => {}}
          darkMode={palette.isDark}
          zIndex={10004}
          backdropOpacity={0.95}
          debugName="UpdateProgress"
          backdropBlur={16}
        >
          <Box
            sx={{
              width: '100%',
              maxWidth: 600,
              mx: 'auto',
              px: 3,
            }}
          >
            <Box
              sx={{
                mb: 3,
                display: 'flex',
                justifyContent: 'center',
              }}
            >
              <Box
                sx={{
                  width: 80,
                  height: 80,
                  borderRadius: RADIUS.circle,
                  bgcolor: palette.isDark ? accentAlpha(0.15) : accentAlpha(0.1),
                  border: `2px solid ${palette.isDark ? accentAlpha(0.3) : accentAlpha(0.2)}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                }}
              >
                {updateJobStatus === 'done' ? (
                  <CheckCircleOutlinedIcon sx={{ fontSize: TYPO.hero, color: STATUS.success }} />
                ) : updateJobStatus === 'failed' ? (
                  <ErrorOutlineIcon sx={{ fontSize: TYPO.hero, color: STATUS.error }} />
                ) : updateJobStatus === 'restarting' ? (
                  <CircularProgress size={32} thickness={3} sx={{ color: STATUS.success }} />
                ) : (
                  <CircularProgress size={32} thickness={3} sx={{ color: ACCENT.main }} />
                )}
              </Box>
            </Box>

            <Typography
              variant="h5"
              sx={{
                fontWeight: FONT_WEIGHT.semibold,
                color: 'text.primary',
                mb: 1,
                textAlign: 'center',
              }}
            >
              {updateJobStatus === 'done'
                ? 'Update Completed!'
                : updateJobStatus === 'failed'
                  ? 'Update Failed'
                  : updateJobStatus === 'restarting'
                    ? 'Restarting Robot...'
                    : 'Updating...'}
            </Typography>

            <Typography
              sx={{
                color: 'text.secondary',
                fontSize: TYPO.md,
                lineHeight: 1.6,
                mb: 3,
                textAlign: 'center',
              }}
            >
              {updateJobStatus === 'done'
                ? 'The update has been installed successfully.'
                : updateJobStatus === 'failed'
                  ? 'An error occurred during the update.'
                  : updateJobStatus === 'restarting'
                    ? 'Update installed! The robot is restarting to apply changes...'
                    : 'Installing the new version. This may take a few minutes...'}
            </Typography>

            <Box
              ref={(el: HTMLDivElement | null) => {
                if (el) el.scrollTop = el.scrollHeight;
              }}
              sx={{
                mb: 3,
                p: 2,
                borderRadius: RADIUS.xl,
                bgcolor: palette.isDark ? blackAlpha(0.3) : blackAlpha(0.05),
                border: `1px solid ${palette.border}`,
                height: 220,
                overflowY: 'auto',
                fontFamily: 'monospace',
                fontSize: TYPO.sm,
                lineHeight: 1.6,
                color: palette.textSecondary,
                ...scrollbarSx(palette, {
                  width: 8,
                  radius: 4,
                  thumb: palette.isDark ? whiteAlpha(0.2) : blackAlpha(0.2),
                  thumbHover: palette.isDark ? whiteAlpha(0.3) : blackAlpha(0.3),
                  track: palette.isDark ? whiteAlpha(0.05) : blackAlpha(0.05),
                }),
              }}
            >
              {updateLogs.length > 0 ? (
                updateLogs.map((log, index) => (
                  <Box key={index} component="div" sx={{ mb: 0.5 }}>
                    {log}
                  </Box>
                ))
              ) : (
                <Box sx={{ textAlign: 'center', color: 'text.secondary', py: 2 }}>
                  Waiting for logs...
                </Box>
              )}
            </Box>

            {updateJobStatus !== 'done' &&
              updateJobStatus !== 'failed' &&
              updateJobStatus !== 'restarting' && (
                <Box
                  sx={{
                    p: 2,
                    borderRadius: RADIUS.xl,
                    bgcolor: palette.isDark
                      ? 'rgba(251, 191, 36, 0.15)'
                      : 'rgba(251, 191, 36, 0.1)',
                    border: `1px solid ${palette.isDark ? 'rgba(251, 191, 36, 0.3)' : 'rgba(251, 191, 36, 0.2)'}`,
                    textAlign: 'center',
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: TYPO.body,
                      fontWeight: FONT_WEIGHT.semibold,
                      color: palette.isDark ? '#fbbf24' : '#d97706',
                      mb: 0.5,
                    }}
                  >
                    Please Wait
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: TYPO.sm,
                      color: palette.isDark ? '#fbbf24' : '#d97706',
                      lineHeight: 1.5,
                    }}
                  >
                    Do not close this window or disconnect power during the update.
                  </Typography>
                </Box>
              )}
          </Box>
        </FullscreenOverlay>
      )}
    </FullscreenOverlay>
  );
}
