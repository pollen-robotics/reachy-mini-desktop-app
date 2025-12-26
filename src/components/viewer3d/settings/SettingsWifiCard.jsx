import React from 'react';
import { 
  Box, 
  Typography, 
  TextField, 
  IconButton, 
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
  Chip,
} from '@mui/material';
import WifiIcon from '@mui/icons-material/Wifi';
import SignalWifi4BarIcon from '@mui/icons-material/SignalWifi4Bar';
import WifiTetheringIcon from '@mui/icons-material/WifiTethering';
import SignalWifiOffIcon from '@mui/icons-material/SignalWifiOff';
import RefreshIcon from '@mui/icons-material/Refresh';
import SectionHeader from './SectionHeader';

/**
 * WiFi Card Component
 * Displays WiFi status and network configuration controls
 */
export default function SettingsWifiCard({
  darkMode,
  wifiStatus,
  availableNetworks,
  isLoadingWifi,
  selectedSSID,
  wifiPassword,
  isConnecting,
  wifiError,
  onRefresh,
  onSSIDChange,
  onPasswordChange,
  onConnectClick,
  cardStyle,
  buttonStyle,
  inputStyles,
}) {
  const textPrimary = darkMode ? '#f5f5f5' : '#333';
  const textSecondary = darkMode ? '#888' : '#666';
  const textMuted = darkMode ? '#666' : '#999';

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

  return (
    <Box sx={{ ...cardStyle, height: '100%' }}>
      <SectionHeader 
        title="WiFi Network" 
        icon={WifiIcon} 
        darkMode={darkMode}
        action={
          <IconButton
            onClick={onRefresh}
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
                  onChange={(e) => onSSIDChange(e.target.value)}
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
                onChange={(e) => onPasswordChange(e.target.value)}
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
                onClick={onConnectClick}
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
  );
}

