import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Box, 
  Typography, 
  Stepper, 
  Step, 
  StepLabel,
  CircularProgress,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { invoke } from '@tauri-apps/api/core';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

import useAppStore from '../../store/useAppStore';
import { isReachyHotspot } from '../../constants/wifi';
import { useLocalWifiScan, useRobotDiscovery } from '../../hooks/system';
import { useConnection, ConnectionMode } from '../../hooks/useConnection';
import { useToast } from '../../hooks/useToast';
import FullscreenOverlay from '../../components/FullscreenOverlay';
import Toast from '../../components/Toast';
import {
  Step1PowerOn,
  Step2ConnectHotspot,
  Step3ConfigureWifi,
  Step4Reconnecting,
  Step5Success,
} from './steps';

// Hotspot daemon hosts to try (when connected to reachy-mini-ap)
// mDNS (.local) is the standard, but we also try common IPs as fallback
const HOTSPOT_HOSTS = [
  'reachy-mini.local',  // mDNS (standard)
  '10.42.0.1',          // Common NetworkManager hotspot IP
  '192.168.4.1',        // Common ESP/embedded hotspot IP
];
const HOTSPOT_CHECK_INTERVAL = 2000; // 2s

const steps = [
  'Power On',
  'Connect to Hotspot',
  'Configure WiFi',
  'Reconnecting',
  'Ready!',
];

/**
 * FirstTimeWifiSetupView - Premium guided setup for first WiFi connection
 * 
 * Flow:
 * 1. Power On & detect hotspot via local WiFi scan
 * 2. Connect to hotspot (QR code + manual instructions)
 * 3. Configure WiFi credentials via daemon
 * 4. Wait for Reachy to reconnect on local network
 * 5. Success - Connect to Reachy
 */
