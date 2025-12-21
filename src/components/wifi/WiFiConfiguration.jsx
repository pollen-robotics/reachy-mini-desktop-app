import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  CircularProgress,
  Alert,
  IconButton,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import WifiIcon from '@mui/icons-material/Wifi';
import SignalWifi4BarIcon from '@mui/icons-material/SignalWifi4Bar';
import SignalWifiOffIcon from '@mui/icons-material/SignalWifiOff';
import WifiTetheringIcon from '@mui/icons-material/WifiTethering';
import RouterIcon from '@mui/icons-material/Router';
import { buildApiUrl, fetchWithTimeout, DAEMON_CONFIG } from '../../config/daemon';

// Pattern to detect Reachy hotspot networks
const REACHY_HOTSPOT_PATTERNS = [
  'reachy-mini-ap',
  'reachy-mini-hotspot',
  'reachy_mini_ap',
  'reachy_mini_hotspot',
];

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
 * @param {boolean} props.showHotspotDetection - Show hotspot detection alert (default: true)
 * @param {string} props.customBaseUrl - Custom base URL for API calls (e.g. for hotspot mode)
 */
export default function WiFiConfiguration({ 
  darkMode, 
  compact = false,
  onConnectSuccess,
  onConnectStart,
  onReachyHotspotDetected,
  showHotspotDetection = true,
  customBaseUrl = null,
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


  // Fetch WiFi status and scan networks
  const fetchWifiStatus = useCallback(async () => {
    const baseUrl = customBaseUrl || buildApiUrl('').replace(/\/$/, '');
    console.log('[WiFi] 🔍 Fetching WiFi status from:', baseUrl);
    setIsLoadingWifi(true);
    setWifiError(null);
    
    try {
      const statusUrl = `${baseUrl}/wifi/status`;
      console.log('[WiFi] → GET', statusUrl);
      
      const statusResponse = await fetchWithTimeout(
        statusUrl,
        {},
        5000, // 5s timeout for initial check
        { label: 'WiFi status', silent: true }
      );
      
      console.log('[WiFi] ← Status response:', statusResponse.status, statusResponse.ok);
      
      if (statusResponse.ok) {
        const data = await statusResponse.json();
        console.log('[WiFi] ✅ Status data:', data);
        setWifiStatus(data);
        setIsDaemonReachable(true);
      } else {
        console.warn('[WiFi] ❌ Status check failed:', statusResponse.status);
        setIsDaemonReachable(false);
        return; // Don't try to scan if daemon is not reachable
      }
      
      const scanUrl = `${baseUrl}/wifi/scan_and_list`;
      console.log('[WiFi] → POST', scanUrl);
      
      const networksResponse = await fetchWithTimeout(
        scanUrl,
        { method: 'POST' },
        DAEMON_CONFIG.TIMEOUTS.COMMAND * 2,
        { label: 'WiFi scan', silent: true }
      );
      
      console.log('[WiFi] ← Scan response:', networksResponse.status, networksResponse.ok);
      
      if (networksResponse.ok) {
        const networks = await networksResponse.json();
        console.log('[WiFi] ✅ Scanned networks:', networks);
        // Filter out empty network names and Reachy hotspots (we don't want to connect to ourselves)
        const validNetworks = Array.isArray(networks) 
          ? networks.filter(n => {
              if (!n || n.trim().length === 0) return false;
              const lowerName = n.toLowerCase();
              // Filter out Reachy hotspots
              const isReachyHotspot = REACHY_HOTSPOT_PATTERNS.some(pattern => 
                lowerName.includes(pattern.toLowerCase())
              );
              return !isReachyHotspot;
            })
          : [];
        setAvailableNetworks(validNetworks);
      } else {
        console.warn('[WiFi] ❌ Scan failed:', networksResponse.status);
      }
    } catch (err) {
      console.error('[WiFi] ❌ Failed to fetch WiFi status:', err);
      setIsDaemonReachable(false);
      setWifiError(null); // Clear error, we'll show the "not connected" message instead
    } finally {
      setIsLoadingWifi(false);
    }
  }, [customBaseUrl]);

  // Connect to WiFi
  const handleConnect = useCallback(async () => {
    if (!selectedSSID || !wifiPassword) return;
    
    if (onConnectStart) {
      onConnectStart();
    }
    
    setIsConnecting(true);
    setWifiError(null);
    setSuccessMessage(null);
    
    const baseUrl = customBaseUrl || buildApiUrl('').replace(/\/$/, '');
    const connectUrl = `${baseUrl}/wifi/connect?ssid=${encodeURIComponent(selectedSSID)}&password=${encodeURIComponent(wifiPassword)}`;
    console.log('[WiFi] → POST', connectUrl);
    
    try {
      const response = await fetchWithTimeout(
        connectUrl,
        { method: 'POST' },
        DAEMON_CONFIG.TIMEOUTS.COMMAND * 3,
        { label: 'WiFi connect' }
      );
      
      if (response.ok) {
        setSuccessMessage(`Successfully connected to ${selectedSSID}`);
        const connectedSSID = selectedSSID;
        setWifiPassword('');
        setSelectedSSID('');
        
        if (onConnectSuccess) {
          onConnectSuccess(connectedSSID);
        }
        
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
  }, [selectedSSID, wifiPassword, fetchWifiStatus, onConnectSuccess, onConnectStart, customBaseUrl]);

  // Auto-fetch on mount and poll for connection
  useEffect(() => {
    fetchWifiStatus();
    
    // If daemon is not reachable, poll every 3 seconds to check
    const pollInterval = setInterval(() => {
      if (!isDaemonReachable) {
        console.log('[WiFi] Polling for daemon connection...');
        fetchWifiStatus();
      }
    }, 3000);
    
    return () => clearInterval(pollInterval);
  }, [fetchWifiStatus, isDaemonReachable]);

  // Detect Reachy hotspots in available networks
  const detectedReachyHotspots = useMemo(() => {
    return availableNetworks.filter(network => 
      REACHY_HOTSPOT_PATTERNS.some(pattern => 
        network.toLowerCase().includes(pattern.toLowerCase())
      )
    );
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
        return { icon: SignalWifi4BarIcon, text: wifiStatus.connected_network, subtitle: 'Connected', color: '#22c55e' };
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
      <Box sx={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        py: compact ? 2 : 3,
        textAlign: 'center',
      }}>
        <WifiTetheringIcon sx={{ fontSize: 40, color: '#FF9500' }} />
        <Typography sx={{ 
          fontSize: compact ? 13 : 14, 
          fontWeight: 600, 
          color: textPrimary 
        }}>
          Connect to Reachy's Hotspot
        </Typography>
        <Typography sx={{ 
          fontSize: compact ? 11 : 12, 
          color: textSecondary,
          maxWidth: 300,
        }}>
          Open your computer's WiFi settings and connect to:
        </Typography>
        <Box sx={{
          bgcolor: darkMode ? 'rgba(255, 149, 0, 0.1)' : 'rgba(255, 149, 0, 0.08)',
          border: '1px solid',
          borderColor: darkMode ? 'rgba(255, 149, 0, 0.3)' : 'rgba(255, 149, 0, 0.2)',
          borderRadius: '8px',
          px: 2,
          py: 1.5,
        }}>
          <Typography sx={{ 
            fontSize: compact ? 12 : 13, 
            fontWeight: 600, 
            color: '#FF9500' 
          }}>
            Network: reachy-mini-ap
          </Typography>
          <Typography sx={{ 
            fontSize: compact ? 11 : 12, 
            color: textSecondary,
            mt: 0.5,
          }}>
            Password: reachy-mini
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
          <CircularProgress size={14} sx={{ color: '#FF9500' }} />
          <Typography sx={{ 
            fontSize: compact ? 10 : 11, 
            color: textSecondary,
          }}>
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

  // Still checking if daemon is reachable (or loading with customBaseUrl)
  if ((isDaemonReachable === null && isLoadingWifi) || (isDaemonReachable === false && customBaseUrl && isLoadingWifi)) {
    return (
      <Box sx={{ 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center', 
        justifyContent: 'center',
        gap: 1.5,
        py: compact ? 3 : 4,
      }}>
        <CircularProgress size={24} sx={{ color: '#FF9500' }} />
        <Typography sx={{ 
          fontSize: compact ? 12 : 13, 
          color: textSecondary 
        }}>
          {customBaseUrl ? 'Scanning available networks...' : 'Checking connection...'}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: compact ? 1.5 : 2 }}>
      {/* Current Status */}
      <Box sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        gap: 1,
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <StatusIcon sx={{ fontSize: compact ? 18 : 20, color: wifiConfig.color }} />
          <Box>
            <Typography sx={{ 
              fontSize: compact ? 12 : 13, 
              fontWeight: 600, 
              color: textPrimary 
            }}>
              {wifiConfig.text}
            </Typography>
            {wifiConfig.subtitle && (
              <Typography sx={{ 
                fontSize: compact ? 10 : 11, 
                color: textSecondary 
              }}>
                {wifiConfig.subtitle}
              </Typography>
            )}
          </Box>
        </Box>
        
        <IconButton
          onClick={fetchWifiStatus}
          size="small"
          disabled={isLoadingWifi}
          sx={{
            color: 'primary.main',
            '&:disabled': {
              color: darkMode ? '#555' : '#bbb',
            },
          }}
        >
          <RefreshIcon sx={{ 
            fontSize: compact ? 16 : 18,
            animation: isLoadingWifi ? 'spin 1s linear infinite' : 'none',
            '@keyframes spin': {
              '0%': { transform: 'rotate(0deg)' },
              '100%': { transform: 'rotate(360deg)' },
            },
          }} />
        </IconButton>
      </Box>

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
      <Box sx={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: compact ? 1.5 : 2,
        pt: compact ? 1 : 1.5,
        borderTop: `1px solid ${darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
      }}>
        <Typography sx={{ 
          fontSize: compact ? 11 : 12, 
          fontWeight: 600, 
          color: textPrimary 
        }}>
          Connect to Network
        </Typography>
        
        <FormControl size="small" fullWidth sx={inputStyles}>
          <InputLabel>Network</InputLabel>
          <Select
            value={selectedSSID}
            onChange={(e) => setSelectedSSID(e.target.value)}
            label="Network"
            disabled={isLoadingWifi || isConnecting}
            MenuProps={{
              sx: {
                zIndex: 99999, // Above overlay
              },
              PaperProps: {
                sx: {
                  bgcolor: darkMode ? '#1a1a1a' : '#fff',
                  maxHeight: 300,
                },
              },
            }}
          >
            <MenuItem value="" disabled sx={{ color: textSecondary }}>
              <em>{availableNetworks.length === 0 ? 'Scanning...' : 'Select network'}</em>
            </MenuItem>
            {availableNetworks.map((network, i) => (
              <MenuItem 
                key={`${network}-${i}`} 
                value={network} 
                sx={{ 
                  fontSize: compact ? 12 : 13,
                  color: textPrimary,
                }}
              >
                {network}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <TextField
          label="Password"
          type="password"
          value={wifiPassword}
          onChange={(e) => setWifiPassword(e.target.value)}
          size="small"
          fullWidth
          disabled={isConnecting}
          sx={inputStyles}
          onKeyPress={(e) => {
            if (e.key === 'Enter' && selectedSSID && wifiPassword) {
              handleConnect();
            }
          }}
        />

        <Button
          variant="contained"
          onClick={handleConnect}
          disabled={!selectedSSID || !wifiPassword || isConnecting}
          fullWidth
          sx={{
            bgcolor: '#FF9500',
            textTransform: 'none',
            fontSize: compact ? 12 : 13,
            fontWeight: 600,
            minHeight: compact ? 32 : 36,
            borderRadius: compact ? '8px' : '10px',
            '&:hover': {
              bgcolor: '#e68600',
            },
            '&:disabled': {
              bgcolor: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
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

