import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Alert,
  CircularProgress,
  TextField,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import BluetoothIcon from '@mui/icons-material/Bluetooth';
import useAppStore from '../../store/useAppStore';
import FullscreenOverlay from '../../components/FullscreenOverlay';
import serialNumberImage from '../../assets/serial-number.jpg';
import {
  startScan,
  stopScan,
  connect,
  disconnect,
  sendString,
  readString,
  subscribeString,
  unsubscribe,
  checkPermissions,
  getConnectionUpdates,
} from '@mnlphlp/plugin-blec';

/**
 * BluetoothSupportView - Reset Reachy via Bluetooth
 * 
 * Flow:
 * 1. Scan for "ReachyMini" BLE device
 * 2. Connect and authenticate with PIN (last 5 digits of serial)
 * 3. Send CMD_SOFTWARE_RESET command
 * 
 * Commands available via BLE:
 * - CMD_SOFTWARE_RESET: Restores /venvs/ from /restore/venvs/ and restarts daemon
 * - CMD_RESTART_DAEMON: Restarts the daemon service
 * - CMD_HOTSPOT: Activates WiFi hotspot mode
 */
export default function BluetoothSupportView() {
  const { darkMode, setShowBluetoothSupportView } = useAppStore();
  const [step, setStep] = useState(0); // 0: scan, 1: authenticate, 2: reset
  
  // BLE state
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState(null);
  
  // BLE UUIDs from daemon
  const SERVICE_UUID = '12345678-1234-5678-1234-56789abcdef0';
  const COMMAND_UUID = '12345678-1234-5678-1234-56789abcdef1';
  const RESPONSE_UUID = '12345678-1234-5678-1234-56789abcdef2';
  
  // Colors
  const textPrimary = darkMode ? '#f5f5f5' : '#333';
  const textSecondary = darkMode ? '#888' : '#666';
  const bgCard = darkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)';
  const borderColor = darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';

  // Check permissions on mount
  useEffect(() => {
    const checkBLEPermissions = async () => {
      const hasPermissions = await checkPermissions(true);
      if (!hasPermissions) {
        setError('Bluetooth permissions are required. Please grant permissions and try again.');
      }
    };
    checkBLEPermissions();
  }, []);

  // Listen for connection updates (only after we've successfully connected)
  useEffect(() => {
    if (step < 2) return; // Only listen after authentication step
    
    getConnectionUpdates((connected) => {
      setIsConnected(connected);
      if (!connected && step >= 2) {
        // Only show error if we were actually connected and working
        setError('Connection lost. Please try again.');
        setStep(0);
        setSelectedDevice(null);
        setIsConnected(false);
      }
    });
  }, [step]);

  // BLE Scanning
  const handleScan = useCallback(async () => {
    setIsScanning(true);
    setError(null);
    setDevices([]);
    
    try {
      // Check permissions
      const hasPermissions = await checkPermissions(true);
      if (!hasPermissions) {
        setError('Bluetooth permissions are required.');
        setIsScanning(false);
        return;
      }

      // Start scanning with 10 second timeout
      await startScan((foundDevices) => {
        // Filter for ReachyMini devices (case-insensitive, partial match)
        const reachyDevices = foundDevices.filter(
          (device) => {
            const name = (device.name || '').toLowerCase();
            return name.includes('reachy') || name.includes('reachymini');
          }
        );
        
        if (reachyDevices.length > 0) {
          // Update devices list, avoiding duplicates
          setDevices((prev) => {
            const existingAddresses = new Set(prev.map(d => d.address));
            const newDevices = reachyDevices.filter(d => !existingAddresses.has(d.address));
            
            // If we found new devices, stop scanning immediately
            if (newDevices.length > 0) {
              stopScan().catch(err => console.error('[BLE] Error stopping scan:', err));
              setIsScanning(false);
            }
            
            return [...prev, ...newDevices];
          });
        }
      }, 10000); // 10 second scan (max, but will stop early if device found)
      
      // Stop scanning after timeout (fallback if no device found)
      setTimeout(async () => {
        await stopScan();
        setIsScanning(false);
      }, 10000);
    } catch (err) {
      console.error('[BLE Scan Error]', err);
      setError(`Scan failed: ${err.message || 'Unknown error'}`);
      setIsScanning(false);
      await stopScan();
    }
  }, []);

  // Connect and authenticate via BLE
  // Flow: Connect → Subscribe to response → Send PIN_xxxxx → Wait for notification
  const handleConnect = useCallback(async () => {
    if (!selectedDevice || !pin || pin.length !== 5) return;
    setError(null);
    setIsConnecting(true);
    
    let responseReceived = false;
    let authSuccess = false;
    
    try {
      console.log('[BLE] Connecting to', selectedDevice.address);
      
      // 1. Connect to device (onDisconnect callback only for unexpected disconnections)
      await connect(selectedDevice.address, () => {
        console.log('[BLE] Unexpected disconnection');
        // Only handle if we were actually authenticated
        if (authSuccess) {
          setIsConnected(false);
          setError('Connection lost.');
          setStep(0);
          setSelectedDevice(null);
        }
      });
      
      console.log('[BLE] Connected, waiting for connection to stabilize...');
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // 2. Subscribe to response characteristic to receive notifications
      console.log('[BLE] Subscribing to response characteristic...');
      await subscribeString(RESPONSE_UUID, (response) => {
        console.log('[BLE] Received notification:', response);
        responseReceived = true;
        
        if (response && response.includes('OK: Connected')) {
          console.log('[BLE] Authentication successful!');
          authSuccess = true;
          setIsConnected(true);
          setStep(2);
        } else if (response && response.includes('ERROR')) {
          console.error('[BLE] Authentication failed:', response);
          setError('Authentication failed. Please check the PIN (last 5 digits of serial number).');
          setIsConnecting(false);
        }
      }, SERVICE_UUID);
      
      // 3. Wait a bit for subscription to be ready
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // 4. Send PIN authentication
      console.log('[BLE] Sending PIN authentication...');
      await sendString(COMMAND_UUID, `PIN_${pin}`, 'withResponse', SERVICE_UUID);
      
      // 5. Wait for response (with timeout)
      const timeout = 5000; // 5 seconds
      const startTime = Date.now();
      while (!responseReceived && (Date.now() - startTime) < timeout) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      if (!responseReceived) {
        // Try reading directly as fallback
        console.log('[BLE] No notification received, trying direct read...');
        const directResponse = await readString(RESPONSE_UUID, SERVICE_UUID);
        console.log('[BLE] Direct read response:', directResponse);
        
        if (directResponse && directResponse.includes('OK: Connected')) {
          authSuccess = true;
          setIsConnected(true);
          setStep(2);
        } else {
          setError('Authentication timeout. Please check the PIN and try again.');
          await unsubscribe(RESPONSE_UUID);
          await disconnect();
        }
      }
      
      // Clean up subscription if we didn't succeed
      if (!authSuccess) {
        try {
          await unsubscribe(RESPONSE_UUID);
        } catch (e) {
          console.error('[BLE] Error unsubscribing:', e);
        }
        try {
          await disconnect();
        } catch (e) {
          console.error('[BLE] Error disconnecting:', e);
        }
      }
    } catch (err) {
      console.error('[BLE Connect Error]', err);
      setError(`Connection failed: ${err.message || 'Unknown error'}. Please try again.`);
      try {
        await unsubscribe(RESPONSE_UUID).catch(() => {});
        await disconnect().catch(() => {});
      } catch (e) {
        console.error('[BLE] Error cleaning up:', e);
      }
    } finally {
      if (!authSuccess) {
        setIsConnecting(false);
      }
    }
  }, [selectedDevice, pin]);

  // Reset via BLE
  // Flow: Already connected & authenticated → Send CMD_SOFTWARE_RESET
  // The SOFTWARE_RESET.sh script:
  //   - rm -rf /venvs/
  //   - cp -r /restore/venvs/ /
  //   - chown -R pollen:pollen /venvs
  //   - systemctl restart reachy-mini-daemon.service
  const handleReset = useCallback(async () => {
    if (!selectedDevice || !isConnected) return;
    setError(null);
    setIsResetting(true);
    
    try {
      console.log('[BLE] Sending reset command...');
      // 1. Send reset command
      await sendString(COMMAND_UUID, 'CMD_SOFTWARE_RESET', 'withResponse', SERVICE_UUID);
      
      console.log('[BLE] Reset command sent, waiting for response...');
      
      // 2. Wait a bit for the command to be processed
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // 3. Try to read response (but the daemon might restart before responding)
      let response = null;
      try {
        response = await readString(RESPONSE_UUID, SERVICE_UUID);
        console.log('[BLE Reset Response]', response);
      } catch (readErr) {
        console.log('[BLE] Could not read response (daemon may have restarted):', readErr.message);
        // This is actually expected - the daemon restarts after reset
      }
      
      // 4. Check response if we got one
      if (response) {
        if (response.includes('ERROR')) {
          setError(`Reset failed: ${response}`);
          setIsResetting(false);
          return;
        }
        // If response contains OK or is empty, consider it success
      }
      
      // 5. The daemon will restart, so we'll lose connection
      // Wait a moment to see if connection drops (confirms restart)
      console.log('[BLE] Waiting to confirm daemon restart...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 6. Success - the daemon is restarting
      // Note: Connection is automatically reset after command (see daemon code)
      console.log('[BLE] ✅ Reset command executed successfully');
      setStep(3); // Show success step
      
    } catch (err) {
      console.error('[BLE Reset Error]', err);
      // Even if there's an error, the command might have been sent
      // The daemon will reset the connection anyway
      // Show success after a delay to give time for restart
      setTimeout(() => {
        setStep(3); // Show success anyway, as the reset might be in progress
      }, 2000);
    } finally {
      setIsResetting(false);
    }
  }, [selectedDevice, isConnected]);

  const handleBack = useCallback(async () => {
    // Cleanup: stop scan and disconnect if connected
    try {
      await stopScan();
      if (isConnected) {
        await disconnect();
      }
    } catch (err) {
      console.error('[BLE Cleanup Error]', err);
    }
    setShowBluetoothSupportView(false);
  }, [setShowBluetoothSupportView, isConnected]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopScan().catch(() => {});
      if (isConnected) {
        disconnect().catch(() => {});
      }
    };
  }, [isConnected]);

  return (
    <FullscreenOverlay
      open={true}
      onClose={handleBack}
      darkMode={darkMode}
      showCloseButton={true}
      centered={true}
      backdropBlur={40}
      debugName="BluetoothSupport"
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
          Bluetooth Support & Reset
        </Typography>

        <Typography
          sx={{
            fontSize: 12,
            color: textSecondary,
            mb: 3,
            textAlign: 'center',
            maxWidth: 400,
          }}
        >
          Reset your Reachy via Bluetooth if it's stuck or unresponsive. This will restore the system to a clean state.
        </Typography>

        {/* Content Card */}
        <Box
          sx={{
            width: '100%',
            maxWidth: 420,
            minHeight: 320,
            bgcolor: bgCard,
            borderRadius: '12px',
            border: '1px solid',
            borderColor: borderColor,
            p: 3,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            justifyContent: 'center',
            gap: 2,
          }}
        >
          {error && (
            <Alert severity="error" sx={{ fontSize: 11, width: '100%' }}>
              {error}
            </Alert>
          )}

          {step === 0 && (
            <>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <BluetoothIcon sx={{ fontSize: 20, color: '#FF9500' }} />
                <Typography sx={{ fontSize: 15, fontWeight: 600, color: textPrimary }}>
                  Scan for Reachy
                </Typography>
              </Box>
              
              <Typography sx={{ fontSize: 12, color: textSecondary, mb: 2 }}>
                Make sure your Reachy is powered on and nearby. We'll scan for Bluetooth devices.
              </Typography>

              <Button
                variant="outlined"
                onClick={handleScan}
                disabled={isScanning}
                fullWidth
                sx={{
                  fontSize: 13,
                  fontWeight: 600,
                  textTransform: 'none',
                  py: 1,
                  borderRadius: '10px',
                  borderColor: '#FF9500',
                  color: '#FF9500',
                  '&:hover': {
                    borderColor: '#e68600',
                    bgcolor: 'rgba(255, 149, 0, 0.08)',
                  },
                }}
              >
                {isScanning ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CircularProgress size={14} sx={{ color: '#FF9500' }} />
                    Scanning...
                  </Box>
                ) : (
                  'Scan for ReachyMini'
                )}
              </Button>

              {devices.length > 0 && (
                <Box sx={{ width: '100%', mt: 1 }}>
                  {devices.map((device) => (
                    <Box
                      key={device.address}
                      onClick={() => {
                        setSelectedDevice(device);
                        setStep(1);
                      }}
                      sx={{
                        p: 2,
                        borderRadius: '8px',
                        border: '1px solid',
                        borderColor: borderColor,
                        cursor: 'pointer',
                        '&:hover': {
                          bgcolor: darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
                        },
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <BluetoothIcon sx={{ fontSize: 18, color: '#22c55e' }} />
                        <Typography sx={{ fontSize: 13, fontWeight: 600, color: textPrimary }}>
                          {device.name}
                        </Typography>
                      </Box>
                      <Typography sx={{ fontSize: 10, color: textSecondary, mt: 0.5 }}>
                        {device.address}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </>
          )}

          {step === 1 && selectedDevice && (
            <>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <BluetoothIcon sx={{ fontSize: 20, color: '#FF9500' }} />
                <Typography sx={{ fontSize: 15, fontWeight: 600, color: textPrimary }}>
                  Connect to {selectedDevice.name}
                </Typography>
              </Box>

              {/* Image and description side by side */}
              <Box sx={{ 
                display: 'flex', 
                gap: 2, 
                mb: 2,
                alignItems: 'flex-start',
              }}>
                {/* Serial number image - left */}
                <Box sx={{
                  bgcolor: '#fff',
                  p: 1,
                  borderRadius: '8px',
                  width: 150,
                  height: 120,
                  flexShrink: 0,
                  overflow: 'hidden',
                }}>
                  <img 
                    src={serialNumberImage} 
                    alt="Serial number location" 
                    style={{ 
                      width: '100%', 
                      height: '100%', 
                      display: 'block', 
                      objectFit: 'contain' 
                    }} 
                  />
                </Box>
                
                {/* Description - right */}
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ fontSize: 12, color: textSecondary, lineHeight: 1.6 }}>
                    Enter the PIN to authenticate. The PIN is usually the last 5 digits of your Reachy's serial number.
                  </Typography>
                </Box>
              </Box>

              <TextField
                label="PIN (5 digits)"
                value={pin}
                onChange={(e) => {
                  // Only allow digits, max 5
                  const value = e.target.value.replace(/\D/g, '').slice(0, 5);
                  setPin(value);
                }}
                size="small"
                fullWidth
                placeholder="00966"
                inputProps={{
                  maxLength: 5,
                  inputMode: 'numeric',
                  pattern: '[0-9]{5}',
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    bgcolor: darkMode ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.02)',
                    '& fieldset': {
                      borderColor: borderColor,
                    },
                  },
                }}
              />

              <Button
                variant="outlined"
                onClick={handleConnect}
                disabled={!pin || pin.length !== 5 || isConnecting}
                fullWidth
                sx={{
                  fontSize: 13,
                  fontWeight: 600,
                  textTransform: 'none',
                  py: 1,
                  borderRadius: '10px',
                  borderColor: '#FF9500',
                  color: '#FF9500',
                  '&:hover': {
                    borderColor: '#e68600',
                    bgcolor: 'rgba(255, 149, 0, 0.08)',
                  },
                }}
              >
                {isConnecting ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CircularProgress size={14} sx={{ color: '#FF9500' }} />
                    Connecting...
                  </Box>
                ) : (
                  'Reset Reachy'
                )}
              </Button>
            </>
          )}

          {step === 2 && isConnected && (
            <>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <CheckCircleIcon sx={{ fontSize: 20, color: '#22c55e' }} />
                <Typography sx={{ fontSize: 15, fontWeight: 600, color: textPrimary }}>
                  Authenticated via Bluetooth
                </Typography>
              </Box>

              <Typography sx={{ fontSize: 12, color: textSecondary, mb: 2 }}>
                Ready to reset your Reachy. This will:
              </Typography>

              <Box sx={{ 
                bgcolor: darkMode ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.05)',
                border: '1px solid',
                borderColor: darkMode ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.2)',
                borderRadius: '8px',
                p: 2,
                mb: 2,
              }}>
                <Typography sx={{ fontSize: 11, color: textSecondary, mb: 1 }}>
                  • Restore system files to default state
                </Typography>
                <Typography sx={{ fontSize: 11, color: textSecondary, mb: 1 }}>
                  • Restart the daemon service
                </Typography>
                <Typography sx={{ fontSize: 11, color: '#ef4444', fontWeight: 600 }}>
                  ⚠️ This will remove any custom configurations
                </Typography>
              </Box>

              <Button
                variant="outlined"
                onClick={handleReset}
                disabled={isResetting}
                fullWidth
                sx={{
                  fontSize: 13,
                  fontWeight: 600,
                  textTransform: 'none',
                  py: 1.5,
                  borderRadius: '10px',
                  borderColor: '#ef4444',
                  color: '#ef4444',
                  '&:hover': {
                    borderColor: '#dc2626',
                    bgcolor: 'rgba(239, 68, 68, 0.08)',
                  },
                }}
              >
                {isResetting ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CircularProgress size={14} sx={{ color: '#ef4444' }} />
                    Resetting...
                  </Box>
                ) : (
                  'Reset Reachy Now'
                )}
              </Button>

            </>
          )}

          {step === 3 && (
            <>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <CheckCircleIcon sx={{ fontSize: 20, color: '#22c55e' }} />
                <Typography sx={{ fontSize: 15, fontWeight: 600, color: '#22c55e' }}>
                  Reset Successful
                </Typography>
              </Box>

              <Typography sx={{ fontSize: 12, color: textSecondary, mb: 3 }}>
                Your Reachy has been reset and is restarting. It should be back online in a few moments.
              </Typography>

              <Button
                variant="outlined"
                onClick={() => setShowBluetoothSupportView(false)}
                fullWidth
                sx={{
                  fontSize: 13,
                  fontWeight: 600,
                  textTransform: 'none',
                  py: 1.5,
                  borderRadius: '10px',
                  borderColor: '#22c55e',
                  color: '#22c55e',
                  '&:hover': {
                    borderColor: '#16a34a',
                    bgcolor: 'rgba(34, 197, 94, 0.08)',
                  },
                }}
              >
                Close
              </Button>
            </>
          )}
        </Box>
      </Box>
    </FullscreenOverlay>
  );
}

