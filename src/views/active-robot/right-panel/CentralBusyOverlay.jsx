import React from 'react';
import { Box, Typography } from '@mui/material';
import PhonelinkOutlinedIcon from '@mui/icons-material/PhonelinkOutlined';

/**
 * Fills the right panel when a remote web app is currently holding the
 * robot via the central cloud relay. Masking the launcher is the cleanest
 * way to prevent concurrent launches — the user can't fight the remote
 * session if they can't see the "Run app" button in the first place.
 *
 * The release mechanism is explained in plain language: the remote app
 * holds the slot until its browser tab / window is closed.
 */
export default function CentralBusyOverlay({ activeApp, darkMode = false }) {
  const accent = '#f59e0b'; // amber — consistent with the "busy" semantic

  return (
    <Box
      sx={{
        width: '100%',
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        px: 3,
        py: 4,
        textAlign: 'center',
      }}
    >
      {/* Icon in accent-tinted circle */}
      <Box
        sx={{
          width: 72,
          height: 72,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: darkMode ? 'rgba(245, 158, 11, 0.12)' : 'rgba(245, 158, 11, 0.08)',
          border: `1px solid ${darkMode ? 'rgba(245, 158, 11, 0.3)' : 'rgba(245, 158, 11, 0.25)'}`,
          mb: 0.5,
        }}
      >
        <PhonelinkOutlinedIcon sx={{ fontSize: 36, color: accent }} />
      </Box>

      {/* Title */}
      <Typography
        sx={{
          fontSize: 16,
          fontWeight: 700,
          color: darkMode ? '#f5f5f5' : '#1a1a1a',
          letterSpacing: '-0.2px',
        }}
      >
        Robot in use
      </Typography>

      {/* Active app name — prominent */}
      <Typography
        sx={{
          fontSize: 13,
          fontWeight: 600,
          color: accent,
          bgcolor: darkMode ? 'rgba(245, 158, 11, 0.12)' : 'rgba(245, 158, 11, 0.08)',
          border: `1px solid ${darkMode ? 'rgba(245, 158, 11, 0.3)' : 'rgba(245, 158, 11, 0.25)'}`,
          borderRadius: '8px',
          px: 1.5,
          py: 0.75,
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {activeApp}
      </Typography>

      {/* Description */}
      <Typography
        sx={{
          fontSize: 12,
          color: darkMode ? '#aaa' : '#666',
          lineHeight: 1.6,
          maxWidth: 320,
          mt: 0.5,
        }}
      >
        A remote web app is currently connected to this robot via the cloud relay. Local apps are
        disabled until it releases the robot.
      </Typography>

      {/* How-to-release hint */}
      <Box
        sx={{
          mt: 1,
          px: 2,
          py: 1.5,
          borderRadius: '10px',
          bgcolor: darkMode ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)',
          border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'}`,
          maxWidth: 340,
        }}
      >
        <Typography
          sx={{
            fontSize: 11,
            fontWeight: 600,
            color: darkMode ? '#ccc' : '#555',
            mb: 0.5,
          }}
        >
          To release the robot
        </Typography>
        <Typography
          sx={{
            fontSize: 11,
            color: darkMode ? '#999' : '#777',
            lineHeight: 1.55,
          }}
        >
          Close the browser tab or window running {activeApp} on the device that opened it. The slot
          frees as soon as the connection drops.
        </Typography>
      </Box>
    </Box>
  );
}
