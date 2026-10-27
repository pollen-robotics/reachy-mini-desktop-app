import { useState, useEffect, useCallback, useMemo } from 'react';
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
import { ACCENT, STATUS, accentAlpha } from '@styles/tokens';
import { useAppPalette, TYPO, FONT_WEIGHT, RADIUS } from '@styles';

type Severity = 'success' | 'error' | 'warning' | 'info';

interface WifiStatus {
  mode?: 'hotspot' | 'wlan' | 'disconnected' | 'busy' | string;
  connected_network?: string;
  [key: string]: unknown;
}

export interface WiFiConfigurationProps {
  /** @deprecated Theme mode is now read from `useAppPalette()`. Prop kept for back-compat but ignored. */
  darkMode?: boolean;
  compact?: boolean;
  onConnectSuccess?: (ssid: string) => void;
  onConnectStart?: (ssid: string) => void;
  onReachyHotspotDetected?: (hotspots: string[]) => void;
  onError?: (message: string, severity?: Severity) => void;
  showHotspotDetection?: boolean;
  customBaseUrl?: string | null;
  skipInitialFetch?: boolean;
}

/**
 * WiFiConfiguration - Reusable WiFi configuration component
 *
 * Handles:
 * - Fetching WiFi status
 * - Scanning available networks
 * - Connecting to a network
 */
