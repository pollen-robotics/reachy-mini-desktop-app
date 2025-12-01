import React from 'react';
import { Accordion, AccordionSummary, AccordionDetails, Box, Typography } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Donut as QuickActionsDonut } from '../../application-store/quick-actions';

/**
 * Quick Actions Section - Wrapper with Accordion
 */
export default function QuickActionsSection({ 
  quickActions = [],
  handleQuickAction = null,
  isReady = false,
  isActive = false,
  isBusy = false,
  darkMode = false,
}) {
  if (!quickActions.length || !handleQuickAction) {
    return null;
  }

  return (
    <Accordion 
      defaultExpanded={true}
      sx={{
        boxShadow: 'none !important',
        bgcolor: 'transparent !important',
        backgroundColor: 'transparent !important',
        '&:before': { display: 'none' },
        '&.Mui-expanded': { margin: 0 },
        mt: 0,
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon sx={{ color: darkMode ? '#666' : '#bbb', opacity: 0.5 }} />}
        sx={{
          px: 3,
          py: 1,
          pt: 0,
          minHeight: 'auto',
          bgcolor: 'transparent !important',
          backgroundColor: 'transparent !important',
          '&.Mui-expanded': { minHeight: 'auto' },
          '& .MuiAccordionSummary-content': {
            margin: '12px 0',
            '&.Mui-expanded': { margin: '12px 0' },
          },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
      </AccordionSummary>
      <AccordionDetails sx={{ px: 3, pt: 0, pb: 0, bgcolor: 'transparent !important', backgroundColor: 'transparent !important' }}>
        <QuickActionsDonut
          actions={quickActions}
          onActionClick={handleQuickAction}
          isReady={isReady}
          isActive={isActive}
          isBusy={isBusy}
          darkMode={darkMode}
        />
      </AccordionDetails>
    </Accordion>
  );
}

