import React from 'react';
import { Box, Typography, Button } from '@mui/material';
import ReachyDetective from '@assets/reachy-detective.svg';

interface EmptyStateProps {
  darkMode: boolean;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

export default function EmptyState({
  darkMode,
  searchQuery,
  setSearchQuery,
}: EmptyStateProps): React.ReactElement {
  return (
    <Box
      sx={{
        py: 10,
        textAlign: 'center',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
      }}
    >
      <Box
        component="img"
        src={ReachyDetective}
        alt="Reachy Detective"
        sx={{
          width: 120,
          height: 'auto',
          opacity: darkMode ? 0.7 : 0.8,
          mb: 1,
        }}
      />

      {searchQuery ? (
        <>
          <Typography
            sx={{
              fontSize: 18,
              fontWeight: 700,
              color: darkMode ? '#aaa' : '#666',
              mb: 0.5,
            }}
          >
            Can&apos;t find what you&apos;re looking for?
          </Typography>
          <Typography
            sx={{
              fontSize: 14,
              color: darkMode ? '#888' : '#999',
              mb: 2,
            }}
          >
            No apps found for &quot;{searchQuery}&quot;
          </Typography>
          <Button
            onClick={() => setSearchQuery('')}
            sx={{
              textTransform: 'none',
              fontSize: 14,
              fontWeight: 600,
              px: 3,
              py: 1,
              borderRadius: '10px',
              bgcolor: 'transparent',
              color: '#FF9500',
              border: '1px solid #FF9500',
              '&:hover': {
                bgcolor: darkMode ? 'rgba(255, 149, 0, 0.08)' : 'rgba(255, 149, 0, 0.05)',
                borderColor: '#FF9500',
              },
            }}
          >
            Clear search
          </Button>
        </>
      ) : (
        <Typography
          sx={{
            fontSize: 18,
            fontWeight: 700,
            color: darkMode ? '#aaa' : '#666',
          }}
        >
          No apps available
        </Typography>
      )}
    </Box>
  );
}
