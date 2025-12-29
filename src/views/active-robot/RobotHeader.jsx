import React, { useState, useEffect } from 'react';
import { Box, Typography } from '@mui/material';
import { getVersion } from '@tauri-apps/api/app';
import useAppStore from '../../store/useAppStore';

/**
 * Robot header with title, version and metadata
 * Apple style: minimalist, clean, spacious
 */
export default function RobotHeader({ daemonVersion, darkMode = false }) {
  const { connectionMode } = useAppStore();
  const [appVersion, setAppVersion] = useState('');

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => setAppVersion(null));
  }, []);

  // Get connection type label
  const getConnectionLabel = () => {
    if (connectionMode === 'wifi') return 'WiFi';
    if (connectionMode === 'simulation') return 'Sim';
    return 'USB';
  };

  return (
    <Box
      sx={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        py: 1,
        mb: 1.5,
      }}
    >
      {/* Title with connection badge */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: -0.5 }}>
        <Typography
          sx={{
            fontSize: 20,
            fontWeight: 600,
            color: darkMode ? '#f5f5f5' : '#1d1d1f',
            letterSpacing: '-0.4px',
          }}
        >
          Reachy Mini
        </Typography>
        {connectionMode && (
          <Typography
            component="span"
            sx={{
              fontSize: 10,
              fontWeight: 600,
              color: darkMode ? '#666' : '#999',
              bgcolor: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
              px: 0.75,
              py: 0.25,
              borderRadius: '4px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            {getConnectionLabel()}
          </Typography>
        )}
      </Box>
      
      {/* Version Subtitle - App + Daemon */}
      <Typography
        sx={{
          fontSize: 9,
          fontWeight: 500,
          color: darkMode ? '#666' : '#999',
          fontFamily: 'SF Mono, Monaco, Menlo, monospace',
          mb: 0.75,
        }}
      >
        {appVersion ? `App v${appVersion}` : 'App ?'}
        <Box
          component="span"
          sx={{
            display: 'inline-block',
            width: 3,
            height: 3,
            borderRadius: '50%',
            bgcolor: darkMode ? '#555' : '#bbb',
            mx: 1,
            verticalAlign: 'middle',
          }}
        />
        {daemonVersion ? `Daemon v${daemonVersion}` : 'Daemon ?'}
      </Typography>
    </Box>
  );
}

