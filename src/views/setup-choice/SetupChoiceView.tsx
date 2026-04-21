import { Box, Typography } from '@mui/material';
import WifiOutlinedIcon from '@mui/icons-material/WifiOutlined';
import BluetoothIcon from '@mui/icons-material/Bluetooth';

import useAppStore from '../../store/useAppStore';
import FullscreenOverlayUntyped from '../../components/FullscreenOverlay';
import type React from 'react';

// TODO(ts): FullscreenOverlay lives outside this agent's migration scope; cast locally
// to a React.FC shape that matches the runtime call signature we use.
const FullscreenOverlay = FullscreenOverlayUntyped as unknown as React.FC<{
  open: boolean;
  onClose: () => void;
  children?: React.ReactNode;
  darkMode?: boolean;
  showCloseButton?: boolean;
  centered?: boolean;
  backdropBlur?: number;
  debugName?: string;
}>;

/**
 * SetupChoiceView - fullscreen overlay letting the user choose
 * between WiFi first-time setup and Bluetooth troubleshooting.
 */
export default function SetupChoiceView() {
  const { darkMode, setShowSetupChoice, setShowFirstTimeWifiSetup, setShowBluetoothSupportView } =
    useAppStore();

  const textPrimary = darkMode ? '#f5f5f5' : '#333';
  const textSecondary = darkMode ? '#888' : '#666';
  const bgCard = darkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)';
  const borderColor = darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';

  const handleWifi = () => {
    setShowSetupChoice(false);
    setShowFirstTimeWifiSetup(true);
  };

  const handleBluetooth = () => {
    setShowSetupChoice(false);
    setShowBluetoothSupportView(true);
  };

  const handleClose = () => {
    setShowSetupChoice(false);
  };

  return (
    <FullscreenOverlay
      open={true}
      onClose={handleClose}
      darkMode={darkMode}
      showCloseButton={true}
      centered={true}
      backdropBlur={40}
      debugName="SetupChoice"
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
          maxWidth: 480,
        }}
      >
        <Typography
          sx={{
            fontSize: 22,
            fontWeight: 700,
            color: textPrimary,
            mb: 1,
            textAlign: 'center',
            letterSpacing: '-0.3px',
          }}
        >
          How would you like to proceed?
        </Typography>

        <Typography
          sx={{
            fontSize: 13,
            color: textSecondary,
            textAlign: 'center',
            mb: 3,
            lineHeight: 1.5,
          }}
        >
          Set up WiFi for the first time, or use Bluetooth to troubleshoot your robot.
        </Typography>

        {/* Cards container */}
        <Box sx={{ display: 'flex', gap: 2, width: '100%' }}>
          {/* WiFi Setup Card (primary) */}
          <Box
            onClick={handleWifi}
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
              p: 3,
              borderRadius: '12px',
              border: '2px solid',
              borderColor: '#FF9500',
              bgcolor: darkMode ? 'rgba(255, 149, 0, 0.06)' : 'rgba(255, 149, 0, 0.04)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              '&:hover': {
                bgcolor: darkMode ? 'rgba(255, 149, 0, 0.12)' : 'rgba(255, 149, 0, 0.08)',
              },
            }}
          >
            <WifiOutlinedIcon sx={{ fontSize: 36, color: '#FF9500' }} />
            <Typography
              sx={{ fontSize: 15, fontWeight: 600, color: textPrimary, textAlign: 'center' }}
            >
              WiFi Setup
            </Typography>
            <Typography
              sx={{
                fontSize: 11,
                color: textSecondary,
                textAlign: 'center',
                lineHeight: 1.4,
              }}
            >
              First time connecting your Reachy to WiFi
            </Typography>
          </Box>

          {/* Bluetooth Card (secondary + Beta badge) */}
          <Box
            onClick={handleBluetooth}
            sx={{
              position: 'relative',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
              p: 3,
              borderRadius: '12px',
              border: '1px solid',
              borderColor: borderColor,
              bgcolor: bgCard,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              '&:hover': {
                borderColor: darkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.15)',
                bgcolor: darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
              },
            }}
          >
            {/* Beta badge */}
            <Box
              sx={{
                position: 'absolute',
                top: 8,
                right: 8,
                px: 0.75,
                py: 0.25,
                borderRadius: '4px',
                bgcolor: darkMode ? 'rgba(255, 149, 0, 0.15)' : 'rgba(255, 149, 0, 0.1)',
                border: `1px solid ${darkMode ? 'rgba(255, 149, 0, 0.3)' : 'rgba(255, 149, 0, 0.25)'}`,
              }}
            >
              <Typography
                sx={{
                  fontSize: 8,
                  fontWeight: 600,
                  color: '#FF9500',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  lineHeight: 1,
                }}
              >
                beta
              </Typography>
            </Box>

            <BluetoothIcon sx={{ fontSize: 36, color: textSecondary }} />
            <Typography
              sx={{ fontSize: 15, fontWeight: 600, color: textPrimary, textAlign: 'center' }}
            >
              Bluetooth
            </Typography>
            <Typography
              sx={{
                fontSize: 11,
                color: textSecondary,
                textAlign: 'center',
                lineHeight: 1.4,
              }}
            >
              Troubleshoot or recover when WiFi is unavailable
            </Typography>
          </Box>
        </Box>
      </Box>
    </FullscreenOverlay>
  );
}
