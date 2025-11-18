import React, { useState } from 'react';
import { Box, IconButton, Tooltip, CircularProgress } from '@mui/material';

/**
 * Quick Actions Pad Component - Piano à émotions
 * Staggered rows design like piano keys, alternating offset
 * Child-friendly and visually appealing
 */
export default function QuickActionsPad({
  actions = [],
  onActionClick = null,
  isReady = false,
  isActive = false,
  isBusy = false,
  darkMode = false,
}) {
  const [executingAction, setExecutingAction] = useState(null);

  if (!actions || actions.length === 0) return null;

  const handleActionClick = (action) => {
    if (!isActive || isBusy || !isReady || !onActionClick) return;
    
    setExecutingAction(action.name || action.label);
    onActionClick(action);
    
    setTimeout(() => {
      setExecutingAction(null);
    }, 3000);
  };

  // Organize actions into staggered rows
  // Each row alternates offset (like piano keys)
  // Row 1: 5 actions, Row 2: 6 actions (with extra on left), Row 3: 5 actions
  const actionsPerRow = 5;
  const maxVisibleRows = 3;
  const rows = [];
  
  let actionIndex = 0;
  
  // Create 3 rows with specific layouts
  for (let rowIndex = 0; rowIndex < maxVisibleRows; rowIndex++) {
    let rowActions = [];
    let actionsNeeded = actionsPerRow;
    
    // Row 2 (index 1) gets 6 actions with one extra on the left
    if (rowIndex === 1) {
      actionsNeeded = 6;
      // Get one action before the normal start for the extra left button
      if (actionIndex > 0) {
        rowActions.push(actions[actionIndex - 1] || null);
      } else {
        rowActions.push(null);
      }
    }
    
    // Get the normal actions for this row
    const normalActions = actions.slice(actionIndex, actionIndex + actionsPerRow);
    rowActions.push(...normalActions);
    
    // Pad row to always have the required number of actions
    const paddedActions = [];
    for (let i = 0; i < actionsNeeded; i++) {
      paddedActions.push(rowActions[i] || null);
    }
    
    rows.push({
      actions: paddedActions,
      offset: rowIndex % 2 === 1, // Alternate: even rows normal, odd rows offset
      rowIndex,
    });
    
    // Move action index forward (skip one for row 2 since we took one before)
    if (rowIndex === 1 && actionIndex > 0) {
      actionIndex += actionsPerRow; // Normal increment
    } else {
      actionIndex += actionsPerRow;
    }
  }
  
  const visibleRows = rows;

  const isDisabled = !isActive || isBusy || !isReady;

  return (
    <Box
      sx={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        mb: 2,
        position: 'relative',
      }}
    >
      {visibleRows.map((row, rowIdx) => (
        <Box
          key={rowIdx}
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 1,
            width: '100%',
            pl: 0,
            transition: 'padding-left 0.3s ease',
          }}
        >
          {row.actions.map((action, actionIdx) => {
            // Skip rendering if action is null (empty slot)
            if (!action) {
              return (
                <Box
                  key={`empty-${row.rowIndex}-${actionIdx}`}
                  sx={{
                    width: 52,
                    height: 52,
                    flexShrink: 0,
                  }}
                />
              );
            }
            
            const globalIndex = row.rowIndex * actionsPerRow + actionIdx;
            const isExecuting = executingAction === (action.name || action.label);
            
            // Fixed size for all buttons
            const buttonSize = 52;
            
            return (
              <Tooltip 
                key={action.name || globalIndex} 
                title={action.label || action.name} 
                placement="top" 
                arrow
              >
                <IconButton
                  onClick={() => handleActionClick(action)}
                  disabled={isDisabled || isExecuting}
                  sx={{
                    width: buttonSize,
                    height: buttonSize,
                    borderRadius: '14px',
                    bgcolor: darkMode 
                      ? 'rgba(255, 255, 255, 0.08)' 
                      : '#ffffff',
                    border: `1px solid ${isExecuting ? '#FF9500' : (darkMode ? 'rgba(255, 149, 0, 0.3)' : 'rgba(255, 149, 0, 0.4)')}`,
                    fontSize: '24px',
                    padding: 0,
                    opacity: isDisabled ? 0.4 : 1,
                    filter: isDisabled ? 'grayscale(100%)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                    position: 'relative',
                    overflow: 'hidden',
                    boxShadow: darkMode 
                      ? '0 2px 8px rgba(0, 0, 0, 0.2)' 
                      : '0 2px 8px rgba(0, 0, 0, 0.08)',
                    '&::before': {
                      content: '""',
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      borderRadius: '14px',
                      background: isExecuting 
                        ? 'linear-gradient(135deg, rgba(255, 149, 0, 0.2) 0%, rgba(255, 149, 0, 0.1) 100%)'
                        : 'linear-gradient(135deg, rgba(255, 149, 0, 0.05) 0%, transparent 100%)',
                      opacity: 0,
                      transition: 'opacity 0.25s ease',
                    },
                    '&:hover': {
                      transform: isDisabled || isExecuting ? 'none' : 'translateY(-2px) scale(1.05)',
                      boxShadow: isDisabled || isExecuting 
                        ? 'none' 
                        : (darkMode 
                          ? '0 6px 20px rgba(255, 149, 0, 0.4)' 
                          : '0 6px 20px rgba(255, 149, 0, 0.3)'),
                      borderColor: '#FF9500',
                      '&::before': {
                        opacity: 1,
                      },
                    },
                    '&:active': {
                      transform: isDisabled || isExecuting ? 'none' : 'translateY(0) scale(0.98)',
                    },
                    '&:disabled': {
                      opacity: 0.3,
                    },
                  }}
                >
                  {isExecuting ? (
                    <CircularProgress 
                      size={22} 
                      thickness={4}
                      sx={{ color: '#FF9500', position: 'relative', zIndex: 1 }}
                    />
                  ) : (
                    <Box
                      sx={{
                        fontSize: '26px',
                        lineHeight: 1,
                        transition: 'transform 0.2s ease',
                        position: 'relative',
                        zIndex: 1,
                      }}
                    >
                      {action.emoji || '⚡'}
                    </Box>
                  )}
                </IconButton>
              </Tooltip>
            );
          })}
        </Box>
      ))}
    </Box>
  );
}

