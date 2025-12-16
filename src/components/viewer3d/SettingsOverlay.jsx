import React, { useState } from 'react';
import { Box, Typography, Switch, TextField, IconButton } from '@mui/material';
import WifiIcon from '@mui/icons-material/Wifi';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import CloseIcon from '@mui/icons-material/Close';
import FullscreenOverlay from '../FullscreenOverlay';
import useAppStore from '../../store/useAppStore';

/**
 * Settings Overlay for 3D Viewer Configuration
 * Opens when clicking the settings cog button
 */
export default function SettingsOverlay({ 
  open, 
  onClose, 
  darkMode,
}) {
  const [wifiSSID, setWifiSSID] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');

  return (
    <FullscreenOverlay
      open={open}
      onClose={onClose}
      darkMode={darkMode}
      zIndex={10001} // Above everything (Settings overlay)
      centeredX={true}
      centeredY={true}
    >
      {/* Centered content */}
      <Box
        sx={{
          position: 'relative',
          width: '90%',
          maxWidth: '400px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 3,
        }}
      >
        {/* Close button - top right */}
        <IconButton
          onClick={onClose}
          sx={{
            position: 'absolute',
            top: 0,
            right: 0,
            color: '#FF9500',
            bgcolor: darkMode ? 'rgba(255, 255, 255, 0.08)' : '#ffffff',
            border: '1px solid #FF9500',
            opacity: 0.7,
            '&:hover': {
              opacity: 1,
              bgcolor: darkMode ? 'rgba(255, 255, 255, 0.12)' : '#ffffff',
            },
            zIndex: 1,
          }}
        >
          <CloseIcon sx={{ fontSize: 20 }} />
        </IconButton>

        {/* Title */}
        <Typography
          sx={{
            fontSize: 24,
            fontWeight: 700,
            color: darkMode ? '#f5f5f5' : '#333',
            letterSpacing: '-0.3px',
            textAlign: 'center',
          }}
        >
          Settings
        </Typography>

        {/* WiFi Configuration */}
        <Box
          sx={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: 1.5,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <WifiIcon sx={{ fontSize: 18, color: darkMode ? '#aaa' : '#666' }} />
            <Typography
              sx={{
                fontSize: 14,
                fontWeight: 600,
                color: darkMode ? '#f5f5f5' : '#333',
              }}
            >
              WiFi Configuration
            </Typography>
          </Box>
          
          <TextField
            label="Network SSID"
            value={wifiSSID}
            onChange={(e) => setWifiSSID(e.target.value)}
            placeholder="Enter network name"
            size="small"
            fullWidth
            sx={{
              '& .MuiOutlinedInput-root': {
                bgcolor: darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)',
                '& fieldset': {
                  borderColor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
                },
                '&:hover fieldset': {
                  borderColor: darkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)',
                },
                '&.Mui-focused fieldset': {
                  borderColor: '#FF9500',
                },
              },
              '& .MuiInputLabel-root': {
                color: darkMode ? '#aaa' : '#666',
              },
              '& .MuiInputBase-input': {
                color: darkMode ? '#f5f5f5' : '#333',
              },
            }}
          />
          
          <TextField
            label="Password"
            type="password"
            value={wifiPassword}
            onChange={(e) => setWifiPassword(e.target.value)}
            placeholder="Enter password"
            size="small"
            fullWidth
            sx={{
              '& .MuiOutlinedInput-root': {
                bgcolor: darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)',
                '& fieldset': {
                  borderColor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
                },
                '&:hover fieldset': {
                  borderColor: darkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)',
                },
                '&.Mui-focused fieldset': {
                  borderColor: '#FF9500',
                },
              },
              '& .MuiInputLabel-root': {
                color: darkMode ? '#aaa' : '#666',
              },
              '& .MuiInputBase-input': {
                color: darkMode ? '#f5f5f5' : '#333',
              },
            }}
          />
        </Box>

        {/* Dark Mode Toggle */}
        <Box
          sx={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            p: 2,
            borderRadius: '12px',
            bgcolor: darkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
            border: darkMode ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(0, 0, 0, 0.06)',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {darkMode ? (
              <LightModeOutlinedIcon sx={{ fontSize: 20, color: darkMode ? '#aaa' : '#666' }} />
            ) : (
              <DarkModeOutlinedIcon sx={{ fontSize: 20, color: darkMode ? '#aaa' : '#666' }} />
            )}
            <Box>
              <Typography
                sx={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: darkMode ? '#f5f5f5' : '#333',
                  mb: 0.25,
                }}
              >
                {darkMode ? 'Light Mode' : 'Dark Mode'}
              </Typography>
              <Typography
                sx={{
                  fontSize: 11,
                  color: darkMode ? '#888' : '#999',
                }}
              >
                {darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
              </Typography>
            </Box>
          </Box>
          <Switch
            checked={darkMode}
            onChange={() => useAppStore.getState().toggleDarkMode()}
            sx={{
              '& .MuiSwitch-switchBase.Mui-checked': {
                color: '#FF9500',
              },
              '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                backgroundColor: '#FF9500',
              },
            }}
          />
        </Box>
      </Box>
    </FullscreenOverlay>
  );
}

