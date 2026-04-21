import React from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import WifiIcon from '@mui/icons-material/Wifi';
import SectionHeader from './SectionHeader';

export interface WifiStatus {
  mode?: 'wlan' | 'hotspot' | 'disconnected' | string;
  connected_network?: string;
  known_networks?: string[];
  [key: string]: unknown;
}

export interface SettingsWifiCardProps {
  darkMode: boolean;
  wifiStatus: WifiStatus | null;
  isLoadingWifi: boolean;
  onRefresh: () => void;
  onChangeNetwork: () => void;
  onClearAllNetworks: () => void;
  cardStyle?: SxProps<Theme>;
}

export default function SettingsWifiCard({
  darkMode,
  wifiStatus,
  isLoadingWifi,
  onChangeNetwork,
  onClearAllNetworks,
  cardStyle,
}: SettingsWifiCardProps): React.ReactElement {
  const textPrimary = darkMode ? '#f5f5f5' : '#333';
  const textSecondary = darkMode ? '#888' : '#666';
  const textMuted = darkMode ? '#666' : '#999';

  const isConnected = wifiStatus?.mode === 'wlan';
  const isHotspot = wifiStatus?.mode === 'hotspot';
  const isDisconnected = wifiStatus?.mode === 'disconnected';
  const knownNetworks = wifiStatus?.known_networks || [];

  return (
    <Box sx={{ ...cardStyle, height: '100%', display: 'flex', flexDirection: 'column' }}>
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

      <Box sx={{ minHeight: 140, display: 'flex', flexDirection: 'column' }}>
        {isLoadingWifi && !wifiStatus ? (
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1.5,
            }}
          >
            <CircularProgress size={24} color="primary" />
            <Typography sx={{ fontSize: 12, color: textSecondary }}>
              Scanning networks...
            </Typography>
          </Box>
        ) : (
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              gap: 1.5,
            }}
          >
            <Box>
              <Typography
                sx={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: textPrimary,
                  mb: 0.5,
                }}
              >
                {isConnected
                  ? wifiStatus?.connected_network
                  : isHotspot
                    ? 'Hotspot mode'
                    : isDisconnected
                      ? 'Disconnected'
                      : 'Unknown'}
              </Typography>
              <Typography
                sx={{
                  fontSize: 12,
                  color: isConnected ? '#22c55e' : isHotspot ? '#f59e0b' : textMuted,
                }}
              >
                {isConnected
                  ? 'Connected'
                  : isHotspot
                    ? 'Broadcasting network'
                    : 'Not connected to any network'}
              </Typography>
            </Box>

            {knownNetworks.length > 0 && (
              <Box sx={{ width: '100%', mt: 0.5 }}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 1,
                    mb: 0.75,
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: textMuted,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    Saved ({knownNetworks.length})
                  </Typography>
                  <Typography sx={{ color: textMuted, fontSize: 10 }}>•</Typography>
                  <Typography
                    onClick={onClearAllNetworks}
                    sx={{
                      fontSize: 10,
                      color: '#ef4444',
                      cursor: 'pointer',
                      '&:hover': { textDecoration: 'underline' },
                    }}
                  >
                    Clear all
                  </Typography>
                </Box>
                <Box
                  sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                    gap: 0.5,
                  }}
                >
                  {knownNetworks.map(network => {
                    const isActive = network === wifiStatus?.connected_network;
                    return (
                      <Box
                        key={network}
                        sx={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          py: 0.25,
                          px: 0.75,
                          borderRadius: '6px',
                          bgcolor: isActive
                            ? darkMode
                              ? 'rgba(34, 197, 94, 0.15)'
                              : 'rgba(34, 197, 94, 0.1)'
                            : darkMode
                              ? 'rgba(255,255,255,0.05)'
                              : 'rgba(0,0,0,0.04)',
                          border: isActive
                            ? '1px solid rgba(34, 197, 94, 0.3)'
                            : `1px solid ${darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                        }}
                      >
                        <Typography
                          sx={{
                            fontSize: 11,
                            color: isActive ? '#22c55e' : textSecondary,
                            fontWeight: isActive ? 600 : 400,
                            maxWidth: 100,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {network}
                        </Typography>
                      </Box>
                    );
                  })}
                </Box>
              </Box>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
}
