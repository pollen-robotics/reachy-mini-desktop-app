import React from 'react';
import { Box, Typography } from '@mui/material';
import RocketIcon from '@assets/rocket.svg';
import { EMOTIONS, DANCES } from '@constants/choreographies';

/**
 * Expressions Header Component
 * Displays title with icon and library tabs
 */
export default function QuickActionsHeader({ 
  darkMode = false,
  activeTab = 'emotions',
  onTabChange = null,
}) {
  return (
    <Box 
      sx={{ 
        display: 'flex', 
        flexDirection: 'column',
        gap: 1.5,
        mb: 2,
        px: 0,
        pt: 0,
        width: '100%',
        position: 'relative',
        zIndex: 200,
      }}
    >
      {/* Title with icon - centered */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
        <Box
          component="img"
          src={RocketIcon}
          alt="Rocket"
          sx={{
            width: 36,
            height: 36,
          }}
        />
        <Typography
          sx={{
            fontSize: 20,
            fontWeight: 700,
            color: darkMode ? '#f5f5f5' : '#333',
            letterSpacing: '-0.3px',
          }}
        >
          Expressions
        </Typography>
      </Box>

      {/* Library tabs - simple navigation style */}
      <Box 
        sx={{ 
          display: 'flex', 
          gap: 2, 
          alignItems: 'center', 
          justifyContent: 'center',
          position: 'relative',
          zIndex: 200,
        }}
      >
        <Typography 
          component="button" 
          onClick={() => {
            if (onTabChange) {
              onTabChange('emotions');
            }
          }} 
          sx={{
            fontSize: 13,
            fontWeight: 400,
            color: activeTab === 'emotions'
              ? (darkMode ? '#f5f5f5' : '#333')
              : (darkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)'),
            textDecoration: 'none',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px 0',
            textTransform: 'none',
            letterSpacing: '0.2px',
            transition: 'color 0.2s ease',
            position: 'relative',
            zIndex: 201,
            '&:hover': { 
              color: activeTab === 'emotions' 
                ? (darkMode ? '#f5f5f5' : '#333')
                : (darkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)')
            },
            '&::after': {
              content: '""',
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '2px',
              backgroundColor: activeTab === 'emotions' ? '#FF9500' : 'transparent',
              transition: 'background-color 0.2s ease',
            },
          }}
        >
          Emotions
        </Typography>
        <Typography 
          component="button" 
          onClick={() => {
            if (onTabChange) {
              onTabChange('dances');
            }
          }} 
          sx={{
            fontSize: 13,
            fontWeight: 400,
            color: activeTab === 'dances'
              ? (darkMode ? '#f5f5f5' : '#333')
              : (darkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)'),
            textDecoration: 'none',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px 0',
            textTransform: 'none',
            letterSpacing: '0.2px',
            transition: 'color 0.2s ease',
            position: 'relative',
            zIndex: 201,
            '&:hover': { 
              color: activeTab === 'dances' 
                ? (darkMode ? '#f5f5f5' : '#333')
                : (darkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)')
            },
            '&::after': {
              content: '""',
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '2px',
              backgroundColor: activeTab === 'dances' ? '#FF9500' : 'transparent',
              transition: 'background-color 0.2s ease',
            },
          }}
        >
          Dances
        </Typography>
      </Box>
    </Box>
  );
}

