import React from 'react';
import { Box, Typography, Button, CircularProgress } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

export type Step4Status = 'waiting' | 'searching' | 'found' | 'failed';

interface Step4ReconnectingProps {
  darkMode: boolean;
  textPrimary: string;
  textSecondary: string;
  configuredNetwork: string | null;
  status: Step4Status;
  onRetry: () => void;
}

export default function Step4Reconnecting({
  darkMode: _darkMode,
  textPrimary,
  textSecondary,
  configuredNetwork,
  status,
  onRetry,
}: Step4ReconnectingProps): React.ReactElement {
  const getStatusContent = (): React.ReactNode => {
    switch (status) {
      case 'searching':
        return (
          <>
            <CircularProgress size={32} sx={{ color: '#FF9500', mb: 2 }} />
            <Typography sx={{ fontSize: 13, color: textSecondary, lineHeight: 1.6 }}>
              Verifying connection to{' '}
              <strong style={{ color: textPrimary }}>{configuredNetwork || 'network'}</strong>...
            </Typography>
            <Typography sx={{ fontSize: 11, color: textSecondary, mt: 1, opacity: 0.7 }}>
              This may take a few seconds
            </Typography>
          </>
        );

      case 'found':
        return (
          <>
            <CheckCircleIcon sx={{ fontSize: 40, color: '#22c55e', mb: 1 }} />
            <Typography sx={{ fontSize: 14, fontWeight: 600, color: '#22c55e' }}>
              Connected successfully!
            </Typography>
            <Typography sx={{ fontSize: 12, color: textSecondary, mt: 1 }}>
              Reachy is now on {configuredNetwork}
            </Typography>
          </>
        );

      case 'failed':
        return (
          <>
            <Typography sx={{ fontSize: 13, color: textSecondary, mb: 1, lineHeight: 1.6 }}>
              Connection failed.
            </Typography>
            <Typography
              sx={{ fontSize: 12, color: textSecondary, mb: 2, lineHeight: 1.5, opacity: 0.8 }}
            >
              Please check your WiFi password and try again.
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
    <Box
      sx={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
      }}
    >
      {getStatusContent()}
    </Box>
  );
}
