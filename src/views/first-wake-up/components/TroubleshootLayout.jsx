import React from 'react';
import { Box, Typography, Button, Chip } from '@mui/material';
import UsbIcon from '@mui/icons-material/Usb';
import WifiIcon from '@mui/icons-material/Wifi';
import { ACCENT } from '../theme';
import reachyDetective from '../../../assets/reachy-detective.svg';

function ConnectionBadge({ connectionMode, darkMode }) {
  const isUsb = connectionMode === 'usb';
  const isWifi = connectionMode === 'wifi';
  if (!isUsb && !isWifi) return null;

  const Icon = isUsb ? UsbIcon : WifiIcon;
  const label = isUsb ? 'USB' : 'WiFi';

  return (
    <Chip
      icon={<Icon sx={{ fontSize: 14 }} />}
      label={label}
      size="small"
      variant="outlined"
      sx={{
        fontSize: 11,
        fontWeight: 600,
        height: 24,
        borderColor: darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)',
        color: darkMode ? '#aaa' : '#64748b',
        '& .MuiChip-icon': { color: darkMode ? '#aaa' : '#64748b' },
      }}
    />
  );
}

export default function TroubleshootLayout({ darkMode, title, tips, onBack, connectionMode }) {
  const textPrimary = darkMode ? '#f5f5f5' : '#1e293b';
  const textSecondary = darkMode ? '#888' : '#64748b';

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
        flex: 1,
        minHeight: 0,
        gap: 2,
        overflowY: 'auto',
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
        <Box
          component="img"
          src={reachyDetective}
          alt=""
          sx={{ width: 64, height: 'auto', opacity: darkMode ? 0.8 : 0.9 }}
        />
        <Typography sx={{ fontSize: 18, fontWeight: 700, color: textPrimary, textAlign: 'center' }}>
          {title}
        </Typography>
        <ConnectionBadge connectionMode={connectionMode} darkMode={darkMode} />
      </Box>

      {tips && tips.length > 0 && (
        <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 1 }}>
          {tips.map((tip, i) => (
            <Box
              key={i}
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1.5,
                px: 2,
                py: 1.5,
                borderRadius: '8px',
                bgcolor: darkMode ? 'rgba(255,255,255,0.03)' : '#f8fafc',
                border: '1px solid',
                borderColor: darkMode ? 'rgba(255,255,255,0.05)' : '#f1f5f9',
              }}
            >
              <Typography
                sx={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: ACCENT,
                  lineHeight: 1.5,
                  minWidth: 18,
                  textAlign: 'center',
                }}
              >
                {i + 1}
              </Typography>
              <Typography sx={{ fontSize: 12, color: textSecondary, lineHeight: 1.6 }}>
                {tip}
              </Typography>
            </Box>
          ))}
        </Box>
      )}

      <Button
        onClick={onBack}
        sx={{
          mt: 'auto',
          fontSize: 12,
          color: ACCENT,
          textTransform: 'none',
          fontWeight: 500,
          '&:hover': { textDecoration: 'underline' },
        }}
      >
        ← Back to test
      </Button>
    </Box>
  );
}
