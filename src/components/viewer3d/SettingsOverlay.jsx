import React, { useState, useEffect, useCallback } from 'react';
import { 
  Box, 
  Typography, 
  Button,
  CircularProgress,
  Snackbar,
} from '@mui/material';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import FullscreenOverlay from '../FullscreenOverlay';
import PulseButton from '../PulseButton';
import useAppStore from '../../store/useAppStore';
import { buildApiUrl, fetchWithTimeout, DAEMON_CONFIG } from '../../config/daemon';
import reachyUpdateBoxSvg from '../../assets/reachy-update-box.svg';
import { invoke } from '@tauri-apps/api/core';
import { logSuccess } from '../../utils/logging';

// Sub-components
import { 
  SettingsUpdateCard, 
  SettingsWifiCard, 
  SettingsAppearanceCard,
  SettingsCacheCard,
  ChangeWifiOverlay,
} from './settings';
import { useWakeSleep } from '../../views/active-robot/hooks';

/**
 * Settings Overlay for 3D Viewer Configuration
 */
export default function SettingsOverlay({ 
  open, 
  onClose, 
  darkMode,
}) {
  const { connectionMode, remoteHost, robotStatus } = useAppStore();
  const isWifiMode = connectionMode === 'wifi';
  
  // Wake/Sleep controls - used to put robot to sleep before update
  const { goToSleep, isSleeping } = useWakeSleep();
  
  // Text colors
  const textPrimary = darkMode ? '#f5f5f5' : '#333';
  const textMuted = darkMode ? '#666' : '#999';
  
  // ═══════════════════════════════════════════════════════════════════
  // UPDATE STATE
  // ═══════════════════════════════════════════════════════════════════
  const [updateInfo, setUpdateInfo] = useState(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  
  // Read initial preRelease preference from localStorage
  const getInitialPreRelease = () => {
    try {
      const stored = localStorage.getItem('preReleaseUpdates');
      return stored ? JSON.parse(stored) : false;
    } catch {
      return false;
    }
  };
  
  const [preRelease, setPreReleaseState] = useState(getInitialPreRelease);
  
  // Wrapper to persist preRelease changes
  const setPreRelease = (value) => {
    try {
      localStorage.setItem('preReleaseUpdates', JSON.stringify(value));
    } catch (e) {
      console.error('Failed to save preRelease preference:', e);
    }
    setPreReleaseState(value);
  };
  
  // ═══════════════════════════════════════════════════════════════════
  // WIFI STATE
  // ═══════════════════════════════════════════════════════════════════
  const [wifiStatus, setWifiStatus] = useState(null);
  const [availableNetworks, setAvailableNetworks] = useState([]);
  const [isLoadingWifi, setIsLoadingWifi] = useState(false);
  const [selectedSSID, setSelectedSSID] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [wifiError, setWifiError] = useState(null);
  
  // ═══════════════════════════════════════════════════════════════════
  // CONFIRMATION DIALOGS
  // ═══════════════════════════════════════════════════════════════════
  const [showUpdateConfirm, setShowUpdateConfirm] = useState(false);
  const [showChangeWifiOverlay, setShowChangeWifiOverlay] = useState(false);

  // ═══════════════════════════════════════════════════════════════════
  // TOAST NOTIFICATIONS
  // ═══════════════════════════════════════════════════════════════════
  const [toast, setToast] = useState({ open: false, message: '', severity: 'info' });
  const [toastProgress, setToastProgress] = useState(100);
  
  const showToast = useCallback((message, severity = 'info') => {
    setToast({ open: true, message, severity });
    setToastProgress(100);
  }, []);
  
  const handleCloseToast = useCallback(() => {
    setToast(prev => ({ ...prev, open: false }));
    setToastProgress(100);
  }, []);
  
  // Toast progress bar animation
  useEffect(() => {
    if (!toast.open) {
      setToastProgress(100);
      return;
    }
    
    setToastProgress(100);
    const duration = 3500;
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

  // ═══════════════════════════════════════════════════════════════════
  // UPDATE FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════
  
  const checkForUpdate = useCallback(async () => {
    setIsCheckingUpdate(true);
    setUpdateInfo(null);
    
    try {
      if (isWifiMode) {
        // WiFi mode: Use daemon API
      const response = await fetchWithTimeout(
        buildApiUrl(`/update/available?pre_release=${preRelease}`),
        {},
        DAEMON_CONFIG.TIMEOUTS.COMMAND,
        { label: 'Check update', silent: true }
      );
      
      if (response.ok) {
        const data = await response.json();
        setUpdateInfo(data.update?.reachy_mini || null);
        }
      } else {
        // USB/Simulation mode: Use Tauri command
        const data = await invoke('check_daemon_update', { preRelease });
        setUpdateInfo(data);
      }
    } catch (err) {
      console.error('Failed to check for updates:', err);
      setWifiError('Failed to check for updates');
    } finally {
      setIsCheckingUpdate(false);
    }
  }, [isWifiMode, preRelease]);

  // Open update confirmation dialog
  const handleUpdateClick = useCallback(() => {
    if (!updateInfo?.is_available || isUpdating) return;
    setShowUpdateConfirm(true);
  }, [updateInfo, isUpdating]);

  // Actually start the update after confirmation
  const confirmUpdate = useCallback(async () => {
    setShowUpdateConfirm(false);
    setIsUpdating(true);
    
    try {
      // 🛡️ Put robot to sleep before update if not already sleeping
      // This ensures motors are disabled and robot is in safe position
      if (!isSleeping) {
        console.log('🔄 Putting robot to sleep before update...');
        const sleepSuccess = await goToSleep();
        if (!sleepSuccess) {
          console.warn('⚠️ Failed to put robot to sleep, continuing with update anyway');
        } else {
          console.log('✅ Robot is now sleeping, proceeding with update');
        }
      }
      
      if (isWifiMode) {
        // WiFi mode: Use daemon API
      const response = await fetchWithTimeout(
        buildApiUrl(`/update/start?pre_release=${preRelease}`),
        { method: 'POST' },
        DAEMON_CONFIG.TIMEOUTS.COMMAND,
        { label: 'Start update' }
      );
      
      if (response.ok) {
        const data = await response.json();
        console.log('Update started:', data.job_id);
        
        // Close overlay and disconnect cleanly
        onClose();
        
        // Give user time to see the action, then disconnect
        setTimeout(() => {
            useAppStore.getState().resetAll();
        }, 1000);
      } else {
        const error = await response.json();
        setWifiError(`Update failed: ${error.detail || 'Unknown error'}`);
        setIsUpdating(false);
        }
      } else {
        // USB/Simulation mode: Use Tauri command
        await invoke('update_daemon', { preRelease });
        
        // Show success toast
        showToast('Daemon updated successfully! Reconnect to use the new version.', 'success');
        
        // Also log for developers
        logSuccess('Daemon updated successfully! Reconnect to use the new version.');
        
        // Give user time to see the toast (2 seconds)
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Close overlay
        onClose();
        
        // Disconnect and return to selection view
        console.log('Daemon update completed, disconnecting...');
        useAppStore.getState().resetAll();
      }
    } catch (err) {
      console.error('Failed to start update:', err);
      showToast(`Update failed: ${err}`, 'error');
      setWifiError(`Update failed: ${err}`);
      setIsUpdating(false);
    }
  }, [isWifiMode, preRelease, onClose, showToast, isSleeping, goToSleep]);

  // ═══════════════════════════════════════════════════════════════════
  // WIFI FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════

  const fetchWifiStatus = useCallback(async () => {
    if (!isWifiMode) return;
    console.log('[WiFi] Fetching WiFi status...');
    setIsLoadingWifi(true);
    setWifiError(null);
    
    try {
      const statusResponse = await fetchWithTimeout(
        buildApiUrl('/wifi/status'),
        {},
        DAEMON_CONFIG.TIMEOUTS.COMMAND,
        { label: 'WiFi status', silent: true }
      );
      
      if (statusResponse.ok) {
        const data = await statusResponse.json();
        setWifiStatus(data);
      }
      
      const networksResponse = await fetchWithTimeout(
        buildApiUrl('/wifi/scan_and_list'),
        { method: 'POST' },
        DAEMON_CONFIG.TIMEOUTS.COMMAND * 2,
        { label: 'WiFi scan', silent: true }
      );
      
      if (networksResponse.ok) {
        const networks = await networksResponse.json();
        console.log('[WiFi] Scanned networks:', networks);
        setAvailableNetworks(Array.isArray(networks) ? networks : []);
      } else {
        console.warn('[WiFi] Scan failed:', networksResponse.status);
      }
    } catch (err) {
      console.error('Failed to fetch WiFi status:', err);
      setWifiError('Failed to load WiFi configuration');
    } finally {
      setIsLoadingWifi(false);
    }
  }, [isWifiMode]);

  // Connect to WiFi (called from Change Network overlay)
  const handleWifiConnect = useCallback(async () => {
    if (!selectedSSID || !wifiPassword) return;
    setIsConnecting(true);
    setWifiError(null);
    
    try {
      const response = await fetchWithTimeout(
        buildApiUrl(`/wifi/connect?ssid=${encodeURIComponent(selectedSSID)}&password=${encodeURIComponent(wifiPassword)}`),
        { method: 'POST' },
        DAEMON_CONFIG.TIMEOUTS.COMMAND * 3,
        { label: 'WiFi connect' }
      );
      
      if (response.ok) {
        // Close overlay and reset form
        setShowChangeWifiOverlay(false);
        setWifiPassword('');
        setSelectedSSID('');
        // Refresh status after network change
        setTimeout(fetchWifiStatus, 5000);
      } else {
        const error = await response.json();
        setWifiError(error.detail || 'Failed to connect');
      }
    } catch (err) {
      console.error('Failed to connect to WiFi:', err);
      setWifiError('Connection failed');
    } finally {
      setIsConnecting(false);
    }
  }, [selectedSSID, wifiPassword, fetchWifiStatus]);

  // ═══════════════════════════════════════════════════════════════════
  // EFFECTS
  // ═══════════════════════════════════════════════════════════════════

  // Initial fetch when overlay opens
  useEffect(() => {
    if (open) {
      checkForUpdate();
      if (isWifiMode) {
      fetchWifiStatus();
      }
    }
  }, [open, isWifiMode, checkForUpdate, fetchWifiStatus]);

  // Auto-refresh WiFi networks every 3 seconds (WiFi mode only)
  useEffect(() => {
    if (!open || !isWifiMode) return;
    
    const interval = setInterval(() => {
      fetchWifiStatus();
    }, 3000);
    
    return () => clearInterval(interval);
  }, [open, isWifiMode, fetchWifiStatus]);

  useEffect(() => {
    if (open) {
      checkForUpdate();
    }
  }, [preRelease]); // eslint-disable-line react-hooks/exhaustive-deps

  // ═══════════════════════════════════════════════════════════════════
  // STYLES
  // ═══════════════════════════════════════════════════════════════════

  const textSecondary = darkMode ? '#888' : '#666';

  const inputStyles = {
    '& .MuiOutlinedInput-root': {
      bgcolor: darkMode ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.02)',
      borderRadius: '10px',
      '& fieldset': {
        borderColor: darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
      },
      '&:hover fieldset': {
        borderColor: darkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
      },
      '&.Mui-focused fieldset': {
        borderColor: 'primary.main',
        borderWidth: 1,
      },
    },
    '& .MuiInputLabel-root': {
      color: textSecondary,
      fontSize: 13,
      '&.Mui-focused': {
        color: 'primary.main',
      },
    },
    '& .MuiInputBase-input': {
      color: textPrimary,
      fontSize: 13,
    },
    '& .MuiSelect-icon': {
      color: textMuted,
    },
  };

  // Button style for outlined primary
  const buttonStyle = {
    color: 'primary.main',
    borderColor: 'primary.main',
    textTransform: 'none',
    '&:hover': { 
      borderColor: 'primary.dark',
      bgcolor: 'rgba(99, 102, 241, 0.08)',
    },
    '&:disabled': {
      borderColor: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
      color: darkMode ? '#555' : '#bbb',
    },
  };

  // Card style
  const cardStyle = {
    p: 2.5,
    borderRadius: '16px',
    bgcolor: darkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.8)',
    border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)'}`,
    backdropFilter: 'blur(10px)',
  };

  return (
    <FullscreenOverlay
      open={open}
      onClose={onClose}
      darkMode={darkMode}
      zIndex={10001}
      centeredX={true}
      debugName="Settings"
      centeredY={true}
      showCloseButton={true}
    >
      <Box
        sx={{
          width: '90%',
          maxWidth: isWifiMode ? '680px' : '360px',
          maxHeight: '85vh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          // Custom scrollbar
          '&::-webkit-scrollbar': { width: 6 },
          '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
          '&::-webkit-scrollbar-thumb': {
            bgcolor: darkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)',
            borderRadius: 3,
          },
        }}
      >
        {/* HEADER */}
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 1.5,
          pb: 1,
        }}>
            <Typography sx={{ 
              fontSize: 20, 
              fontWeight: 700, 
              color: textPrimary,
              letterSpacing: '-0.3px',
            }}>
              Settings
            </Typography>
            {connectionMode && (
              <Typography sx={{ 
                fontSize: 11, 
                fontWeight: 600,
                color: textMuted,
                bgcolor: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                px: 1,
                py: 0.25,
                borderRadius: '4px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}>
                {connectionMode === 'wifi' ? 'Reachy WiFi' : connectionMode === 'simulation' ? 'Simulation' : 'USB'}
              </Typography>
            )}
            {isWifiMode && remoteHost && (
              <Typography sx={{ 
                fontSize: 11, 
                color: textMuted,
                fontFamily: 'monospace',
              }}>
                {remoteHost}
              </Typography>
            )}
        </Box>

        {/* CONTENT - Grid Layout */}
        <Box sx={{ 
          display: 'grid',
          gridTemplateColumns: isWifiMode ? 'repeat(2, 1fr)' : '1fr',
          gap: 2,
        }}>
          {/* Row 1: Update + WiFi (or Update alone) */}
              <SettingsUpdateCard
                  darkMode={darkMode}
            title={isWifiMode ? "System Update" : "Daemon Update"}
                updateInfo={updateInfo}
                isCheckingUpdate={isCheckingUpdate}
                isUpdating={isUpdating}
                preRelease={preRelease}
                onPreReleaseChange={setPreRelease}
                onCheckUpdate={checkForUpdate}
                onUpdateClick={handleUpdateClick}
                cardStyle={cardStyle}
                buttonStyle={buttonStyle}
              />
          
          {isWifiMode && (
              <SettingsWifiCard
                  darkMode={darkMode}
                wifiStatus={wifiStatus}
                isLoadingWifi={isLoadingWifi}
                onRefresh={fetchWifiStatus}
              onChangeNetwork={() => setShowChangeWifiOverlay(true)}
                cardStyle={cardStyle}
            />
          )}
          
          {/* Row 2: Appearance + Cache (WiFi) or just Appearance (Lite) */}
          <SettingsAppearanceCard darkMode={darkMode} cardStyle={cardStyle} />
          
          {isWifiMode && (
            <SettingsCacheCard 
              darkMode={darkMode}
              cardStyle={cardStyle}
              buttonStyle={buttonStyle}
            />
                    )}
        </Box>
      </Box>
      
      {/* Update Confirmation Overlay */}
      <FullscreenOverlay
        open={showUpdateConfirm}
        onClose={() => setShowUpdateConfirm(false)}
        darkMode={darkMode}
        zIndex={10003}
        backdropOpacity={0.85}
        debugName="UpdateConfirm"
        backdropBlur={12}
      >
        <Box
          sx={{
            width: '100%',
            maxWidth: 380,
            mx: 'auto',
            px: 3,
            textAlign: 'center',
          }}
        >
          {/* Reachy in box illustration */}
          <Box sx={{ mb: 3 }}>
            <img
              src={reachyUpdateBoxSvg}
              alt="Reachy Update"
              style={{
                width: 140,
                height: 140,
              }}
            />
          </Box>
          
          {/* Title */}
          <Typography
            variant="h5"
            sx={{
              fontWeight: 600,
              color: 'text.primary',
              mb: 2,
            }}
          >
            Start Update?
          </Typography>
          
          {/* Description */}
          <Typography
            sx={{
              color: 'text.secondary',
              fontSize: 14,
              lineHeight: 1.6,
              mb: 4,
            }}
          >
            Update to <strong style={{ color: darkMode ? '#fff' : '#333' }}>{updateInfo?.available_version}</strong>
            <br /><br />
            {isWifiMode ? (
              <>
            The robot will restart and you will be <strong style={{ color: darkMode ? '#fff' : '#333' }}>disconnected</strong>.
            <br />
            Reconnect after ~2 minutes when complete.
              </>
            ) : (
              <>
                The daemon will restart automatically.
                <br />
                This will take <strong style={{ color: darkMode ? '#fff' : '#333' }}>between 30 seconds and 5 minutes</strong>.
              </>
            )}
          </Typography>
          
          {/* WiFi Mode Warning */}
          {isWifiMode && (
            <Box
              sx={{
                mb: 4,
                p: 2,
                borderRadius: '12px',
                bgcolor: darkMode ? 'rgba(255, 152, 0, 0.15)' : 'rgba(255, 152, 0, 0.1)',
                border: `1px solid ${darkMode ? 'rgba(255, 152, 0, 0.3)' : 'rgba(255, 152, 0, 0.2)'}`,
                textAlign: 'center',
              }}
            >
              <Typography sx={{ 
                fontSize: 13, 
                fontWeight: 600, 
                color: darkMode ? '#FFB74D' : '#F57C00',
                mb: 0.5,
              }}>
                Important
              </Typography>
              <Typography sx={{ 
                fontSize: 12, 
                color: darkMode ? '#FFB74D' : '#F57C00',
                lineHeight: 1.5,
              }}>
                Make sure your robot is <strong>plugged into a power outlet</strong> during the update. Losing power during update can brick your robot.
              </Typography>
            </Box>
          )}
          
          {/* Actions */}
          <Box sx={{ display: 'flex', gap: 3, justifyContent: 'center', alignItems: 'center' }}>
            <Button 
              onClick={() => setShowUpdateConfirm(false)}
              variant="text"
              sx={{ 
                color: 'text.secondary',
                textTransform: 'none',
                textDecoration: 'underline',
                textUnderlineOffset: '3px',
                '&:hover': {
                  bgcolor: 'transparent',
                  textDecoration: 'underline',
                },
              }}
            >
              Cancel
            </Button>
            <PulseButton
              onClick={confirmUpdate}
              darkMode={darkMode}
              sx={{ minWidth: 160 }}
            >
              Update now
            </PulseButton>
          </Box>
        </Box>
      </FullscreenOverlay>
      
      {/* Change WiFi Network Overlay */}
      <ChangeWifiOverlay
        open={showChangeWifiOverlay}
        onClose={() => {
          setShowChangeWifiOverlay(false);
          setSelectedSSID('');
          setWifiPassword('');
          setWifiError(null);
        }}
        darkMode={darkMode}
        wifiStatus={wifiStatus}
        availableNetworks={availableNetworks}
        selectedSSID={selectedSSID}
        wifiPassword={wifiPassword}
        isConnecting={isConnecting}
        wifiError={wifiError}
        onSSIDChange={setSelectedSSID}
        onPasswordChange={setWifiPassword}
        onConnect={handleWifiConnect}
        onRefresh={fetchWifiStatus}
      />

      {/* Toast Notifications */}
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
          zIndex: 100001,
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
            zIndex: 100001,
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
                  : 'rgba(239, 68, 68, 0.15)')
                : (toast.severity === 'success'
                  ? 'rgba(34, 197, 94, 0.1)'
                  : 'rgba(239, 68, 68, 0.1)'),
              border: `1px solid ${toast.severity === 'success'
                ? darkMode ? 'rgba(34, 197, 94, 0.4)' : 'rgba(34, 197, 94, 0.3)'
                : darkMode ? 'rgba(239, 68, 68, 0.4)' : 'rgba(239, 68, 68, 0.3)'}`,
              color: toast.severity === 'success'
                ? darkMode ? '#86efac' : '#16a34a'
                : darkMode ? '#fca5a5' : '#dc2626',
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
            {/* Progress bar */}
            <Box
              sx={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                height: '2px',
                width: `${toastProgress}%`,
                background: toast.severity === 'success' 
                  ? darkMode ? 'rgba(34, 197, 94, 0.8)' : 'rgba(34, 197, 94, 0.7)'
                  : darkMode ? 'rgba(239, 68, 68, 0.8)' : 'rgba(239, 68, 68, 0.7)',
                transition: 'width 0.02s linear',
                borderRadius: '0 0 12px 12px',
              }}
            />
            
            {/* Icon */}
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
            
            {/* Text */}
            <Typography sx={{ fontSize: 13, fontWeight: 500 }}>
              {toast.message}
            </Typography>
          </Box>
        </Box>
      </Snackbar>
    </FullscreenOverlay>
  );
}
