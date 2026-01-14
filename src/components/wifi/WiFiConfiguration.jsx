import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  CircularProgress,
  Alert,
  IconButton,
  InputAdornment,
} from '@mui/material';
import NetworkSelect from './NetworkSelect';
import WifiIcon from '@mui/icons-material/Wifi';
import SignalWifi4BarIcon from '@mui/icons-material/SignalWifi4Bar';
import SignalWifiOffIcon from '@mui/icons-material/SignalWifiOff';
import WifiTetheringIcon from '@mui/icons-material/WifiTethering';
import RouterIcon from '@mui/icons-material/Router';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { buildApiUrl, fetchWithTimeout, DAEMON_CONFIG } from '../../config/daemon';
import { isReachyHotspot } from '../../constants/wifi';
import { telemetry } from '../../utils/telemetry';

/**
 * WiFiConfiguration - Reusable WiFi configuration component
 *
 * Handles:
 * - Fetching WiFi status
 * - Scanning available networks
 * - Connecting to a network
 *
 * @param {object} props
 * @param {boolean} props.darkMode - Dark mode flag
 * @param {boolean} props.compact - Compact mode (for smaller views)
 * @param {function} props.onConnectSuccess - Callback when connection succeeds
 * @param {function} props.onConnectStart - Callback when connection starts
 * @param {function} props.onReachyHotspotDetected - Callback when a Reachy hotspot is detected
 * @param {function} props.onError - Callback for errors (e.g., for toast notifications)
 * @param {boolean} props.showHotspotDetection - Show hotspot detection alert (default: true)
 * @param {string} props.customBaseUrl - Custom base URL for API calls (e.g. for hotspot mode)
 * @param {boolean} props.skipInitialFetch - Delay automatic fetch on mount by 500ms (default: false)
 */
