import React from 'react';
import { Box, Typography, Button, CircularProgress } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

export default function Step5Success({
  textPrimary,
  textSecondary,
  wifiRobot,
  configuredNetwork,
  isConnecting,
  onConnect,
}) {
  const isReachyFound = wifiRobot?.available && wifiRobot?.host;

  return (
    <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
      {isReachyFound ? (
        <>
          <CheckCircleIcon sx={{ fontSize: 40, color: '#22c55e', mb: 1.5 }} />
          <Typography sx={{ fontSize: 12, color: textSecondary, mb: 2, lineHeight: 1.6 }}>
            Your Reachy Mini is now connected to{' '}
            <strong style={{ color: textPrimary }}>{configuredNetwork || 'your network'}</strong>.
            <br />
            Detected at <strong style={{ color: textPrimary }}>{wifiRobot.host}</strong>.
          </Typography>

          <Button
            variant="outlined"
            onClick={onConnect}
            disabled={isConnecting}
            sx={{
              fontSize: 13,
              fontWeight: 600,
              textTransform: 'none',
              px: 3,
              py: 0.75,
              borderRadius: '8px',
              borderColor: '#22c55e',
              color: '#22c55e',
              '&:hover': {
                borderColor: '#16a34a',
                bgcolor: 'rgba(34, 197, 94, 0.08)',
              },
            }}
          >
            {isConnecting ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CircularProgress size={14} sx={{ color: 'inherit' }} />
                Connecting...
              </Box>
            ) : (
              'Connect Now'
            )}
          </Button>
        </>
      ) : (
        <>
          <CircularProgress size={32} sx={{ color: '#FF9500', mb: 2 }} />
          <Typography sx={{ fontSize: 12, color: textSecondary, mb: 1, lineHeight: 1.6 }}>
            Reachy should now be connected to{' '}
            <strong style={{ color: textPrimary }}>{configuredNetwork || 'your network'}</strong>.
          </Typography>
          <Typography sx={{ fontSize: 11, color: textSecondary, mb: 1 }}>
            Searching for Reachy on the network...
          </Typography>
          {configuredNetwork && (
            <Typography sx={{ fontSize: 11, color: '#FF9500', fontWeight: 500 }}>
              Make sure your computer is connected to "{configuredNetwork}"
            </Typography>
          )}
        </>
      )}
    </Box>
  );
}

