import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Box } from '@mui/material';
import { ApplicationsSection } from './applications';
import ControlButtons from './ControlButtons';
import HfLoginOverlay from './applications/HfLoginOverlay';
import { ControllerSection } from './controller';
import ExpressionsSection from './expressions';
import EmbeddedAppView from './EmbeddedAppView';
import { useActiveRobotContext } from '../context';
import { useHfAuth } from '../../../hooks/auth';
import type { ToastSeverity } from '../../../types/store';
import { DURATION, EASING } from '@styles/tokens';
import { transition, useAppPalette } from '@styles';

export type RightPanelQuickAction = Record<string, unknown>;

export interface RightPanelProps {
  showToast?: (message: string, severity?: ToastSeverity) => void;
  onLoadingChange?: (loading: boolean) => void;
  quickActions?: RightPanelQuickAction[];
  handleQuickAction?: ((action: RightPanelQuickAction) => void) | null;
  isReady?: boolean;
  isActive?: boolean;
  isBusy?: boolean;
  /** @deprecated Theme is now read from `useAppPalette()`. Prop kept for back-compat but ignored. */
  darkMode?: boolean;
}

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
  isReady: _isReady = false,
  isActive = false,
  isBusy = false,
}: RightPanelProps): React.ReactElement {
  const palette = useAppPalette();
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

  const [loginSkipped, setLoginSkipped] = useState<boolean>(false);
  const isEmbeddedApp = rightPanelView === 'embedded-app';
  const isControllerView = rightPanelView === 'controller';
  const isExpressionsView = rightPanelView === 'expressions';
  const showLoginOverlay = !isAuthenticated && !loginSkipped;

  // The inner wrapper needs to FILL the panel (so children that use
  // `height: 100%` render correctly, and so the absolute login overlay covers
  // the viewport) only for the views that don't need to scroll their own
  // body. For the default "Applications + ControlButtons" view we want the
  // wrapper to flow naturally so the outer container's overflow:scroll picks
  // up the overflow. Keeping `flex: 1 + display: flex column` here in every
  // case would constrain the wrapper to clientHeight and let flexbox shrink
  // its children, which silently kills scrolling once the user is signed in.
  const wrapperFillsPanel =
    isEmbeddedApp || isControllerView || isExpressionsView || showLoginOverlay;

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [showTopGradient, setShowTopGradient] = useState<boolean>(false);
  const [showBottomGradient, setShowBottomGradient] = useState<boolean>(false);

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

  // TODO(style-migration): scroll fade gradients rely on the app's background color stops;
  // these exact tints don't have dedicated palette tokens yet.
  const fadeGradientTop = palette.isDark
    ? 'linear-gradient(to bottom, rgba(26, 26, 26, 1) 0%, rgba(26, 26, 26, 0.6) 40%, rgba(26, 26, 26, 0) 100%)'
    : 'linear-gradient(to bottom, rgba(250, 250, 252, 1) 0%, rgba(250, 250, 252, 0.6) 40%, rgba(250, 250, 252, 0) 100%)';
  const fadeGradientBottom = palette.isDark
    ? 'linear-gradient(to top, rgba(26, 26, 26, 1) 0%, rgba(26, 26, 26, 0.6) 40%, rgba(26, 26, 26, 0) 100%)'
    : 'linear-gradient(to top, rgba(250, 250, 252, 1) 0%, rgba(250, 250, 252, 0.6) 40%, rgba(250, 250, 252, 0) 100%)';

  return (
    <Box
      ref={scrollRef}
      onScroll={updateGradients}
      sx={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        // `auto` + hidden scrollbar: same treatment as the left column. On macOS
        // "always show scroll bars", `scroll` rendered the scrollbar as a bright
        // vertical line down the window's right edge. The panel stays scrollable
        // via wheel/trackpad; the top/bottom fade gradients already signal overflow.
        overflowY: isEmbeddedApp || !isAuthenticated ? 'hidden' : 'auto',
        overflowX: 'hidden',
        scrollbarWidth: 'none',
        '&::-webkit-scrollbar': { display: 'none' },
        pt: 0,
        bgcolor: 'transparent !important',
        backgroundColor: 'transparent !important',
        position: 'relative',
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
            background: fadeGradientTop,
            pointerEvents: 'none',
            zIndex: 10,
            flexShrink: 0,
            marginBottom: '-32px',
            opacity: showTopGradient ? 1 : 0,
            transition: transition('opacity', DURATION.base, EASING.exit),
          }}
        />
      )}

      {/* Content wrapper - relative so the login overlay can cover it */}
      <Box
        sx={{
          position: 'relative',
          ...(wrapperFillsPanel
            ? {
                // Full-bleed views (embedded app / controller / expressions)
                // and the HF login overlay all need the wrapper to span the
                // full panel height.
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
              }
            : {
                // Default Applications + ControlButtons view: let the wrapper
                // grow to its natural height so the outer scroll container
                // sees the overflow and lets the user scroll the panel.
                flexShrink: 0,
              }),
        }}
      >
        {/* HF Login Overlay - covers content when not authenticated */}
        {showLoginOverlay && (
          <HfLoginOverlay
            onLogin={handleLogin}
            onSkip={() => setLoginSkipped(true)}
            isLoading={hfLoading}
            isWaitingForAuth={isWaitingForAuth}
            error={hfError}
          />
        )}

        {/* Conditional rendering based on rightPanelView */}
        {isEmbeddedApp ? (
          <EmbeddedAppView />
        ) : rightPanelView === 'controller' ? (
          <ControllerSection showToast={showToast} isBusy={isBusy} />
        ) : rightPanelView === 'expressions' ? (
          <ExpressionsSection isBusy={isBusy} />
        ) : (
          <>
            {/* Applications - Default view */}
            <ApplicationsSection
              showToast={showToast}
              onLoadingChange={onLoadingChange}
              hasQuickActions={quickActions.length > 0 && handleQuickAction}
              isActive={isActive}
              isBusy={isBusy}
              hfUser={hfUser}
              onLogout={handleLogout}
            />

            {/* Control Buttons - Opens Controller and Expressions in right panel */}
            <ControlButtons isBusy={isBusy} />
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
            background: fadeGradientBottom,
            pointerEvents: 'none',
            zIndex: 10,
            flexShrink: 0,
            marginTop: '-32px',
            opacity: showBottomGradient ? 1 : 0,
            transition: transition('opacity', DURATION.base, EASING.exit),
          }}
        />
      )}
    </Box>
  );
}
