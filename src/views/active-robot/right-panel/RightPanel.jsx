import React from 'react';
import { Box } from '@mui/material';
import { PositionControlSection } from './position-control';
import { QuickActionsSection } from './quick-actions';
import { ApplicationsSection } from './applications';

/**
 * Right Panel - Assembles Position Control, Quick Actions, and Applications sections
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
      {/* Quick Actions - First */}
      <QuickActionsSection
        quickActions={quickActions}
        handleQuickAction={handleQuickAction}
        isReady={isReady}
        isActive={isActive}
        isBusy={isBusy}
        darkMode={darkMode}
      />

      {/* Position Control - Second */}
      <PositionControlSection
        isActive={isActive}
        isBusy={isBusy}
        darkMode={darkMode}
      />

      {/* Applications - Third */}
      <ApplicationsSection
        showToast={showToast}
        onLoadingChange={onLoadingChange}
        hasQuickActions={quickActions.length > 0 && handleQuickAction}
        isActive={isActive}
        isBusy={isBusy}
        darkMode={darkMode}
      />
    </Box>
  );
}

