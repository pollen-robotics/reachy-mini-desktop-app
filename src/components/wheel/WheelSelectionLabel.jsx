import React from 'react';
import { Box, Typography } from '@mui/material';

/**
 * Selection label component - displays selected item name and index
 */
export default function WheelSelectionLabel({ selectedItem, selectedIndex, itemCount, darkMode }) {
  if (!selectedItem) return null;

  const currentNumber = selectedIndex + 1;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0,
        userSelect: 'none',
      }}
    >
      <Typography
        sx={{
          fontSize: 24,
          fontWeight: 700,
          color: darkMode ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.9)',
          textAlign: 'center',
          letterSpacing: '0.2px',
          userSelect: 'none',
        }}
      >
        {selectedItem.label}
      </Typography>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
        }}
      >
        <span style={{ 
          color: darkMode ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.25)',
          fontSize: 16,
          fontWeight: 400,
        }}>#</span>
        <Typography
          component="span"
          sx={{
            fontSize: 16,
            fontWeight: 400,
            color: darkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)',
          }}
        >
          {currentNumber}
        </Typography>
      </Box>
    </Box>
  );
}

