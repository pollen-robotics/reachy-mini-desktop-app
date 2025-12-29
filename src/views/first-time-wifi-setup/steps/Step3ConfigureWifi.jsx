import React from 'react';
import { Box, Typography } from '@mui/material';
import { WiFiConfiguration } from '../../../components/wifi';

// Base URL for hotspot mode (when connected to reachy-mini-ap)
// Use IP directly since Tauri's fetch may have issues with mDNS (.local)
const HOTSPOT_BASE_URL = 'http://10.42.0.1:8000';

export default function Step3ConfigureWifi({
  darkMode,
  textPrimary,
  textSecondary,
  onConnectStart,
}) {
  return (
    <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <Typography sx={{ fontSize: 12, color: textSecondary, mb: 2, textAlign: 'center', lineHeight: 1.5 }}>
        Select the network you want your Reachy to use.
      </Typography>

      {/* WiFi Form */}
      <Box sx={{ width: '100%' }}>
        <WiFiConfiguration 
          darkMode={darkMode}
          compact={true}
          onConnectStart={onConnectStart}
          showHotspotDetection={false}
          customBaseUrl={HOTSPOT_BASE_URL}
        />
      </Box>
    </Box>
  );
}