export default function WiFiConfiguration({
  darkMode,
  compact = false,
  onConnectSuccess,
  onConnectStart,
  onReachyHotspotDetected,
  onError,
  showHotspotDetection = true,
  customBaseUrl = null,
  skipInitialFetch = false,
}) {
  // Text colors
  const textPrimary = darkMode ? '#f5f5f5' : '#333';
  const textSecondary = darkMode ? '#888' : '#666';
  const textMuted = darkMode ? '#666' : '#999';

  // State
  const [wifiStatus, setWifiStatus] = useState(null);
  const [availableNetworks, setAvailableNetworks] = useState([]);
  const [isLoadingWifi, setIsLoadingWifi] = useState(false);
  const [selectedSSID, setSelectedSSID] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [wifiError, setWifiError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [isDaemonReachable, setIsDaemonReachable] = useState(null); // null = checking, true/false = result
  const [showPassword, setShowPassword] = useState(false); // Toggle password visibility

  // Helper to handle errors (use callback if provided, otherwise set local state)
  const handleError = useCallback(
    (message, severity = 'error') => {
      if (onError) {
        onError(message, severity);
      } else {
        setWifiError(message);
      }
    },
    [onError]
  );

  // Fetch WiFi status and scan networks
  const fetchWifiStatus = useCallback(async () => {
    const baseUrl = customBaseUrl || buildApiUrl('').replace(/\/$/, '');
    setIsLoadingWifi(true);
    if (!onError) {
      setWifiError(null);
    }

    try {
      const statusResponse = await fetchWithTimeout(`${baseUrl}/wifi/status`, {}, 5000, {
        label: 'WiFi status',
        silent: true,
      });

      if (statusResponse.ok) {
        const data = await statusResponse.json();
        setWifiStatus(data);
        setIsDaemonReachable(true);
      } else {
        setIsDaemonReachable(false);
        return;
      }

      const networksResponse = await fetchWithTimeout(
        `${baseUrl}/wifi/scan_and_list`,
        { method: 'POST' },
        DAEMON_CONFIG.TIMEOUTS.COMMAND * 2,
        { label: 'WiFi scan', silent: true }
      );

      if (networksResponse.ok) {
        const networks = await networksResponse.json();
        const validNetworks = Array.isArray(networks)
          ? networks.filter(n => {
              if (!n || n.trim().length === 0) return false;
              return !isReachyHotspot(n);
            })
          : [];
        setAvailableNetworks(validNetworks);
      }
    } catch (err) {
      setIsDaemonReachable(false);
      if (!onError) {
        setWifiError(null);
      }
    } finally {
      setIsLoadingWifi(false);
    }
  }, [customBaseUrl, onError]);

  // Connect to WiFi
  const handleConnect = useCallback(async () => {
    if (!selectedSSID || !wifiPassword) return;
    const ssidToUse = selectedSSID;

    // 📊 Telemetry - Track WiFi setup started
    telemetry.wifiSetupStarted();

    if (onConnectStart) {
      onConnectStart(ssidToUse);
    }

    setIsConnecting(true);
    if (!onError) {
      setWifiError(null);
    }
    setSuccessMessage(null);

    const baseUrl = customBaseUrl || buildApiUrl('').replace(/\/$/, '');
    const connectUrl = `${baseUrl}/wifi/connect?ssid=${encodeURIComponent(ssidToUse)}&password=${encodeURIComponent(wifiPassword)}`;

    try {
      // Step 1: Send connection request
      const response = await fetchWithTimeout(
        connectUrl,
        { method: 'POST' },
        DAEMON_CONFIG.TIMEOUTS.COMMAND,
        { label: 'WiFi connect' }
      );

      if (!response.ok) {
        const error = await response.json();
        handleError(error.detail || 'Failed to connect', 'error');
        setIsConnecting(false);
        return;
      }

      // Step 2: Poll /wifi/status until mode changes from "busy"
      const MAX_POLL_TIME = 20000;
      const POLL_INTERVAL = 1000;
      const startTime = Date.now();
      let hasSeenBusy = false;
      let consecutiveErrors = 0;
      const MAX_ERRORS = 3;

      const pollStatus = async () => {
        try {
          const statusResponse = await fetchWithTimeout(`${baseUrl}/wifi/status`, {}, 3000, {
            label: 'WiFi status',
            silent: true,
          });

          if (!statusResponse.ok) {
            return null;
          }

          const status = await statusResponse.json();
          consecutiveErrors = 0;

          // Still busy
          if (status.mode === 'busy') {
            hasSeenBusy = true;
            return null;
          }

          // Success - Connected to WiFi
          if (status.mode === 'wlan' && status.connected_network === ssidToUse) {
            setSuccessMessage(`Successfully connected to ${ssidToUse}`);
            setWifiPassword('');
            setSelectedSSID('');
            setIsConnecting(false);

            // 📊 Telemetry - Track WiFi setup completed successfully
            telemetry.wifiSetupCompleted({ success: true });

            if (onConnectSuccess) {
              onConnectSuccess(ssidToUse);
            }
            return 'success';
          }

          // Failure - Back to hotspot
          if (status.mode === 'hotspot') {
            const errorResponse = await fetchWithTimeout(`${baseUrl}/wifi/error`, {}, 2000, {
              label: 'WiFi error',
              silent: true,
            });

            let errorMsg = 'Connection failed. Please check your password and try again.';
            if (errorResponse.ok) {
              const errorData = await errorResponse.json();
              if (errorData.error) {
                errorMsg = `Connection failed: ${errorData.error}`;

                await fetchWithTimeout(`${baseUrl}/wifi/reset_error`, { method: 'POST' }, 2000, {
                  label: 'Reset error',
                  silent: true,
                }).catch(() => {});
              }
            }

            handleError(errorMsg, 'error');
            setIsConnecting(false);

            // 📊 Telemetry - Track WiFi setup failed
            telemetry.wifiSetupCompleted({ success: false });

            return 'failed';
          }

          return null;
        } catch (err) {
          consecutiveErrors++;

          // Robot has left the hotspot
          if (consecutiveErrors >= MAX_ERRORS) {
            // Inform user
            if (onError) {
              onError(
                'Reachy is attempting to connect to your WiFi network. The hotspot will temporarily disconnect...',
                'info'
              );
            }

            // Wait 12 seconds
            await new Promise(resolve => setTimeout(resolve, 12000));

            // Check if robot is back on hotspot
            try {
              const hotspotCheckResponse = await fetchWithTimeout(
                `${baseUrl}/wifi/status`,
                {},
                3000,
                { label: 'Hotspot re-check', silent: true }
              );

              if (hotspotCheckResponse.ok) {
                const hotspotStatus = await hotspotCheckResponse.json();

                if (hotspotStatus.mode === 'hotspot') {
                  // Robot is BACK on hotspot = FAILED
                  const errorResponse = await fetchWithTimeout(`${baseUrl}/wifi/error`, {}, 2000, {
                    label: 'WiFi error',
                    silent: true,
                  });

                  let errorMsg = 'Connection failed. Please check your password and try again.';
                  if (errorResponse.ok) {
                    const errorData = await errorResponse.json();
                    if (errorData.error) {
                      errorMsg = `Connection failed: ${errorData.error}`;
                      await fetchWithTimeout(
                        `${baseUrl}/wifi/reset_error`,
                        { method: 'POST' },
                        2000,
                        { label: 'Reset error', silent: true }
                      ).catch(() => {});
                    }
                  }

                  handleError(errorMsg, 'error');
                  setIsConnecting(false);

                  // 📊 Telemetry - Track WiFi setup failed
                  telemetry.wifiSetupCompleted({ success: false });

                  return 'failed';
                }
              }
            } catch (recheckErr) {
              // Robot still gone
            }

            // Robot is still gone after 12s = likely success
            setWifiPassword('');
            setSelectedSSID('');
            setIsConnecting(false);

            // 📊 Telemetry - Track WiFi setup completed (likely success)
            telemetry.wifiSetupCompleted({ success: true });

            if (onConnectSuccess) {
              onConnectSuccess(ssidToUse);
            }
            return 'verify';
          }

          return null;
        }
      };

      // Polling loop with timeout
      while (Date.now() - startTime < MAX_POLL_TIME) {
        const result = await pollStatus();

        if (result === 'success' || result === 'failed' || result === 'verify') {
          return;
        }

        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
      }

      // Timeout reached
      handleError('Connection timeout. Please try again.', 'error');
      setIsConnecting(false);

      // 📊 Telemetry - Track WiFi setup failed (timeout)
      telemetry.wifiSetupCompleted({ success: false });
    } catch (err) {
      handleError('Connection failed', 'error');
      setIsConnecting(false);

      // 📊 Telemetry - Track WiFi setup failed (error)
      telemetry.wifiSetupCompleted({ success: false });
    }
  }, [
    selectedSSID,
    wifiPassword,
    onConnectSuccess,
    onConnectStart,
    customBaseUrl,
    handleError,
    onError,
  ]);

  // Fetch on mount
  useEffect(() => {
    if (skipInitialFetch) {
      const timer = setTimeout(() => {
        fetchWifiStatus();
      }, 500);

      return () => clearTimeout(timer);
    }

    fetchWifiStatus();

    return () => {};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps = mount only

  // Detect Reachy hotspots in available networks
  const detectedReachyHotspots = useMemo(() => {
    return availableNetworks.filter(network => isReachyHotspot(network));
  }, [availableNetworks]);

  // Notify parent when Reachy hotspot is detected
  useEffect(() => {
    if (detectedReachyHotspots.length > 0 && onReachyHotspotDetected) {
      onReachyHotspotDetected(detectedReachyHotspots);
    }
  }, [detectedReachyHotspots, onReachyHotspotDetected]);

  // Input styles
  const inputStyles = {
    '& .MuiOutlinedInput-root': {
      bgcolor: darkMode ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.02)',
      borderRadius: compact ? '8px' : '10px',
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
      fontSize: compact ? 12 : 13,
      '&.Mui-focused': {
        color: 'primary.main',
      },
    },
    '& .MuiInputBase-input': {
      color: textPrimary,
      fontSize: compact ? 12 : 13,
    },
    '& .MuiSelect-icon': {
      color: textMuted,
    },
  };

  // Get WiFi status display
  const getWifiStatusText = () => {
    if (!wifiStatus) return { icon: WifiIcon, text: 'Loading...', color: textSecondary };

    switch (wifiStatus.mode) {
      case 'hotspot':
        return { icon: WifiTetheringIcon, text: 'Hotspot mode', color: '#FF9500' };
      case 'wlan':
        return {
          icon: SignalWifi4BarIcon,
          text: wifiStatus.connected_network,
          subtitle: 'Connected',
          color: '#22c55e',
        };
      case 'disconnected':
        return { icon: SignalWifiOffIcon, text: 'Disconnected', color: '#ef4444' };
      case 'busy':
        return { icon: WifiIcon, text: 'Configuring...', color: '#FF9500' };
      default:
        return { icon: WifiIcon, text: 'Unknown', color: textSecondary };
    }
  };

  const wifiConfig = getWifiStatusText();
  const StatusIcon = wifiConfig.icon;

  // If daemon is not reachable and we're NOT in custom base URL mode (setup), show connection instructions
  // When customBaseUrl is set, we assume we're already connected and just show a loader
  if (isDaemonReachable === false && !customBaseUrl) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          py: compact ? 2 : 3,
          textAlign: 'center',
        }}
      >
        <WifiTetheringIcon sx={{ fontSize: 40, color: '#FF9500' }} />
        <Typography
          sx={{
            fontSize: compact ? 13 : 14,
            fontWeight: 600,
            color: textPrimary,
          }}
        >
          Connect to Reachy's Hotspot
        </Typography>
        <Typography
          sx={{
            fontSize: compact ? 11 : 12,
            color: textSecondary,
            maxWidth: 300,
          }}
        >
          Open your computer's WiFi settings and connect to:
        </Typography>
        <Box
          sx={{
            bgcolor: darkMode ? 'rgba(255, 149, 0, 0.1)' : 'rgba(255, 149, 0, 0.08)',
            border: '1px solid',
            borderColor: darkMode ? 'rgba(255, 149, 0, 0.3)' : 'rgba(255, 149, 0, 0.2)',
            borderRadius: '8px',
            px: 2,
            py: 1.5,
          }}
        >
          <Typography
            sx={{
              fontSize: compact ? 12 : 13,
              fontWeight: 600,
              color: '#FF9500',
            }}
          >
            Network: reachy-mini-ap
          </Typography>
          <Typography
            sx={{
              fontSize: compact ? 11 : 12,
              color: textSecondary,
              mt: 0.5,
            }}
          >
            Password: reachy-mini
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
          <CircularProgress size={14} sx={{ color: '#FF9500' }} />
          <Typography
            sx={{
              fontSize: compact ? 10 : 11,
              color: textSecondary,
            }}
          >
            Waiting for connection...
          </Typography>
        </Box>
        <Button
          size="small"
          onClick={fetchWifiStatus}
          sx={{
            fontSize: compact ? 11 : 12,
            textTransform: 'none',
            color: 'primary.main',
          }}
        >
          Check connection
        </Button>
      </Box>
    );
  }

  // Still checking if daemon is reachable (but NOT when customBaseUrl is set - show form immediately)
  if (isDaemonReachable === null && isLoadingWifi && !customBaseUrl) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1.5,
          py: compact ? 3 : 4,
        }}
      >
        <CircularProgress size={24} sx={{ color: '#FF9500' }} />
        <Typography
          sx={{
            fontSize: compact ? 12 : 13,
            color: textSecondary,
          }}
        >
          Checking connection...
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: compact ? 1.5 : 2 }}>
      {/* Reachy Hotspot Detection Alert */}
      {showHotspotDetection && detectedReachyHotspots.length > 0 && (
        <Alert
          severity="info"
          icon={<RouterIcon sx={{ fontSize: compact ? 18 : 20 }} />}
          sx={{
            fontSize: compact ? 11 : 12,
            '& .MuiAlert-message': {
              width: '100%',
            },
          }}
        >
          <Box>
            <Typography sx={{ fontWeight: 600, fontSize: compact ? 11 : 12 }}>
              🤖 Reachy hotspot detected!
            </Typography>
            <Typography sx={{ fontSize: compact ? 10 : 11, mt: 0.5, color: 'text.secondary' }}>
              Found: <strong>{detectedReachyHotspots.join(', ')}</strong>
            </Typography>
            <Typography sx={{ fontSize: compact ? 10 : 11, mt: 0.5, color: 'text.secondary' }}>
              Another Reachy is in setup mode nearby.
            </Typography>
          </Box>
        </Alert>
      )}

      {/* Error/Success Messages */}
      {wifiError && (
        <Alert severity="error" sx={{ fontSize: compact ? 11 : 12 }}>
          {wifiError}
        </Alert>
      )}

      {successMessage && (
        <Alert severity="success" sx={{ fontSize: compact ? 11 : 12 }}>
          {successMessage}
        </Alert>
      )}

      {/* Network Selection */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: compact ? 1.5 : 2,
        }}
      >
        {/* Network dropdown */}
        <NetworkSelect
          value={selectedSSID}
          onChange={setSelectedSSID}
          networks={availableNetworks}
          disabled={isConnecting}
          onOpen={fetchWifiStatus}
          isLoading={isLoadingWifi}
          showLabel={true}
          darkMode={darkMode}
          zIndex={99999}
          sx={inputStyles}
        />

        {/* Password - always visible */}
        <TextField
          label="Password"
          type={showPassword ? 'text' : 'password'}
          value={wifiPassword}
          onChange={e => setWifiPassword(e.target.value)}
          size="small"
          fullWidth
          disabled={isConnecting}
          sx={inputStyles}
          onKeyPress={e => {
            if (e.key === 'Enter' && selectedSSID && wifiPassword) {
              handleConnect();
            }
          }}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  onClick={() => setShowPassword(!showPassword)}
                  edge="end"
                  size="small"
                  sx={{
                    color: textMuted,
                    '&:hover': { color: textPrimary },
                  }}
                >
                  {showPassword ? (
                    <VisibilityOffIcon sx={{ fontSize: compact ? 16 : 18 }} />
                  ) : (
                    <VisibilityIcon sx={{ fontSize: compact ? 16 : 18 }} />
                  )}
                </IconButton>
              </InputAdornment>
            ),
          }}
        />

        {/* Connect button - always visible */}
        <Button
          variant="outlined"
          onClick={handleConnect}
          disabled={!selectedSSID || !wifiPassword || isConnecting}
          fullWidth
          sx={{
            borderColor: '#FF9500',
            color: '#FF9500',
            textTransform: 'none',
            fontSize: compact ? 12 : 13,
            fontWeight: 600,
            minHeight: compact ? 36 : 40,
            borderRadius: compact ? '8px' : '10px',
            '&:hover': {
              borderColor: '#e68600',
              bgcolor: 'rgba(255, 149, 0, 0.08)',
            },
            '&:disabled': {
              borderColor: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
              color: darkMode ? '#555' : '#bbb',
            },
          }}
        >
          {isConnecting ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={14} sx={{ color: 'inherit' }} />
              Connecting...
            </Box>
          ) : (
            'Connect'
          )}
        </Button>
      </Box>
    </Box>
  );
}
