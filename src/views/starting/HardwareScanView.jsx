import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Box, Typography, CircularProgress, Button, LinearProgress, useTheme } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import Viewer3D from '../../components/viewer3d';
import useAppStore from '../../store/useAppStore';
import { invoke } from '@tauri-apps/api/core';
import { HARDWARE_ERROR_CONFIGS, getErrorMeshes } from '../../utils/hardwareErrors';
import { getTotalScanParts, getCurrentScanPart, mapMeshToScanPart } from '../../utils/scanParts';
import { useDaemonStartupLogs } from '../../hooks/daemon/useDaemonStartupLogs';
import LogConsole from '@components/LogConsole';
import { DAEMON_CONFIG, fetchWithTimeout, buildApiUrl } from '../../config/daemon';
import { detectMovementChanges } from '../../utils/movementDetection';
import { useAppFetching, useAppEnrichment } from '../active-robot/application-store/hooks';

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
  const { setHardwareError, darkMode, transitionTo, robotStatus, setRobotStateFull, setAvailableApps, setInstalledApps, setAppsLoading } = useAppStore();
  
  // ✅ App fetching hooks for pre-loading apps before transition
  const { fetchOfficialApps, fetchAllAppsFromDaemon, fetchInstalledApps } = useAppFetching();
  const { enrichApps } = useAppEnrichment();
  const isStarting = robotStatus === 'starting';
  const theme = useTheme();
  const { logs: startupLogs, hasError: hasStartupError, lastMessage } = useDaemonStartupLogs(isStarting);
  const totalScanParts = getTotalScanParts(); // Static total from scan parts list
  const [scanProgress, setScanProgress] = useState({ current: 0, total: totalScanParts });
  const [currentPart, setCurrentPart] = useState(null);
  const [scanError, setScanError] = useState(null);
  const [errorMesh, setErrorMesh] = useState(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);
  const [waitingForDaemon, setWaitingForDaemon] = useState(false);
  const [waitingForMovements, setWaitingForMovements] = useState(false);
  const [waitingForApps, setWaitingForApps] = useState(false); // ✅ NEW: Pre-fetch apps state
  const [daemonStep, setDaemonStep] = useState('connecting'); // 'connecting' | 'initializing' | 'detecting' | 'loading_apps'
  const [daemonAttempts, setDaemonAttempts] = useState(0);
  const [movementAttempts, setMovementAttempts] = useState(0);
  const [allMeshes, setAllMeshes] = useState([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0); // ✅ Track elapsed time for progressive messages
  const robotRefRef = useRef(null);
  const healthCheckIntervalRef = useRef(null);
  const movementCheckIntervalRef = useRef(null);
  const elapsedTimerRef = useRef(null); // ✅ Timer for elapsed time
  const lastMovementStateRef = useRef(null); // Track last movement state to detect changes
  
  // ✅ Get message thresholds from config
  const { MESSAGE_THRESHOLDS } = DAEMON_CONFIG.HARDWARE_SCAN;
  
  // ✅ Helper to get progressive message based on elapsed time
  const getProgressiveMessage = useCallback(() => {
    if (elapsedSeconds >= MESSAGE_THRESHOLDS.VERY_LONG) {
      return { text: 'Taking its time.', bold: 'Worth the wait', suffix: '!' };
    }
    if (elapsedSeconds >= MESSAGE_THRESHOLDS.LONG_WAIT) {
      return { text: 'Patience is a', bold: 'virtue', suffix: ', they say' };
    }
    if (elapsedSeconds >= MESSAGE_THRESHOLDS.TAKING_TIME) {
      return { text: 'Loading robot', bold: 'superpowers', suffix: '...' };
    }
    if (elapsedSeconds >= MESSAGE_THRESHOLDS.FIRST_LAUNCH) {
      return { text: 'First launch may take a bit', bold: 'longer', suffix: '' };
    }
    return null; // Use default message
  }, [elapsedSeconds, MESSAGE_THRESHOLDS])
  
  // ✅ Helper to clear all intervals (DRY)
  const clearAllIntervals = useCallback(() => {
    if (healthCheckIntervalRef.current) {
      clearInterval(healthCheckIntervalRef.current);
      healthCheckIntervalRef.current = null;
    }
    if (movementCheckIntervalRef.current) {
      clearInterval(movementCheckIntervalRef.current);
      movementCheckIntervalRef.current = null;
    }
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  }, []);
  
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
      
      // Reset scan progress and visual states (but NOT hardwareError yet)
      // hardwareError will be reset by startDaemon, and re-set if error persists
      setScanError(null);
      setErrorMesh(null);
      setScanProgress({ current: 0, total: totalScanParts });
      setCurrentPart(null);
      setScanComplete(false);
      setWaitingForDaemon(false);
      setWaitingForMovements(false);
      setDaemonStep('connecting');
      setDaemonAttempts(0);
      setMovementAttempts(0);
      setElapsedSeconds(0); // ✅ Reset elapsed time
      scannedPartsRef.current.clear(); // Reset scanned parts tracking
      
      // Clear all intervals
      clearAllIntervals();
      lastMovementStateRef.current = null; // Reset movement tracking
      
      // ✅ CRITICAL: Reset hardwareError before restarting
      // Otherwise transitionTo.ready() will be blocked by the guard that checks hardwareError
      // If the error persists, it will be re-detected by the stderr listener
      setHardwareError(null);
      
      // If startDaemon is provided, use it instead of reloading
      if (startDaemon) {
        transitionTo.starting();
        await startDaemon();
        // ✅ startDaemon will reset hardwareError, and if error persists,
        // it will be re-detected by sidecar-stderr listener or timeout
        setIsRetrying(false);
      } else {
        // Fallback to reload if startDaemon not available
        window.location.reload();
      }
    } catch (err) {
      console.error('Failed to retry:', err);
      setIsRetrying(false);
      // ✅ Keep scan view active - don't reload, let the error be handled by startDaemon
      // startDaemon will set hardwareError if it fails, keeping us in scan view
    }
  }, [transitionTo, startDaemon, clearAllIntervals]);
  
  /**
   * Check daemon health status AND robot ready state
   * Returns { ready: boolean, hasMovements: boolean } 
   * Polls /api/state/full directly (doesn't depend on useRobotState which only polls when isActive=true)
   * ✅ Also updates robotStateFull in store so it's available immediately when transitioning to active view
   */
  const checkDaemonHealth = useCallback(async () => {
    try {
      // 1. Check daemon responds
      const healthCheck = await fetchWithTimeout(
        buildApiUrl('/api/daemon/status'),
        {},
        DAEMON_CONFIG.TIMEOUTS.STARTUP_CHECK,
        { silent: true }
      );
      
      if (!healthCheck.ok) {
        return { ready: false, hasMovements: false };
      }
      
      // 2. Poll /api/state/full directly to check if control_mode is available
      // (useRobotState doesn't poll when isActive=false, so we poll here)
      const stateResponse = await fetchWithTimeout(
        buildApiUrl('/api/state/full?with_control_mode=true&with_head_joints=true&with_body_yaw=true&with_antenna_positions=true'),
        {},
        DAEMON_CONFIG.TIMEOUTS.STATE_FULL,
        { silent: true }
      );
      
      if (!stateResponse.ok) {
        return { ready: false, hasMovements: false };
      }
      
      const stateData = await stateResponse.json();
      
      // control_mode must be defined (enabled or disabled, but not undefined)
      if (stateData.control_mode === undefined) {
        return { ready: false, hasMovements: false };
      }
      
      // ✅ Update robotStateFull in store so it's available immediately when transitioning to active view
      // This prevents the "Connected" state flash when arriving in ActiveRobotView
      setRobotStateFull({
        data: stateData,
        lastUpdate: Date.now(),
        error: null,
      });
      
      // 3. Check if movements are available (head_joints, body_yaw, antennas)
      const hasMovements = (
        stateData.head_joints && 
        Array.isArray(stateData.head_joints) && 
        stateData.head_joints.length === 7 &&
        stateData.body_yaw !== undefined &&
        stateData.antennas_position &&
        Array.isArray(stateData.antennas_position) &&
        stateData.antennas_position.length === 2
      );
      
      // 4. Detect if movements are available (robot data is being updated)
      // ✅ ROBUST: Accept if values are changing OR if we have 2+ consecutive valid readings
      // (robot might be static but data stream is active)
      let movementsDetected = false;
      if (hasMovements) {
        const currentState = {
          headJoints: stateData.head_joints,
          bodyYaw: stateData.body_yaw,
          antennas: stateData.antennas_position,
          timestamp: Date.now(),
          readCount: (lastMovementStateRef.current?.readCount || 0) + 1,
        };
        
        if (lastMovementStateRef.current) {
          // ✅ Use centralized helper for movement detection
          const changes = detectMovementChanges(
            currentState,
            lastMovementStateRef.current,
            DAEMON_CONFIG.MOVEMENT.TOLERANCE_SMALL
          );
          
          // ✅ Movements detected if:
          // - Any value changed (robot is moving/updating), OR
          // - We have at least 2 consecutive valid readings (data stream is active, robot might be static)
          movementsDetected = changes.anyChanged || currentState.readCount >= 2;
        } else {
          // First reading - store it but don't consider movements detected yet
          lastMovementStateRef.current = currentState;
          movementsDetected = false; // Need at least 2 readings
        }
        
        // Update last state
        lastMovementStateRef.current = currentState;
      }
      
      return { 
        ready: true, 
        hasMovements: hasMovements && movementsDetected 
      };
    } catch (err) {
      return { ready: false, hasMovements: false };
    }
  }, [setRobotStateFull]);

  /**
   * Start polling daemon health after scan completes
   * Waits for: 1) daemon ready with control_mode, 2) movements detected
   * Only proceed to transition when both are valid
   * ✅ If timeout reached, sets startupError instead of continuing
   */
  const startDaemonHealthCheck = useCallback(() => {
    // Clear any existing intervals
    clearAllIntervals();

    setWaitingForDaemon(true);
    setWaitingForMovements(false);
    setDaemonStep('connecting');
    setDaemonAttempts(0);
    setMovementAttempts(0);
    setElapsedSeconds(0); // ✅ Reset elapsed time
    let attemptCount = 0;
    let daemonReady = false;
    
    // ✅ Use centralized config
    const { CHECK_INTERVAL, DAEMON_MAX_ATTEMPTS, MOVEMENT_MAX_ATTEMPTS } = DAEMON_CONFIG.HARDWARE_SCAN;
    
    // ✅ Start elapsed time counter (updates every second)
    elapsedTimerRef.current = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);

    // Step 1: Wait for daemon to be ready
    const checkHealth = async () => {
      attemptCount++;
      setDaemonAttempts(attemptCount);
      
      const result = await checkDaemonHealth();
      
      if (result.ready && !daemonReady) {
        // ✅ Daemon is ready AND robot has control_mode
        
        daemonReady = true;
        setDaemonStep('initializing');
        
        // Small delay to show "initializing" step
        await new Promise(resolve => setTimeout(resolve, 300));
        
        setWaitingForDaemon(false);
        setWaitingForMovements(true);
        setDaemonStep('detecting');
        
        // Clear health check interval
        if (healthCheckIntervalRef.current) {
          clearInterval(healthCheckIntervalRef.current);
          healthCheckIntervalRef.current = null;
        }
        
        // Start checking for movements
        let movementAttemptCount = 0;
        const checkMovements = async () => {
          movementAttemptCount++;
          setMovementAttempts(movementAttemptCount);
          
          const result = await checkDaemonHealth();
          
          if (result.hasMovements) {
            // ✅ Movements detected, now pre-fetch apps before transition
            
            setWaitingForMovements(false);
            clearAllIntervals();
            
            // ✅ NEW: Pre-fetch apps before transitioning to ActiveRobotView
            setWaitingForApps(true);
            setDaemonStep('loading_apps');
            
            
            try {
              setAppsLoading(true);
              
              // Fetch all apps in parallel (official + community + installed)
              const [officialResult, communityResult, installedResult] = await Promise.allSettled([
                fetchOfficialApps(),
                fetchAllAppsFromDaemon(),
                fetchInstalledApps(),
              ]);
              
              // Extract results
              let officialApps = officialResult.status === 'fulfilled' ? (officialResult.value || []) : [];
              let communityApps = communityResult.status === 'fulfilled' ? (communityResult.value || []) : [];
              const installedAppsFromDaemon = installedResult.status === 'fulfilled' ? (installedResult.value?.apps || []) : [];
              
              // Mark apps with isOfficial flag
              officialApps = officialApps.map(app => ({ ...app, isOfficial: true }));
              communityApps = communityApps.map(app => ({ ...app, isOfficial: false }));
              
              // Merge all apps
              let allApps = [...officialApps, ...communityApps];
              
              // Add local-only installed apps
              const availableAppNames = new Set(allApps.map(app => app.name?.toLowerCase()));
              const localOnlyApps = installedAppsFromDaemon
                .filter(app => !availableAppNames.has(app.name?.toLowerCase()))
                .map(app => ({ ...app, source_kind: app.source_kind || 'local', isOfficial: false }));
              
              if (localOnlyApps.length > 0) {
                allApps = [...allApps, ...localOnlyApps];
              }
              
              // Create lookup structures for installed apps
              const installedAppNames = new Set(
                installedAppsFromDaemon.map(app => app.name?.toLowerCase()).filter(Boolean)
              );
              const installedAppsMap = new Map(
                installedAppsFromDaemon.map(app => [app.name?.toLowerCase(), app])
              );
              
              // Enrich apps with metadata
              const { enrichedApps, installed } = await enrichApps(
                allApps,
                installedAppNames,
                installedAppsMap,
                officialApps
              );
              
              // Preserve isOfficial flag after enrichment
              const enrichedAppsWithFlag = enrichedApps.map(app => {
                const original = allApps.find(a => a.name === app.name);
                return { ...app, isOfficial: original?.isOfficial ?? false };
              });
              
              // Store in global store (will be used immediately by ActiveRobotView)
              setAvailableApps(enrichedAppsWithFlag);
              setInstalledApps(installed);
              
              
            } catch (err) {
              console.warn('⚠️ Failed to pre-fetch apps (will retry in ActiveRobotView):', err.message);
            } finally {
              setAppsLoading(false);
              setWaitingForApps(false);
            }
            
            // Now we can safely call the callback
            if (onScanCompleteCallback) {
              onScanCompleteCallback();
            }
            return;
          }
          
          // ✅ If max attempts reached, set timeout error instead of continuing
          if (movementAttemptCount >= MOVEMENT_MAX_ATTEMPTS) {
            console.error(`❌ Movement check timeout after ${MOVEMENT_MAX_ATTEMPTS} attempts (${MOVEMENT_MAX_ATTEMPTS * CHECK_INTERVAL / 1000}s)`);
            setWaitingForMovements(false);
            clearAllIntervals();
            
            // Set timeout error
            const timeoutError = {
              type: 'timeout',
              message: 'Robot movements not detected within timeout period',
              messageParts: {
                text: 'Robot movements',
                bold: 'not detected',
                suffix: 'within timeout period. Please check the robot connection.'
              },
            };
            setHardwareError(timeoutError);
            return;
          }
        };
        
        // Start checking movements immediately, then every interval
        checkMovements();
        movementCheckIntervalRef.current = setInterval(checkMovements, CHECK_INTERVAL);
        return;
      }

      // ✅ If max attempts reached for daemon, set timeout error instead of continuing
      if (attemptCount >= DAEMON_MAX_ATTEMPTS && !daemonReady) {
        console.error(`❌ Daemon healthcheck timeout after ${DAEMON_MAX_ATTEMPTS} attempts (${DAEMON_MAX_ATTEMPTS * CHECK_INTERVAL / 1000}s)`);
        setWaitingForDaemon(false);
        clearAllIntervals();
        
        // Set timeout error
        const timeoutError = {
          type: 'timeout',
          message: 'Daemon did not become ready within timeout period',
          messageParts: {
            text: 'Daemon did not become',
            bold: 'ready',
            suffix: 'within timeout period. Please check the robot connection.'
          },
        };
        setHardwareError(timeoutError);
        return;
      }
    };

    // Start checking immediately, then every interval
    checkHealth();
    healthCheckIntervalRef.current = setInterval(checkHealth, CHECK_INTERVAL);
  }, [checkDaemonHealth, onScanCompleteCallback, clearAllIntervals, setHardwareError, fetchOfficialApps, fetchAllAppsFromDaemon, fetchInstalledApps, enrichApps, setAvailableApps, setInstalledApps, setAppsLoading]);
  
  const handleScanComplete = useCallback(() => {
    
    
    // ✅ Don't mark scan as complete if there's an error - stay in error state
    const currentState = useAppStore.getState();
    if (currentState.hardwareError || (startupError && typeof startupError === 'object' && startupError.type)) {
      console.warn('[HardwareScanView] ⚠️ Scan visual completed but error detected, not completing scan');
      return; // Don't complete scan, stay in error state
    }
    
    
    setScanProgress(prev => ({ ...prev, current: prev.total }));
    setCurrentPart(null);
    setScanComplete(true);
    
    // ✅ NEW: Wait for daemon healthcheck before proceeding
    // This ensures daemon is ready before fetching apps
    startDaemonHealthCheck();
  }, [startupError, startDaemonHealthCheck]);
  
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

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      clearAllIntervals();
      lastMovementStateRef.current = null;
    };
  }, [clearAllIntervals]);

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
        position: 'relative', // For absolute positioning of logs
      }}
    >
      <Box
        sx={{
          width: '100%',
          maxWidth: '300px', // Reduced by 1/3: 450px * 2/3 = 300px
          position: 'relative',
          bgcolor: 'transparent',
        }}
      >
        <Box
          sx={{
            width: '100%',
            height: '320px', // Reduced by 1/3: 480px * 2/3 = 320px
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
            {scanComplete && !waitingForDaemon && !waitingForMovements ? (
              <>
                <Typography
                  sx={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: darkMode ? '#666' : '#999',
                    letterSpacing: '1px',
                    textTransform: 'uppercase',
                    mb: 0.5,
                  }}
                >
                  Hardware Scan Complete
                </Typography>
                
                <Box sx={{ margin: "auto", width: '300px' }}>
                  <LinearProgress 
                    variant="determinate"
                    value={100}
                    sx={{ 
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: darkMode 
                        ? `${theme.palette.success.main}33` 
                        : `${theme.palette.success.main}1A`,
                      '& .MuiLinearProgress-bar': {
                        backgroundColor: theme.palette.success.main,
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
                    All components <Box component="span" sx={{ fontWeight: 700 }}>verified</Box>
                  </Typography>
                </Box>
              </>
            ) : (
              <>
            <Typography
                  sx={{
                fontSize: 11,
                fontWeight: 600,
                color: darkMode ? '#666' : '#999',
                letterSpacing: '1px',
                textTransform: 'uppercase',
                  }}
            >
              {waitingForApps
                ? 'Loading Applications'
                : waitingForMovements 
                ? 'Detecting Movements' 
                : waitingForDaemon 
                ? (daemonStep === 'connecting' 
                    ? 'Connecting to Daemon'
                    : daemonStep === 'initializing'
                    ? 'Initializing Control'
                    : 'Starting Software')
                : 'Scanning Hardware'}
            </Typography>
            
            <Box sx={{ margin: "auto", width: '300px' }}>
              <LinearProgress 
                variant="determinate"
                value={(() => {
                  // ✅ Use centralized progress distribution (adjusted for apps loading step)
                  const { PROGRESS, DAEMON_MAX_ATTEMPTS, MOVEMENT_MAX_ATTEMPTS } = DAEMON_CONFIG.HARDWARE_SCAN;
                  
                  // Hardware scan: 0-25%
                  if (!scanComplete && !waitingForDaemon && scanProgress.total > 0) {
                    return (scanProgress.current / scanProgress.total) * 25;
                  }
                  
                  // Daemon connecting: 25-40%
                  if (waitingForDaemon && daemonStep === 'connecting') {
                    return 25 + Math.min(15, (daemonAttempts / DAEMON_MAX_ATTEMPTS) * 15);
                  }
                  
                  // Daemon initializing: 40-55%
                  if (waitingForDaemon && daemonStep === 'initializing') {
                    return 40 + Math.min(15, (daemonAttempts / DAEMON_MAX_ATTEMPTS) * 15);
                  }
                  
                  // Detecting movements: 55-80%
                  if (waitingForMovements) {
                    return 55 + Math.min(25, (movementAttempts / MOVEMENT_MAX_ATTEMPTS) * 25);
                  }
                  
                  // Loading apps: 80-100%
                  if (waitingForApps) {
                    return 85; // Static value while loading apps
                  }
                  
                  // Scan complete
                  if (scanComplete && !waitingForDaemon && !waitingForMovements && !waitingForApps) {
                    return 100;
                  }
                  
                  return 0;
                })()}
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
                {waitingForApps ? (
                  <>
                    <Box component="span" sx={{ fontWeight: 700 }}>Fetching</Box> available apps...
                  </>
                ) : waitingForDaemon && daemonStep === 'connecting' ? (
                  <>
                    <Box component="span" sx={{ fontWeight: 700 }}>Establishing</Box> connection...
                  </>
                ) : waitingForDaemon && daemonStep === 'initializing' ? (
                  <>
                    <Box component="span" sx={{ fontWeight: 700 }}>Preparing</Box> motor control...
                  </>
                ) : waitingForMovements ? (
                  <>
                    <Box component="span" sx={{ fontWeight: 700 }}>Waiting</Box> for robot response...
                  </>
                ) : currentPart ? (
                  <>
                    Scanning <Box component="span" sx={{ fontWeight: 700 }}>{currentPart.part}</Box>
                  </>
                ) : (
                  'Initializing scan...'
                )}
              </Typography>
              
              {/* ✅ Progressive message based on elapsed time */}
              {(waitingForDaemon || waitingForMovements) && getProgressiveMessage() && (
                <Typography
                  sx={{
                    fontSize: 12,
                    fontWeight: 400,
                    color: elapsedSeconds >= MESSAGE_THRESHOLDS.VERY_LONG 
                      ? (darkMode ? '#f59e0b' : '#d97706') // Warning color after 45s
                      : (darkMode ? '#888' : '#666'),
                    mt: 0.5,
                    opacity: 1,
                    transition: 'all 0.3s ease-in-out',
                  }}
                >
                  {getProgressiveMessage().text}{' '}
                  <Box component="span" sx={{ fontWeight: 600 }}>
                    {getProgressiveMessage().bold}
                  </Box>
                  {getProgressiveMessage().suffix}
                </Typography>
              )}
            </Box>
              </>
            )}
            
          </Box>
        )}
      </Box>

      {/* ✅ Daemon startup logs - fixed at the bottom, visible, scrollable */}
      {/* Always show logs if available, even if not starting (error state) */}
      {startupLogs.length > 0 && (
        <Box
          sx={{
            position: 'fixed',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'calc(100% - 32px)',
            maxWidth: '420px',
            zIndex: 1000,
            opacity: 0.5, // Semi-transparent by default
            transition: 'opacity 0.3s ease-in-out',
            '&:hover': {
              opacity: 1, // Full opacity on hover
            },
          }}
        >
          <LogConsole
            logs={startupLogs}
            darkMode={darkMode}
            includeStoreLogs={true}
            compact={true}
            showTimestamp={false}
            lines={4}
                sx={{
              bgcolor: darkMode ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.7)',
              border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.12)'}`,
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
            }}
          />
        </Box>
      )}
    </Box>
  );
}

export default HardwareScanView;

