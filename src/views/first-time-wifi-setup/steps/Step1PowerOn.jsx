import React from 'react';
import { Box, Typography, Button, CircularProgress } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import powerOnImage from '../../../assets/power-on.jpg';

export default function Step1PowerOn({ 
  textPrimary, 
  textSecondary, 
  countdown,
  hasReachyHotspot,
  hotspotName,
  isLocalScanning,
  onNext,
  darkMode,
}) {
  const isWaiting = countdown > 0 && !hasReachyHotspot;
  const timeoutReached = countdown === 0 && !hasReachyHotspot;

  return (
    <Box sx={{ width: '100%', textAlign: 'center' }}>
      {isWaiting ? (
        // Waiting for auto-detection
        <>
          <Typography sx={{ fontSize: 12, color: textSecondary, mb: 2, lineHeight: 1.6 }}>
            Turn on your Reachy and wait. We're automatically detecting the WiFi hotspot it creates.
          </Typography>
          
          {/* Power on illustration */}
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'center', 
            mb: 2,
          }}>
            <Box
              component="img"
              src={powerOnImage}
              alt="Power on Reachy"
              sx={{
                width: 140,
                height: 'auto',
                borderRadius: '12px',
                border: `1px solid ${darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
              }}
            />
          </Box>
          
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
            <CircularProgress size={16} sx={{ color: '#FF9500' }} />
            <Typography sx={{ fontSize: 11, color: textSecondary }}>
              Detecting hotspot... ({countdown}s)
            </Typography>
          </Box>
        </>
      ) : timeoutReached ? (
        // Timeout - hotspot not detected
        <>
          <Typography sx={{ fontSize: 12, color: textSecondary, mb: 2, lineHeight: 1.6 }}>
            Automatic detection didn't find a Reachy hotspot, but it may still exist on your network.
            Make sure your Reachy is powered on, then continue to the next step.
          </Typography>

          <Button
            variant="outlined"
            onClick={onNext}
            sx={{ 
              fontSize: 13,
              fontWeight: 600,
              textTransform: 'none',
              px: 3,
              py: 0.75,
              borderRadius: '8px',
              borderColor: '#FF9500',
              color: '#FF9500',
              '&:hover': {
                borderColor: '#e68600',
                bgcolor: 'rgba(255, 149, 0, 0.08)',
              },
            }}
          >
            Continue manually →
          </Button>
        </>
      ) : (
        // Hotspot detected (will auto-advance shortly)
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
          <CheckCircleIcon sx={{ fontSize: 40, color: '#22c55e' }} />
          <Box sx={{ textAlign: 'center' }}>
            <Typography sx={{ fontSize: 14, fontWeight: 600, color: '#22c55e' }}>
              {hotspotName || 'Hotspot'} detected!
            </Typography>
            <Typography sx={{ fontSize: 11, color: textSecondary, mt: 0.5 }}>
              Moving to next step...
            </Typography>
          </Box>
        </Box>
      )}
    </Box>
  );
}