export default function FirstTimeWifiSetupView() {
  const { darkMode, setShowFirstTimeWifiSetup, setShowBluetoothSupportView } = useAppStore();
  const [activeStep, setActiveStep] = useState(0);
  const [configuredNetwork, setConfiguredNetwork] = useState(null);
  
  // Toast notifications
  const { toast, toastProgress, showToast, handleCloseToast } = useToast();
  
  // Step 1: Local WiFi scan to detect hotspot
  const { 
    reachyHotspots, 
    hasReachyHotspot, 
    isScanning: isLocalScanning,
    scan: scanLocalWifi,
  } = useLocalWifiScan({ autoScan: true, scanInterval: 5000 });

  // Step 2: Check if connected to hotspot daemon
  const [isDaemonReachable, setIsDaemonReachable] = useState(false);
  const [isCheckingDaemon, setIsCheckingDaemon] = useState(false);
  const daemonCheckInterval = useRef(null);

  // Step 4: Robot discovery on local network
  const { wifiRobot, isScanning: isDiscoveryScanning, refresh: refreshDiscovery } = useRobotDiscovery();
  
  // Connection
  const { connect, isConnecting } = useConnection();

  // Timer state for visual feedback
  const [countdown, setCountdown] = useState(30);
  const countdownInterval = useRef(null);

  // Colors
  const textPrimary = darkMode ? '#f5f5f5' : '#333';
  const textSecondary = darkMode ? '#888' : '#666';
  const bgCard = darkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)';
  const borderColor = darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';

  // ============================================================================
  // SKIP TO SUCCESS: If Reachy already available on network
  // ============================================================================
  
  // If Reachy is already accessible on the network, skip directly to success
  // BUT: Don't interfere if we're already in the WiFi setup flow (Step 2-4)
  useEffect(() => {
    if (wifiRobot.available && activeStep === 0) {
      
      setActiveStep(4); // Jump to Step 5 (Success)
    }
  }, [wifiRobot.available, activeStep]);

  // ============================================================================
  // STEP 1: Power On - Countdown + Hotspot Detection
  // ============================================================================
  
  // Start countdown on mount for Step 1
  useEffect(() => {
    if (activeStep === 0) {
      setCountdown(30);
      countdownInterval.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(countdownInterval.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      return () => {
        if (countdownInterval.current) {
          clearInterval(countdownInterval.current);
        }
      };
    }
  }, [activeStep]);

  // Auto-advance when hotspot is detected (Step 1 → Step 2)
  useEffect(() => {
    if (activeStep === 0 && hasReachyHotspot) {
      
      // 2 second delay to let user see the success message
      setTimeout(() => setActiveStep(1), 2000);
    }
  }, [activeStep, hasReachyHotspot]);

  // ============================================================================
  // STEP 2: Connect to Hotspot - Check daemon reachability
  // ============================================================================

  const checkDaemonReachable = useCallback(async () => {
    setIsCheckingDaemon(true);
    
    // Try all hosts in parallel
    const checkHost = async (host) => {
      try {
        const response = await tauriFetch(`http://${host}:8000/api/daemon/status`, {
          method: 'GET',
          connectTimeout: 2000,
        });
        if (response.ok) {
          return host;
        }
      } catch (e) {
        // Not reachable on this host
      }
      return null;
    };
    
    try {
      const results = await Promise.all(HOTSPOT_HOSTS.map(checkHost));
      const reachableHost = results.find(h => h !== null);
      
      if (reachableHost) {
        
        setIsDaemonReachable(true);
        return true;
      } else {
        
      }
    } catch (e) {
      
    } finally {
      setIsCheckingDaemon(false);
    }
    return false;
  }, []);

  // Start polling for daemon when on Step 2 (activeStep === 1)
  useEffect(() => {
    if (activeStep === 1) {
      // Check immediately
      checkDaemonReachable();
      
      // Then poll every 2 seconds
      daemonCheckInterval.current = setInterval(checkDaemonReachable, HOTSPOT_CHECK_INTERVAL);
      
      return () => {
        if (daemonCheckInterval.current) {
          clearInterval(daemonCheckInterval.current);
        }
      };
    }
  }, [activeStep, checkDaemonReachable]);

  // Auto-advance when daemon is reachable (Step 2 → Step 3)
  useEffect(() => {
    if (activeStep === 1 && isDaemonReachable) {
      
      if (daemonCheckInterval.current) {
        clearInterval(daemonCheckInterval.current);
      }
      setTimeout(() => setActiveStep(2), 500);
    }
  }, [activeStep, isDaemonReachable]);

  // ============================================================================
  // STEP 3: Configure WiFi
  // ============================================================================

  const handleWifiConfigured = useCallback((ssid) => {
    
    // Note: onConnectSuccess is only called when WiFiConfiguration verifies
    // that the Reachy is actually connected (mode === 'wlan' && connected_network === ssid)
    // So we can trust that the connection is real
    setConfiguredNetwork(ssid);
    setIsRetryAfterFail(false); // Reset retry flag
    setActiveStep(3);
  }, []);

  // ============================================================================
  // STEP 4: Reconnecting - Auto-detect when we leave hotspot + find Reachy
  // ============================================================================

  const [reconnectStatus, setReconnectStatus] = useState('waiting'); // 'waiting' | 'searching' | 'found' | 'failed'
  const [foundHost, setFoundHost] = useState(null);
  const [wifiConfigKey, setWifiConfigKey] = useState(0); // Key to force remount of WiFiConfiguration
  const [isRetryAfterFail, setIsRetryAfterFail] = useState(false); // Track if we're retrying after a failed connection

  // Hosts to check for Reachy on normal network (not hotspot IPs)
  const NORMAL_NETWORK_HOSTS = ['reachy-mini.local', 'reachy-mini.home'];
  const MIN_RECONNECT_DELAY = 3000; // Minimum 3 seconds in reconnecting state for UX

  // ============================================================================
  // STEP 4: Reconnecting - Verify robot is on normal network
  // ============================================================================

  useEffect(() => {
    if (activeStep !== 3) return;
    
    
    setReconnectStatus('searching');
    setFoundHost(null);
    let isCancelled = false;
    let intervalId = null;
    let timeoutId = null;
    
    const checkNormalNetwork = async () => {
      if (isCancelled) return false;
      
      
      
      // Only check NORMAL network hosts (not hotspot)
        for (const host of NORMAL_NETWORK_HOSTS) {
        if (isCancelled) return false;
        
        
          try {
            const response = await tauriFetch(`http://${host}:8000/api/daemon/status`, {
              method: 'GET',
              connectTimeout: 500, // Short timeout to avoid blocking other HTTP requests
            });
          
            if (response.ok && !isCancelled) {
            
              setFoundHost(host);
              setReconnectStatus('found');
            return true; // Success
          }
        } catch (e) {
          
        }
      }
      
      return false; // Not found yet
    };
    
    // Start immediately
    (async () => {
      const found = await checkNormalNetwork();
      if (found && !isCancelled) {
        if (intervalId) clearInterval(intervalId);
        if (timeoutId) clearTimeout(timeoutId);
        setTimeout(() => setActiveStep(4), 500);
        return;
      }
    })();
    
    // Poll every 2 seconds
    intervalId = setInterval(async () => {
      if (isCancelled) return;
      const found = await checkNormalNetwork();
      if (found) {
        if (intervalId) clearInterval(intervalId);
        if (timeoutId) clearTimeout(timeoutId);
        setTimeout(() => setActiveStep(4), 500);
      }
    }, 2000);
      
    // Timeout after 15 seconds (increased from 10)
    timeoutId = setTimeout(() => {
      if (!isCancelled && reconnectStatus !== 'found') {
        console.error('[Setup] ❌ Robot not found on normal network after 15s');
        setReconnectStatus('failed');
      }
    }, 15000);
    
    return () => {
      
      isCancelled = true;
      
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };
  }, [activeStep]); // Ne pas inclure reconnectStatus !

  // ============================================================================
  // STEP 5: Success - Connect
  // ============================================================================

  const handleConnect = useCallback(async () => {
    if (wifiRobot.available && wifiRobot.host) {
      await connect(ConnectionMode.WIFI, { host: wifiRobot.host });
      setShowFirstTimeWifiSetup(false);
    }
  }, [wifiRobot, connect, setShowFirstTimeWifiSetup]);

  // ============================================================================
  // Navigation
  // ============================================================================

  const handleBack = useCallback(() => {
    setShowFirstTimeWifiSetup(false);
  }, [setShowFirstTimeWifiSetup]);

  const handleManualNext = useCallback(() => {
    setActiveStep(prev => Math.min(prev + 1, steps.length - 1));
  }, []);

  const handleManualPrev = useCallback(() => {
    setActiveStep(prev => Math.max(prev - 1, 0));
  }, []);

  const openWifiSettings = useCallback(async () => {
    try {
      await invoke('open_wifi_settings');
    } catch (e) {
      console.error('Failed to open WiFi settings:', e);
    }
  }, []);

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <FullscreenOverlay
      open={true}
      onClose={handleBack}
      darkMode={darkMode}
      showCloseButton={true}
      centered={true}
      backdropBlur={40}
      debugName="FirstTimeWifiSetup"
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          px: 3,
          py: 4,
          width: '100%',
          maxWidth: 500,
        }}
      >
        <Typography
          variant="h1"
          sx={{
            fontSize: 22,
            fontWeight: 700,
            color: textPrimary,
            mb: 3,
            textAlign: 'center',
            letterSpacing: '-0.3px',
          }}
        >
          First Time WiFi Setup
        </Typography>

        {/* Stepper */}
        <Box sx={{ width: '100%', maxWidth: 500, mb: 2, mt: 1, mx: 'auto', display: 'flex', justifyContent: 'center' }}>
          <Stepper activeStep={activeStep} alternativeLabel sx={{ width: '100%' }}>
            {steps.map((label, index) => (
              <Step key={label} completed={activeStep > index}>
                <StepLabel
                  sx={{
                    '& .MuiStepLabel-label': {
                      fontSize: 9,
                      color: textSecondary,
                      mt: 0.5,
                      '&.Mui-active': {
                        color: '#FF9500',
                        fontWeight: 600,
                      },
                      '&.Mui-completed': {
                        color: '#22c55e',
                      },
                    },
                    '& .MuiStepIcon-root': {
                      fontSize: 20,
                      color: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
                      '&.Mui-active': {
                        color: '#FF9500',
                      },
                      '&.Mui-completed': {
                        color: '#22c55e',
                      },
                    },
                  }}
                >
                  {label}
                </StepLabel>
              </Step>
            ))}
          </Stepper>
        </Box>

        {/* Content Card - Fixed height for consistent layout */}
        <Box
          sx={{
            position: 'relative',
            width: '100%',
            maxWidth: 420,
            height: 320,
            bgcolor: bgCard,
            borderRadius: '12px',
            border: '1px solid',
            borderColor: borderColor,
            p: 3,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {/* Discrete auto-detection indicator (top right) */}
          <Box sx={{ 
            position: 'absolute', 
            top: 12, 
            right: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
          }}>
            {/* Step 2: Daemon detected */}
            {activeStep === 1 && isDaemonReachable && (
              <>
                <CheckCircleIcon sx={{ fontSize: 12, color: '#22c55e' }} />
                <Typography sx={{ fontSize: 9, color: '#22c55e' }}>
                  connected
                </Typography>
              </>
            )}
            {/* Step 4: Robot found */}
            {activeStep === 3 && wifiRobot.available && (
              <>
                <CheckCircleIcon sx={{ fontSize: 12, color: '#22c55e' }} />
                <Typography sx={{ fontSize: 9, color: '#22c55e' }}>
                  found
                </Typography>
              </>
            )}
            {/* Step 4: Scanning */}
            {activeStep === 3 && isDiscoveryScanning && !wifiRobot.available && (
              <>
                <CircularProgress size={10} sx={{ color: textSecondary }} />
                <Typography sx={{ fontSize: 9, color: textSecondary }}>
                  scanning...
                </Typography>
              </>
            )}
          </Box>

          {/* ================================================================ */}
          {/* STEP 1: POWER ON */}
          {/* ================================================================ */}
          {activeStep === 0 && (
            <Step1PowerOn
              darkMode={darkMode}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
              countdown={countdown}
              hasReachyHotspot={hasReachyHotspot}
              hotspotName={reachyHotspots[0]?.ssid}
              isLocalScanning={isLocalScanning}
              onNext={handleManualNext}
            />
          )}

          {/* ================================================================ */}
          {/* STEP 2: CONNECT TO HOTSPOT */}
          {/* ================================================================ */}
          {activeStep === 1 && (
            <Step2ConnectHotspot
              darkMode={darkMode}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
              reachyHotspots={reachyHotspots}
              isDaemonReachable={isDaemonReachable}
              onOpenWifiSettings={openWifiSettings}
              isRetry={isRetryAfterFail}
            />
          )}

          {/* ================================================================ */}
          {/* STEP 3: CONFIGURE WIFI */}
          {/* ================================================================ */}
          {activeStep === 2 && (
            <Step3ConfigureWifi
              key={wifiConfigKey} // Still keep key here for safety
              resetKey={wifiConfigKey} // Pass key as prop to child
              darkMode={darkMode}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
              onConnectSuccess={handleWifiConfigured}
              onError={showToast}
            />
          )}

          {/* ================================================================ */}
          {/* STEP 4: RECONNECTING */}
          {/* ================================================================ */}
          {activeStep === 3 && (
            <Step4Reconnecting
              darkMode={darkMode}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
              configuredNetwork={configuredNetwork}
              status={reconnectStatus}
              onRetry={() => {
                
                
                
                // Reset ALL state
                setWifiConfigKey(prev => prev + 1);
                setReconnectStatus('waiting');
                setFoundHost(null);
                setIsRetryAfterFail(true); // Mark as retry after failure
                setIsDaemonReachable(false); // CRITICAL: Reset daemon check to force re-verification
                
                // Go back to Step 2 to force user to reconnect to hotspot
                setActiveStep(1);
              }}
            />
          )}

          {/* ================================================================ */}
          {/* STEP 5: SUCCESS */}
          {/* ================================================================ */}
          {activeStep === 4 && (
            <Step5Success
              darkMode={darkMode}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
              wifiRobot={wifiRobot}
              configuredNetwork={configuredNetwork}
              isConnecting={isConnecting}
              onConnect={handleConnect}
            />
          )}
        </Box>
        
        {/* Help link */}
        <Typography
          onClick={() => {
            setShowFirstTimeWifiSetup(false);
            setShowBluetoothSupportView(true);
          }}
          sx={{
            fontSize: 11,
            color: textSecondary,
            textAlign: 'center',
            mt: 2,
            cursor: 'pointer',
            textDecoration: 'underline',
            '&:hover': {
              color: '#FF9500',
            },
          }}
        >
          Having trouble detecting Reachy? Click here
        </Typography>
      </Box>

      {/* Toast Notifications */}
      <Toast 
        toast={toast} 
        toastProgress={toastProgress} 
        onClose={handleCloseToast} 
        darkMode={darkMode} 
      />
    </FullscreenOverlay>
  );
}

