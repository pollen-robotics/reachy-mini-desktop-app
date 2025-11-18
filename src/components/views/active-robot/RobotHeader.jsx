import React from 'react';
import { Box, Typography } from '@mui/material';

/**
 * Robot header with title, version and metadata
 * Apple style: minimalist, clean, spacious
 */
export default function RobotHeader({ daemonVersion, darkMode = false }) {

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
      {/* Title */}
      <Typography
        sx={{
          fontSize: 20,
          fontWeight: 600,
          color: darkMode ? '#f5f5f5' : '#1d1d1f',
          letterSpacing: '-0.4px',
          mb: -0.5,
        }}
      >
        Reachy Mini
      </Typography>
      
      {/* Version Subtitle */}
      <Typography
        sx={{
          fontSize: 11,
          fontWeight: 500,
          color: darkMode ? '#888' : '#86868b',
          fontFamily: 'SF Mono, Monaco, Menlo, monospace',
          mb: 0.75,
        }}
      >
        {daemonVersion ? `Daemon v${daemonVersion}` : 'Daemon unknown version'}
      </Typography>
    </Box>
  );
}

