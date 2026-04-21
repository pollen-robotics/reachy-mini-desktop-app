import React, { useState, useEffect } from 'react';
import { Box, Typography, Button } from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

const STORAGE_KEY = 'simulation-disclaimer-accepted';

export interface SimulationDisclaimerProps {
  darkMode?: boolean;
  onAccept?: () => void;
}

/**
 * Simulation Mode Disclaimer Overlay (Compact)
 * Warns users that apps support is incomplete in simulation mode
 */
export default function SimulationDisclaimer({
  darkMode = false,
  onAccept,
}: SimulationDisclaimerProps): React.ReactElement | null {
  const [isVisible, setIsVisible] = useState<boolean>(false);

  useEffect(() => {
    const accepted = localStorage.getItem(STORAGE_KEY);
    setIsVisible(!accepted);
  }, []);

  const handleAccept = (): void => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setIsVisible(false);
    onAccept?.();
  };

  if (!isVisible) return null;

  const warningColor = '#f59e0b';

  return (
    <Box
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        bgcolor: darkMode ? 'rgba(26, 26, 26, 0.97)' : 'rgba(250, 250, 252, 0.97)',
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        p: 2,
        gap: 1.5,
        borderRadius: '14px',
      }}
    >
      {/* Icon + Title row */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <WarningAmberIcon sx={{ fontSize: 18, color: warningColor }} />
        <Typography
          sx={{
            fontSize: 13,
            fontWeight: 600,
            color: darkMode ? '#f5f5f5' : '#333',
          }}
        >
          Simulation Mode
        </Typography>
      </Box>

      {/* Message */}
      <Typography
        sx={{
          fontSize: 11,
          color: darkMode ? '#999' : '#666',
          textAlign: 'center',
          lineHeight: 1.6,
          maxWidth: 240,
        }}
      >
        Apps using <strong style={{ color: darkMode ? '#ccc' : '#444' }}>camera</strong> or{' '}
        <strong style={{ color: darkMode ? '#ccc' : '#444' }}>microphone</strong> won't work yet —
        coming soon!
      </Typography>

      {/* Button */}
      <Button
        size="small"
        onClick={handleAccept}
        sx={{
          mt: 0.5,
          color: warningColor,
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'none',
          px: 2,
          py: 0.5,
          borderRadius: '6px',
          border: `1px solid ${darkMode ? 'rgba(245, 158, 11, 0.4)' : 'rgba(245, 158, 11, 0.5)'}`,
          '&:hover': {
            bgcolor: darkMode ? 'rgba(245, 158, 11, 0.15)' : 'rgba(245, 158, 11, 0.1)',
            borderColor: warningColor,
          },
        }}
      >
        Got it
      </Button>
    </Box>
  );
}
