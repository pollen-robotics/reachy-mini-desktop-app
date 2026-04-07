import React from 'react';
import { Box, Typography } from '@mui/material';

export default function StepLayout({ darkMode, illustration, title, subtitle, children }) {
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
      }}
    >
      {/* Header - fixed height so interactive card always starts at the same Y */}
      <Box
        sx={{
          height: 220,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          alignItems: 'center',
          textAlign: 'center',
          pb: 2,
        }}
      >
        {illustration && (
          <Box
            component="img"
            src={illustration}
            alt=""
            sx={{
              width: 100,
              height: 'auto',
              mb: 1.5,
              opacity: darkMode ? 0.85 : 1,
            }}
          />
        )}
        <Typography
          variant="h2"
          sx={{
            fontSize: 22,
            fontWeight: 700,
            color: textPrimary,
            letterSpacing: '-0.3px',
            mb: 0.5,
          }}
        >
          {title}
        </Typography>
        {subtitle && (
          <Typography
            sx={{
              fontSize: 13,
              color: textSecondary,
              lineHeight: 1.5,
              maxWidth: 340,
            }}
          >
            {subtitle}
          </Typography>
        )}
      </Box>

      {/* Interactive content - bordered frame */}
      <Box
        sx={{
          flex: 1,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 0,
          p: 2,
          borderRadius: '12px',
          border: '1px solid',
          borderColor: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
          bgcolor: darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)',
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
