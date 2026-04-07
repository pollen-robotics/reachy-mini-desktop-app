import React, { useCallback } from 'react';
import { Box } from '@mui/material';
import HardwareScanView from './HardwareScanView';
import useAppStore from '../../store/useAppStore';
import { DAEMON_CONFIG, fetchWithTimeout, buildApiUrl, getWsBaseUrl } from '../../config/daemon';

/**
 * View displayed during daemon startup
 * Wrapper around HardwareScanView that handles the transition logic
 */
function StartingView({ startupError, startDaemon }) {
  const { darkMode, transitionTo, setHardwareError, setShowFirstWakeUp } = useAppStore();

  const handleScanComplete = useCallback(async () => {
    setHardwareError(null);

    // Check if first wake-up diagnostic is needed
    // If endpoint exists: respect its response. If not: default to showing the wizard.
    let needsFirstWakeUp = true; // Default: show wizard (safe default for first-time users)
    try {
      const statusRes = await fetchWithTimeout(
        buildApiUrl('/api/first-wake-up/status'),
        {},
        DAEMON_CONFIG.TIMEOUTS.COMMAND,
        { silent: true }
      );
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        needsFirstWakeUp = !statusData.is_completed;
      }
    } catch {
      // Endpoint doesn't exist yet: show wizard by default
      console.log('[StartingView] /api/first-wake-up/status not available, showing wizard');
    }

    // Skip wizard with URL param ?skip-first-wake-up=true (dev override)
    const params = new URLSearchParams(window.location.search);
    if (params.get('skip-first-wake-up') === 'true') {
      needsFirstWakeUp = false;
    }

    if (needsFirstWakeUp) {
      // Robot stays sleeping - MotorTestStep will enable motors + play wake_up
      setShowFirstWakeUp(true);
      transitionTo.ready();
      return;
    }

    // Normal flow: enable motors + wake up animation
    try {
      await fetchWithTimeout(
        buildApiUrl('/api/motors/set_mode/enabled'),
        { method: 'POST' },
        DAEMON_CONFIG.TIMEOUTS.COMMAND,
        { label: 'Enable motors' }
      );

      await new Promise(resolve => setTimeout(resolve, 300));

      const response = await fetchWithTimeout(
        buildApiUrl('/api/move/play/wake_up'),
        { method: 'POST' },
        DAEMON_CONFIG.TIMEOUTS.COMMAND,
        { label: 'Wake up animation' }
      );

      const moveData = await response.json();
      const moveUuid = moveData?.uuid;

      if (moveUuid) {
        await new Promise(resolve => {
          let resolved = false;
          const finish = () => {
            if (!resolved) {
              resolved = true;
              resolve();
            }
          };

          const timeout = setTimeout(finish, 10000);

          try {
            const ws = new WebSocket(`${getWsBaseUrl()}/api/move/ws/updates`);
            ws.onmessage = event => {
              try {
                const data = JSON.parse(event.data);
                if (
                  data.uuid === moveUuid &&
                  (data.type === 'move_completed' ||
                    data.type === 'move_failed' ||
                    data.type === 'move_cancelled')
                ) {
                  clearTimeout(timeout);
                  ws.close();
                  finish();
                }
              } catch {}
            };
            ws.onerror = () => {
              clearTimeout(timeout);
              ws.close();
              setTimeout(finish, 1000);
            };
            ws.onclose = () => {
              if (!resolved) setTimeout(finish, 1000);
            };
          } catch {
            clearTimeout(timeout);
            setTimeout(finish, 4000);
          }
        });
      } else {
        await new Promise(resolve => setTimeout(resolve, 4000));
      }
    } catch (err) {
      console.error('[StartingView] Auto wake-up error:', err);
    }

    transitionTo.ready();
  }, [transitionTo, setHardwareError, setShowFirstWakeUp]);

  return (
    <Box
      sx={{
        width: '100vw',
        height: '100vh',
        background: darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(250, 250, 252, 0.85)',
        backdropFilter: 'blur(40px)',
        WebkitBackdropFilter: 'blur(40px)',
        overflow: 'hidden',
      }}
    >
      {/* Centered content */}
      <Box
        sx={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <HardwareScanView
          startupError={startupError}
          onScanComplete={handleScanComplete}
          startDaemon={startDaemon}
        />
      </Box>
    </Box>
  );
}

export default StartingView;
