import React from 'react';
import { Box } from '@mui/material';
import { ApplicationsSection } from './applications';
import ControlButtons from './ControlButtons';

/**
 * Right Panel - Assembles Control Buttons and Applications sections
 * Quick Actions and Position Control are now opened in separate windows
 */
export default function RightPanel({ 
  showToast, 
  onLoadingChange,
  quickActions = [],
  handleQuickAction = null,
  isReady = false,
  isActive = false,
  isBusy = false,
  darkMode = false,
}) {
  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'scroll', // Force scrollbar to always be visible to prevent content shift
        overflowX: 'hidden',
        pt: 0,
        bgcolor: 'transparent !important',
        backgroundColor: 'transparent !important',
        // Scrollbar styling
        '&::-webkit-scrollbar': {
          width: '6px',
        },
        '&::-webkit-scrollbar-track': {
          background: 'transparent',
        },
        '&::-webkit-scrollbar-thumb': {
          background: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
          borderRadius: '3px',
        },
        '&:hover::-webkit-scrollbar-thumb': {
          background: darkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
        },
      }}
    >
      {/* Applications - First */}
      <ApplicationsSection
        showToast={showToast}
        onLoadingChange={onLoadingChange}
        hasQuickActions={quickActions.length > 0 && handleQuickAction}
        isActive={isActive}
        isBusy={isBusy}
        darkMode={darkMode}
      />

      {/* Control Buttons - Opens Quick Actions and Position Control in new windows */}
      <ControlButtons
        isActive={isActive}
        darkMode={darkMode}
      />
    </Box>
  );
}

