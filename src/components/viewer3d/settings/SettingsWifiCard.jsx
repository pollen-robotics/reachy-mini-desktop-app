import React from 'react';
import { 
  Box, 
  Typography, 
  CircularProgress,
} from '@mui/material';
import WifiIcon from '@mui/icons-material/Wifi';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import WifiTetheringIcon from '@mui/icons-material/WifiTethering';
import SectionHeader from './SectionHeader';

/**
 * WiFi Card Component
 * Simplified UX - shows status only, "Change network" opens overlay
 */
export default function SettingsWifiCard({
  darkMode,
  wifiStatus,
  isLoadingWifi,
  onRefresh,
  onChangeNetwork,
  cardStyle,
}) {
  const textPrimary = darkMode ? '#f5f5f5' : '#333';
  const textSecondary = darkMode ? '#888' : '#666';
  const textMuted = darkMode ? '#666' : '#999';

  // Determine status
  const isConnected = wifiStatus?.mode === 'wlan';
  const isHotspot = wifiStatus?.mode === 'hotspot';
  const isDisconnected = wifiStatus?.mode === 'disconnected';

  // Get icon based on status
  const StatusIcon = isConnected ? WifiIcon 
    : isHotspot ? WifiTetheringIcon 
    : isDisconnected ? WifiOffIcon 
    : WifiIcon;

  return (
    <Box sx={{ ...cardStyle, height: '100%' }}>
      <SectionHeader 
        title="WiFi Network" 
        icon={WifiIcon} 
        darkMode={darkMode}
        action={
          wifiStatus && (
            <Typography
              onClick={onChangeNetwork}
            sx={{
                fontSize: 11,
                color: textMuted,
                textDecoration: 'underline',
                cursor: 'pointer',
                '&:hover': { color: textSecondary },
              }}
            >
              Change network
            </Typography>
          )
        }
      />

      {/* Content with min height */}
      <Box sx={{ minHeight: 140, display: 'flex', flexDirection: 'column' }}>
      {isLoadingWifi && !wifiStatus ? (
          // Loading state
          <Box sx={{ 
            flex: 1,
            display: 'flex', 
            flexDirection: 'column',
            alignItems: 'center', 
            justifyContent: 'center',
            gap: 1.5,
          }}>
            <CircularProgress size={24} color="primary" />
          <Typography sx={{ fontSize: 12, color: textSecondary }}>
            Scanning networks...
          </Typography>
        </Box>
      ) : (
          // Status display
          <Box sx={{ 
            flex: 1,
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center',
            textAlign: 'center',
            gap: 1.5,
          }}>
            <StatusIcon sx={{ 
              fontSize: 32, 
              color: isConnected ? '#22c55e' : textSecondary,
            }} />
            <Box>
              <Typography sx={{ 
                fontSize: 14, 
                fontWeight: 600,
                color: textPrimary,
                mb: 0.5,
              }}>
                {isConnected ? wifiStatus.connected_network : 
                 isHotspot ? 'Hotspot mode' :
                 isDisconnected ? 'Disconnected' : 'Unknown'}
              </Typography>
            <Typography sx={{ 
              fontSize: 12, 
                color: isConnected ? '#22c55e' : textMuted,
              }}>
                {isConnected ? 'Connected' : 
                 isHotspot ? 'Broadcasting network' :
                 'Not connected to any network'}
                </Typography>
            </Box>
          </Box>
        )}

        </Box>
    </Box>
  );
}

