import React, { useState, useCallback, useEffect } from 'react';
import { Box, Typography, IconButton, Button, CircularProgress, Snackbar, Alert, LinearProgress, ButtonGroup, Slider, Switch } from '@mui/material';
import PowerSettingsNewOutlinedIcon from '@mui/icons-material/PowerSettingsNewOutlined';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open } from '@tauri-apps/plugin-shell';
import Viewer3D from '../../viewer3d';
import CameraFeed from './camera/CameraFeed';
import ViewportSwapper from './ViewportSwapper';
import LogConsole from './LogConsole';
import ApplicationStore from './application-store';
import RobotHeader from './RobotHeader';
import AudioVisualizer from './camera/AudioVisualizer';
import { useRobotState } from '../../../hooks/useRobotState';
import useAppStore from '../../../store/useAppStore';
import { CHOREOGRAPHY_DATASETS, DANCES, QUICK_EMOTIONS } from '../../../constants/choreographies';
import { buildApiUrl } from '../../../config/daemon';

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
  // Use mock if available, otherwise the real API
  const appWindow = window.mockGetCurrentWindow ? window.mockGetCurrentWindow() : getCurrentWindow();
  
  // Get dark mode and daemon state from global store
  const { darkMode, isDaemonCrashed, resetTimeouts, update } = useAppStore();
  
  // Get complete robot state from daemon API
  const { isOn, isMoving } = useRobotState(isActive);
  
  // ✅ Computed helpers to simplify conditions
  const isBusy = useAppStore(state => state.isBusy());
  const isReady = useAppStore(state => state.isReady());
  
  // ✨ State machine
  const robotStatus = useAppStore(state => state.robotStatus);
  const busyReason = useAppStore(state => state.busyReason);
  
  // Toast notifications
  const [toast, setToast] = useState({ open: false, message: '', severity: 'info' });
  const [toastProgress, setToastProgress] = useState(100);
  
  // Volume control - Connected to API
  const [volume, setVolume] = useState(50);
  const [microphoneVolume, setMicrophoneVolume] = useState(50);
  
  // Logs collapse state
  const [logsExpanded, setLogsExpanded] = useState(false);
  
  // Load volume from API
  useEffect(() => {
    if (!isActive) return;

    const fetchVolume = async () => {
      try {
        const response = await fetch(buildApiUrl('/api/volume/current'));
        if (response.ok) {
          const data = await response.json();
          if (data.volume !== undefined) {
            setVolume(data.volume);
          }
        }
      } catch (err) {
        console.warn('Failed to fetch volume:', err);
      }
    };

    const fetchMicrophoneVolume = async () => {
      try {
        const response = await fetch(buildApiUrl('/api/volume/microphone/current'));
        if (response.ok) {
          const data = await response.json();
          if (data.volume !== undefined) {
            setMicrophoneVolume(data.volume);
          }
        }
      } catch (err) {
        console.warn('Failed to fetch microphone volume:', err);
      }
    };

    fetchVolume();
    fetchMicrophoneVolume();
  }, [isActive]);

  // Update volume via API
  const handleVolumeChange = async (newVolume) => {
    setVolume(newVolume);
    try {
      await fetch(buildApiUrl('/api/volume/set'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ volume: newVolume }),
      });
    } catch (err) {
      console.warn('Failed to set volume:', err);
    }
  };

  // Update microphone via API
  const handleMicrophoneChange = async (enabled) => {
    setMicrophoneVolume(enabled ? 50 : 0);
    try {
      await fetch(buildApiUrl('/api/volume/microphone/set'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ volume: enabled ? 50 : 0 }),
      });
    } catch (err) {
      console.warn('Failed to set microphone:', err);
    }
  };
  
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

  // Quick Actions: 15 emotions from QUICK_EMOTIONS + 1 sleep action = 16 total
  const quickActions = [
    // Sleep action
    { name: 'goto_sleep', emoji: '😴', label: 'Sleep', type: 'action' },
    // 15 emotions from QUICK_EMOTIONS
    ...QUICK_EMOTIONS.map(emotion => ({
      name: emotion.name,
      emoji: emotion.emoji,
      label: emotion.label,
      type: 'emotion',
    })),
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
          bgcolor: 'transparent',
        }}
      >
        {/* Empty titlebar */}
      </Box>

      {/* Dark Mode Toggle - Fixed at top right of window, slightly lower */}
      <IconButton
        size="small"
        onClick={() => useAppStore.getState().toggleDarkMode()}
        sx={{
          position: 'absolute',
          top: 18,
          right: 18,
          width: 32,
          height: 32,
          bgcolor: darkMode ? 'rgba(255, 149, 0, 0.08)' : 'transparent',
          zIndex: 10,
          '&:hover': {
            bgcolor: darkMode ? 'rgba(255, 149, 0, 0.12)' : 'rgba(0, 0, 0, 0.04)',
          },
        }}
      >
        {darkMode ? (
          <LightModeOutlinedIcon sx={{ fontSize: 18, color: '#FF9500' }} />
        ) : (
          <DarkModeOutlinedIcon sx={{ fontSize: 18, color: darkMode ? '#aaa' : '#999' }} />
        )}
      </IconButton>

      {/* Drop shadow in middle for elevation effect - Positioned full height */}
      <Box
        sx={{
          position: 'absolute',
          left: '50%',
          top: 0,
          bottom: 0,
          width: '16px',
          background: darkMode
            ? 'linear-gradient(to left, transparent 0%, rgba(0, 0, 0, 0.25) 15%, rgba(0, 0, 0, 0.15) 50%, transparent 100%)'
            : 'linear-gradient(to left, transparent 0%, rgba(0, 0, 0, 0.12) 15%, rgba(0, 0, 0, 0.06) 50%, transparent 100%)',
          pointerEvents: 'none',
          zIndex: 3,
          transform: 'translateX(-50%)',
          filter: 'blur(4px)',
        }}
      />

      {/* Content - 2 columns */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'row',
          height: 'calc(100% - 33px)',
          gap: 0,
          position: 'relative',
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
            overflowY: 'auto',
            overflowX: 'hidden',
            position: 'relative',
            zIndex: 1,
            height: '100%',
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
            height: 'auto',
            position: 'relative',
            mb: 1,
            overflow: 'visible',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* ViewportSwapper: handles swap between 3D and Camera with Portals */}
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
              color: '#FF9500',
              width: 36,
              height: 36,
              border: '1.5px solid rgba(255, 149, 0, 0.3)',
              backdropFilter: 'blur(10px)',
              transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              opacity: isReady ? 1 : 0.4,
              boxShadow: '0 2px 8px rgba(255, 149, 0, 0.15)',
              zIndex: 20,
              '&:hover': {
                bgcolor: 'rgba(255, 149, 0, 0.08)',
                transform: isReady ? 'scale(1.08)' : 'none',
                borderColor: 'rgba(255, 149, 0, 0.5)',
                boxShadow: '0 4px 12px rgba(255, 149, 0, 0.25)',
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
            daemonVersion={daemonVersion}
            darkMode={darkMode}
          />

        {/* Audio Controls - Single Line 50/50 */}
        <Box
          sx={{
            width: '100%',
            mb: 1.5,
            display: 'flex',
            gap: 1,
          }}
        >
          {/* Volume Control - 50% */}
          <Box
            sx={{
              flex: '0 0 50%',
              display: 'flex',
              flexDirection: 'column',
              gap: 0.75,
              p: 1.25,
              borderRadius: '12px',
              bgcolor: darkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
              border: darkMode ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(0, 0, 0, 0.06)',
              transition: 'all 0.2s ease',
              '&:hover': {
                bgcolor: darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
                borderColor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
              },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <VolumeUpIcon sx={{ fontSize: 12, color: '#FF9500' }} />
                <Typography
                  sx={{
                    fontSize: 9,
                    fontWeight: 600,
                    color: darkMode ? '#aaa' : '#666',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  Volume
                </Typography>
              </Box>
              <Typography
                sx={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#FF9500',
                  fontFamily: 'SF Mono, Monaco, Menlo, monospace',
                }}
              >
                {volume}%
              </Typography>
            </Box>
            <Slider
              value={volume}
              onChange={(e, val) => handleVolumeChange(val)}
              sx={{
                '& .MuiSlider-thumb': {
                  width: 12,
                  height: 12,
                  bgcolor: '#FF9500',
                  border: `2px solid ${darkMode ? '#1a1a1a' : '#fff'}`,
                  boxShadow: '0 2px 4px rgba(255, 149, 0, 0.3)',
                  '&:hover': {
                    boxShadow: '0 0 0 5px rgba(255, 149, 0, 0.16)',
                    transform: 'scale(1.1)',
                  },
                  transition: 'all 0.2s ease',
                },
                '& .MuiSlider-track': {
                  bgcolor: '#FF9500',
                  border: 'none',
                  height: 2.5,
                  borderRadius: '2px',
                },
                '& .MuiSlider-rail': {
                  bgcolor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
                  height: 2.5,
                  borderRadius: '2px',
                },
              }}
            />
          </Box>

          {/* Microphone Control - 50% */}
          <Box
            sx={{
              flex: '0 0 50%',
              display: 'flex',
              flexDirection: 'column',
              gap: 0.75,
              p: 1.25,
              borderRadius: '12px',
              bgcolor: darkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
              border: darkMode 
                ? `1px solid ${microphoneVolume > 0 ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 255, 255, 0.06)'}`
                : `1px solid ${microphoneVolume > 0 ? 'rgba(34, 197, 94, 0.15)' : 'rgba(0, 0, 0, 0.06)'}`,
              transition: 'all 0.2s ease',
              '&:hover': {
                bgcolor: darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
                borderColor: microphoneVolume > 0 
                  ? (darkMode ? 'rgba(34, 197, 94, 0.3)' : 'rgba(34, 197, 94, 0.25)')
                  : (darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'),
              },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {microphoneVolume > 0 ? (
                  <MicIcon sx={{ fontSize: 12, color: '#22c55e' }} />
                ) : (
                  <MicOffIcon sx={{ fontSize: 12, color: darkMode ? '#666' : '#999', opacity: 0.6 }} />
                )}
                <Typography
                  sx={{
                    fontSize: 9,
                    fontWeight: 600,
                    color: darkMode ? '#aaa' : '#666',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  Microphone
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                {/* Audio Visualizer */}
                {microphoneVolume > 0 && (
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      px: 0.75,
                      py: 0.25,
                      borderRadius: '6px',
                      bgcolor: darkMode ? 'rgba(34, 197, 94, 0.1)' : 'rgba(34, 197, 94, 0.08)',
                    }}
                  >
                    <AudioVisualizer 
                      barCount={6} 
                      color={darkMode ? 'rgba(34, 197, 94, 0.9)' : '#22c55e'}
                      showBackground={false}
                      isLarge={true}
                    />
                  </Box>
                )}
                <IconButton
                  onClick={() => handleMicrophoneChange(microphoneVolume === 0)}
                  size="small"
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: '8px',
                    bgcolor: microphoneVolume > 0 
                      ? (darkMode ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.1)')
                      : 'transparent',
                    color: microphoneVolume > 0 ? '#22c55e' : (darkMode ? '#666' : '#999'),
                    padding: 0,
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      bgcolor: microphoneVolume > 0 
                        ? (darkMode ? 'rgba(34, 197, 94, 0.2)' : 'rgba(34, 197, 94, 0.15)')
                        : (darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'),
                      transform: 'scale(1.05)',
                    },
                  }}
                >
                  {microphoneVolume > 0 ? (
                    <MicIcon sx={{ fontSize: 14 }} />
                  ) : (
                    <MicOffIcon sx={{ fontSize: 14 }} />
                  )}
                </IconButton>
              </Box>
            </Box>
            {/* Spacer pour aligner avec le slider du volume */}
            <Box sx={{ height: 2.5 }} />
          </Box>
        </Box>
        
        {/* Logs Console - Collapsible */}
        <Box sx={{ mt: 1, width: '100%' }}>
          <Box 
            sx={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              mb: logsExpanded ? 1.5 : 0,
              cursor: 'pointer',
              userSelect: 'none',
            }}
            onClick={() => setLogsExpanded(!logsExpanded)}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Typography sx={{ fontSize: 11, fontWeight: 600, color: darkMode ? '#888' : '#999', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Daemon Logs
              </Typography>
              <IconButton
                size="small"
                sx={{
                  width: 20,
                  height: 20,
                  padding: 0,
                  color: darkMode ? '#888' : '#999',
                  transition: 'transform 0.2s ease',
                  transform: logsExpanded ? 'rotate(0deg)' : 'rotate(180deg)',
                }}
              >
                <ExpandMoreIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Box>
            <Typography
              onClick={async (e) => {
                e.stopPropagation();
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
          
          {logsExpanded && (
            <Box sx={{ transition: 'all 0.3s ease' }}>
              <LogConsole logs={logs} darkMode={darkMode} />
            </Box>
          )}
        </Box>
        </Box>

                {/* Right column (450px) - Application Store with elevation effect */}
                <Box
                  sx={{
                    width: '450px',
                    flexShrink: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    borderLeft: darkMode
                      ? '1px solid rgba(255, 255, 255, 0.08)'
                      : '1px solid rgba(0, 0, 0, 0.06)',
                    // ✅ Simple elevation effect with transform
                    position: 'relative',
                    zIndex: 2,
                    transform: 'translateY(-8px)',
                  }}
                >
          <ApplicationStore 
            showToast={showToast}
            onLoadingChange={handleAppsLoadingChange}
            quickActions={quickActions}
            handleQuickAction={handleQuickAction}
            isReady={isReady}
            isActive={isActive}
            isBusy={isBusy}
            darkMode={darkMode}
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