export default function WiFiConfiguration({
  compact = false,
  onConnectSuccess,
  onConnectStart,
  onReachyHotspotDetected,
  onError,
  showHotspotDetection = true,
  customBaseUrl = null,
  skipInitialFetch = false,
}: WiFiConfigurationProps) {
  const palette = useAppPalette();

  // State
  const [wifiStatus, setWifiStatus] = useState<WifiStatus | null>(null);
  const [availableNetworks, setAvailableNetworks] = useState<string[]>([]);
  const [isLoadingWifi, setIsLoadingWifi] = useState<boolean>(false);
  const [selectedSSID, setSelectedSSID] = useState<string>('');
  const [wifiPassword, setWifiPassword] = useState<string>('');
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [wifiError, setWifiError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isDaemonReachable, setIsDaemonReachable] = useState<boolean | null>(null); // null = checking, true/false = result
  const [showPassword, setShowPassword] = useState<boolean>(false); // Toggle password visibility

  // Helper to handle errors (use callback if provided, otherwise set local state)
  const handleError = useCallback(
    (message: string, severity: Severity = 'error') => {
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
    const baseUrl = customBaseUrl || (buildApiUrl('') as string).replace(/\/$/, '');
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
        const data = (await statusResponse.json()) as WifiStatus;
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
        const networks = (await networksResponse.json()) as unknown;
        const validNetworks: string[] = Array.isArray(networks)
          ? (networks as string[]).filter(n => {
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
    if (!selectedSSID) return;
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

    const baseUrl = customBaseUrl || (buildApiUrl('') as string).replace(/\/$/, '');
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
        const error = (await response.json()) as { detail?: string };
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

      const pollStatus = async (): Promise<'success' | 'failed' | 'verify' | null> => {
        try {
          const statusResponse = await fetchWithTimeout(`${baseUrl}/wifi/status`, {}, 3000, {
            label: 'WiFi status',
            silent: true,
          });

          if (!statusResponse.ok) {
            return null;
          }

          const status = (await statusResponse.json()) as WifiStatus;
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
              const errorData = (await errorResponse.json()) as { error?: string };
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
                const hotspotStatus = (await hotspotCheckResponse.json()) as WifiStatus;

                if (hotspotStatus.mode === 'hotspot') {
                  // Robot is BACK on hotspot = FAILED
                  const errorResponse = await fetchWithTimeout(`${baseUrl}/wifi/error`, {}, 2000, {
                    label: 'WiFi error',
                    silent: true,
                  });

                  let errorMsg = 'Connection failed. Please check your password and try again.';
                  if (errorResponse.ok) {
                    const errorData = (await errorResponse.json()) as { error?: string };
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
      bgcolor: palette.surfaceSubtle,
      borderRadius: compact ? RADIUS.md : RADIUS.lg,
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
      color: palette.textSecondary,
      fontSize: compact ? TYPO.sm : TYPO.body,
      '&.Mui-focused': {
        color: 'primary.main',
      },
    },
    '& .MuiInputBase-input': {
      color: palette.textPrimary,
      fontSize: compact ? TYPO.sm : TYPO.body,
    },
    '& .MuiSelect-icon': {
      color: palette.textMuted,
    },
  };

  // Get WiFi status display
  const getWifiStatusText = (): {
    icon: typeof WifiIcon;
    text: string | undefined;
    subtitle?: string;
    color: string;
  } => {
    if (!wifiStatus) return { icon: WifiIcon, text: 'Loading...', color: palette.textSecondary };

    switch (wifiStatus.mode) {
      case 'hotspot':
        return { icon: WifiTetheringIcon, text: 'Hotspot mode', color: ACCENT.main };
      case 'wlan':
        return {
          icon: SignalWifi4BarIcon,
          text: wifiStatus.connected_network,
          subtitle: 'Connected',
          color: STATUS.success,
        };
      case 'disconnected':
        return { icon: SignalWifiOffIcon, text: 'Disconnected', color: STATUS.error };
      case 'busy':
        return { icon: WifiIcon, text: 'Configuring...', color: ACCENT.main };
      default:
        return { icon: WifiIcon, text: 'Unknown', color: palette.textSecondary };
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
        <WifiTetheringIcon sx={{ fontSize: TYPO.hero, color: ACCENT.main }} />
        <Typography
          sx={{
            fontSize: compact ? TYPO.body : TYPO.md,
            fontWeight: FONT_WEIGHT.semibold,
            color: palette.textPrimary,
          }}
        >
          Connect to Reachy's Hotspot
        </Typography>
        <Typography
          sx={{
            fontSize: compact ? TYPO.xs : TYPO.sm,
            color: palette.textSecondary,
            maxWidth: 300,
          }}
        >
          Open your computer's WiFi settings and connect to:
        </Typography>
        <Box
          sx={{
            bgcolor: palette.isDark ? accentAlpha(0.1) : accentAlpha(0.08),
            border: '1px solid',
            borderColor: palette.accentBorder,
            borderRadius: RADIUS.md,
            px: 2,
            py: 1.5,
          }}
        >
          <Typography
            sx={{
              fontSize: compact ? TYPO.sm : TYPO.body,
              fontWeight: FONT_WEIGHT.semibold,
              color: ACCENT.main,
            }}
          >
            Network: reachy-mini-ap
          </Typography>
          <Typography
            sx={{
              fontSize: compact ? TYPO.xs : TYPO.sm,
              color: palette.textSecondary,
              mt: 0.5,
            }}
          >
            Password: reachy-mini
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
          <CircularProgress size={14} sx={{ color: ACCENT.main }} />
          <Typography
            sx={{
              fontSize: compact ? TYPO.tiny : TYPO.xs,
              color: palette.textSecondary,
            }}
          >
            Waiting for connection...
          </Typography>
        </Box>
        <Button
          size="small"
          onClick={fetchWifiStatus}
          sx={{
            fontSize: compact ? TYPO.xs : TYPO.sm,
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
        <CircularProgress size={24} sx={{ color: ACCENT.main }} />
        <Typography
          sx={{
            fontSize: compact ? TYPO.sm : TYPO.body,
            color: palette.textSecondary,
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
          icon={<RouterIcon sx={{ fontSize: compact ? TYPO.xl : TYPO.xxl }} />}
          sx={{
            fontSize: compact ? TYPO.xs : TYPO.sm,
            '& .MuiAlert-message': {
              width: '100%',
            },
          }}
        >
          <Box>
            <Typography
              sx={{ fontWeight: FONT_WEIGHT.semibold, fontSize: compact ? TYPO.xs : TYPO.sm }}
            >
              🤖 Reachy hotspot detected!
            </Typography>
            <Typography
              sx={{ fontSize: compact ? TYPO.tiny : TYPO.xs, mt: 0.5, color: 'text.secondary' }}
            >
              Found: <strong>{detectedReachyHotspots.join(', ')}</strong>
            </Typography>
            <Typography
              sx={{ fontSize: compact ? TYPO.tiny : TYPO.xs, mt: 0.5, color: 'text.secondary' }}
            >
              Another Reachy is in setup mode nearby.
            </Typography>
          </Box>
        </Alert>
      )}

      {/* Error/Success Messages */}
      {wifiError && (
        <Alert severity="error" sx={{ fontSize: compact ? TYPO.xs : TYPO.sm }}>
          {wifiError}
        </Alert>
      )}

      {successMessage && (
        <Alert severity="success" sx={{ fontSize: compact ? TYPO.xs : TYPO.sm }}>
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
          zIndex={99999}
          sx={inputStyles}
        />

        {/* Password - always visible */}
        <TextField
          label="Password"
          type={showPassword ? 'text' : 'password'}
          value={wifiPassword}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWifiPassword(e.target.value)}
          size="small"
          fullWidth
          disabled={isConnecting}
          sx={inputStyles}
          onKeyPress={(e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter' && selectedSSID) {
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
                    color: palette.textMuted,
                    '&:hover': { color: palette.textPrimary },
                  }}
                >
                  {showPassword ? (
                    <VisibilityOffIcon sx={{ fontSize: compact ? TYPO.lg : TYPO.xl }} />
                  ) : (
                    <VisibilityIcon sx={{ fontSize: compact ? TYPO.lg : TYPO.xl }} />
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
          disabled={!selectedSSID || isConnecting}
          fullWidth
          sx={{
            borderColor: ACCENT.main,
            color: ACCENT.main,
            textTransform: 'none',
            fontSize: compact ? TYPO.sm : TYPO.body,
            fontWeight: FONT_WEIGHT.semibold,
            minHeight: compact ? 36 : 40,
            borderRadius: compact ? RADIUS.md : RADIUS.lg,
            '&:hover': {
              borderColor: ACCENT.dark,
              bgcolor: accentAlpha(0.08),
            },
            '&:disabled': {
              borderColor: palette.border,
              color: palette.textDisabled,
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
