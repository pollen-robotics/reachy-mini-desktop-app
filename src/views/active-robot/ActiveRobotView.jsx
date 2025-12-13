import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Box, Typography, IconButton, Button, CircularProgress, Snackbar, Alert, LinearProgress, ButtonGroup, Switch, Tooltip } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import Viewer3D from '../../components/viewer3d';
import CameraFeed from './camera/CameraFeed';
import WebRTCVideo from '../../components/WebRTCVideo';
import CameraStatusManager from '../../components/CameraStatusManager';
import { ViewportSwapper } from './layout';
import LogConsole from '@components/LogConsole';
import { RightPanel } from './right-panel';
import RobotHeader from './RobotHeader';
import { PowerButton } from './controls';
import AudioControls from './audio/AudioControls';
import { useRobotPowerState, useRobotMovementStatus } from './hooks';
import { useAudioControls } from './audio/hooks';
import { useAppLogs } from './application-store/hooks';
import { useActiveRobotContext } from './context';
import { CHOREOGRAPHY_DATASETS, DANCES, QUICK_ACTIONS } from '../../constants/choreographies';


function ActiveRobotView({ 
  isActive, 
  isStarting, 
  isStopping, 
  stopDaemon, 
  sendCommand, 
  playRecordedMove, 
  isCommandRunning,
  logs,
  daemonVersion,
  usbPortName,
  onAppsReady, // ✅ Callback to notify when apps are loaded
}) {
  // Get dependencies from context
  const { robotState, actions, windowManager } = useActiveRobotContext();
  
  // Extract state from context
  const { 
    darkMode, 
    isDaemonCrashed, 
    robotStatus, 
    busyReason,
    currentAppName,
    isAppRunning,
  } = robotState;
  
  // Extract actions from context
  const { resetTimeouts, update, triggerEffect, stopEffect, isBusy, isReady } = actions;
  
  // Compute busy/ready state
  const isBusyState = isBusy();
  const isReadyState = isReady();
  
  // Get complete robot state from daemon API
  const { isOn, isMoving } = useRobotPowerState(isActive); // ✅ Robot power state (motors on/off, movement)
  
  // ✅ Centralized app logs system - listens to sidecar stdout/stderr and adds to store
  useAppLogs(currentAppName, isAppRunning);
  
  // ✅ Monitor active movements and update store status (robotStatus: 'busy', busyReason: 'moving')
  useRobotMovementStatus(isActive);
  
  // Toast notifications
  const [toast, setToast] = useState({ open: false, message: '', severity: 'info' });
  const [toastProgress, setToastProgress] = useState(100);
  
  // Audio controls - Extracted to hook
  const {
    volume,
    microphoneVolume,
    speakerDevice,
    microphoneDevice,
    speakerPlatform,
    microphonePlatform,
    handleVolumeChange,
    handleMicrophoneChange,
    handleMicrophoneVolumeChange,
    handleSpeakerMute,
    handleMicrophoneMute,
  } = useAudioControls(isActive);
  
  // ✅ Apps loading state: notify parent when ready
  const [appsLoading, setAppsLoading] = useState(true);
  
  // ✅ Callback to receive apps loading state
  const handleAppsLoadingChange = useCallback((loading) => {
    setAppsLoading(loading);
    
    // ✅ Notify parent when apps are loaded to close TransitionView
    if (!loading && onAppsReady) {
      // Wait short delay for render to complete
      setTimeout(() => {
        onAppsReady();
      }, 300);
    }
  }, [onAppsReady]);
  
  // ✅ Reset state when arriving on view
  useEffect(() => {
    if (isActive) {
      setAppsLoading(true);
    }
  }, [isActive]);
  
  const showToast = useCallback((message, severity = 'info') => {
    setToast({ open: true, message, severity });
    setToastProgress(100);
  }, []);
  
  const handleCloseToast = useCallback(() => {
    setToast(prev => ({ ...prev, open: false }));
    setToastProgress(100);
  }, []);
  
  // ✅ OPTIMIZED: Progress bar animation using requestAnimationFrame
  useEffect(() => {
    if (!toast.open) {
      setToastProgress(100);
      return;
    }
    
    setToastProgress(100);
    const duration = 3500; // Matches autoHideDuration
    const startTime = performance.now();
    
    const animate = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.max(0, 100 - (elapsed / duration) * 100);
      
      setToastProgress(progress);
      
      if (progress > 0 && elapsed < duration) {
        requestAnimationFrame(animate);
      }
    };
    
    const frameId = requestAnimationFrame(animate);
    
    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [toast.open]);
  
  // Wrapper for Quick Actions with toast and visual effects
  const handleQuickAction = useCallback((action) => {
    if (action.type === 'action') {
      // Actions like sleep/wake_up
      sendCommand(`/api/move/play/${action.name}`, action.label);
    } else if (action.type === 'dance') {
      // Dances
      playRecordedMove(CHOREOGRAPHY_DATASETS.DANCES, action.name);
    } else {
      // Emotions
      playRecordedMove(CHOREOGRAPHY_DATASETS.EMOTIONS, action.name);
    }
    
    // Trigger corresponding 3D visual effect
    const effectMap = {
      'goto_sleep': 'sleep',
      'wake_up': null, // No effect for wake up
      'loving1': 'love',
      'sad1': 'sad',
      'surprised1': 'surprised',
    };
    
        const effectType = effectMap[action.name];
        if (effectType) {
          triggerEffect(effectType);
          // Stop effect after 4 seconds
          setTimeout(() => {
            stopEffect();
          }, 4000);
        }
    
    showToast(`${action.emoji} ${action.label}`, 'info');
  }, [sendCommand, playRecordedMove, showToast]);

  // Quick Actions: Curated mix of emotions, dances, and actions (no redundancy)
  const quickActions = QUICK_ACTIONS;

  // Detect crash and log (no toast, we have the overlay)
  useEffect(() => {
    if (isDaemonCrashed) {
      console.error('💥 DAEMON CRASHED - Fast detection after 3 timeouts (6s)');
    }
  }, [isDaemonCrashed]);

  // Handler to restart daemon after crash
  const handleRestartDaemon = useCallback(async () => {
    resetTimeouts();
    update({ isDaemonCrashed: false, isActive: false });
    
    // Switch to "starting" mode to relaunch
    try {
      await stopDaemon();
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err) {
      console.error('Failed to restart:', err);
      window.location.reload();
    }
  }, [resetTimeouts, update, stopDaemon]);

  return (
    <Box
      sx={{
        width: '100vw',
        height: '100vh',
        background: darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(250, 250, 252, 0.85)',
        backdropFilter: 'blur(40px)',
        WebkitBackdropFilter: 'blur(40px)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Error overlay if daemon crashed - Modern design */}
      {isDaemonCrashed && (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            bgcolor: darkMode ? 'rgba(0, 0, 0, 0.85)' : 'rgba(255, 255, 255, 0.9)',
            backdropFilter: 'blur(20px)',
            // z-index hierarchy: 9999 = fullscreen overlays (Settings, Install, Error)
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Box
            sx={{
              bgcolor: darkMode ? 'rgba(26, 26, 26, 0.8)' : 'rgba(255, 255, 255, 0.95)',
              borderRadius: '20px',
              p: 5,
              maxWidth: 380,
              textAlign: 'center',
              border: `1px solid ${darkMode ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.2)'}`,
              boxShadow: darkMode 
                ? '0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(239, 68, 68, 0.1)' 
                : '0 20px 60px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(239, 68, 68, 0.1)',
            }}
          >
            {/* Error icon */}
            <Box
              sx={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                bgcolor: darkMode ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.08)',
                border: `2px solid ${darkMode ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.2)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mx: 'auto',
                mb: 3,
              }}
            >
              <Typography sx={{ fontSize: 32 }}>⚠️</Typography>
            </Box>
            
            {/* Title */}
            <Typography 
              sx={{ 
                fontSize: 18, 
                fontWeight: 700, 
                color: darkMode ? '#f5f5f5' : '#1a1a1a', 
                mb: 1,
                letterSpacing: '0.2px',
              }}
            >
              Connection Lost
            </Typography>
            
            {/* Description */}
            <Typography 
              sx={{ 
                fontSize: 12, 
                color: darkMode ? '#999' : '#666', 
                mb: 3.5, 
                lineHeight: 1.6,
              }}
            >
              The daemon is not responding. Restart the application to restore the connection.
            </Typography>
            
            {/* Restart button */}
            <Button
              variant="contained"
              onClick={handleRestartDaemon}
              sx={{
                bgcolor: '#FF9500',
                color: 'white',
                fontWeight: 600,
                fontSize: 13,
                px: 4,
                py: 1.25,
                borderRadius: '12px',
                textTransform: 'none',
                boxShadow: '0 4px 12px rgba(255, 149, 0, 0.3)',
                '&:hover': {
                  bgcolor: '#ff8800',
                  boxShadow: '0 6px 16px rgba(255, 149, 0, 0.4)',
                },
              }}
            >
              Restart Application
            </Button>
          </Box>
        </Box>
      )}
      {/* Content - 2 columns */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'row',
          height: '100%',
          gap: 0,
          position: 'relative',
          bgcolor: 'transparent',
        }}
      >
        {/* Left column (450px) - Current content */}
        <Box
          sx={{
            width: '450px',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            px: 3,
            pt: '33px', // Padding top to account for AppTopBar
            overflowY: 'auto',
            overflowX: 'hidden',
            scrollbarGutter: 'stable',
            position: 'relative',
            // z-index hierarchy: 1-2 = layout base elements
            zIndex: 1,
            height: '100%',
            // Slightly darker background for left column
            bgcolor: darkMode 
              ? 'rgba(20, 20, 20, 0.6)' // Slightly darker than main background
              : 'rgba(245, 245, 247, 0.7)', // Slightly darker than main background
            // Gradient shadow on the right to show separation between columns
            borderRight: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'}`,
            boxShadow: darkMode
              ? '2px 0 8px -2px rgba(0, 0, 0, 0.3)'
              : '2px 0 8px -2px rgba(0, 0, 0, 0.1)',
            // Scrollbar styling
            '&::-webkit-scrollbar': {
              width: '6px',
            },
            '&::-webkit-scrollbar-track': {
              background: 'transparent',
            },
            '&::-webkit-scrollbar-thumb': {
              background: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
              borderRadius: '3px',
            },
            '&:hover::-webkit-scrollbar-thumb': {
              background: darkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
            },
          }}
        >
        {/* Main viewer block - Both components are always mounted */}
        <Box
          sx={{
            width: '100%',
            position: 'relative',
            mb: 1,
            overflow: 'visible',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* ViewportSwapper: handles swap between 3D and Camera with Portals */}
          {/* ✅ OPTIMIZED: Memoize Viewer3D props to avoid re-renders when parent re-renders */}
          {useMemo(() => (
            <ViewportSwapper
              view3D={
                <Viewer3D 
                  isActive={isActive} 
                  forceLoad={true}
                  useHeadFollowCamera={true}
                  showCameraToggle={true}
                  showStatusTag={true}
                  isOn={isOn}
                  isMoving={isMoving}
                  robotStatus={robotStatus}
                  busyReason={busyReason}
                  hideCameraFeed={true}
                />
              }
              viewCamera={
                <CameraStatusManager 
                  width={640}
                  height={480}
                  isLarge={true}
                />
              }
            />
          ), [isActive, isOn, isMoving, robotStatus, busyReason])}
          
          {/* Power Button - top left corner */}
          <PowerButton
            onStopDaemon={stopDaemon}
            isReady={isReadyState}
            isStopping={isStopping}
            darkMode={darkMode}
          />
        </Box>
        
        {/* Robot Header - Title, version, status, mode */}
          <RobotHeader
            daemonVersion={daemonVersion}
            darkMode={darkMode}
          />

        {/* Audio Controls - Stable wrapper to ensure correct sizing */}
        <Box sx={{ width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
          <AudioControls
            volume={volume}
            microphoneVolume={microphoneVolume}
            speakerDevice={speakerDevice}
            microphoneDevice={microphoneDevice}
            speakerPlatform={speakerPlatform}
            microphonePlatform={microphonePlatform}
            onVolumeChange={handleVolumeChange}
            onMicrophoneChange={handleMicrophoneChange}
            onMicrophoneVolumeChange={handleMicrophoneVolumeChange}
            onSpeakerMute={handleSpeakerMute}
            onMicrophoneMute={handleMicrophoneMute}
            darkMode={darkMode}
          />
        </Box>
        
        {/* Logs Console - Use flex to take remaining space and prevent height issues */}
        <Box sx={{ mt: 1, width: '100%', flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <Box 
            sx={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              mb: 1.5,
              flexShrink: 0,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography sx={{ fontSize: 11, fontWeight: 600, color: darkMode ? '#888' : '#999', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Logs
              </Typography>
              <Tooltip 
                title="Real-time logs from the Reachy Mini robot daemon. Logs are collected via the Python daemon's logging system and streamed to the frontend through Tauri's IPC (Inter-Process Communication). The daemon runs as a background service and captures system events, robot movements, errors, and status updates. Frontend logs (actions, API calls) are also displayed here with timestamps." 
                arrow 
                placement="top"
              >
                <InfoOutlinedIcon sx={{ fontSize: 12, color: darkMode ? '#666' : '#999', opacity: 0.6, cursor: 'help' }} />
              </Tooltip>
            </Box>
          </Box>
          
          <Box sx={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <LogConsole logs={logs} darkMode={darkMode} lines={4} />
          </Box>
        </Box>
        </Box>

                {/* Right column (450px) - Application Store */}
                <Box
                  sx={{
                    width: '450px',
                    flexShrink: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative',
                    zIndex: 2,
                    pt: '33px', // Padding top to account for AppTopBar
                    transform: 'translateY(-8px)',
                    bgcolor: 'transparent !important',
                    backgroundColor: 'transparent !important',
                  }}
                >
          <RightPanel 
            showToast={showToast}
            onLoadingChange={handleAppsLoadingChange}
            quickActions={quickActions}
            handleQuickAction={handleQuickAction}
            isReady={isReadyState}
            isActive={isActive}
            isBusy={isBusyState}
            darkMode={darkMode}
          />
        </Box>
      </Box>

      {/* Toast Notifications - Bottom center */}
      <Snackbar
        open={toast.open}
        autoHideDuration={3500}
        onClose={handleCloseToast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{
          bottom: '24px !important',
          left: '50% !important',
          right: 'auto !important',
          transform: 'translateX(-50%) !important',
          display: 'flex !important',
          justifyContent: 'center !important',
          alignItems: 'center !important',
          width: '100%',
          zIndex: 100000, // Above everything (toasts must be visible above all overlays)
          '& > *': {
            margin: '0 auto !important',
          },
        }}
      >
        <Box 
          onClick={handleCloseToast}
          sx={{ 
            position: 'relative', 
            overflow: 'hidden', 
            borderRadius: '12px',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: darkMode 
              ? '0 8px 32px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3)'
              : '0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08)',
            zIndex: 100000,
            cursor: 'pointer',
          }}
        >
          {/* Main content */}
          <Box
            sx={{
              position: 'relative',
              borderRadius: '12px',
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: '-0.01em',
              background: darkMode
                ? (toast.severity === 'success'
                  ? 'rgba(34, 197, 94, 0.15)'
                  : toast.severity === 'error'
                  ? 'rgba(239, 68, 68, 0.15)'
                  : 'rgba(255, 149, 0, 0.15)')
                : (toast.severity === 'success'
                  ? 'rgba(34, 197, 94, 0.1)'
                  : toast.severity === 'error'
                  ? 'rgba(239, 68, 68, 0.1)'
                  : 'rgba(255, 149, 0, 0.1)'),
              border: `1px solid ${toast.severity === 'success'
                ? darkMode ? 'rgba(34, 197, 94, 0.4)' : 'rgba(34, 197, 94, 0.3)'
                : toast.severity === 'error'
                ? darkMode ? 'rgba(239, 68, 68, 0.4)' : 'rgba(239, 68, 68, 0.3)'
                : darkMode ? 'rgba(255, 149, 0, 0.4)' : 'rgba(255, 149, 0, 0.3)'}`,
              color: toast.severity === 'success'
                ? darkMode ? '#86efac' : '#16a34a'
                : toast.severity === 'error'
                ? darkMode ? '#fca5a5' : '#dc2626'
                : darkMode ? '#fbbf24' : '#d97706',
              minWidth: 240,
              maxWidth: 400,
              px: 3,
              py: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1.5,
              overflow: 'hidden',
            }}
          >
            {/* Animated time bar - Bottom border style */}
            <Box
              sx={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                height: '2px',
                width: `${toastProgress}%`,
                background: toast.severity === 'success' 
                  ? darkMode ? 'rgba(34, 197, 94, 0.8)' : 'rgba(34, 197, 94, 0.7)'
                  : toast.severity === 'error'
                  ? darkMode ? 'rgba(239, 68, 68, 0.8)' : 'rgba(239, 68, 68, 0.7)'
                  : darkMode ? 'rgba(255, 149, 0, 0.8)' : 'rgba(255, 149, 0, 0.7)',
                zIndex: 0,
                transition: 'width 0.02s linear',
                borderRadius: '0 0 12px 12px',
              }}
            />
            
            {/* Icon - Outlined style */}
            {toast.severity === 'success' && (
              <CheckCircleOutlinedIcon 
                sx={{ 
                  fontSize: 20, 
                  flexShrink: 0,
                  color: 'inherit',
                }} 
              />
            )}
            {toast.severity === 'error' && (
              <ErrorOutlineIcon 
                sx={{ 
                  fontSize: 20, 
                  flexShrink: 0,
                  color: 'inherit',
                }} 
              />
            )}
            {(toast.severity === 'warning' || toast.severity === 'info') && (
              <WarningAmberOutlinedIcon 
                sx={{ 
                  fontSize: 20, 
                  flexShrink: 0,
                  color: 'inherit',
              }}
            />
            )}
            
            {/* Text content */}
            <Box
              sx={{
                position: 'relative',
                zIndex: 1,
                lineHeight: 1.5,
                textAlign: 'left',
                flex: 1,
            }}
          >
            {toast.message}
            </Box>
          </Box>
        </Box>
      </Snackbar>
    </Box>
  );
}

export default ActiveRobotView;

