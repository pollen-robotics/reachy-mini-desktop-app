import React from 'react';
import { Box, Typography } from '@mui/material';

/**
 * Selection label component - displays selected item name and index
 */
export default function WheelSelectionLabel({ selectedItem, selectedIndex, itemCount, darkMode }) {
  if (!selectedItem) return null;

  return (
    <Box
      sx={{
        position: 'absolute',
        bottom: 60,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0.25,
        userSelect: 'none',
      }}
    >
      <Typography
        sx={{
          fontSize: 16,
          fontWeight: 500,
          color: darkMode ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.9)',
          textAlign: 'center',
          letterSpacing: '0.2px',
          userSelect: 'none',
        }}
      >
        {selectedItem.label}
      </Typography>
      <Typography
        sx={{
          fontSize: 12,
          fontWeight: 400,
          color: darkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)',
          textAlign: 'center',
          letterSpacing: '0.1px',
          userSelect: 'none',
        }}
      >
        {selectedIndex + 1} / {itemCount}
      </Typography>
    </Box>
  );
}

