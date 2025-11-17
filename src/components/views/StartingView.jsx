import React, { useState, useCallback } from 'react';
import { Box, Typography, CircularProgress, Button } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import Viewer3D from '../viewer3d';
import { getShortComponentName } from '../../utils/componentNames';
import useAppStore from '../../store/useAppStore';
import { DAEMON_CONFIG } from '../../config/daemon';

/**
 * View displayed during daemon startup
 * Shows the robot in X-ray mode with a scan effect
 * Displays errors if startup fails
 */
function StartingView({ startupError }) {
  const appWindow = window.mockGetCurrentWindow ? window.mockGetCurrentWindow() : getCurrentWindow();
  const { setHardwareError, darkMode } = useAppStore();
  const [currentComponent, setCurrentComponent] = useState(null);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 });
  const [scanError, setScanError] = useState(null);
  const [errorMesh, setErrorMesh] = useState(null); // The mesh in error for camera focus
  const [isRetrying, setIsRetrying] = useState(false);
  const [scanComplete, setScanComplete] = useState(false); // Scan completed successfully
  
  const handleRetry = useCallback(async () => {
    console.log('🔄 Retrying scan...');
    setIsRetrying(true);
    
    try {
      // 1. Stop the daemon (without goto_sleep)
      console.log('🛑 Stopping daemon...');
      await invoke('stop_daemon');
      
      // 2. Wait for the daemon to be fully stopped
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 3. Reset all states
      setScanError(null);
      setErrorMesh(null);
      setScanProgress({ current: 0, total: 0 });
      setCurrentComponent(null);
      setScanComplete(false);
      setHardwareError(null);
      
      // 4. Reload to restart a complete scan
      console.log('🔄 Reloading app...');
      window.location.reload();
    } catch (err) {
      console.error('Failed to stop daemon:', err);
      // Reload anyway
      window.location.reload();
    }
  }, [setHardwareError]);
  
  const handleScanComplete = useCallback(() => {
    console.log('✅ Scan 3D completed (visually finished)');
    // Force progression to 100%
    setScanProgress(prev => ({ ...prev, current: prev.total }));
    setCurrentComponent(null);
    setScanComplete(true); // ✅ Display success
    
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
  
  const handleScanMesh = useCallback((mesh, index, total) => {
    const componentName = getShortComponentName(mesh, index, total);
    setCurrentComponent(componentName);
    // index comes from ScanEffect which counts from 1 to total (not 0 to total-1)
    // Never regress: if current > index, keep current
    setScanProgress(prev => ({
      current: Math.max(prev.current, index),
      total: total
    }));
    
    // ========================================================================
    // ⚠️ HARDWARE ERROR SIMULATION - To test error UI
    // ========================================================================
    // 
    // Error simulation during scan to test:
    // - Stopping scan at specified mesh
    // - Camera focus on error component
    // - Component color change to red
    // - Error message display with instructions
    // - Retry button that restarts daemon
    // - Blocking transition to ActiveRobotView
    //
    // For production, this code must be replaced with real polling
    // of the daemon API to detect real hardware errors.
    // 
    // ========================================================================
    
    // if (index === 50) {
    //   const errorData = {
    //     code: "Camera Error - Communication timeout (0x03)",
    //     action: "Check the camera cable connection and restart",
    //     component: componentName,
    //   };
    //   console.log('⚠️ Hardware error detected on mesh:', mesh);
    //   console.log('⚠️ Component:', componentName);
    //   setScanError(errorData);
    //   setErrorMesh(mesh); // Store mesh for camera focus
    //   setHardwareError(errorData.code); // Block transition
    // }
  }, [setHardwareError]);

  return (
    <Box
      sx={{
        width: '100vw',
        height: '100vh',
        background: darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)',
        backdropFilter: 'blur(40px)',
        WebkitBackdropFilter: 'blur(40px)',
        overflow: 'hidden',
      }}
    >
      {/* Titlebar */}
      <Box
        onMouseDown={async (e) => {
          e.preventDefault();
          try {
            await appWindow.startDragging();
          } catch (err) {
            console.error('Drag error:', err);
          }
        }}
        sx={{
          height: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          cursor: 'move',
          userSelect: 'none',
        }}
      >
        <Box sx={{ height: 20 }} /> {/* Space for drag */}
      </Box>

      {/* Centered content */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: 'calc(100% - 44px)',
          px: 4,
          gap: 1.5,
        }}
      >
        {/* Robot Viewer 3D - Clean design, larger */}
        <Box
          sx={{
            width: '100%',
            maxWidth: '450px',
            position: 'relative',
          }}
        >
          {/* Robot 3D */}
          <Box
            sx={{
              width: '100%',
              height: '480px',
              position: 'relative',
            }}
          >
            <Viewer3D 
              isActive={true}
              antennas={[-10, -10]}
              initialMode="xray" 
              hideControls={true}
              forceLoad={true}
              hideGrid={true}
              hideBorder={true}
              showScanEffect={!startupError && !scanError}
              onScanComplete={handleScanComplete}
              onScanMesh={handleScanMesh}
              cameraPreset="scan"
              useCinematicCamera={true}
              errorFocusMesh={errorMesh}
              backgroundColor="transparent"
            />
          </Box>
        </Box>

        {/* Status - Minimalist design, more discrete */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            width: '100%',
            maxWidth: '450px',
            minHeight: '60px',
            mt: -2, // Reduce space above
          }}
        >
          {(startupError || scanError) ? (
            // ❌ Error - Modern design with instruction upfront
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 1,
                py: 0.5,
                maxWidth: '360px',
                minHeight: '90px', // Same height as scan mode
              }}
            >
              
              {/* Compact title */}
              <Typography
                sx={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: darkMode ? '#666' : '#999',
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                }}
              >
                Hardware Error
              </Typography>
              
              {/* Main instruction - Larger with bold words */}
              <Box sx={{ textAlign: 'center' }}>
                <Typography
                  component="span"
                  sx={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: darkMode ? '#f5f5f5' : '#333',
                    lineHeight: 1.5,
                  }}
                >
                  {scanError?.action ? (
                    <>
                      <Box component="span" sx={{ fontWeight: 700 }}>Check</Box> the{' '}
                      <Box component="span" sx={{ fontWeight: 700 }}>camera cable</Box> connection and{' '}
                      <Box component="span" sx={{ fontWeight: 700 }}>restart</Box>
                    </>
                  ) : (
                    startupError
                  )}
                </Typography>
              </Box>
              
              {/* Technical error code - Smaller, secondary */}
              {scanError?.code && (
                <Typography
                  sx={{
                    fontSize: 9,
                    fontWeight: 500,
                    color: darkMode ? '#666' : '#999',
                    fontFamily: 'monospace',
                    bgcolor: darkMode ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0.05)',
                    px: 1.5,
                    py: 0.5,
                    borderRadius: '6px',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                  }}
                >
                  {scanError.code}
                </Typography>
              )}
              
              {/* Retry button */}
              <Button
                variant="outlined"
                startIcon={isRetrying ? <CircularProgress size={15} sx={{ color: '#ef4444' }} /> : <RefreshIcon sx={{ fontSize: 15 }} />}
                onClick={handleRetry}
                disabled={isRetrying}
                sx={{
                  borderColor: '#ef4444',
                  color: '#ef4444',
                  fontWeight: 600,
                  fontSize: 11,
                  px: 2.5,
                  py: 0.75,
                  borderRadius: '10px',
                  textTransform: 'none',
                  '&:hover': {
                    borderColor: '#dc2626',
                    bgcolor: 'rgba(239, 68, 68, 0.04)',
                  },
                  '&:disabled': {
                    borderColor: '#fca5a5',
                    color: '#fca5a5',
                  },
                }}
              >
                {isRetrying ? 'Restarting...' : 'Retry Scan'}
              </Button>
            </Box>
          ) : (
            // 🔄 Scanning in progress - Clean design, more discrete and compact
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 0.75,
                width: '100%',
              }}
            >
              {/* Title + spinner/checkmark + discrete counter - More discrete and compact */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {scanComplete ? (
                  // ✅ Success checkmark (outlined)
                  <CheckCircleOutlinedIcon
                    sx={{
                      fontSize: 14,
                      color: darkMode ? 'rgba(34, 197, 94, 0.6)' : 'rgba(22, 163, 74, 0.5)',
                    }}
                  />
                ) : (
                  // 🔄 Spinner in progress
                  <CircularProgress 
                    size={12} 
                    thickness={4} 
                    sx={{ 
                      color: darkMode ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.2)',
                    }} 
                  />
                )}
                <Typography
                  sx={{
                    fontSize: 10,
                    fontWeight: 500,
                    color: scanComplete 
                      ? (darkMode ? 'rgba(34, 197, 94, 0.6)' : 'rgba(22, 163, 74, 0.5)')
                      : (darkMode ? 'rgba(245, 245, 245, 0.5)' : 'rgba(51, 51, 51, 0.5)'),
                    letterSpacing: '0.1px',
                    transition: 'color 0.3s ease',
                  }}
                >
                  {scanComplete ? 'Scan complete' : 'Scanning hardware'}
                </Typography>
                {!scanComplete && (
                  <Typography
                    sx={{
                      fontSize: 8,
                      fontWeight: 500,
                      color: darkMode ? 'rgba(102, 102, 102, 0.6)' : 'rgba(153, 153, 153, 0.6)',
                      fontFamily: 'monospace',
                      ml: 0.5,
                    }}
                  >
                    {scanProgress.current}/{scanProgress.total}
                  </Typography>
                )}
              </Box>
            </Box>
          )}
          </Box>
      </Box>
    </Box>
  );
}

export default StartingView;
