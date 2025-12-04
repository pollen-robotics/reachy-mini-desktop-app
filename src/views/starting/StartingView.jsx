import React, { useCallback } from 'react';
import { Box } from '@mui/material';
import HardwareScanView from './HardwareScanView';
import useAppStore from '../../store/useAppStore';
import { DAEMON_CONFIG } from '../../config/daemon';

/**
 * View displayed during daemon startup
 * Wrapper around HardwareScanView that handles the transition logic
 */
function StartingView({ startupError, startDaemon }) {
  const { darkMode, setIsStarting, setIsTransitioning, setIsActive, setHardwareError, hardwareError } = useAppStore();
  
  const handleScanComplete = useCallback(() => {
    // ⚡ WAIT for pause to see success, then trigger transition
    setTimeout(() => {
      // ✅ CRITICAL: Don't transition if there's an error - stay in scan view
      const currentState = useAppStore.getState();
      if (currentState.hardwareError || (startupError && typeof startupError === 'object' && startupError.type)) {
        console.warn('⚠️ Scan completed but error detected, staying in scan view');
        return; // Don't transition, stay in error state
      }
      
      // ✅ Clear any hardware errors when scan completes successfully
      setHardwareError(null);
      // ✅ Transition: keep TransitionView displayed until apps are loaded
      // (the onAppsReady callback in ActiveRobotView will close TransitionView)
      setIsStarting(false);
      setIsTransitioning(true);
      setIsActive(true);
      // ✅ No longer close TransitionView automatically after TRANSITION_DURATION
      // It will be closed by onAppsReady when apps are loaded
    }, DAEMON_CONFIG.ANIMATIONS.SCAN_COMPLETE_PAUSE);
  }, [setIsStarting, setIsTransitioning, setIsActive, setHardwareError, startupError]);

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
