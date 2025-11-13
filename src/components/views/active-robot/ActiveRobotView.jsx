import React, { useState, useCallback, useEffect } from 'react';
import { Box, Typography, IconButton, Button, CircularProgress, Snackbar, Alert, LinearProgress, ButtonGroup } from '@mui/material';
import PowerSettingsNewOutlinedIcon from '@mui/icons-material/PowerSettingsNewOutlined';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open } from '@tauri-apps/plugin-shell';
import Viewer3D from '../../viewer3d';
import CameraFeed from './camera/CameraFeed';
import ViewportSwapper from './ViewportSwapper';
import LogConsole from './LogConsole';
import ApplicationStore from './application-store';
import RobotHeader from './RobotHeader';
import { useRobotState } from '../../../hooks/useRobotState';
import useAppStore from '../../../store/useAppStore';
import { CHOREOGRAPHY_DATASETS, DANCES } from '../../../constants/choreographies';

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
  onAppsReady, // ✅ Callback pour notifier quand les apps sont chargées
}) {
  // Use mock if available, otherwise the real API
  const appWindow = window.mockGetCurrentWindow ? window.mockGetCurrentWindow() : getCurrentWindow();
  
  // Get dark mode and daemon state from global store
  const { darkMode, isDaemonCrashed, resetTimeouts, update } = useAppStore();
  
  // Get complete robot state from daemon API
  const { isOn, isMoving } = useRobotState(isActive);
  
  // ✅ Helpers computed pour simplifier les conditions
  const isBusy = useAppStore(state => state.isBusy());
  const isReady = useAppStore(state => state.isReady());
  
  // ✨ State machine
  const robotStatus = useAppStore(state => state.robotStatus);
  const busyReason = useAppStore(state => state.busyReason);
  
  // Toast notifications
  const [toast, setToast] = useState({ open: false, message: '', severity: 'info' });
  const [toastProgress, setToastProgress] = useState(100);
  
  // ✅ État de chargement des apps : notifier le parent quand c'est prêt
  const [appsLoading, setAppsLoading] = useState(true);
  
  // ✅ Callback pour recevoir l'état de chargement des apps
  const handleAppsLoadingChange = useCallback((loading) => {
    setAppsLoading(loading);
    
    // ✅ Notifier le parent quand les apps sont chargées pour fermer TransitionView
    if (!loading && onAppsReady) {
      // Attendre un court délai pour que le rendu soit complet
      setTimeout(() => {
        onAppsReady();
      }, 300);
    }
  }, [onAppsReady]);
  
  // ✅ Réinitialiser l'état quand on arrive sur la vue
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
  
  // Progress bar animation
  useEffect(() => {
    if (!toast.open) return;
    
    setToastProgress(100);
    const duration = 3500; // Matches autoHideDuration
    const interval = 20; // Update every 20ms
    const steps = duration / interval;
    const decrement = 100 / steps;
    
    const timer = setInterval(() => {
      setToastProgress(prev => {
        const next = prev - decrement;
        // Stop at 5% to avoid flickering when toast disappears
        if (next <= 5) {
          clearInterval(timer);
          return 5;
        }
        return next;
      });
    }, interval);
    
    return () => clearInterval(timer);
  }, [toast.open]);
  
  // Wrapper for Quick Actions with toast and visual effects
  const handleQuickAction = useCallback((action) => {
    if (action.type === 'action') {
      // Actions like sleep/wake_up
      sendCommand(`/api/move/play/${action.name}`, action.label);
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
          useAppStore.getState().triggerEffect(effectType);
          // Stop effect after 4 seconds
          setTimeout(() => {
            useAppStore.getState().stopEffect();
          }, 4000);
        }
    
    showToast(`${action.emoji} ${action.label}`, 'info');
  }, [sendCommand, playRecordedMove, showToast]);

  // Quick Actions: Mix of actions and emotions
  const quickActions = [
    { name: 'goto_sleep', emoji: '😴', label: 'Sleep', type: 'action' },
    { name: 'wake_up', emoji: '☀️', label: 'Awake', type: 'action' },
    { name: 'loving1', emoji: '🥰', label: 'Love', type: 'emotion' },
    { name: 'sad1', emoji: '😢', label: 'Sad', type: 'emotion' },
    { name: 'surprised1', emoji: '😲', label: 'Surprised', type: 'emotion' },
  ];

  // Detect crash and log (no toast, we have the overlay)
  useEffect(() => {
    if (isDaemonCrashed) {
      console.error('💥 DAEMON CRASHED - Fast detection after 3 timeouts (6s)');
    }
  }, [isDaemonCrashed]);

  // Handler to restart daemon after crash
  const handleRestartDaemon = useCallback(async () => {
    console.log('🔄 Restarting daemon after crash...');
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
      {/* Titlebar */}
      <Box
        onMouseDown={async (e) => {
          // If clicking on a button or its children, do nothing
          const target = e.target;
          const isButton = target.tagName === 'BUTTON' || 
                          target.closest('button') !== null ||
                          target.tagName === 'svg' || 
                          target.tagName === 'path';
          
          if (!isButton) {
            e.preventDefault();
            console.log('🖱️ Start dragging');
            try {
              await appWindow.startDragging();
            } catch (err) {
              console.error('Drag error:', err);
            }
          }
        }}
        sx={{
          height: 33,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          px: 2,
          cursor: 'move',
          userSelect: 'none',
        }}
      >
        {/* Empty titlebar now - moved version near the title */}
      </Box>

      {/* Content - 2 columns */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'row',
          height: 'calc(100% - 33px)',
          gap: 0,
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
            overflowY: 'visible',
          }}
        >
        {/* Main viewer block - Les 2 composants sont toujours montés */}
        <Box
          sx={{
            width: '100%',
            height: 280,
            position: 'relative',
            mb: 1,
            overflow: 'visible',
          }}
        >
          {/* ViewportSwapper : gère le swap entre 3D et Caméra avec Portals */}
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
              <CameraFeed 
                width={640}
                height={480}
                isLarge={true}
              />
            }
          />
          
          {/* Power Button - top left corner */}
          <IconButton
            onClick={stopDaemon}
            disabled={!isReady}
            sx={{
              position: 'absolute',
              top: 12,
              left: 12,
              bgcolor: 'rgba(255, 255, 255, 0.95)',
              color: '#FF3B30',
              width: 36,
              height: 36,
              border: '1.5px solid rgba(255, 59, 48, 0.3)',
              backdropFilter: 'blur(10px)',
              transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              opacity: isReady ? 1 : 0.4,
              boxShadow: '0 2px 8px rgba(255, 59, 48, 0.15)',
              zIndex: 20,
              '&:hover': {
                bgcolor: 'rgba(255, 59, 48, 0.08)',
                transform: isReady ? 'scale(1.08)' : 'none',
                borderColor: 'rgba(255, 59, 48, 0.5)',
                boxShadow: '0 4px 12px rgba(255, 59, 48, 0.25)',
              },
              '&:active': {
                transform: isReady ? 'scale(0.95)' : 'none',
              },
              '&:disabled': {
                bgcolor: 'rgba(255, 255, 255, 0.6)',
                color: '#999',
                borderColor: 'rgba(0, 0, 0, 0.1)',
              },
            }}
            title={isStopping ? 'Stopping...' : !isReady ? 'Robot is busy...' : 'Power Off'}
          >
            {isStopping ? (
              <CircularProgress size={16} thickness={4} sx={{ color: '#999' }} />
            ) : (
              <PowerSettingsNewOutlinedIcon sx={{ fontSize: 18 }} />
            )}
          </IconButton>
        </Box>
        
        {/* Robot Header - Title, version, status, mode */}
        <RobotHeader
          isOn={isOn}
          usbPortName={usbPortName}
          daemonVersion={daemonVersion}
          darkMode={darkMode}
        />

        {/* Quick Actions - Using MUI ButtonGroup for cleaner layout */}
        <Box sx={{ width: '100%', mb: 2 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 600, color: darkMode ? '#888' : '#999', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 1.5 }}>
            Quick Actions
          </Typography>
          <ButtonGroup
            variant="outlined"
            disabled={!isReady}
            sx={{
              width: '100%',
              display: 'flex',
              borderRadius: '14px',
              overflow: 'hidden',
              border: '1px solid #FF9500',
              '& .MuiButtonGroup-grouped': {
                flex: 1,
                border: 'none',
                borderColor: 'transparent',
                color: darkMode ? '#fff' : '#000',
                opacity: !isActive || isBusy ? 0.3 : 1,
                filter: !isActive || isBusy ? 'grayscale(100%)' : 'none',
                fontSize: '24px',
                minWidth: 0,
                padding: '12px 8px',
                '&:hover': {
                  bgcolor: !isActive || isBusy ? 'transparent' : (darkMode ? 'rgba(255, 149, 0, 0.15)' : 'rgba(255, 149, 0, 0.1)'),
                  zIndex: 1,
                },
                '&:not(:last-of-type)': {
                  borderRight: '1px solid #FF9500',
                },
              },
              '& .MuiButtonGroup-grouped:not(:first-of-type)': {
                borderLeft: 'none',
              },
            }}
          >
            {quickActions.map((action) => (
              <Button
                key={action.name}
                onClick={() => handleQuickAction(action)}
                disabled={!isActive || isBusy}
                sx={{
                  fontSize: '24px',
                  padding: '12px 8px',
                  transition: 'background-color 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
                title={action.label}
              >
                {action.emoji}
              </Button>
            ))}
          </ButtonGroup>
        </Box>
        
        {/* Logs Console */}
        <Box sx={{ mt: 1, width: '100%' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
            <Typography sx={{ fontSize: 11, fontWeight: 600, color: darkMode ? '#888' : '#999', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Daemon Logs
            </Typography>
            <Typography
              onClick={async () => {
                try {
                  // Opens in external system browser (Safari, Chrome, etc.)
                  await open('http://localhost:8000/docs');
                  console.log('📖 Opening API docs in external browser');
                } catch (err) {
                  console.error('Failed to open API docs:', err);
                }
              }}
              sx={{
                fontSize: 9,
                fontWeight: 500,
                color: darkMode ? '#666' : '#999',
                textDecoration: 'none',
                opacity: 0.7,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                '&:hover': {
                  opacity: 1,
                  color: '#FF9500',
                  textDecoration: 'underline',
                },
              }}
            >
              API Docs →
            </Typography>
          </Box>
          
          <LogConsole logs={logs} darkMode={darkMode} />
        </Box>
        </Box>

        {/* Right column (450px) - Application Store */}
        <Box
          sx={{
            width: '450px',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            borderLeft: darkMode 
              ? '1px solid rgba(255, 255, 255, 0.08)' 
              : '1px solid rgba(0, 0, 0, 0.06)',
          }}
        >
          <ApplicationStore 
            showToast={showToast}
            onLoadingChange={handleAppsLoadingChange}
          />
        </Box>
      </Box>

      {/* Toast Notifications - Bottom right */}
      <Snackbar
        open={toast.open}
        autoHideDuration={3500}
        onClose={handleCloseToast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        sx={{
          bottom: '24px !important',
          right: '24px !important',
        }}
      >
        <Box sx={{ position: 'relative', overflow: 'hidden', borderRadius: '7px' }}>
          {/* Animated time bar - Color based on type */}
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '6px',
              bgcolor: toast.severity === 'success' 
                ? (darkMode ? 'rgba(34, 197, 94, 0.4)' : 'rgba(34, 197, 94, 0.3)')
                : toast.severity === 'error'
                ? (darkMode ? 'rgba(239, 68, 68, 0.4)' : 'rgba(239, 68, 68, 0.3)')
                : (darkMode ? 'rgba(255, 179, 102, 0.4)' : 'rgba(255, 179, 102, 0.3)'),
              zIndex: 1,
              transition: 'width 0.02s linear',
              width: `${toastProgress}%`,
            }}
          />
          
          <Box
            sx={{
              borderRadius: '7px',
              fontSize: 14,
              fontWeight: 500,
              boxShadow: darkMode ? '0 6px 20px rgba(0, 0, 0, 0.5)' : '0 6px 20px rgba(0, 0, 0, 0.1)',
              bgcolor: darkMode ? '#2a2a2a' : '#fff',
              border: toast.severity === 'success'
                ? '1.5px solid rgba(34, 197, 94, 0.3)'
                : toast.severity === 'error'
                ? '1.5px solid rgba(239, 68, 68, 0.3)'
                : (darkMode ? '1.5px solid rgba(255, 255, 255, 0.15)' : '1.5px solid rgba(0, 0, 0, 0.12)'),
              color: darkMode ? '#f5f5f5' : '#333',
              minWidth: 200,
              px: 2.5,
              py: 1.5,
              pt: 2.5,
            }}
          >
            {toast.message}
          </Box>
        </Box>
      </Snackbar>
    </Box>
  );
}

export default ActiveRobotView;

