import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Box } from '@mui/material';
import { useShallow } from 'zustand/react/shallow';
import { ApplicationsSection } from './applications';
import ControlButtons from './ControlButtons';
import HfLoginOverlay from './applications/HfLoginOverlay';
import { ControllerSection } from './controller';
import ExpressionsSection from './expressions';
import EmbeddedAppView from './EmbeddedAppView';
import CentralBusyOverlay from './CentralBusyOverlay';
import { useActiveRobotContext } from '../context';
import { useHfAuth } from '../../../hooks/auth';
import useAppStore from '../../../store/useAppStore';
import { selectCentralBusy } from '../../../hooks/system/useCentralRobotStatus';

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

  const {
    isAuthenticated,
    username,
    avatarUrl,
    isLoading: hfLoading,
    isWaitingForAuth,
    error: hfError,
    handleLogin,
    handleLogout,
  } = useHfAuth();

  const hfUser = useMemo(
    () => (isAuthenticated && username ? { username, avatarUrl } : null),
    [isAuthenticated, username, avatarUrl]
  );

  const [loginSkipped, setLoginSkipped] = useState(false);
  const isEmbeddedApp = rightPanelView === 'embedded-app';

  // When a remote web app is holding the robot via the cloud relay, we
  // mask the panel to physically prevent concurrent launches. Local apps
  // that are already running (embedded view) keep their own UI — the
  // overlay only blocks *new* launches from the apps list / control views.
  const centralBusy = useAppStore(useShallow(selectCentralBusy));
  const showBusyOverlay = centralBusy.isBusy && !isEmbeddedApp;

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

  return (
    <Box
      ref={scrollRef}
      onScroll={updateGradients}
      sx={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflowY: isEmbeddedApp || !isAuthenticated ? 'hidden' : 'scroll',
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
      {/* Top gradient for depth effect on scroll - hidden for embedded apps */}
      {!isEmbeddedApp && (
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
            marginBottom: '-32px',
            opacity: showTopGradient ? 1 : 0,
            transition: 'opacity 0.2s ease-out',
          }}
        />
      )}

      {/* Content wrapper — relative so the login overlay can cover it */}
      <Box
        sx={{
          position: 'relative',
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* HF Login Overlay — covers content when not authenticated */}
        {!isAuthenticated && !loginSkipped && (
          <HfLoginOverlay
            darkMode={darkMode}
            onLogin={handleLogin}
            onSkip={() => setLoginSkipped(true)}
            isLoading={hfLoading}
            isWaitingForAuth={isWaitingForAuth}
            error={hfError}
          />
        )}

        {/* Conditional rendering based on rightPanelView */}
        {isEmbeddedApp ? (
          <EmbeddedAppView darkMode={darkMode} />
        ) : showBusyOverlay ? (
          <CentralBusyOverlay activeApp={centralBusy.activeApp} darkMode={darkMode} />
        ) : rightPanelView === 'controller' ? (
          <ControllerSection showToast={showToast} isBusy={isBusy} darkMode={darkMode} />
        ) : rightPanelView === 'expressions' ? (
          <ExpressionsSection isBusy={isBusy} darkMode={darkMode} />
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
              hfUser={hfUser}
              onLogout={handleLogout}
            />

            {/* Control Buttons - Opens Controller and Expressions in right panel */}
            <ControlButtons isBusy={isBusy} darkMode={darkMode} />
          </>
        )}
      </Box>

      {/* Bottom gradient for depth effect on scroll - hidden for embedded apps */}
      {!isEmbeddedApp && (
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
            marginTop: '-32px',
            opacity: showBottomGradient ? 1 : 0,
            transition: 'opacity 0.2s ease-out',
          }}
        />
      )}
    </Box>
  );
}
