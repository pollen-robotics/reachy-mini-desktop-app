import React from 'react';
import { Box, Typography, Switch } from '@mui/material';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import useAppStore from '../../../store/useAppStore';
import SectionHeader from './SectionHeader';

/**
 * Appearance Card Component
 * Dark/Light mode toggle
 */
export default function SettingsAppearanceCard({ darkMode, cardStyle }) {
  const textPrimary = darkMode ? '#f5f5f5' : '#333';
  const textSecondary = darkMode ? '#888' : '#666';

  return (
    <Box sx={cardStyle}>
      <SectionHeader title="Appearance" icon={null} darkMode={darkMode} />
      
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: 1.5,
          borderRadius: '12px',
          bgcolor: darkMode ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)',
          cursor: 'pointer',
          transition: 'background 0.15s',
          '&:hover': {
            bgcolor: darkMode ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.04)',
          },
        }}
        onClick={() => useAppStore.getState().toggleDarkMode()}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {darkMode ? (
            <DarkModeOutlinedIcon sx={{ fontSize: 18, color: textSecondary }} />
          ) : (
            <LightModeOutlinedIcon sx={{ fontSize: 18, color: textSecondary }} />
          )}
          <Typography sx={{ fontSize: 13, fontWeight: 500, color: textPrimary }}>
            {darkMode ? 'Dark Mode' : 'Light Mode'}
          </Typography>
        </Box>
        <Switch
          checked={darkMode}
          size="small"
          color="primary"
        />
      </Box>
    </Box>
  );
}

