import React, { useState, useCallback } from 'react';
import { Box, Typography, CircularProgress, Button } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import Viewer3D from '../viewer3d';
import { getShortComponentName } from '../../utils/componentNames';
import useAppStore from '../../store/useAppStore';
import { invoke } from '@tauri-apps/api/core';

/**
 * Hardware Scan View Component
 * Displays the robot in X-ray mode with a scan effect
 * Shows scan progress and handles hardware errors
 */
function HardwareScanView({ 
  startupError,
  onScanComplete: onScanCompleteCallback,
  showTitlebar = true,
}) {
  const { setHardwareError, darkMode } = useAppStore();
  const [currentComponent, setCurrentComponent] = useState(null);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 });
  const [scanError, setScanError] = useState(null);
  const [errorMesh, setErrorMesh] = useState(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);
  
  const handleRetry = useCallback(async () => {
    console.log('🔄 Retrying scan...');
    setIsRetrying(true);
    
    try {
      console.log('🛑 Stopping daemon...');
      await invoke('stop_daemon');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setScanError(null);
      setErrorMesh(null);
      setScanProgress({ current: 0, total: 0 });
      setCurrentComponent(null);
      setScanComplete(false);
      setHardwareError(null);
      
      console.log('🔄 Reloading app...');
      window.location.reload();
    } catch (err) {
      console.error('Failed to stop daemon:', err);
      window.location.reload();
    }
  }, [setHardwareError]);
  
  const handleScanComplete = useCallback(() => {
    console.log('✅ Scan 3D completed (visually finished)');
    setScanProgress(prev => ({ ...prev, current: prev.total }));
    setCurrentComponent(null);
    setScanComplete(true);
    
    if (onScanCompleteCallback) {
      onScanCompleteCallback();
    }
  }, [onScanCompleteCallback]);
  
  const handleScanMesh = useCallback((mesh, index, total) => {
    const componentName = getShortComponentName(mesh, index, total);
    setCurrentComponent(componentName);
    setScanProgress(prev => ({
      current: Math.max(prev.current, index),
      total: total
    }));
  }, [setHardwareError]);

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        px: 4,
        gap: 1.5,
        bgcolor: 'transparent',
      }}
    >
      <Box
        sx={{
          width: '100%',
          maxWidth: '450px',
          position: 'relative',
          bgcolor: 'transparent',
        }}
      >
        <Box
          sx={{
            width: '100%',
            height: '480px',
            position: 'relative',
            bgcolor: 'transparent',
          }}
        >
          <Viewer3D 
            isActive={false}
            antennas={[-10, -10]}
            headPose={null}
            headJoints={null}
            yawBody={null}
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

      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: '100%',
          maxWidth: '450px',
          minHeight: '60px',
          mt: 2,
        }}
      >
        {(startupError || scanError) ? (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 1,
              py: 0.5,
              maxWidth: '360px',
              minHeight: '90px',
            }}
          >
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
            
            <Button
              variant="outlined"
              startIcon={isRetrying ? <CircularProgress size={15} sx={{ color: '#ef4444' }} /> : <RefreshIcon sx={{ fontSize: 15, color: '#ef4444' }} />}
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
                bgcolor: 'transparent',
                '&:hover': {
                  borderColor: '#dc2626',
                  bgcolor: darkMode ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0.04)',
                },
                '&:disabled': {
                  borderColor: darkMode ? 'rgba(239, 68, 68, 0.3)' : '#fca5a5',
                  color: darkMode ? 'rgba(239, 68, 68, 0.3)' : '#fca5a5',
                },
              }}
            >
              {isRetrying ? 'Restarting...' : 'Retry Scan'}
            </Button>
          </Box>
        ) : (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 0.75,
              width: '100%',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              {scanComplete ? (
                <CheckCircleOutlinedIcon
                  sx={{
                    fontSize: 18,
                    color: '#16a34a',
                  }}
                />
              ) : (
                <CircularProgress 
                  size={16}
                  thickness={4} 
                  sx={{ 
                    color: '#16a34a',
                  }} 
                />
              )}
              <Typography
                sx={{
                  fontSize: 16,
                  fontWeight: 900,
                  color: '#16a34a',
                  letterSpacing: '0.3px',
                  transition: 'color 0.3s ease',
                  // ✅ Contour de la couleur du fond de la scène pour meilleure lisibilité
                  textShadow: `
                    -4px -4px 0 ${darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)'},
                    4px -4px 0 ${darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)'},
                    -4px 4px 0 ${darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)'},
                    4px 4px 0 ${darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)'},
                    -3px -3px 0 ${darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)'},
                    3px -3px 0 ${darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)'},
                    -3px 3px 0 ${darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)'},
                    3px 3px 0 ${darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)'},
                    -2px -2px 0 ${darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)'},
                    2px -2px 0 ${darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)'},
                    -2px 2px 0 ${darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)'},
                    2px 2px 0 ${darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)'},
                    -1px -1px 0 ${darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)'},
                    1px -1px 0 ${darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)'},
                    -1px 1px 0 ${darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)'},
                    1px 1px 0 ${darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)'}
                  `,
                }}
              >
                {scanComplete ? 'Scan complete' : 'Scanning hardware'}
              </Typography>
              {!scanComplete && (
                <Typography
                  sx={{
                    fontSize: 12,
                    fontWeight: 900,
                    color: '#16a34a',
                    opacity: 0.9,
                    fontFamily: 'monospace',
                    ml: 0.5,
                    // ✅ Contour de la couleur du fond de la scène pour le compteur
                    textShadow: `
                      -3px -3px 0 ${darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)'},
                      3px -3px 0 ${darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)'},
                      -3px 3px 0 ${darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)'},
                      3px 3px 0 ${darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)'},
                      -2px -2px 0 ${darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)'},
                      2px -2px 0 ${darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)'},
                      -2px 2px 0 ${darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)'},
                      2px 2px 0 ${darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)'},
                      -1px -1px 0 ${darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)'},
                      1px -1px 0 ${darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)'},
                      -1px 1px 0 ${darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)'},
                      1px 1px 0 ${darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)'}
                    `,
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
  );
}

export default HardwareScanView;

