import React from 'react';
import { Box, Typography, Button } from '@mui/material';
import BluetoothIcon from '@mui/icons-material/Bluetooth';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { open } from '@tauri-apps/plugin-shell';

import useAppStore from '../../store/useAppStore';
import FullscreenOverlay from '../../components/FullscreenOverlay';

const BLUETOOTH_DASHBOARD_URL = 'https://pollen-robotics.github.io/reachy_mini/';

/**
 * BluetoothSupportView - Redirect to external Bluetooth dashboard
 * 
 * The native BLE plugin has compatibility issues on macOS.
 * We redirect users to Pollen's web-based Bluetooth dashboard instead.
 */
export default function BluetoothSupportView() {
  const { darkMode, setShowBluetoothSupportView } = useAppStore();

  const textPrimary = darkMode ? '#f5f5f5' : '#333';
  const textSecondary = darkMode ? '#888' : '#666';
  const bgCard = darkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)';
  const borderColor = darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';

  const handleOpenDashboard = async () => {
    try {
      await open(BLUETOOTH_DASHBOARD_URL);
    } catch (err) {
      console.error('Failed to open URL:', err);
      // Fallback: open in default browser
      window.open(BLUETOOTH_DASHBOARD_URL, '_blank');
    }
  };

  const handleClose = () => {
    setShowBluetoothSupportView(false);
  };

  return (
    <FullscreenOverlay
      open={true}
      onClose={handleClose}
      darkMode={darkMode}
      showCloseButton={true}
      centered={true}
      backdropBlur={40}
      debugName="BluetoothSupport"
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          px: 3,
          py: 4,
          width: '100%',
          maxWidth: 450,
        }}
      >
        {/* Content Card */}
        <Box
          sx={{
            width: '100%',
            bgcolor: bgCard,
            borderRadius: '12px',
            border: '1px solid',
            borderColor: borderColor,
            p: 4,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
          }}
        >
          <BluetoothIcon sx={{ fontSize: 48, color: textSecondary, mb: 2 }} />

          <Typography sx={{ fontSize: 18, fontWeight: 600, color: textPrimary, mb: 1 }}>
            Bluetooth Reset Tool
          </Typography>

          <Typography sx={{ fontSize: 13, color: textSecondary, mb: 3, lineHeight: 1.6 }}>
            Reset your Reachy via Bluetooth if it's stuck or unresponsive.
            Use the web-based Bluetooth dashboard in Chrome or Edge.
          </Typography>

          <Button
            variant="outlined"
            onClick={handleOpenDashboard}
            fullWidth
            startIcon={<OpenInNewIcon />}
            sx={{
              fontSize: 14,
              fontWeight: 600,
              textTransform: 'none',
              py: 1.5,
              borderRadius: '10px',
              borderColor: '#FF9500',
              color: '#FF9500',
              mb: 2,
              '&:hover': {
                borderColor: '#e68600',
                bgcolor: 'rgba(255, 149, 0, 0.08)',
              },
            }}
          >
            Open Bluetooth Dashboard
          </Button>

          <Typography sx={{ fontSize: 11, color: textSecondary, lineHeight: 1.5 }}>
            Requires Chrome, Edge, or Opera browser.
            <br />
            Make sure Bluetooth is enabled on your computer.
          </Typography>
        </Box>

      </Box>
    </FullscreenOverlay>
  );
}
