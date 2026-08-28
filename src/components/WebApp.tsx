/**
 * WebApp - Simplified entry point for web-only mode
 *
 * This component is used when the app is built for web (dashboard-v2)
 * and served by the daemon. It skips all Tauri-specific features
 * and goes directly to ActiveRobotView.
 *
 * Assumes the daemon is already running and active.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import ActiveRobotModule from '../views/active-robot/ActiveRobotModule';
import type { ActiveRobotContextConfig } from '../hooks/adapters/activeRobotContextTypes';
import { useWebActiveRobotAdapter } from '../hooks/useWebActiveRobotAdapter';
import { useRobotStateWebSocket } from '../hooks/robot/useRobotStateWebSocket';
import { useRobotCommands } from '../hooks/robot/useRobotCommands';
import { useActiveMoves } from '../hooks/robot/useActiveMoves';
import { useWindowVisible } from '../hooks/system/useWindowVisible';
import useAppStore from '../store/useAppStore';
import { ROBOT_STATUS } from '../constants/robotStatus';
import type { FullAppState } from '../store/useStore';
import { ACCENT, STATUS, blackAlpha, whiteAlpha } from '@styles/tokens';
import { useAppPalette, TYPO, RADIUS } from '@styles';

interface DaemonStatusResponse {
  state?: string;
  version?: string;
  [key: string]: unknown;
}

/**
 * Web-only App component
 * Directly renders ActiveRobotView without Tauri dependencies
 */
export default function WebApp(): React.ReactElement {
  const palette = useAppPalette();
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [daemonVersion, setDaemonVersion] = useState<string>('web');
  const isActive = useAppStore((state: FullAppState) => state.isActive);
  const logs = useAppStore((state: FullAppState) => state.logs);
  const { sendCommand, playRecordedMove, isCommandRunning } = useRobotCommands();
  const isWindowVisible = useWindowVisible();

  // The web adapter intentionally omits Tauri-only window methods
  // (addOpenWindow, removeOpenWindow, isWindowOpen) since they are no-ops in
  // the browser. ActiveRobotModule's Tauri-typed config is widened here.
  const contextConfig = useWebActiveRobotAdapter() as unknown as ActiveRobotContextConfig;

  useRobotStateWebSocket(isConnected && !error && isWindowVisible);
  useActiveMoves(isConnected && !error && isWindowVisible);

  const stopDaemon = useCallback((): void => {
    console.log('[WebMode] stopDaemon - not available');
  }, []);

  useEffect(() => {
    const checkDaemon = async (): Promise<void> => {
      try {
        const response = await fetch('/api/daemon/status');
        if (response.ok) {
          const data = (await response.json()) as DaemonStatusResponse;
          if (data.state === 'running' || data.state === 'error') {
            setIsConnected(true);
            setDaemonVersion(data.version || 'web');
            if (data.state === 'running') {
              // TODO(ts): useStore slices are partially typed; fall back to the
              // raw snapshot so we can call its lifecycle methods here.
              const store = useAppStore.getState() as unknown as FullAppState & {
                startConnection: (mode: string, options: Record<string, unknown>) => void;
              };
              if (store.robotStatus === ROBOT_STATUS.DISCONNECTED) {
                store.startConnection('web', {});
              }
              store.transitionTo.ready();
            }
          } else {
            setError(`Daemon is ${data.state}. Please start the daemon first.`);
          }
        } else {
          setError('Failed to connect to daemon API');
        }
      } catch (err) {
        setError(`Cannot connect to daemon: ${(err as Error).message}`);
      }
    };

    checkDaemon();

    const interval = setInterval(checkDaemon, 5000);
    return () => clearInterval(interval);
  }, []);

  // TODO(style-migration): these app-frame greys (1a1a1a/f5f5f7, 0a0a0a/e5e5e7)
  // are not captured by a semantic surface token yet; branch on `palette.isDark`
  // to preserve the chrome while staying darkMode-prop-free.
  const frameBg = palette.isDark ? '#1a1a1a' : '#f5f5f7';
  const shellBg = palette.isDark ? '#0a0a0a' : '#e5e5e7';

  if (!isConnected && !error) {
    return (
      <Box
        sx={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          bgcolor: frameBg,
        }}
      >
        <CircularProgress sx={{ color: ACCENT.main }} />
        <Typography sx={{ color: palette.textSecondary }}>Connecting to daemon...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box
        sx={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          bgcolor: frameBg,
        }}
      >
        <Typography variant="h5" sx={{ color: STATUS.error }}>
          Connection Error
        </Typography>
        <Typography sx={{ color: palette.textSecondary, textAlign: 'center', maxWidth: 400 }}>
          {error}
        </Typography>
        <Typography sx={{ color: palette.textMuted, fontSize: TYPO.sm, mt: 2 }}>
          Make sure the daemon is running on port 8000
        </Typography>
      </Box>
    );
  }

  // Connected - render ActiveRobotModule in a centered container
  // Size matches Tauri app expanded mode: 900x670
  return (
    <Box
      sx={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: shellBg,
      }}
    >
      <Box
        sx={{
          width: 900,
          height: 670,
          borderRadius: RADIUS.xl,
          overflow: 'hidden',
          boxShadow: palette.isDark
            ? `0 25px 50px -12px ${blackAlpha(0.5)}, 0 0 0 1px ${whiteAlpha(0.1)}`
            : `0 25px 50px -12px ${blackAlpha(0.25)}, 0 0 0 1px ${blackAlpha(0.05)}`,
        }}
      >
        <ActiveRobotModule
          contextConfig={contextConfig}
          isActive={isActive}
          isStarting={false}
          isStopping={false}
          stopDaemon={stopDaemon}
          sendCommand={sendCommand}
          playRecordedMove={playRecordedMove}
          isCommandRunning={isCommandRunning}
          logs={logs}
          daemonVersion={daemonVersion}
          usbPortName="web"
        />
      </Box>
    </Box>
  );
}
