import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Box, Typography } from '@mui/material';
import WbSunnyOutlinedIcon from '@mui/icons-material/WbSunnyOutlined';
import PulseButton from '@components/PulseButton';
import { ApplicationsSection } from './applications';
import ControlButtons from './ControlButtons';
import { ControllerSection } from './controller';
import ExpressionsSection from './expressions';
import { useActiveRobotContext } from '../context';
import { useWakeSleep } from '../hooks/useWakeSleep';
import useAppStore from '../../../store/useAppStore';
import SleepingReachyIcon from '@assets/sleeping-reachy.svg';

/**
 * Right Panel - Assembles Control Buttons and Applications sections
 * Can display Applications (default), Controller, or Expressions based on rightPanelView state
 * 
 * Uses ActiveRobotContext for decoupling from global stores
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
  const { robotState } = useActiveRobotContext();
  const { rightPanelView } = robotState;
  const { robotStatus } = useAppStore();
  const isSleeping = robotStatus === 'sleeping';
  const { isTransitioning, wakeUp } = useWakeSleep();
  
  const scrollRef = useRef(null);
  const [showTopGradient, setShowTopGradient] = useState(false);
  const [showBottomGradient, setShowBottomGradient] = useState(false);
  
  // Check scroll position to show/hide gradients
  const updateGradients = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    
    const { scrollTop, scrollHeight, clientHeight } = el;
    const scrollThreshold = 10; // Pixels threshold before showing gradient
    
    // Show top gradient only if scrolled down
    setShowTopGradient(scrollTop > scrollThreshold);
    
    // Show bottom gradient only if there's more content below
    const isAtBottom = scrollTop + clientHeight >= scrollHeight - scrollThreshold;
    setShowBottomGradient(!isAtBottom && scrollHeight > clientHeight);
  }, []);
  
  // Update gradients on mount and when view changes
  useEffect(() => {
    updateGradients();
    // Small delay to ensure content is rendered
    const timer = setTimeout(updateGradients, 100);
    return () => clearTimeout(timer);
  }, [rightPanelView, updateGradients]);

  // When sleeping, signal that loading is complete (ApplicationsSection not rendered)
  useEffect(() => {
    if (isSleeping && onLoadingChange) {
      onLoadingChange(false);
    }
  }, [isSleeping, onLoadingChange]);

  return (
    <Box
      ref={scrollRef}
      onScroll={updateGradients}
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
        position: 'relative',
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
      {/* Top gradient for depth effect on scroll - only visible when scrolled */}
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          left: 0,
          right: 0,
          height: '32px',
          background: darkMode
            ? 'linear-gradient(to bottom, rgba(26, 26, 26, 1) 0%, rgba(26, 26, 26, 0.6) 40%, rgba(26, 26, 26, 0) 100%)'
            : 'linear-gradient(to bottom, rgba(250, 250, 252, 1) 0%, rgba(250, 250, 252, 0.6) 40%, rgba(250, 250, 252, 0) 100%)',
          pointerEvents: 'none',
          zIndex: 10,
          flexShrink: 0,
          marginBottom: '-32px', // Overlay on top of content
          opacity: showTopGradient ? 1 : 0,
          transition: 'opacity 0.2s ease-out',
        }}
      />
      
      {/* Conditional rendering based on rightPanelView and sleeping state */}
      {isSleeping ? (
        /* Sleeping state - Show centered wake toggle */
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 3,
            px: 4,
          }}
        >
          <Box
            component="img"
            src={SleepingReachyIcon}
            alt="Sleeping Reachy"
            sx={{
              width: 120,
              height: 120,
              objectFit: 'contain',
            }}
          />
          <Typography
            sx={{
              fontSize: 18,
              fontWeight: 600,
              color: darkMode ? '#f5f5f5' : '#333',
              textAlign: 'center',
            }}
          >
            Reachy is sleeping
          </Typography>
          <Typography
            sx={{
              fontSize: 13,
              color: darkMode ? '#888' : '#666',
              textAlign: 'center',
              maxWidth: 280,
              lineHeight: 1.5,
            }}
          >
            Wake up the robot to access apps and controls
          </Typography>
          <PulseButton
            onClick={wakeUp}
            disabled={isTransitioning}
            startIcon={<WbSunnyOutlinedIcon />}
            darkMode={darkMode}
            sx={{ mt: 1 }}
          >
            {isTransitioning ? 'Waking up...' : 'Wake Up'}
          </PulseButton>
        </Box>
      ) : rightPanelView === 'controller' ? (
        <ControllerSection
          showToast={showToast}
          isBusy={isBusy}
          darkMode={darkMode}
        />
      ) : rightPanelView === 'expressions' ? (
        <ExpressionsSection
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
            isBusy={isBusy}
            darkMode={darkMode}
          />
        </>
      )}
      
      {/* Bottom gradient for depth effect on scroll - only visible when more content below */}
      <Box
        sx={{
          position: 'sticky',
          bottom: 0,
          left: 0,
          right: 0,
          height: '32px',
          background: darkMode
            ? 'linear-gradient(to top, rgba(26, 26, 26, 1) 0%, rgba(26, 26, 26, 0.6) 40%, rgba(26, 26, 26, 0) 100%)'
            : 'linear-gradient(to top, rgba(250, 250, 252, 1) 0%, rgba(250, 250, 252, 0.6) 40%, rgba(250, 250, 252, 0) 100%)',
          pointerEvents: 'none',
          zIndex: 10,
          flexShrink: 0,
          marginTop: '-32px', // Overlay on top of content
          opacity: showBottomGradient ? 1 : 0,
          transition: 'opacity 0.2s ease-out',
        }}
      />
    </Box>
  );
}

