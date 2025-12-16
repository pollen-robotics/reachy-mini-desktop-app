import React, { useState, useEffect, useCallback } from 'react';
import { 
  Box, 
  Typography, 
  Switch, 
  TextField, 
  IconButton, 
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
  Checkbox,
  FormControlLabel,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import WifiIcon from '@mui/icons-material/Wifi';
import SignalWifi4BarIcon from '@mui/icons-material/SignalWifi4Bar';
import WifiTetheringIcon from '@mui/icons-material/WifiTethering';
import SignalWifiOffIcon from '@mui/icons-material/SignalWifiOff';
import RefreshIcon from '@mui/icons-material/Refresh';
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import NewReleasesOutlinedIcon from '@mui/icons-material/NewReleasesOutlined';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import CloseIcon from '@mui/icons-material/Close';
import FullscreenOverlay from '../FullscreenOverlay';
import useAppStore from '../../store/useAppStore';
import { buildApiUrl, fetchWithTimeout, DAEMON_CONFIG } from '../../config/daemon';

/**
 * Section Header Component
 */
function SectionHeader({ title, icon: Icon, darkMode, action }) {
  const textColor = darkMode ? '#888' : '#666';
  
  return (
    <Box sx={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'space-between',
      mb: 2,
      pb: 1.5,
      borderBottom: `1px solid ${darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {Icon && <Icon sx={{ fontSize: 18, color: textColor }} />}
        <Typography sx={{ 
          fontSize: 14, 
          fontWeight: 700, 
          color: darkMode ? '#f5f5f5' : '#333',
          letterSpacing: '-0.2px',
        }}>
          {title}
        </Typography>
      </Box>
      {action}
    </Box>
  );
}

/**
 * Settings Overlay for 3D Viewer Configuration
 */
export default function SettingsOverlay({ 
  open, 
  onClose, 
  darkMode,
}) {
  const { connectionMode, remoteHost } = useAppStore();
  const isWifiMode = connectionMode === 'wifi';
  
  // Text colors
  const textPrimary = darkMode ? '#f5f5f5' : '#333';
  const textSecondary = darkMode ? '#888' : '#666';
  const textMuted = darkMode ? '#666' : '#999';
  
  // ═══════════════════════════════════════════════════════════════════
  // UPDATE STATE
  // ═══════════════════════════════════════════════════════════════════
  const [updateInfo, setUpdateInfo] = useState(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [preRelease, setPreRelease] = useState(false);
  
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
  const [showWifiConfirm, setShowWifiConfirm] = useState(false);

  // ═══════════════════════════════════════════════════════════════════
  // UPDATE FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════
  
  const checkForUpdate = useCallback(async () => {
    if (!isWifiMode) return;
    setIsCheckingUpdate(true);
    setUpdateInfo(null);
    
    try {
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
    } catch (err) {
      console.error('Failed to check for updates:', err);
    } finally {
      setIsCheckingUpdate(false);
    }
  }, [isWifiMode, preRelease]);

  // Open update confirmation dialog
  const handleUpdateClick = useCallback(() => {
    if (!updateInfo?.is_available || isUpdating) return;
    setShowUpdateConfirm(true);
  }, [updateInfo, isUpdating]);

  // Actually start the update after confirmation
  const confirmUpdate = useCallback(async () => {
    setShowUpdateConfirm(false);
    setIsUpdating(true);
    
    try {
      const response = await fetchWithTimeout(
        buildApiUrl(`/update/start?pre_release=${preRelease}`),
        { method: 'POST' },
        DAEMON_CONFIG.TIMEOUTS.COMMAND,
        { label: 'Start update' }
      );
      
      if (response.ok) {
        const data = await response.json();
        console.log('Update started:', data.job_id);
        
        // Close overlay and disconnect cleanly
        onClose();
        
        // Give user time to see the action, then disconnect
        setTimeout(() => {
          useAppStore.getState().resetConnection();
        }, 1000);
      } else {
        const error = await response.json();
        setWifiError(`Update failed: ${error.detail || 'Unknown error'}`);
        setIsUpdating(false);
      }
    } catch (err) {
      console.error('Failed to start update:', err);
      setWifiError('Failed to start update');
      setIsUpdating(false);
    }
  }, [preRelease, onClose]);

  // ═══════════════════════════════════════════════════════════════════
  // WIFI FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════

  const fetchWifiStatus = useCallback(async () => {
    if (!isWifiMode) return;
    console.log('[WiFi] Fetching WiFi status...');
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
        console.log('[WiFi] Scanned networks:', networks);
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

  // Open WiFi confirmation dialog
  const handleWifiConnectClick = useCallback(() => {
    if (!selectedSSID || !wifiPassword) return;
    setShowWifiConfirm(true);
  }, [selectedSSID, wifiPassword]);

  // Actually connect to WiFi after confirmation
  const confirmWifiConnect = useCallback(async () => {
    setShowWifiConfirm(false);
    setIsConnecting(true);
    setWifiError(null);
    
    try {
      const response = await fetchWithTimeout(
        buildApiUrl(`/wifi/connect?ssid=${encodeURIComponent(selectedSSID)}&password=${encodeURIComponent(wifiPassword)}`),
        { method: 'POST' },
        DAEMON_CONFIG.TIMEOUTS.COMMAND * 3,
        { label: 'WiFi connect' }
      );
      
      if (response.ok) {
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

  useEffect(() => {
    if (open && isWifiMode) {
      checkForUpdate();
      fetchWifiStatus();
    }
  }, [open, isWifiMode, checkForUpdate, fetchWifiStatus]);

  useEffect(() => {
    if (open && isWifiMode) {
      checkForUpdate();
    }
  }, [preRelease]); // eslint-disable-line react-hooks/exhaustive-deps

  // ═══════════════════════════════════════════════════════════════════
  // STYLES
  // ═══════════════════════════════════════════════════════════════════

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

  // Get WiFi status display
  const getWifiStatusText = () => {
    if (!wifiStatus) return { icon: WifiIcon, text: 'Loading...' };
    
    switch (wifiStatus.mode) {
      case 'hotspot':
        return { icon: WifiTetheringIcon, text: 'Hotspot mode' };
      case 'wlan':
        return { icon: SignalWifi4BarIcon, text: wifiStatus.connected_network, subtitle: 'Connected' };
      case 'disconnected':
        return { icon: SignalWifiOffIcon, text: 'Disconnected' };
      case 'busy':
        return { icon: WifiIcon, text: 'Configuring...' };
      default:
        return { icon: WifiIcon, text: 'Unknown' };
    }
  };

  const wifiConfig = getWifiStatusText();

  // Card style
  const cardStyle = {
    p: 2.5,
    borderRadius: '16px',
    bgcolor: darkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.8)',
    border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)'}`,
    backdropFilter: 'blur(10px)',
  };

  return (
    <FullscreenOverlay
      open={open}
      onClose={onClose}
      darkMode={darkMode}
      zIndex={10001}
      centeredX={true}
      centeredY={true}
    >
      <Box
        sx={{
          width: '90%',
          maxWidth: isWifiMode ? '680px' : '360px',
          maxHeight: '85vh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          // Custom scrollbar
          '&::-webkit-scrollbar': { width: 6 },
          '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
          '&::-webkit-scrollbar-thumb': {
            bgcolor: darkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)',
            borderRadius: 3,
          },
        }}
      >
        {/* ═══════════════════════════════════════════════════════════════════
            HEADER
        ═══════════════════════════════════════════════════════════════════ */}
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          pb: 1,
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography sx={{ 
              fontSize: 20, 
              fontWeight: 700, 
              color: textPrimary,
              letterSpacing: '-0.3px',
            }}>
              Settings
            </Typography>
            {connectionMode && (
              <Typography sx={{ 
                fontSize: 11, 
                fontWeight: 600,
                color: textMuted,
                bgcolor: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                px: 1,
                py: 0.25,
                borderRadius: '4px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}>
                {connectionMode === 'wifi' ? 'Reachy WiFi' : connectionMode === 'simulation' ? 'Simulation' : 'USB'}
              </Typography>
            )}
            {isWifiMode && remoteHost && (
              <Typography sx={{ 
                fontSize: 11, 
                color: textMuted,
                fontFamily: 'monospace',
              }}>
                {remoteHost}
              </Typography>
            )}
          </Box>
        <IconButton
          onClick={onClose}
          sx={{
            color: '#FF9500',
            bgcolor: darkMode ? 'rgba(255, 255, 255, 0.08)' : '#ffffff',
            border: '1px solid #FF9500',
            opacity: 0.7,
            '&:hover': {
              opacity: 1,
              bgcolor: darkMode ? 'rgba(255, 255, 255, 0.12)' : '#ffffff',
            },
          }}
        >
          <CloseIcon sx={{ fontSize: 20 }} />
        </IconButton>
        </Box>

        {/* ═══════════════════════════════════════════════════════════════════
            WIFI MODE: Two columns
        ═══════════════════════════════════════════════════════════════════ */}
        {isWifiMode ? (
          <Box sx={{ display: 'flex', gap: 2 }}>
            {/* LEFT COLUMN */}
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              
              {/* UPDATE CARD */}
              <Box sx={cardStyle}>
                <SectionHeader 
                  title="System Update" 
                  icon={SystemUpdateAltIcon} 
                  darkMode={darkMode}
                  action={
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={preRelease}
                          onChange={(e) => setPreRelease(e.target.checked)}
                          size="small"
                          color="primary"
          sx={{
                            color: darkMode ? '#555' : '#ccc',
                            p: 0.5,
                          }}
                        />
                      }
                      label={
                        <Typography sx={{ fontSize: 10, color: textMuted }}>
                          beta
        </Typography>
                      }
                      sx={{ m: 0 }}
                    />
                  }
                />

                {/* Update Status */}
                {isCheckingUpdate ? (
                  <Box sx={{ 
            display: 'flex',
            flexDirection: 'column',
                    alignItems: 'center', 
                    justifyContent: 'center',
            gap: 1.5,
                    height: 159,
                  }}>
                    <CircularProgress size={24} color="primary" />
                    <Typography sx={{ fontSize: 12, color: textSecondary }}>
                      Checking for updates...
                    </Typography>
                  </Box>
                ) : updateInfo ? (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {/* Status badge with refresh */}
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        {updateInfo.is_available ? (
                          <NewReleasesOutlinedIcon sx={{ fontSize: 20, color: textSecondary }} />
                        ) : (
                          <CheckCircleOutlineIcon sx={{ fontSize: 20, color: textSecondary }} />
                        )}
                        <Typography sx={{ 
                          fontSize: 13, 
                          fontWeight: 600,
                          color: textPrimary,
                        }}>
                          {updateInfo.is_available ? 'Update available' : 'Up to date'}
                        </Typography>
                      </Box>
                      <IconButton
                        onClick={checkForUpdate}
                        size="small"
                        disabled={isCheckingUpdate}
                        sx={{ 
                          color: textMuted,
                          p: 0.5,
                          '&:hover': { color: textSecondary },
                        }}
                      >
                        <RefreshIcon sx={{ 
                          fontSize: 16,
                          animation: isCheckingUpdate ? 'spin 1s linear infinite' : 'none',
                          '@keyframes spin': {
                            '0%': { transform: 'rotate(0deg)' },
                            '100%': { transform: 'rotate(360deg)' },
                          },
                        }} />
                      </IconButton>
                    </Box>
                    
                    {/* Version info */}
                    <Box sx={{ 
                      display: 'flex', 
                      alignItems: 'center',
                      gap: 2,
                      p: 1.5,
                      borderRadius: '10px',
                      bgcolor: darkMode ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.03)',
                    }}>
                      <Box sx={{ flex: 1 }}>
                        <Typography sx={{ fontSize: 9, color: textMuted, mb: 0.25, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Current
                        </Typography>
                        <Typography sx={{ fontSize: 12, fontFamily: 'monospace', color: textSecondary }}>
                          {updateInfo.current_version}
                        </Typography>
                      </Box>
                      <Box sx={{ width: '1px', height: 28, bgcolor: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', flexShrink: 0 }} />
                      <Box sx={{ flex: 1 }}>
                        <Typography sx={{ fontSize: 9, color: textMuted, mb: 0.25, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Available
                        </Typography>
                        <Typography sx={{ 
                          fontSize: 12, 
                          fontFamily: 'monospace', 
                          color: textSecondary,
                          fontWeight: updateInfo.is_available ? 600 : 400,
                        }}>
                          {updateInfo.available_version}
                        </Typography>
                      </Box>
                    </Box>
                    
                    {/* Update button */}
                    {updateInfo.is_available && (
                      <Button
                        variant="outlined"
                        onClick={handleUpdateClick}
                        disabled={isUpdating}
                        fullWidth
              sx={{
                          ...buttonStyle, 
                fontSize: 14,
                fontWeight: 600,
                          py: 1.25,
                          borderRadius: '10px',
                        }}
                      >
                        {isUpdating ? <CircularProgress size={20} color="primary" /> : 'Update Now'}
                      </Button>
                    )}
                  </Box>
                ) : (
                  <Box sx={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    height: 159,
                  }}>
                    <Button
                      variant="outlined"
                      onClick={checkForUpdate}
                      sx={{ ...buttonStyle, fontSize: 12 }}
                    >
                      Check for updates
                    </Button>
                  </Box>
                )}
              </Box>

              {/* APP SETTINGS CARD */}
              <Box sx={cardStyle}>
                <SectionHeader title="Appearance" icon={null} darkMode={darkMode} />
                
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    p: 1.5,
                    borderRadius: '12px',
                    bgcolor: darkMode ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                    '&:hover': {
                      bgcolor: darkMode ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.04)',
                    },
                  }}
                  onClick={() => useAppStore.getState().toggleDarkMode()}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    {darkMode ? (
                      <DarkModeOutlinedIcon sx={{ fontSize: 18, color: textSecondary }} />
                    ) : (
                      <LightModeOutlinedIcon sx={{ fontSize: 18, color: textSecondary }} />
                    )}
                    <Typography sx={{ fontSize: 13, fontWeight: 500, color: textPrimary }}>
                      {darkMode ? 'Dark Mode' : 'Light Mode'}
            </Typography>
                  </Box>
                  <Switch
                    checked={darkMode}
                    size="small"
                    color="primary"
                  />
                </Box>
              </Box>
          </Box>
          
            {/* RIGHT COLUMN: WiFi */}
            <Box sx={{ flex: 1 }}>
              <Box sx={{ ...cardStyle, height: '100%' }}>
                <SectionHeader 
                  title="WiFi Network" 
                  icon={WifiIcon} 
                  darkMode={darkMode}
                  action={
                    <IconButton
                      onClick={fetchWifiStatus}
            size="small"
                      disabled={isLoadingWifi}
                      color="primary"
            sx={{
                        p: 0.5,
                        '&:disabled': {
                          color: darkMode ? '#555' : '#bbb',
                        },
                      }}
                    >
                      <RefreshIcon sx={{ 
                        fontSize: 16,
                        animation: isLoadingWifi ? 'spin 1s linear infinite' : 'none',
                        '@keyframes spin': {
                          '0%': { transform: 'rotate(0deg)' },
                          '100%': { transform: 'rotate(360deg)' },
                        },
                      }} />
                    </IconButton>
                  }
                />

                {isLoadingWifi && !wifiStatus ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 2 }}>
                    <CircularProgress size={16} color="primary" />
                    <Typography sx={{ fontSize: 12, color: textSecondary }}>
                      Scanning networks...
                    </Typography>
                  </Box>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {/* Current Status */}
                    <Box sx={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 1.5,
                      p: 1.5,
                      borderRadius: '10px',
                      bgcolor: darkMode ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.03)',
                    }}>
                      <wifiConfig.icon sx={{ fontSize: 20, color: textSecondary }} />
                      <Box sx={{ flex: 1 }}>
                        <Typography sx={{ fontSize: 12, fontWeight: 600, color: textPrimary }}>
                          {wifiConfig.text}
                        </Typography>
                        {wifiConfig.subtitle && (
                          <Typography sx={{ fontSize: 10, color: textMuted }}>
                            {wifiConfig.subtitle}
                          </Typography>
                        )}
                      </Box>
                    </Box>

                    {/* Known Networks */}
                    {wifiStatus?.known_networks?.length > 0 && (
                      <Box>
                        <Typography sx={{ fontSize: 10, color: textMuted, mb: 1, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Saved Networks
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                          {wifiStatus.known_networks.map((network, i) => {
                            const isConnected = network === wifiStatus.connected_network;
                            return (
                              <Chip
                                key={i}
                                label={network}
                                size="small"
                                sx={{
                                  fontSize: 10,
                                  height: 24,
                                  bgcolor: isConnected 
                                    ? (darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)')
                                    : (darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'),
                                  color: isConnected ? textPrimary : textSecondary,
                                  fontWeight: isConnected ? 600 : 400,
                                }}
                              />
                            );
                          })}
                        </Box>
                      </Box>
                    )}

                    {/* Add Network Form */}
                    <Box sx={{ 
                      pt: 2, 
                      mt: 1,
                      borderTop: `1px solid ${darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
                    }}>
                      <Typography sx={{ 
                        fontSize: 12, 
                        fontWeight: 600, 
                        color: textPrimary, 
                        mb: 1.5 
                      }}>
                        Connect to Network
                      </Typography>
                      
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        <FormControl size="small" fullWidth sx={inputStyles}>
                          <InputLabel>Network</InputLabel>
                          <Select
                            value={selectedSSID}
                            onChange={(e) => setSelectedSSID(e.target.value)}
                            label="Network"
                            MenuProps={{
                              sx: { zIndex: 10002 },
                              PaperProps: {
                                sx: {
                                  maxHeight: 200,
                                  bgcolor: darkMode ? '#1e1e1e' : '#fff',
                                }
                              }
                            }}
                          >
                            <MenuItem value="" disabled>
                              <em>{availableNetworks.length === 0 ? 'Scanning...' : 'Select network'}</em>
                            </MenuItem>
                            {availableNetworks.map((network, i) => (
                              <MenuItem key={i} value={network} sx={{ fontSize: 13 }}>
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
                          sx={inputStyles}
                        />
                        
                        {wifiError && (
                          <Typography sx={{ fontSize: 11, color: textSecondary }}>
                            ⚠️ {wifiError}
                          </Typography>
                        )}
                        
                        <Button
                          variant="outlined"
                          onClick={handleWifiConnectClick}
                          disabled={!selectedSSID || !wifiPassword || isConnecting}
            fullWidth
            sx={{
                            ...buttonStyle,
                            fontWeight: 600,
                            fontSize: 13,
                            py: 1,
                            borderRadius: '10px',
                          }}
                        >
                          {isConnecting ? (
                            <CircularProgress size={18} color="primary" />
                          ) : (
                            'Connect'
                          )}
                        </Button>
                      </Box>
                    </Box>
                  </Box>
                )}
              </Box>
            </Box>
        </Box>
        ) : (
          /* ═══════════════════════════════════════════════════════════════════
              USB/SIMULATION MODE: Single column
          ═══════════════════════════════════════════════════════════════════ */
          <Box sx={cardStyle}>
            <SectionHeader title="Appearance" icon={null} darkMode={darkMode} />
            
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
                p: 1.5,
            borderRadius: '12px',
                bgcolor: darkMode ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)',
                cursor: 'pointer',
                transition: 'background 0.15s',
                '&:hover': {
                  bgcolor: darkMode ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.04)',
                },
              }}
              onClick={() => useAppStore.getState().toggleDarkMode()}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {darkMode ? (
                  <DarkModeOutlinedIcon sx={{ fontSize: 20, color: textSecondary }} />
            ) : (
                  <LightModeOutlinedIcon sx={{ fontSize: 20, color: textSecondary }} />
            )}
                <Typography sx={{ fontSize: 14, fontWeight: 500, color: textPrimary }}>
                  {darkMode ? 'Dark Mode' : 'Light Mode'}
              </Typography>
          </Box>
          <Switch
            checked={darkMode}
                color="primary"
          />
        </Box>
          </Box>
        )}
      </Box>
      
      {/* Update Confirmation Dialog */}
      <Dialog
        open={showUpdateConfirm}
        onClose={() => setShowUpdateConfirm(false)}
        PaperProps={{
          sx: {
            borderRadius: 3,
            bgcolor: 'background.paper',
            maxWidth: 400,
          }
        }}
      >
        <DialogTitle sx={{ fontWeight: 600 }}>
          Start Update?
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: 'text.secondary' }}>
            Update to <strong>{updateInfo?.available_version}</strong>?
            <br /><br />
            The robot will restart and you will be <strong>disconnected</strong>.
            <br />
            Reconnect after ~2 minutes when the update is complete.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button 
            onClick={() => setShowUpdateConfirm(false)}
            sx={{ color: 'text.secondary' }}
          >
            Cancel
          </Button>
          <Button 
            onClick={confirmUpdate}
            variant="contained"
            color="primary"
          >
            Update Now
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* WiFi Confirmation Dialog */}
      <Dialog
        open={showWifiConfirm}
        onClose={() => setShowWifiConfirm(false)}
        PaperProps={{
          sx: {
            borderRadius: 3,
            bgcolor: 'background.paper',
            maxWidth: 400,
          }
        }}
      >
        <DialogTitle sx={{ fontWeight: 600 }}>
          Connect to WiFi?
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: 'text.secondary' }}>
            Connect Reachy to "<strong>{selectedSSID}</strong>"?
            <br /><br />
            If this is a different network than your computer, you may <strong>lose connection</strong> to the robot.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button 
            onClick={() => setShowWifiConfirm(false)}
            sx={{ color: 'text.secondary' }}
          >
            Cancel
          </Button>
          <Button 
            onClick={confirmWifiConnect}
            variant="contained"
            color="primary"
          >
            Connect
          </Button>
        </DialogActions>
      </Dialog>
    </FullscreenOverlay>
  );
}
