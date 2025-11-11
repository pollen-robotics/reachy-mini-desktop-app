import React from 'react';
import { Box, Typography, Chip } from '@mui/material';

/**
 * Header du robot avec titre, version et métadonnées
 * Style Apple : minimaliste, épuré, aéré
 */
export default function RobotHeader({ isOn, usbPortName, daemonVersion, darkMode = false }) {

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
      {/* Titre + Version */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 1,
          mb: 0.75,
        }}
      >
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
        <Typography
          sx={{
            fontSize: 12,
            fontWeight: 500,
            color: darkMode ? '#888' : '#86868b',
            letterSpacing: '0.2px',
          }}
        >
          {daemonVersion ? `v${daemonVersion}` : 'v0.1.0'}
        </Typography>
      </Box>

      {/* USB Port + Power Tag */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
        }}
      >
        
        {usbPortName && (
          <Chip
            label={usbPortName.split('/').pop()}
            size="small"
            sx={{
              height: 20,
              fontSize: 9,
              fontWeight: 600,
              bgcolor: darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
              color: darkMode ? '#888' : '#86868b',
              border: darkMode ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.06)',
              fontFamily: 'SF Mono, Monaco, Menlo, monospace',
              '& .MuiChip-label': { px: 1.25 },
            }}
          />
        )}
        
        {/* Tag Power status (si control_mode === enabled) */}
        {isOn === true && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              px: 1.25,
              height: 20,
              borderRadius: '10px',
              bgcolor: darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
              border: darkMode ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.06)',
            }}
          >
            <Typography
              sx={{
                fontSize: 9,
                fontWeight: 600,
                color: darkMode ? '#888' : '#86868b',
              }}
            >
              Power
            </Typography>
            <Typography
              sx={{
                fontSize: 9,
                fontWeight: 700,
                color: '#22c55e',
              }}
            >
              ON
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}

