import React from 'react';
import { Box } from '@mui/material';
import { ApplicationsSection } from './applications';
import ControlButtons from './ControlButtons';
import { ControllerSection } from './controller';
import ExpressionsSection from './expressions';
import useAppStore from '@store/useAppStore';

/**
 * Right Panel - Assembles Control Buttons and Applications sections
 * Can display Applications (default), Controller, or Expressions based on rightPanelView state
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
  const rightPanelView = useAppStore(state => state.rightPanelView);

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
      {/* Conditional rendering based on rightPanelView */}
      {rightPanelView === 'controller' ? (
        <ControllerSection
          isActive={isActive}
          isBusy={isBusy}
          darkMode={darkMode}
        />
      ) : rightPanelView === 'expressions' ? (
        <ExpressionsSection
          isActive={isActive}
          isBusy={isBusy}
          darkMode={darkMode}
        />
      ) : (
        <>
          {/* Applications - Default view */}
          <ApplicationsSection
            showToast={showToast}
            onLoadingChange={onLoadingChange}
            hasQuickActions={quickActions.length > 0 && handleQuickAction}
            isActive={isActive}
            isBusy={isBusy}
            darkMode={darkMode}
          />

          {/* Control Buttons - Opens Controller and Expressions in right panel */}
          <ControlButtons
            isActive={isActive}
            darkMode={darkMode}
          />
        </>
      )}
    </Box>
  );
}

