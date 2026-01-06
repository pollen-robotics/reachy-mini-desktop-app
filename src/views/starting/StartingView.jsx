import React, { useCallback } from 'react';
import { Box } from '@mui/material';
import HardwareScanView from './HardwareScanView';
import useAppStore from '../../store/useAppStore';

/**
 * View displayed during daemon startup
 * Wrapper around HardwareScanView that handles the transition logic
 */
function StartingView({ startupError, startDaemon }) {
  const { darkMode, transitionTo, setHardwareError } = useAppStore();
  
  
  const handleScanComplete = useCallback(() => {
    // ✅ HardwareScanView only calls this callback after successful healthcheck
    // ✅ Clear any hardware errors when scan completes successfully
    setHardwareError(null);
    // ✅ Robot starts in SLEEPING state - user must use toggle to wake up
    // This separates daemon connection from robot awake state
    // ⚡ IMMEDIATE transition - window resize will happen now, not after delay
    // ⚡ Safe to shutdown immediately on startup (robot already sleeping, no animation)
    transitionTo.sleeping({ safeToShutdown: true });
  }, [transitionTo, setHardwareError]);

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
