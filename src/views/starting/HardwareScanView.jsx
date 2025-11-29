import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Box, Typography, CircularProgress, Button, LinearProgress, useTheme } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import Viewer3D from '../../components/viewer3d';
import useAppStore from '../../store/useAppStore';
import { invoke } from '@tauri-apps/api/core';
import { HARDWARE_ERROR_CONFIGS, getErrorMeshes } from '../../utils/hardwareErrors';
import { getTotalScanParts, getCurrentScanPart, mapMeshToScanPart } from '../../utils/scanParts';

/**
 * Generate text shadow for better readability on transparent backgrounds
 */
const createTextShadow = (bgColor) => {
  const offsets = [
    [-4, -4], [4, -4], [-4, 4], [4, 4],
    [-3, -3], [3, -3], [-3, 3], [3, 3],
    [-2, -2], [2, -2], [-2, 2], [2, 2],
    [-1, -1], [1, -1], [-1, 1], [1, 1]
  ];
  return offsets.map(([x, y]) => `${x}px ${y}px 0 ${bgColor}`).join(', ');
};

/**
 * Hardware Scan View Component
 * Displays the robot in X-ray mode with a scan effect
 * Shows scan progress and handles hardware errors
 */
function HardwareScanView({ 
  startupError,
  onScanComplete: onScanCompleteCallback,
  startDaemon,
}) {
  const { setHardwareError, darkMode, setIsStarting } = useAppStore();
  const theme = useTheme();
  const totalScanParts = getTotalScanParts(); // Static total from scan parts list
  const [scanProgress, setScanProgress] = useState({ current: 0, total: totalScanParts });
  const [currentPart, setCurrentPart] = useState(null);
  const [scanError, setScanError] = useState(null);
  const [errorMesh, setErrorMesh] = useState(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);
  const [allMeshes, setAllMeshes] = useState([]);
  const robotRefRef = useRef(null);
  
  // Memoize text shadow based on dark mode
  const textShadow = useMemo(() => {
    const bgColor = darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)';
    return createTextShadow(bgColor);
  }, [darkMode]);
  
  // Get error configuration from startupError
  const errorConfig = useMemo(() => {
    if (!startupError || typeof startupError !== 'object') return null;
    return HARDWARE_ERROR_CONFIGS[Object.keys(HARDWARE_ERROR_CONFIGS).find(
      key => HARDWARE_ERROR_CONFIGS[key].type === startupError.type
    )] || null;
  }, [startupError]);
  
  // Find error meshes based on configuration
  useEffect(() => {
    if (!errorConfig || !allMeshes.length) {
      setErrorMesh(null);
      return;
    }
    
    // Get error meshes using centralized helper
    const meshes = getErrorMeshes(errorConfig, robotRefRef.current, allMeshes);
    
    // Set first mesh as errorFocusMesh (Viewer3D will handle finding all related meshes)
    if (meshes && meshes.length > 0) {
      setErrorMesh(meshes[0]);
    } else {
      setErrorMesh(null);
    }
  }, [errorConfig, allMeshes]);
  
  // Callback when meshes are ready
  const handleMeshesReady = useCallback((meshes) => {
    setAllMeshes(meshes);
  }, []);
  
  const handleRetry = useCallback(async () => {
    setIsRetrying(true);
    
    try {
      // Stop daemon first
      await invoke('stop_daemon');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Reset all error states
      setScanError(null);
      setErrorMesh(null);
      setScanProgress({ current: 0, total: totalScanParts });
      setCurrentPart(null);
      setScanComplete(false);
      setHardwareError(null);
      scannedPartsRef.current.clear(); // Reset scanned parts tracking
      
      // If startDaemon is provided, use it instead of reloading
      if (startDaemon) {
        setIsStarting(true);
        await startDaemon();
        setIsRetrying(false);
      } else {
        // Fallback to reload if startDaemon not available
        window.location.reload();
      }
    } catch (err) {
      console.error('Failed to retry:', err);
      setIsRetrying(false);
      // If startDaemon fails, reload as fallback
      if (startDaemon) {
        window.location.reload();
      }
    }
  }, [setHardwareError, setIsStarting, startDaemon]);
  
  const handleScanComplete = useCallback(() => {
    setScanProgress(prev => ({ ...prev, current: prev.total }));
    setCurrentPart(null);
    setScanComplete(true);
    
    if (onScanCompleteCallback) {
      onScanCompleteCallback();
    }
  }, [onScanCompleteCallback]);
  
  // Track which parts have been scanned to calculate progress
  const scannedPartsRef = useRef(new Set());
  const totalMeshesRef = useRef(0);
  const lastProgressRef = useRef({ current: 0, total: 0 });
  const lastPartRef = useRef(null);
  const meshPartCacheRef = useRef(new WeakMap()); // Cache mesh -> part mapping
  
  const handleScanMesh = useCallback((mesh, index, total) => {
    // Store total meshes count
    totalMeshesRef.current = total;
    
    // ✅ Cache mesh-to-part mapping to avoid recalculating
    let partInfo = meshPartCacheRef.current.get(mesh);
    if (!partInfo) {
      partInfo = mapMeshToScanPart(mesh);
      if (partInfo) {
        meshPartCacheRef.current.set(mesh, partInfo);
      }
    }
    
    if (partInfo) {
      // Create a unique key for this part
      const partKey = `${partInfo.family}:${partInfo.part}`;
      
      // Track if this is a new part
      if (!scannedPartsRef.current.has(partKey)) {
        scannedPartsRef.current.add(partKey);
      }
      
      // ✅ Only update currentPart if it changed (avoid unnecessary re-renders)
      if (!lastPartRef.current || 
          lastPartRef.current.family !== partInfo.family || 
          lastPartRef.current.part !== partInfo.part) {
        setCurrentPart(partInfo);
        lastPartRef.current = partInfo;
      }
    }
    
    // ✅ Only update progress if it actually changed (throttle updates)
    const newProgress = { current: index, total: total };
    if (lastProgressRef.current.current !== newProgress.current || 
        lastProgressRef.current.total !== newProgress.total) {
      setScanProgress(newProgress);
      lastProgressRef.current = newProgress;
    }
  }, [totalScanParts]);
  
  // Initialize first part when scan starts
  useEffect(() => {
    const showScan = !startupError && !scanError && !scanComplete;
    
    if (showScan && scannedPartsRef.current.size === 0) {
      // Show initializing message until first mesh is scanned
      setCurrentPart(null);
    }
  }, [scanComplete, startupError, scanError]);

  return (
    <Box
      sx={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
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
            key="hardware-scan"
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
            usePremiumScan={false}
            onScanComplete={handleScanComplete}
            onScanMesh={handleScanMesh}
            onMeshesReady={handleMeshesReady}
            cameraPreset={errorConfig?.cameraPreset || 'scan'}
            useCinematicCamera={true}
            errorFocusMesh={errorMesh}
            backgroundColor="transparent"
            canvasScale={0.9}
            canvasTranslateX="5%"
            canvasTranslateY="10%"
          />
        </Box>
      </Box>

      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          width: '100%',
          maxWidth: '450px',
          height: '100px', // Fixed height to prevent vertical shifts between states
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
                {startupError && typeof startupError === 'object' && startupError.messageParts ? (
                  <>
                    {startupError.messageParts.text && `${startupError.messageParts.text} `}
                    <Box component="span" sx={{ fontWeight: 700 }}>{startupError.messageParts.bold}</Box>
                    {startupError.messageParts.suffix && ` ${startupError.messageParts.suffix}`}
                  </>
                ) : scanError?.action ? (
                  <>
                    <Box component="span" sx={{ fontWeight: 700 }}>Check</Box> the{' '}
                    <Box component="span" sx={{ fontWeight: 700 }}>camera cable</Box> connection and{' '}
                    <Box component="span" sx={{ fontWeight: 700 }}>restart</Box>
                  </>
                ) : startupError && typeof startupError === 'object' && startupError.message ? (
                  startupError.message
                ) : (
                  startupError || 'Hardware error detected'
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
              {isRetrying ? 'Restarting...' : 'Restart Scan'}
            </Button>
          </Box>
        ) : (
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
              {scanComplete ? 'Scan Complete' : 'Scanning Hardware'}
            </Typography>
            
            {!scanComplete && scanProgress.total > 0 && (
              <>
                <Box sx={{ margin: "auto", width: '100%', maxWidth: '300px' }}>
                  <LinearProgress 
                    variant="determinate"
                    value={scanProgress.total > 0 ? (scanProgress.current / scanProgress.total) * 100 : 0}
                    sx={{
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: darkMode 
                        ? `${theme.palette.primary.main}33` 
                        : `${theme.palette.primary.main}1A`,
                      '& .MuiLinearProgress-bar': {
                        backgroundColor: theme.palette.primary.main,
                        borderRadius: 2,
                      },
                    }}
                  />
                </Box>
                
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
                    {currentPart ? (
                      <>
                        Scanning <Box component="span" sx={{ fontWeight: 700 }}>{currentPart.part}</Box>
                      </>
                    ) : (
                      'Initializing scan...'
                    )}
                  </Typography>
                </Box>
              </>
            )}
            
            {scanComplete && (
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
                  <Box component="span" sx={{ fontWeight: 700 }}>Hardware scan</Box> completed successfully
                </Typography>
              </Box>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
}

export default HardwareScanView;

