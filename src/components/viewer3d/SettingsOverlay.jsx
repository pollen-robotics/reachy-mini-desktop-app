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

// Sub-components
import {
  SettingsUpdateCard,
  SettingsWifiCard,
  SettingsPreferencesCard,
  SettingsCacheCard,
  SettingsDaemonCard,
  ChangeWifiOverlay,
} from './settings';

/**
 * Settings Overlay for 3D Viewer Configuration
 */
export default function SettingsOverlay({ open, onClose, darkMode }) {
  const { connectionMode, remoteHost, robotStatus, blacklistRobot, resetAll, clearApps } =
    useAppStore();
  const isWifiMode = connectionMode === 'wifi';

  // Helper to safely park the robot (sleep + disable motors) before update
  const safelyParkRobot = async () => {
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

  // Text colors
  const textPrimary = darkMode ? '#f5f5f5' : '#333';
  const textMuted = darkMode ? '#666' : '#999';

  // ═══════════════════════════════════════════════════════════════════
  // UPDATE STATE
  // ═══════════════════════════════════════════════════════════════════
  const [updateInfo, setUpdateInfo] = useState(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // Update job tracking (WiFi mode)
  const [updateJobId, setUpdateJobId] = useState(null);
  const [updateJobStatus, setUpdateJobStatus] = useState(null); // 'pending' | 'in_progress' | 'done' | 'failed' | 'restarting'
  const [updateLogs, setUpdateLogs] = useState([]);
  const updatePollingRef = useRef(null);

  // Read initial preRelease preference from localStorage
  const getInitialPreRelease = () => {
    try {
      const stored = localStorage.getItem('preReleaseUpdates');
      return stored ? JSON.parse(stored) : false;
    } catch {
      return false;
    }
  };

  const [preRelease, setPreReleaseState] = useState(getInitialPreRelease);

  // Wrapper to persist preRelease changes
  const setPreRelease = value => {
    try {
      localStorage.setItem('preReleaseUpdates', JSON.stringify(value));
    } catch (e) {
      console.error('Failed to save preRelease preference:', e);
    }
    setPreReleaseState(value);
  };

  // ═══════════════════════════════════════════════════════════════════
  // WIFI STATE
  // ═══════════════════════════════════════════════════════════════════
  const [wifiStatus, setWifiStatus] = useState(null);
  const [availableNetworks, setAvailableNetworks] = useState([]);
  const [isLoadingWifi, setIsLoadingWifi] = useState(false);
  const [selectedSSID, setSelectedSSID] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [wifiError, setWifiError] = useState(null);

  // ═══════════════════════════════════════════════════════════════════
  // CONFIRMATION DIALOGS
  // ═══════════════════════════════════════════════════════════════════
  const [showUpdateConfirm, setShowUpdateConfirm] = useState(false);
  const [showChangeWifiOverlay, setShowChangeWifiOverlay] = useState(false);
  const [showClearNetworksConfirm, setShowClearNetworksConfirm] = useState(false);
  const [isClearingNetworks, setIsClearingNetworks] = useState(false);
  const [showResetAppsConfirm, setShowResetAppsConfirm] = useState(false);
  const [isResettingApps, setIsResettingApps] = useState(false);
  const [showResetAppsVenvConfirm, setShowResetAppsVenvConfirm] = useState(false);
  const [isResettingAppsVenv, setIsResettingAppsVenv] = useState(false);
  const [showResetPythonEnvConfirm, setShowResetPythonEnvConfirm] = useState(false);
  const [isResettingPythonEnv, setIsResettingPythonEnv] = useState(false);

  // ═══════════════════════════════════════════════════════════════════
  // TOAST NOTIFICATIONS (global - rendered in App.jsx)
  // ═══════════════════════════════════════════════════════════════════
  const { showToast } = useToast();

  // ═══════════════════════════════════════════════════════════════════
  // UPDATE FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════

  const checkForUpdate = useCallback(async () => {
    // Check network status first
    if (!navigator.onLine) {
      console.warn('⚠️ No internet connection, cannot check for updates');
      showToast('No internet connection. Please check your network and try again.', 'warning');
      return;
    }

    setIsCheckingUpdate(true);
    setUpdateInfo(null);

    try {
      if (isWifiMode) {
        // WiFi mode: Use daemon API
        const response = await fetchWithTimeout(
          buildApiUrl(`/update/available?pre_release=${preRelease}`),
          {},
          DAEMON_CONFIG.TIMEOUTS.COMMAND,
          { label: 'Check update', silent: true }
        );

        if (response.ok) {
          const data = await response.json();
          setUpdateInfo(data.update?.reachy_mini || null);
        }
      } else {
        // USB/Simulation mode: Use Tauri command (requires internet to check PyPI)
        const data = await invoke('check_daemon_update', { preRelease });
        setUpdateInfo(data);
      }
    } catch (err) {
      console.error('Failed to check for updates:', err);
      // Check if it's a network error
      const isNetworkError =
        err.message?.toLowerCase().includes('network') ||
        err.message?.toLowerCase().includes('timeout') ||
        err.message?.toLowerCase().includes('connection') ||
        err.message?.toLowerCase().includes('fetch');

      if (isNetworkError) {
        showToast('No internet connection. Please check your network and try again.', 'warning');
      } else {
        showToast('Failed to check for updates', 'error');
      }
    } finally {
      setIsCheckingUpdate(false);
    }
  }, [isWifiMode, preRelease, showToast]);

  // Connect to update job WebSocket (WiFi mode)
  const connectUpdateWebSocket = useCallback(
    jobId => {
      const wsUrl = `${getWsBaseUrl()}/update/ws/logs?job_id=${jobId}`;

      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {};
      ws._lastStatus = 'pending'; // Track status for onclose handler

      ws.onmessage = event => {
        try {
          // Try to parse as JSON (final status message)
          const data = JSON.parse(event.data);

          if (data.status) {
            ws._lastStatus = data.status; // Track for onclose handler
            setUpdateJobStatus(data.status);

            // Add new logs if present
            if (data.logs && Array.isArray(data.logs)) {
              setUpdateLogs(prev => [...prev, ...data.logs]);
            }

            // Job is done
            if (data.status === 'done' || data.status === 'failed') {
              ws.close();

              if (data.status === 'done') {
                // ✅ Update successful - daemon will restart
                // Keep overlay visible and show "restarting" status

                setUpdateJobStatus('restarting');
                logSuccess('Update completed successfully!');

                // Wait for daemon restart (takes ~5-10 seconds typically)
                // Then reset to force reconnection
                setTimeout(() => {
                  setIsUpdating(false);
                  showToast('Update completed! Please reconnect to the robot.', 'success');
                  useAppStore.getState().resetAll();
                }, 6000); // 6 seconds to allow daemon to restart
              } else {
                // ✅ Update failed - show error immediately
                setTimeout(() => {
                  setIsUpdating(false);
                  showToast('Update failed. Check logs for details.', 'error');
                }, 500);
              }
            }
          }
        } catch (err) {
          // Not JSON, probably a log line
          const logLine = event.data.trim();
          if (logLine) {
            setUpdateLogs(prev => [...prev, logLine]);
          }
        }
      };

      ws.onerror = error => {
        console.error('[UpdateWS] Error:', error);
      };

      ws.onclose = event => {
        // If WebSocket closes while update was in progress (not after 'done'/'failed'),
        // it likely means the daemon restarted after a successful update.
        // Treat this as update success to avoid the UI getting stuck on "Updating".
        const currentStatus = updatePollingRef.current?._lastStatus;
        if (currentStatus === 'in_progress' || currentStatus === 'pending') {
          setUpdateJobStatus('restarting');
          logSuccess('Update likely completed (daemon restarted, connection lost).');
          setTimeout(() => {
            setIsUpdating(false);
            showToast('Update completed! Please reconnect to the robot.', 'success');
            useAppStore.getState().resetAll();
          }, 6000);
        }
        updatePollingRef.current = null;
      };

      updatePollingRef.current = ws;
    },
    [showToast]
  );

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      if (updatePollingRef.current instanceof WebSocket) {
        updatePollingRef.current.close();
      }
    };
  }, []);

  // Open update confirmation dialog
  const handleUpdateClick = useCallback(() => {
    if (!updateInfo?.is_available || isUpdating) return;
    setShowUpdateConfirm(true);
  }, [updateInfo, isUpdating]);

  // Actually start the update after confirmation
  const confirmUpdate = useCallback(async () => {
    // Check network status first
    if (!navigator.onLine) {
      console.warn('⚠️ No internet connection, cannot start update');
      showToast('No internet connection. Please check your network and try again.', 'warning');
      setShowUpdateConfirm(false);
      return;
    }

    setShowUpdateConfirm(false);
    setIsUpdating(true);

    try {
      // Park the robot safely before update (sleep animation + disable motors)
      const parkSuccess = await safelyParkRobot();
      if (!parkSuccess) {
        console.warn('[Update] Failed to park robot, continuing with update anyway');
      }

      if (isWifiMode) {
        // WiFi mode: Use daemon API with WebSocket for logs
        const response = await fetchWithTimeout(
          buildApiUrl(`/update/start?pre_release=${preRelease}`),
          { method: 'POST' },
          DAEMON_CONFIG.TIMEOUTS.COMMAND,
          { label: 'Start update' }
        );

        if (response.ok) {
          const data = await response.json();

          // Start tracking the update job
          setUpdateJobId(data.job_id);
          setUpdateJobStatus('pending');
          setUpdateLogs([]);

          // NOTE: Do NOT close settings overlay - the update progress overlay
          // is displayed INSIDE it with higher z-index (10004)

          // Connect to WebSocket for real-time logs
          connectUpdateWebSocket(data.job_id);
        } else {
          const error = await response.json();
          setWifiError(`Update failed: ${error.detail || 'Unknown error'}`);
          setIsUpdating(false);
        }
      } else {
        // USB/Simulation mode: Use Tauri command
        await invoke('update_daemon', { preRelease });

        // Show success toast
        showToast('Daemon updated successfully! Reconnect to use the new version.', 'success');

        // Also log for developers
        logSuccess('Daemon updated successfully! Reconnect to use the new version.');

        // Give user time to see the toast (2 seconds)
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Close overlay
        onClose();

        // Disconnect and return to selection view

        useAppStore.getState().resetAll();
      }
    } catch (err) {
      console.error('Failed to start update:', err);

      // Check if it's a network error
      const isNetworkError =
        err.message?.toLowerCase().includes('network') ||
        err.message?.toLowerCase().includes('timeout') ||
        err.message?.toLowerCase().includes('connection') ||
        err.message?.toLowerCase().includes('fetch');

      if (isNetworkError) {
        showToast('No internet connection. Please check your network and try again.', 'warning');
      } else {
        showToast(`Update failed: ${err}`, 'error');
      }

      setIsUpdating(false);
    }
  }, [isWifiMode, preRelease, showToast, safelyParkRobot, connectUpdateWebSocket]);

  // ═══════════════════════════════════════════════════════════════════
  // WIFI FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════

  const fetchWifiStatus = useCallback(async () => {
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
        setWifiStatus(data);
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

  // Clear all saved WiFi networks
  const handleClearAllNetworks = useCallback(async () => {
    setIsClearingNetworks(true);

    try {
      const response = await fetchWithTimeout(
        buildApiUrl('/wifi/forget_all'),
        { method: 'POST' },
        DAEMON_CONFIG.TIMEOUTS.COMMAND * 2,
        { label: 'Clear all networks' }
      );

      if (response.ok) {
        // Blacklist current robot for 10 seconds to prevent immediate rediscovery
        if (remoteHost) {
          blacklistRobot(remoteHost, 10000);
        }

        // Close overlays
        setShowClearNetworksConfirm(false);
        onClose();

        // Give a moment for UI to update, then disconnect and return to connection selection
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
  }, [onClose, showToast, remoteHost, blacklistRobot, resetAll]);

  // ═══════════════════════════════════════════════════════════════════
  // RESET APPS FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════

  const handleResetAppsClick = useCallback(() => {
    setShowResetAppsConfirm(true);
  }, []);

  const confirmResetApps = useCallback(async () => {
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

  // ═══════════════════════════════════════════════════════════════════
  // ENVIRONMENT RESET FUNCTIONS (USB/Simulation only)
  // ═══════════════════════════════════════════════════════════════════

  const handleResetAppsVenvClick = useCallback(() => {
    setShowResetAppsVenvConfirm(true);
  }, []);

  const confirmResetAppsVenv = useCallback(async () => {
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

  const handleResetPythonEnvClick = useCallback(() => {
    setShowResetPythonEnvConfirm(true);
  }, []);

  const confirmResetPythonEnv = useCallback(async () => {
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

  // Connect to WiFi (called from Change Network overlay)
  const handleWifiConnect = useCallback(async () => {
    if (!selectedSSID || !wifiPassword) return;
    setIsConnecting(true);
    setWifiError(null);

    try {
      const response = await fetchWithTimeout(
        buildApiUrl(
          `/wifi/connect?ssid=${encodeURIComponent(selectedSSID)}&password=${encodeURIComponent(wifiPassword)}`
        ),
        { method: 'POST' },
        DAEMON_CONFIG.TIMEOUTS.COMMAND * 3,
        { label: 'WiFi connect' }
      );

      if (response.ok) {
        // Close overlay and reset form
        setShowChangeWifiOverlay(false);
        setWifiPassword('');
        setSelectedSSID('');
        // Refresh status after network change
        setTimeout(fetchWifiStatus, 5000);
      } else {
        const error = await response.json();
        setWifiError(error.detail || 'Failed to connect');
      }
    } catch (err) {
      console.error('Failed to connect to WiFi:', err);
      setWifiError('Connection failed');
    } finally {
      setIsConnecting(false);
    }
  }, [selectedSSID, wifiPassword, fetchWifiStatus]);

  // ═══════════════════════════════════════════════════════════════════
  // EFFECTS
  // ═══════════════════════════════════════════════════════════════════

  // Initial fetch when overlay opens
  useEffect(() => {
    if (open) {
      checkForUpdate();
      if (isWifiMode) {
        fetchWifiStatus();
      }
    }
  }, [open, isWifiMode, checkForUpdate, fetchWifiStatus]);

  // Auto-refresh WiFi networks every 3 seconds (WiFi mode only)
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

  // ═══════════════════════════════════════════════════════════════════
  // STYLES
  // ═══════════════════════════════════════════════════════════════════

  const textSecondary = darkMode ? '#888' : '#666';

  const inputStyles = {
    '& .MuiOutlinedInput-root': {
      bgcolor: darkMode ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.02)',
      borderRadius: '10px',
      '& fieldset': {
        borderColor: darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
      },
      '&:hover fieldset': {
        borderColor: darkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
      },
      '&.Mui-focused fieldset': {
        borderColor: 'primary.main',
        borderWidth: 1,
      },
    },
    '& .MuiInputLabel-root': {
      color: textSecondary,
      fontSize: 13,
      '&.Mui-focused': {
        color: 'primary.main',
      },
    },
    '& .MuiInputBase-input': {
      color: textPrimary,
      fontSize: 13,
    },
    '& .MuiSelect-icon': {
      color: textMuted,
    },
  };

  // Button style for outlined primary
  const buttonStyle = {
    color: 'primary.main',
    borderColor: 'primary.main',
    textTransform: 'none',
    '&:hover': {
      borderColor: 'primary.dark',
      bgcolor: 'rgba(99, 102, 241, 0.08)',
    },
    '&:disabled': {
      borderColor: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
      color: darkMode ? '#555' : '#bbb',
    },
  };

  // Card style
  const cardStyle = {
    p: 2.5,
    borderRadius: '16px',
    bgcolor: darkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.8)',
    border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)'}`,
    backdropFilter: 'blur(10px)',
  };

  // Handle overlay close - prevent closing if update is in progress (USB mode only, WiFi shows its own overlay)
  const handleOverlayClose = useCallback(() => {
    if (isUpdating && !isWifiMode) {
      // Prevent closing during USB update
      return;
    }
    onClose();
  }, [isUpdating, isWifiMode, onClose]);

  return (
    <FullscreenOverlay
      open={open}
      onClose={handleOverlayClose}
      darkMode={darkMode}
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
          '&::-webkit-scrollbar': { width: 6 },
          '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
          '&::-webkit-scrollbar-thumb': {
            bgcolor: darkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)',
            borderRadius: 3,
          },
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
          {/* HEADER */}
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
                fontSize: 20,
                fontWeight: 700,
                color: textPrimary,
                letterSpacing: '-0.3px',
              }}
            >
              Settings
            </Typography>
            {connectionMode && (
              <Typography
                sx={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: textMuted,
                  bgcolor: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                  px: 1,
                  py: 0.25,
                  borderRadius: '4px',
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
                  fontSize: 11,
                  color: textMuted,
                  fontFamily: 'monospace',
                }}
              >
                {remoteHost}
              </Typography>
            )}
          </Box>

          {/* CONTENT - Grid Layout */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 2,
            }}
          >
            {/* Row 1: Update + WiFi (WiFi) or Update + Daemon Control (USB/Sim) */}
            <SettingsUpdateCard
              darkMode={darkMode}
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
                darkMode={darkMode}
                wifiStatus={wifiStatus}
                isLoadingWifi={isLoadingWifi}
                onRefresh={fetchWifiStatus}
                onChangeNetwork={() => setShowChangeWifiOverlay(true)}
                onClearAllNetworks={() => setShowClearNetworksConfirm(true)}
                cardStyle={cardStyle}
              />
            ) : (
              <SettingsDaemonCard darkMode={darkMode} cardStyle={cardStyle} />
            )}

            {/* Row 2: Preferences + Daemon Control (WiFi) or Preferences + Maintenance (USB/Sim) */}
            <SettingsPreferencesCard darkMode={darkMode} cardStyle={cardStyle} />

            {isWifiMode ? (
              <SettingsDaemonCard darkMode={darkMode} cardStyle={cardStyle} />
            ) : (
              <SettingsCacheCard
                darkMode={darkMode}
                cardStyle={cardStyle}
                buttonStyle={buttonStyle}
                onResetAppsClick={handleResetAppsClick}
                isResettingApps={isResettingApps}
              />
            )}

            {/* Row 3: Maintenance (WiFi only) */}
            {isWifiMode && (
              <SettingsCacheCard
                darkMode={darkMode}
                cardStyle={cardStyle}
                buttonStyle={buttonStyle}
                onResetAppsClick={handleResetAppsClick}
                isResettingApps={isResettingApps}
              />
            )}
          </Box>
        </Box>
      </Box>

      {/* Update Confirmation Overlay */}
      <FullscreenOverlay
        open={showUpdateConfirm}
        onClose={() => setShowUpdateConfirm(false)}
        darkMode={darkMode}
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
          {/* Reachy in box illustration */}
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

          {/* Title */}
          <Typography
            variant="h5"
            sx={{
              fontWeight: 600,
              color: 'text.primary',
              mb: 2,
            }}
          >
            Start Update?
          </Typography>

          {/* Description */}
          <Typography
            sx={{
              color: 'text.secondary',
              fontSize: 14,
              lineHeight: 1.6,
              mb: 4,
            }}
          >
            Update to{' '}
            <strong style={{ color: darkMode ? '#fff' : '#333' }}>
              {updateInfo?.available_version}
            </strong>
            <br />
            <br />
            {isWifiMode ? (
              <>
                The robot will restart and you will be{' '}
                <strong style={{ color: darkMode ? '#fff' : '#333' }}>disconnected</strong>.
                <br />
                Reconnect after ~2 minutes when complete.
              </>
            ) : (
              <>
                The daemon will restart automatically.
                <br />
                This will take{' '}
                <strong style={{ color: darkMode ? '#fff' : '#333' }}>
                  between 30 seconds and 5 minutes
                </strong>
                .
              </>
            )}
          </Typography>

          {/* WiFi Mode Warning */}
          {isWifiMode && (
            <Box
              sx={{
                mb: 4,
                p: 2,
                borderRadius: '12px',
                bgcolor: darkMode ? 'rgba(255, 152, 0, 0.15)' : 'rgba(255, 152, 0, 0.1)',
                border: `1px solid ${darkMode ? 'rgba(255, 152, 0, 0.3)' : 'rgba(255, 152, 0, 0.2)'}`,
                textAlign: 'center',
              }}
            >
              <Typography
                sx={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: darkMode ? '#FFB74D' : '#F57C00',
                  mb: 0.5,
                }}
              >
                Important
              </Typography>
              <Typography
                sx={{
                  fontSize: 12,
                  color: darkMode ? '#FFB74D' : '#F57C00',
                  lineHeight: 1.5,
                }}
              >
                Make sure your robot is <strong>plugged into a power outlet</strong> during the
                update. <strong>Losing power during update can brick your robot</strong>.
              </Typography>
            </Box>
          )}

          {/* Actions */}
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
            <PulseButton onClick={confirmUpdate} darkMode={darkMode} sx={{ minWidth: 160 }}>
              Update now
            </PulseButton>
          </Box>
        </Box>
      </FullscreenOverlay>

      {/* Clear All Networks Confirmation Overlay */}
      <FullscreenOverlay
        open={showClearNetworksConfirm}
        onClose={() => setShowClearNetworksConfirm(false)}
        darkMode={darkMode}
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
          {/* Warning icon */}
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
                borderRadius: '50%',
                bgcolor: darkMode ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)',
                border: `2px solid ${darkMode ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.2)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ErrorOutlineIcon sx={{ fontSize: 40, color: '#ef4444' }} />
            </Box>
          </Box>

          {/* Title */}
          <Typography
            variant="h5"
            sx={{
              fontWeight: 600,
              color: 'text.primary',
              mb: 2,
            }}
          >
            Clear All Networks?
          </Typography>

          {/* Description */}
          <Typography
            sx={{
              color: 'text.secondary',
              fontSize: 14,
              lineHeight: 1.6,
              mb: 3,
            }}
          >
            This will forget all saved WiFi networks on your robot.
          </Typography>

          {/* Warning box */}
          <Box
            sx={{
              mb: 4,
              p: 2,
              borderRadius: '12px',
              bgcolor: darkMode ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)',
              border: `1px solid ${darkMode ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.2)'}`,
              textAlign: 'center',
            }}
          >
            <Typography
              sx={{
                fontSize: 13,
                fontWeight: 600,
                color: darkMode ? '#fca5a5' : '#dc2626',
                mb: 0.5,
              }}
            >
              You will be disconnected
            </Typography>
            <Typography
              sx={{
                fontSize: 12,
                color: darkMode ? '#fca5a5' : '#dc2626',
                lineHeight: 1.5,
                mb: 1,
              }}
            >
              The robot will switch to <strong>Hotspot mode</strong>.<br />
              Reconnect via <strong>reachy-mini-ap</strong> network.
            </Typography>
            <Typography
              sx={{
                fontSize: 11,
                color: darkMode ? 'rgba(252, 165, 165, 0.7)' : 'rgba(220, 38, 38, 0.7)',
                lineHeight: 1.5,
                fontStyle: 'italic',
              }}
            >
              If the robot doesn't appear, try restarting it.
            </Typography>
          </Box>

          {/* Actions */}
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
                bgcolor: '#ef4444',
                color: '#fff',
                textTransform: 'none',
                fontWeight: 600,
                '&:hover': {
                  bgcolor: '#dc2626',
                },
                '&:disabled': {
                  bgcolor: darkMode ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.5)',
                  color: darkMode ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.8)',
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

      {/* Reset Apps Confirmation Overlay */}
      <FullscreenOverlay
        open={showResetAppsConfirm}
        onClose={() => setShowResetAppsConfirm(false)}
        darkMode={darkMode}
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
          {/* Warning icon */}
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
                borderRadius: '50%',
                bgcolor: darkMode ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)',
                border: `2px solid ${darkMode ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.2)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ErrorOutlineIcon sx={{ fontSize: 40, color: '#ef4444' }} />
            </Box>
          </Box>

          {/* Title */}
          <Typography
            variant="h5"
            sx={{
              fontWeight: 600,
              color: 'text.primary',
              mb: 2,
            }}
          >
            Reset Apps Cache?
          </Typography>

          {/* Description */}
          <Typography
            sx={{
              color: 'text.secondary',
              fontSize: 14,
              lineHeight: 1.6,
              mb: 3,
            }}
          >
            This will{' '}
            <strong style={{ color: darkMode ? '#fff' : '#333' }}>
              remove all installed applications
            </strong>{' '}
            from the robot. You will need to reinstall them individually from the app store.
          </Typography>

          {/* Actions */}
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
                bgcolor: '#ef4444',
                color: '#fff',
                textTransform: 'none',
                fontWeight: 600,
                '&:hover': {
                  bgcolor: '#dc2626',
                },
                '&:disabled': {
                  bgcolor: darkMode ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.5)',
                  color: darkMode ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.8)',
                },
              }}
            >
              Reset all apps
            </Button>
          </Box>
        </Box>
      </FullscreenOverlay>

      {/* Reset Apps Venv Confirmation Overlay */}
      <FullscreenOverlay
        open={showResetAppsVenvConfirm}
        onClose={() => setShowResetAppsVenvConfirm(false)}
        darkMode={darkMode}
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
                borderRadius: '50%',
                bgcolor: darkMode ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)',
                border: `2px solid ${darkMode ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.2)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ErrorOutlineIcon sx={{ fontSize: 40, color: '#ef4444' }} />
            </Box>
          </Box>
          <Typography variant="h5" sx={{ fontWeight: 600, color: 'text.primary', mb: 2 }}>
            Reset Apps Environment?
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 14, lineHeight: 1.6, mb: 3 }}>
            This will{' '}
            <strong style={{ color: darkMode ? '#fff' : '#333' }}>
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
                bgcolor: '#ef4444',
                color: '#fff',
                textTransform: 'none',
                fontWeight: 600,
                '&:hover': { bgcolor: '#dc2626' },
                '&:disabled': {
                  bgcolor: darkMode ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.5)',
                  color: darkMode ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.8)',
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

      {/* Reset Python Environment Confirmation Overlay */}
      <FullscreenOverlay
        open={showResetPythonEnvConfirm}
        onClose={() => setShowResetPythonEnvConfirm(false)}
        darkMode={darkMode}
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
                borderRadius: '50%',
                bgcolor: darkMode ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)',
                border: `2px solid ${darkMode ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.2)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ErrorOutlineIcon sx={{ fontSize: 40, color: '#ef4444' }} />
            </Box>
          </Box>
          <Typography variant="h5" sx={{ fontWeight: 600, color: 'text.primary', mb: 2 }}>
            Full Environment Reset?
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 14, lineHeight: 1.6, mb: 2 }}>
            This will{' '}
            <strong style={{ color: darkMode ? '#fff' : '#333' }}>
              delete all Python files, virtual environments, and the package manager
            </strong>
            . Everything will be re-downloaded on next connection.
          </Typography>
          <Typography
            sx={{
              color: '#ef4444',
              fontSize: 13,
              fontWeight: 500,
              mb: 3,
              p: 1.5,
              borderRadius: '8px',
              bgcolor: darkMode ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.05)',
              border: `1px solid ${darkMode ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.15)'}`,
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
                bgcolor: '#ef4444',
                color: '#fff',
                textTransform: 'none',
                fontWeight: 600,
                '&:hover': { bgcolor: '#dc2626' },
                '&:disabled': {
                  bgcolor: darkMode ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.5)',
                  color: darkMode ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.8)',
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

      {/* Change WiFi Network Overlay */}
      <ChangeWifiOverlay
        open={showChangeWifiOverlay}
        onClose={() => {
          setShowChangeWifiOverlay(false);
          setSelectedSSID('');
          setWifiPassword('');
          setWifiError(null);
        }}
        darkMode={darkMode}
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

      {/* Update Progress Overlay (WiFi mode only) */}
      {isWifiMode && updateJobId && (
        <FullscreenOverlay
          open={isUpdating}
          onClose={() => {}} // Prevent closing during update
          darkMode={darkMode}
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
            {/* Update Icon */}
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
                  borderRadius: '50%',
                  bgcolor: darkMode ? 'rgba(255, 149, 0, 0.15)' : 'rgba(255, 149, 0, 0.1)',
                  border: `2px solid ${darkMode ? 'rgba(255, 149, 0, 0.3)' : 'rgba(255, 149, 0, 0.2)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                }}
              >
                {updateJobStatus === 'done' ? (
                  <CheckCircleOutlinedIcon sx={{ fontSize: 40, color: '#10b981' }} />
                ) : updateJobStatus === 'failed' ? (
                  <ErrorOutlineIcon sx={{ fontSize: 40, color: '#ef4444' }} />
                ) : updateJobStatus === 'restarting' ? (
                  <CircularProgress size={32} thickness={3} sx={{ color: '#10b981' }} />
                ) : (
                  <CircularProgress size={32} thickness={3} sx={{ color: '#FF9500' }} />
                )}
              </Box>
            </Box>

            {/* Title */}
            <Typography
              variant="h5"
              sx={{
                fontWeight: 600,
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

            {/* Description */}
            <Typography
              sx={{
                color: 'text.secondary',
                fontSize: 14,
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

            {/* Logs Container */}
            <Box
              ref={el => {
                if (el) el.scrollTop = el.scrollHeight;
              }}
              sx={{
                mb: 3,
                p: 2,
                borderRadius: '12px',
                bgcolor: darkMode ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.05)',
                border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`,
                height: 220,
                overflowY: 'auto',
                fontFamily: 'monospace',
                fontSize: 12,
                lineHeight: 1.6,
                color: darkMode ? '#aaa' : '#666',
                '&::-webkit-scrollbar': {
                  width: '8px',
                },
                '&::-webkit-scrollbar-track': {
                  bgcolor: darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
                  borderRadius: '4px',
                },
                '&::-webkit-scrollbar-thumb': {
                  bgcolor: darkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)',
                  borderRadius: '4px',
                  '&:hover': {
                    bgcolor: darkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)',
                  },
                },
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

            {/* Warning for ongoing update */}
            {updateJobStatus !== 'done' &&
              updateJobStatus !== 'failed' &&
              updateJobStatus !== 'restarting' && (
                <Box
                  sx={{
                    p: 2,
                    borderRadius: '12px',
                    bgcolor: darkMode ? 'rgba(251, 191, 36, 0.15)' : 'rgba(251, 191, 36, 0.1)',
                    border: `1px solid ${darkMode ? 'rgba(251, 191, 36, 0.3)' : 'rgba(251, 191, 36, 0.2)'}`,
                    textAlign: 'center',
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: darkMode ? '#fbbf24' : '#d97706',
                      mb: 0.5,
                    }}
                  >
                    Please Wait
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: 12,
                      color: darkMode ? '#fbbf24' : '#d97706',
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

      {/* Toast Notifications - handled by global Toast in App.jsx */}
    </FullscreenOverlay>
  );
}
