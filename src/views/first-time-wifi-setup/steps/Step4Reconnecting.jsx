import React from 'react';
import { Box, Typography, Button, CircularProgress } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

export default function Step4Reconnecting({
  darkMode,
  textPrimary,
  textSecondary,
  configuredNetwork,
  status, // 'waiting' | 'searching' | 'found' | 'failed'
  onRetry,
}) {
  const getStatusContent = () => {
    switch (status) {
      case 'waiting':
        return (
          <>
            <CircularProgress size={32} sx={{ color: '#FF9500', mb: 2 }} />
            <Typography sx={{ fontSize: 13, color: textSecondary, lineHeight: 1.6 }}>
              Reachy is connecting to <strong style={{ color: textPrimary }}>{configuredNetwork || 'your network'}</strong>...
            </Typography>
            <Typography sx={{ fontSize: 11, color: textSecondary, mt: 1 }}>
              You'll be disconnected from the hotspot automatically
            </Typography>
          </>
        );
      
      case 'searching':
        return (
          <>
            <CircularProgress size={32} sx={{ color: '#22c55e', mb: 2 }} />
            <Typography sx={{ fontSize: 13, color: textSecondary, lineHeight: 1.6 }}>
              Searching for Reachy on <strong style={{ color: textPrimary }}>{configuredNetwork || 'your network'}</strong>...
            </Typography>
          </>
        );
      
      case 'found':
        return (
          <>
            <CheckCircleIcon sx={{ fontSize: 40, color: '#22c55e', mb: 1 }} />
            <Typography sx={{ fontSize: 14, fontWeight: 600, color: '#22c55e' }}>
              Reachy found!
            </Typography>
          </>
        );
      
      case 'failed':
        return (
          <>
            <Typography sx={{ fontSize: 13, color: textSecondary, mb: 2, lineHeight: 1.6 }}>
              Couldn't find Reachy on the network. The connection may have failed.
            </Typography>
            <Button
              variant="outlined"
              size="small"
              onClick={onRetry}
              sx={{ 
                fontSize: 12, 
                fontWeight: 600,
                textTransform: 'none', 
                borderColor: '#FF9500',
                color: '#FF9500',
                px: 2,
                py: 0.5,
                borderRadius: '8px',
                '&:hover': {
                  borderColor: '#e68600',
                  bgcolor: 'rgba(255, 149, 0, 0.08)',
                },
              }}
            >
              Try again
            </Button>
          </>
        );
      
      default:
        return null;
    }
  };

  return (
    <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
      {getStatusContent()}
    </Box>
  );
}

