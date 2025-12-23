import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Box, 
  Typography, 
  Button, 
  Stepper, 
  Step, 
  StepLabel,
  Alert,
  CircularProgress,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { invoke } from '@tauri-apps/api/core';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

import useAppStore from '../../store/useAppStore';
import qrCodeImage from '../../assets/reachy-mini-access-point-QR-code.png';
import { WiFiConfiguration } from '../../components/wifi';
import { useLocalWifiScan, useRobotDiscovery } from '../../hooks/system';
import { useConnection, ConnectionMode } from '../../hooks/useConnection';
import FullscreenOverlay from '../../components/FullscreenOverlay';

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
      // Small delay for UX
      setTimeout(() => setActiveStep(1), 500);
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
        console.log('[Setup] Daemon reachable on hotspot via:', reachableHost);
        setIsDaemonReachable(true);
        return true;
      } else {
        console.log('[Setup] Daemon not reachable on any host');
      }
    } catch (e) {
      console.log('[Setup] Daemon check error:', e.message);
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
    console.log('[Setup] WiFi configured:', ssid);
    // Note: onConnectSuccess is only called when WiFiConfiguration verifies
    // that the Reachy is actually connected (mode === 'wlan' && connected_network === ssid)
    // So we can trust that the connection is real
    setConfiguredNetwork(ssid);
    setActiveStep(3);
  }, []);

  // ============================================================================
  // STEP 4: Reconnecting - Wait for Reachy on local network
  // ============================================================================

  // Countdown for Step 4
  useEffect(() => {
    if (activeStep === 3) {
      setCountdown(45);
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

  // Auto-advance when Reachy found on network (Step 4 → Step 5)
  useEffect(() => {
    if (activeStep === 3 && wifiRobot.available) {
      if (countdownInterval.current) {
        clearInterval(countdownInterval.current);
      }
      setTimeout(() => setActiveStep(4), 500);
    }
  }, [activeStep, wifiRobot.available]);

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
          sx={{
            fontSize: 18,
            fontWeight: 600,
            color: textPrimary,
            mb: 0.5,
            textAlign: 'center',
          }}
        >
          First Time WiFi Setup
        </Typography>

        {/* Stepper */}
        <Box sx={{ width: '100%', maxWidth: 500, mb: 2, mt: 1 }}>
          <Stepper activeStep={activeStep} alternativeLabel>
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
            alignItems: 'flex-start',
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
            {/* Step 1: Hotspot detected */}
            {activeStep === 0 && hasReachyHotspot && (
              <>
                <CheckCircleIcon sx={{ fontSize: 12, color: '#22c55e' }} />
                <Typography sx={{ fontSize: 9, color: '#22c55e' }}>
                  {reachyHotspots[0]?.ssid || 'Hotspot'} found
                </Typography>
              </>
            )}
            {/* Step 1: Scanning */}
            {activeStep === 0 && isLocalScanning && !hasReachyHotspot && (
              <>
                <CircularProgress size={10} sx={{ color: textSecondary }} />
                <Typography sx={{ fontSize: 9, color: textSecondary }}>
                  scanning...
                </Typography>
              </>
            )}
            {/* Step 2: Daemon detected */}
            {activeStep === 1 && isDaemonReachable && (
              <>
                <CheckCircleIcon sx={{ fontSize: 12, color: '#22c55e' }} />
                <Typography sx={{ fontSize: 9, color: '#22c55e' }}>
                  connected
                </Typography>
              </>
            )}
            {/* Step 2: Checking daemon */}
            {activeStep === 1 && isCheckingDaemon && !isDaemonReachable && (
              <>
                <CircularProgress size={10} sx={{ color: textSecondary }} />
                <Typography sx={{ fontSize: 9, color: textSecondary }}>
                  detecting...
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
              onSkip={handleManualNext}
            />
          )}

          {/* ================================================================ */}
          {/* STEP 3: CONFIGURE WIFI */}
          {/* ================================================================ */}
          {activeStep === 2 && (
            <Step3ConfigureWifi
              darkMode={darkMode}
              onSuccess={handleWifiConfigured}
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
              wifiRobot={wifiRobot}
              onSkip={handleManualNext}
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
    </FullscreenOverlay>
  );
}

// ============================================================================
// STEP COMPONENTS
// ============================================================================

function Step1PowerOn({ 
  textPrimary, 
  textSecondary, 
  onNext,
}) {
  return (
    <Box sx={{ width: '100%' }}>
      <Typography sx={{ fontSize: 15, fontWeight: 600, color: textPrimary, mb: 1 }}>
        Power On Your Reachy Mini
      </Typography>
      
      <Typography sx={{ fontSize: 12, color: textSecondary, mb: 3, lineHeight: 1.6 }}>
        Turn on your Reachy and wait about 30 seconds.
        It will create a WiFi hotspot for setup.
      </Typography>

      <Button
        variant="outlined"
        onClick={onNext}
        sx={{ 
          fontSize: 13,
          fontWeight: 600,
          textTransform: 'none',
          px: 3,
          py: 0.75,
          borderRadius: '8px',
          borderColor: '#FF9500',
          color: '#FF9500',
          '&:hover': {
            borderColor: '#e68600',
            bgcolor: 'rgba(255, 149, 0, 0.08)',
          },
        }}
      >
        Continue
      </Button>
    </Box>
  );
}

function Step2ConnectHotspot({
  textPrimary,
  textSecondary,
  reachyHotspots,
  isDaemonReachable,
  onOpenWifiSettings,
  onSkip,
}) {
  const hotspotName = reachyHotspots[0]?.ssid || 'reachy-mini-ap';
  
  return (
    <Box sx={{ width: '100%' }}>
      {isDaemonReachable ? (
        <>
          <Typography sx={{ fontSize: 15, fontWeight: 600, color: '#22c55e', mb: 1 }}>
            Connected to Reachy!
          </Typography>
          <Typography sx={{ fontSize: 12, color: textSecondary }}>
            Moving to WiFi configuration...
          </Typography>
        </>
      ) : (
        <>
          <Typography sx={{ fontSize: 15, fontWeight: 600, color: textPrimary, mb: 1.5 }}>
            Connect to Reachy's Hotspot
          </Typography>

          {/* QR Code + Credentials */}
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'flex-start', 
            gap: 2,
            mb: 2,
            width: '100%',
          }}>
            {/* QR Code */}
            <Box sx={{ 
              bgcolor: '#fff', 
              p: 1, 
              borderRadius: '8px',
              width: 100,
              height: 100,
              flexShrink: 0,
            }}>
              <img 
                src={qrCodeImage} 
                alt="QR Code" 
                style={{ width: '100%', height: '100%', display: 'block', objectFit: 'contain' }} 
              />
            </Box>
            
            {/* Credentials */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Typography sx={{ fontSize: 11, color: textSecondary }}>
                Scan or connect manually:
              </Typography>
              <Typography sx={{ fontSize: 12, color: textSecondary }}>
                Network: <strong style={{ color: textPrimary }}>{hotspotName}</strong>
              </Typography>
              <Typography sx={{ fontSize: 12, color: textSecondary }}>
                Password: <strong style={{ color: textPrimary }}>reachy-mini</strong>
              </Typography>
            </Box>
          </Box>

          {/* Buttons */}
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
            <Button
              variant="outlined"
              size="small"
              endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
              onClick={onOpenWifiSettings}
              sx={{
                fontSize: 12,
                fontWeight: 600,
                textTransform: 'none',
                borderColor: '#FF9500',
                color: '#FF9500',
                px: 2,
                py: 0.5,
                borderRadius: '8px',
                '&:hover': {
                  borderColor: '#e68600',
                  bgcolor: 'rgba(255, 149, 0, 0.08)',
                },
              }}
            >
              Open WiFi Settings
            </Button>

            <Button
              variant="outlined"
              size="small"
              onClick={onSkip}
              sx={{ 
                fontSize: 11, 
                textTransform: 'none', 
                borderColor: '#FF9500',
                color: '#FF9500',
                '&:hover': {
                  borderColor: '#e68600',
                  bgcolor: 'rgba(255, 149, 0, 0.08)',
                },
              }}
            >
              I'm connected →
            </Button>
          </Box>
        </>
      )}
    </Box>
  );
}

// Base URL for hotspot mode (when connected to reachy-mini-ap)
// Use IP directly since Tauri's fetch may have issues with mDNS (.local)
const HOTSPOT_BASE_URL = 'http://10.42.0.1:8000';

function Step3ConfigureWifi({
  darkMode,
  onSuccess,
}) {
  return (
    <Box sx={{ width: '100%' }}>
      <WiFiConfiguration 
        darkMode={darkMode}
        compact={true}
        onConnectSuccess={onSuccess}
        showHotspotDetection={false}
        customBaseUrl={HOTSPOT_BASE_URL}
      />
    </Box>
  );
}

function Step4Reconnecting({
  textPrimary,
  textSecondary,
  configuredNetwork,
  wifiRobot,
  onSkip,
}) {
  return (
    <Box sx={{ width: '100%' }}>
      {wifiRobot.available ? (
        <>
          <Typography sx={{ fontSize: 15, fontWeight: 600, color: '#22c55e', mb: 1 }}>
            Reachy Found!
          </Typography>
          <Typography sx={{ fontSize: 12, color: textSecondary }}>
            Detected at {wifiRobot.host}
          </Typography>
        </>
      ) : (
        <>
          <Typography sx={{ fontSize: 15, fontWeight: 600, color: textPrimary, mb: 1 }}>
            Reconnect to Your WiFi
          </Typography>
          
          <Typography sx={{ fontSize: 12, color: textSecondary, mb: 2, lineHeight: 1.6 }}>
            Your Reachy is now connecting to{' '}
            <strong>{configuredNetwork || 'your network'}</strong>.
            Reconnect your computer to the same network.
          </Typography>

          <Alert 
            severity="info" 
            sx={{ 
              fontSize: 11, 
              py: 0.5,
              mb: 2,
              '& .MuiAlert-message': { py: 0 },
            }}
          >
            Make sure you're on <strong>{configuredNetwork || 'your WiFi'}</strong>
          </Alert>

          <Button
            variant="outlined"
            size="small"
            onClick={onSkip}
            sx={{ 
              fontSize: 12, 
              fontWeight: 600,
              textTransform: 'none', 
              borderColor: '#FF9500',
              color: '#FF9500',
              px: 2,
              py: 0.5,
              borderRadius: '8px',
              '&:hover': {
                borderColor: '#e68600',
                bgcolor: 'rgba(255, 149, 0, 0.08)',
              },
            }}
          >
            I'm connected, continue →
          </Button>
        </>
      )}
    </Box>
  );
}

function Step5Success({
  textPrimary,
  textSecondary,
  wifiRobot,
  configuredNetwork,
  isConnecting,
  onConnect,
}) {
  return (
    <Box sx={{ width: '100%' }}>
      <Typography sx={{ fontSize: 15, fontWeight: 600, color: '#22c55e', mb: 1 }}>
        Setup Complete!
      </Typography>
      
      <Typography sx={{ fontSize: 12, color: textSecondary, mb: 2, lineHeight: 1.6 }}>
        Your Reachy Mini is now connected to{' '}
        <strong style={{ color: textPrimary }}>{configuredNetwork || 'your network'}</strong>.
        {wifiRobot.host && (
          <> Detected at <strong style={{ color: textPrimary }}>{wifiRobot.host}</strong>.</>
        )}
      </Typography>

      <Button
        variant="outlined"
        onClick={onConnect}
        disabled={isConnecting}
        sx={{
          fontSize: 13,
          fontWeight: 600,
          textTransform: 'none',
          px: 3,
          py: 0.75,
          borderRadius: '8px',
          borderColor: '#22c55e',
          color: '#22c55e',
          '&:hover': {
            borderColor: '#16a34a',
            bgcolor: 'rgba(34, 197, 94, 0.08)',
          },
        }}
      >
        {isConnecting ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CircularProgress size={14} sx={{ color: 'inherit' }} />
            Connecting...
          </Box>
        ) : (
          'Connect Now'
        )}
      </Button>
    </Box>
  );
}
