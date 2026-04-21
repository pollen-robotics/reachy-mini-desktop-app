import React from 'react';
import { Box, Typography } from '@mui/material';
// TODO(ts): WiFiConfiguration.jsx JSDoc marks optional callbacks as required.
// Cast until the component itself is migrated.

import { WiFiConfiguration as WiFiConfigurationRaw } from '../../../components/wifi';

const WiFiConfiguration = WiFiConfigurationRaw as unknown as React.FC<any>;

// Base URL for hotspot mode (when connected to reachy-mini-ap)
// Use IP directly since Tauri's fetch may have issues with mDNS (.local)
const HOTSPOT_BASE_URL = 'http://10.42.0.1:8000';

interface Step3ConfigureWifiProps {
  darkMode: boolean;
  textPrimary: string;
  textSecondary: string;
  onConnectSuccess: (ssid: string) => void;
  onError: (message: string, severity?: 'success' | 'error' | 'warning' | 'info') => void;
  resetKey: number;
}

export default function Step3ConfigureWifi({
  darkMode,
  textPrimary: _textPrimary,
  textSecondary,
  onConnectSuccess,
  onError,
  resetKey,
}: Step3ConfigureWifiProps): React.ReactElement {
  return (
    <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <Typography
        sx={{ fontSize: 12, color: textSecondary, mb: 2, textAlign: 'center', lineHeight: 1.5 }}
      >
        Select the network you want your Reachy to use.
      </Typography>

      {/* WiFi Form */}
      <Box sx={{ width: '100%' }}>
        <WiFiConfiguration
          key={resetKey}
          darkMode={darkMode}
          compact={true}
          onConnectSuccess={onConnectSuccess}
          onError={onError}
          showHotspotDetection={false}
          customBaseUrl={HOTSPOT_BASE_URL}
          skipInitialFetch={resetKey > 0}
        />
      </Box>
    </Box>
  );
}
