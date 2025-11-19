import React from 'react';
import { Box, Typography } from '@mui/material';
import StoreOutlinedIcon from '@mui/icons-material/StoreOutlined';

/**
 * Discover Apps Button Component
 * Button with integrated pulse/highlight animation
 */
export default function DiscoverAppsButton({ onClick, darkMode }) {
  return (
    <Box
      component="button"
      onClick={onClick}
      sx={{
        display: 'inline-flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        px: 2,
        py: 1,
        borderRadius: '10px',
        bgcolor: darkMode ? 'rgba(26, 26, 26, 0.95)' : '#ffffff',
        border: '1px solid #FF9500',
        cursor: 'pointer',
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        position: 'relative',
        overflow: 'visible',
        // Pulse animation - subtle and integrated
        animation: 'discoverPulse 3s ease-in-out infinite',
        '@keyframes discoverPulse': {
          '0%, 100%': {
            boxShadow: darkMode
              ? '0 0 0 0 rgba(255, 149, 0, 0.4)'
              : '0 0 0 0 rgba(255, 149, 0, 0.3)',
          },
          '50%': {
            boxShadow: darkMode
              ? '0 0 0 8px rgba(255, 149, 0, 0)'
              : '0 0 0 8px rgba(255, 149, 0, 0)',
          },
        },
        // Hover state
        '&:hover': {
          borderColor: '#FF9500',
          bgcolor: darkMode ? 'rgba(26, 26, 26, 1)' : '#ffffff',
          transform: 'translateY(-2px)',
          boxShadow: darkMode
            ? '0 6px 16px rgba(255, 149, 0, 0.2)'
            : '0 6px 16px rgba(255, 149, 0, 0.15)',
          animation: 'none', // Stop pulse on hover
        },
        // Active/Click state
        '&:active': {
          transform: 'translateY(0)',
          boxShadow: darkMode
            ? '0 2px 8px rgba(255, 149, 0, 0.2)'
            : '0 2px 8px rgba(255, 149, 0, 0.15)',
        },
        // Remove default button styles
        fontFamily: 'inherit',
        outline: 'none',
      }}
    >
      <StoreOutlinedIcon
        sx={{
          fontSize: 16,
          color: '#FF9500',
        }}
      />
      <Typography
        sx={{
          fontSize: 12,
          fontWeight: 700,
          color: '#FF9500',
          letterSpacing: '-0.2px',
        }}
      >
        Discover apps
      </Typography>
    </Box>
  );
}

