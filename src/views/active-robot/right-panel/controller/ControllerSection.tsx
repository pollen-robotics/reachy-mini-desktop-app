import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Box, Typography, IconButton, Tooltip, Chip } from '@mui/material';
import SportsEsportsOutlinedIcon from '@mui/icons-material/SportsEsportsOutlined';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';
import { ACCENT, accentAlpha } from '@styles/tokens';
import { FONT_WEIGHT, TYPO, scrollbarSx, useAppPalette } from '@styles';
import Controller from '../../controller';
import { useGamepadConnected, useActiveDevice } from '../../../../utils/InputManager';
import { useWindowFocus } from '../../../windows/hooks';
import { useActiveRobotContext } from '../../context';
import type { ToastSeverity } from '../../../../types/store';

export interface ControllerSectionProps {
  showToast?: (message: string, severity?: ToastSeverity) => void;
  isBusy?: boolean;
  /** @deprecated Theme mode is now read from `useAppPalette()`. Prop kept for back-compat but ignored. */
  darkMode?: boolean;
}

type ResetFn = () => void;

/**
 * Controller Section - Displays controller component in right panel
 * Uses ActiveRobotContext for decoupling from global stores
 */
export default function ControllerSection({
  showToast,
  isBusy = false,
}: ControllerSectionProps): React.ReactElement {
  const palette = useAppPalette();
  const { robotState, actions } = useActiveRobotContext();
  const { rightPanelView, robotStatus, isActive } = robotState;
  const { setRightPanelView } = actions;

  // Only enabled when robot is ready (not sleeping, not busy)
  const isReady = robotStatus === 'ready';

  const controllerResetRef = useRef<ResetFn | null>(null);
  const [isAtInitialPosition, setIsAtInitialPosition] = useState<boolean>(true);
  const prevRightPanelViewRef = useRef<string | null>(rightPanelView);

  // Check if gamepad is connected and which device is active
  const isGamepadConnected = useGamepadConnected();
  const _activeDevice = useActiveDevice();
  const _hasWindowFocus = useWindowFocus();
  const prevGamepadConnectedRef = useRef<boolean>(isGamepadConnected);

  // Toast notifications for gamepad connection/disconnection
  useEffect(() => {
    // Skip on initial mount (prevGamepadConnectedRef.current will be the initial value)
    if (prevGamepadConnectedRef.current !== undefined) {
      if (isGamepadConnected && !prevGamepadConnectedRef.current) {
        // Gamepad connected
        if (showToast) {
          showToast('Gamepad connected', 'success');
        }
      } else if (!isGamepadConnected && prevGamepadConnectedRef.current) {
        // Gamepad disconnected
        if (showToast) {
          showToast('Gamepad disconnected', 'warning');
        }
      }
    }
    // Update ref for next comparison
    prevGamepadConnectedRef.current = isGamepadConnected;
  }, [isGamepadConnected, showToast]);

  // Auto-reset when leaving controller section (only on exit, not on entry)
  useEffect(() => {
    const prevView = prevRightPanelViewRef.current;
    const currentView = rightPanelView;

    // Only reset if we were in controller and now we're not
    if (prevView === 'controller' && currentView !== 'controller' && controllerResetRef.current) {
      controllerResetRef.current();
    }

    // Update ref for next comparison
    prevRightPanelViewRef.current = currentView;
  }, [rightPanelView]);

  // Cleanup: reset on unmount (only if we're actually leaving)
  useEffect(() => {
    return () => {
      // Only reset if we're actually unmounting while in controller view
      if (rightPanelView === 'controller' && controllerResetRef.current) {
        controllerResetRef.current();
      }
    };
  }, [rightPanelView]);

  const handleBack = (): void => {
    setRightPanelView(null); // Return to applications view
  };

  const handleResetReady = useCallback((resetFn: ResetFn): void => {
    controllerResetRef.current = resetFn;
  }, []);

  const handleIsAtInitialPosition = useCallback((isAtInitial: boolean): void => {
    setIsAtInitialPosition(isAtInitial);
  }, []);

  const handleResetClick = useCallback((): void => {
    controllerResetRef.current?.();
  }, []);

  return (
    <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header with back button and title */}
      <Box
        sx={{
          px: 2,
          pt: 1.5,
          bgcolor: 'transparent',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <IconButton
            onClick={handleBack}
            size="small"
            sx={{
              color: ACCENT.main,
              '&:hover': {
                bgcolor: accentAlpha(palette.isDark ? 0.1 : 0.05),
              },
            }}
          >
            <ArrowBackIcon sx={{ fontSize: TYPO.xxl }} />
          </IconButton>
          <Typography
            sx={{
              fontSize: TYPO.xxl,
              fontWeight: FONT_WEIGHT.bold,
              color: palette.textPrimary,
              letterSpacing: '-0.3px',
            }}
          >
            Controller
          </Typography>
          {/* Input device indicator - always show, indicates gamepad support */}
          <Tooltip
            title={
              isGamepadConnected
                ? 'Left stick: X/Y\nRight stick: Pitch/Yaw\nD-pad ↑↓: Z\nD-pad ←→: Body\nL1/R1: Antennas'
                : 'Connect a gamepad to control the robot'
            }
            arrow
            placement="right"
            componentsProps={{
              tooltip: {
                sx: { whiteSpace: 'pre-line' },
              },
            }}
          >
            <Chip
              icon={<SportsEsportsOutlinedIcon />}
              label=""
              size="medium"
              variant="outlined"
              sx={{
                height: 30,
                width: 30,
                padding: 0.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: isGamepadConnected ? 1 : 0.6,
                borderColor: isGamepadConnected ? ACCENT.main : palette.borderStrong,
                '& .MuiChip-icon': {
                  fontSize: '1rem',
                  color: isGamepadConnected ? ACCENT.main : palette.textMuted,
                  margin: 0,
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%',
                  height: '100%',
                },
                '& .MuiChip-label': {
                  display: 'none',
                },
              }}
            />
          </Tooltip>
          {/* Reset button - only show when not at initial position */}
          {!isAtInitialPosition && (
            <Tooltip title="Reset all position controls" arrow>
              <IconButton
                size="small"
                onClick={handleResetClick}
                disabled={!isReady || isBusy}
                sx={{
                  ml: 0.5,
                  color: palette.textMuted,
                  '&:hover': {
                    color: ACCENT.main,
                    bgcolor: accentAlpha(palette.isDark ? 0.1 : 0.05),
                  },
                }}
              >
                <RefreshIcon sx={{ fontSize: TYPO.lg, color: palette.textMuted }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>

      {/* Controller component with padding.
          Own scroll region: the panel is height-locked (wrapperFillsPanel), so when
          the fullscreen webview zoom enlarges the controls past the available height
          they must scroll here instead of being clipped off the bottom. Header stays
          pinned; only the controls below scroll. */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          pt: 1,
          pr: 3,
          pb: 1.5,
          pl: 3,
          ...scrollbarSx(palette),
        }}
      >
        <Controller
          isActive={isActive}
          darkMode={palette.isDark}
          onResetReady={handleResetReady}
          onIsAtInitialPosition={handleIsAtInitialPosition}
        />
      </Box>
    </Box>
  );
}
