import React from 'react';
import { Box, Typography } from '@mui/material';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';

/**
 * CameraFeed Component - Displays camera unavailable placeholder
 */
export default function CameraFeed({ width = 240, height = 180, isLarge = false }) {
  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        height: '100%',
        borderRadius: isLarge ? '16px' : '12px',
        overflow: 'hidden',
        border: isLarge ? 'none' : '1px solid rgba(0, 0, 0, 0.08)',
        bgcolor: '#000000',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
      }}
    >
      <VideocamOffIcon
        sx={{
          fontSize: isLarge ? 64 : 32,
          color: 'rgba(255, 255, 255, 0.3)',
        }}
      />
      <Typography
        sx={{
          fontSize: isLarge ? 9 : 8,
          color: 'rgba(255, 255, 255, 0.4)',
          fontFamily: 'SF Mono, Monaco, Menlo, monospace',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        Camera Unavailable
      </Typography>
    </Box>
  );
}
