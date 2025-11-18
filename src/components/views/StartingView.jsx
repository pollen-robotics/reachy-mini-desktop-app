import React, { useCallback } from 'react';
import { Box } from '@mui/material';
import { getCurrentWindow } from '@tauri-apps/api/window';
import HardwareScanView from './HardwareScanView';
import useAppStore from '../../store/useAppStore';
import { DAEMON_CONFIG } from '../../config/daemon';

/**
 * View displayed during daemon startup
 * Wrapper around HardwareScanView that handles the transition logic
 */
function StartingView({ startupError }) {
  const appWindow = window.mockGetCurrentWindow ? window.mockGetCurrentWindow() : getCurrentWindow();
  const { darkMode } = useAppStore();
  
  const handleScanComplete = useCallback(() => {
    // ⚡ WAIT for pause to see success, then trigger transition
    console.log(`⏱️ Waiting ${DAEMON_CONFIG.ANIMATIONS.SCAN_COMPLETE_PAUSE}ms before transition...`);
    setTimeout(() => {
      console.log('🚀 Triggering transition to ActiveView');
      // Trigger transition via store
      const { setIsStarting, setIsTransitioning, setIsActive } = useAppStore.getState();
      
      // ✅ Transition: keep TransitionView displayed until apps are loaded
      // (the onAppsReady callback in ActiveRobotView will close TransitionView)
      setIsStarting(false);
      setIsTransitioning(true);
      setIsActive(true);
      // ✅ No longer close TransitionView automatically after TRANSITION_DURATION
      // It will be closed by onAppsReady when apps are loaded
    }, DAEMON_CONFIG.ANIMATIONS.SCAN_COMPLETE_PAUSE);
  }, []);

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
          height: 'calc(100vh - 44px)',
        }}
      >
        <HardwareScanView 
          startupError={startupError}
          onScanComplete={handleScanComplete}
          showTitlebar={false}
        />
      </Box>
    </Box>
  );
}

export default StartingView;
