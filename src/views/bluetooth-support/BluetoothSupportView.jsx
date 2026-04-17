import React, { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Stepper,
  Step,
  StepLabel,
  TextField,
  CircularProgress,
} from '@mui/material';
import BluetoothSearchingIcon from '@mui/icons-material/BluetoothSearching';
import BluetoothConnectedIcon from '@mui/icons-material/BluetoothConnected';
import NetworkCheckIcon from '@mui/icons-material/NetworkCheck';
import WifiTetheringIcon from '@mui/icons-material/WifiTethering';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import CellTowerIcon from '@mui/icons-material/CellTower';
import useAppStore from '../../store/useAppStore';
import useBluetooth from '../../hooks/bluetooth/useBluetooth';
import FullscreenOverlay from '../../components/FullscreenOverlay';
import LogConsole from '../../components/LogConsole';

const steps = ['Scan', 'PIN', 'Commands'];

// BLE commands — protocol from bluetooth_service.py:
//  "PING" / "STATUS" → no auth needed
//  "CMD_xxx" → requires prior PIN_xxxxx auth
const COMMANDS = [
  { id: 'ping', label: 'Ping', icon: CellTowerIcon, color: '#6366f1', noAuth: true },
  {
    id: 'network_status',
    label: 'Network Status',
    icon: NetworkCheckIcon,
    color: '#6366f1',
    readStatus: true,
  },
  { id: 'hotspot', label: 'Hotspot', icon: WifiTetheringIcon, color: '#6366f1', script: 'HOTSPOT' },
  {
    id: 'restart_daemon',
    label: 'Software Restart',
    icon: RestartAltIcon,
    color: '#6366f1',
    script: 'RESTART_DAEMON',
  },
  {
    id: 'software_reset',
    label: 'Software Reset',
    icon: DeleteForeverIcon,
    color: '#ef4444',
    danger: true,
    script: 'SOFTWARE_RESET',
  },
];

/**
 * BluetoothSupportView — 3-step native BLE flow:
 * 1. Scan for ReachyMini devices
 * 2. Enter PIN (last 5 digits of serial number)
 * 3. Send commands and view responses
 */
export default function BluetoothSupportView() {
  const { darkMode, setShowBluetoothSupportView, setShowFirstTimeWifiSetup, blePin, setBlePin } =
    useAppStore();
  const {
    bleStatus,
    bleDevices,
    scan,
    connectToDevice,
    disconnectDevice,
    sendCommand,
    sendPing,
    readNetworkStatus,
    startJournal,
    stopJournal,
    openJournalWindow,
    checkAdapterState,
  } = useBluetooth();

  const [activeStep, setActiveStep] = useState(0);
  const [pinInput, setPinInput] = useState(blePin);
  const [activityLog, setActivityLog] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const [adapterWarning, setAdapterWarning] = useState('');
  const [journalActive, setJournalActive] = useState(false);
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [hotspotPending, setHotspotPending] = useState(false);
  const [hotspotCountdown, setHotspotCountdown] = useState(0);

  const textPrimary = darkMode ? '#f5f5f5' : '#333';
  const textSecondary = darkMode ? '#888' : '#666';
  const bgCard = darkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)';
  const borderColor = darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';

  const addLog = useCallback((message, level = 'info') => {
    setActivityLog(prev => [...prev, { message, timestamp: Date.now(), level }]);
  }, []);

  const handleHotspot = useCallback(() => {
    const pin = blePin || pinInput;
    setHotspotPending(true);
    setHotspotCountdown(15);
    addLog('Switching to hotspot mode...');
    sendCommand(pin, 'HOTSPOT').catch(() => {});
    const interval = setInterval(() => {
      setHotspotCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          setHotspotPending(false);
          setShowBluetoothSupportView(false);
          setShowFirstTimeWifiSetup(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [
    blePin,
    pinInput,
    sendCommand,
    addLog,
    setShowBluetoothSupportView,
    setShowFirstTimeWifiSetup,
  ]);

  // Journal start/stop handlers
  const handleJournalStart = useCallback(async () => {
    if (journalActive) return;
    try {
      await openJournalWindow();
      await startJournal();
      setJournalActive(true);
      addLog('Journal streaming started (see Journal window)', 'success');
    } catch (e) {
      addLog(`Journal error: ${e.message}`, 'error');
    }
  }, [journalActive, startJournal, openJournalWindow, addLog]);

  const handleJournalStop = useCallback(async () => {
    if (!journalActive) return;
    await stopJournal();
    setJournalActive(false);
    addLog('Journal streaming stopped', 'info');
  }, [journalActive, stopJournal, addLog]);

  // Step 1: Handle connect to a device
  const handleConnect = useCallback(
    async device => {
      const address = typeof device === 'string' ? device : device.address;
      const name = typeof device === 'string' ? null : device.name;
      try {
        addLog(`Connecting to ${address}...`);
        await connectToDevice(address);
        setConnectedDevice({ address, name });
        addLog('Connected!', 'success');

        // Check cached PIN for this device (read directly — state not yet updated)
        let cachedPin = '';
        try {
          const pins = JSON.parse(localStorage.getItem('blePins') || '{}');
          cachedPin = pins[address] || '';
        } catch {
          /* ignore */
        }

        if (cachedPin) {
          setPinInput(cachedPin);
          setActiveStep(2);
        } else {
          setActiveStep(1);
        }
      } catch (e) {
        addLog(`Connection failed: ${e.message}`, 'error');
      }
    },
    [connectToDevice, addLog]
  );

  // Step 2: Save PIN and advance
  const handleSavePin = useCallback(() => {
    if (pinInput.length === 5) {
      setBlePin(pinInput);
      setActiveStep(2);
    }
  }, [pinInput, setBlePin]);

  // Step 3: Send a command
  const handleCommand = useCallback(
    async commandId => {
      if (isSending) return;
      setIsSending(true);

      const cmd = COMMANDS.find(c => c.id === commandId);
      const pin = blePin || pinInput;
      addLog(`Sending: ${cmd?.label || commandId}`);

      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout: no response after 15s')), 15000)
      );

      let timedOut = false;
      try {
        let response;
        if (cmd?.noAuth) {
          response = await Promise.race([sendPing(), timeout]);
        } else if (cmd?.readStatus) {
          response = await Promise.race([readNetworkStatus(), timeout]);
        } else if (cmd?.script) {
          response = await Promise.race([sendCommand(pin, cmd.script), timeout]);
        }
        addLog(`Response: ${response}`, 'success');
      } catch (e) {
        const msg = e?.message || (typeof e === 'string' ? e : JSON.stringify(e));
        addLog(`Error: ${msg}`, 'error');
        if (msg.includes('Timeout')) {
          timedOut = true;
        }
      } finally {
        setIsSending(false);
        if (timedOut) {
          disconnectDevice().catch(() => {});
          setConnectedDevice(null);
          setJournalActive(false);
          setActiveStep(0);
        }
      }
    },
    [isSending, blePin, pinInput, sendCommand, sendPing, readNetworkStatus, addLog]
  );

  // Disconnect handler
  const handleDisconnect = useCallback(async () => {
    if (journalActive) {
      await stopJournal();
      setJournalActive(false);
    }
    await disconnectDevice();
    addLog('Disconnected', 'info');
    setActiveStep(0);
  }, [disconnectDevice, journalActive, stopJournal, addLog]);

  const handleClose = () => {
    setIsSending(false);
    if (bleStatus === 'connected') {
      if (journalActive) stopJournal().catch(() => {});
      disconnectDevice().catch(() => {});
    }
    setShowBluetoothSupportView(false);
  };

  return (
    <FullscreenOverlay
      open={true}
      onClose={handleClose}
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
          maxWidth: 520,
        }}
      >
        <Typography
          sx={{
            fontSize: 22,
            fontWeight: 700,
            color: textPrimary,
            mb: 3,
            textAlign: 'center',
            letterSpacing: '-0.3px',
          }}
        >
          Bluetooth Console
        </Typography>

        {/* Stepper */}
        <Box sx={{ width: '100%', maxWidth: 400, mb: 2 }}>
          <Stepper activeStep={activeStep} alternativeLabel>
            {steps.map((label, index) => (
              <Step key={label} completed={activeStep > index}>
                <StepLabel
                  sx={{
                    '& .MuiStepLabel-label': {
                      fontSize: 10,
                      color: textSecondary,
                      mt: 0.5,
                      '&.Mui-active': { color: 'primary.main', fontWeight: 600 },
                      '&.Mui-completed': { color: '#22c55e' },
                    },
                    '& .MuiStepIcon-root': {
                      fontSize: 20,
                      color: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
                      '&.Mui-active': { color: 'primary.main' },
                      '&.Mui-completed': { color: '#22c55e' },
                    },
                  }}
                >
                  {label}
                </StepLabel>
              </Step>
            ))}
          </Stepper>
        </Box>

        {/* Content Card */}
        <Box
          sx={{
            width: '100%',
            maxWidth: 460,
            minHeight: 300,
            bgcolor: bgCard,
            borderRadius: '12px',
            border: '1px solid',
            borderColor: borderColor,
            p: 3,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* ============================================================ */}
          {/* STEP 1: SCAN */}
          {/* ============================================================ */}
          {activeStep === 0 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 2 }}>
              {/* Scan button — hidden once devices are found or connecting */}
              {bleDevices.length === 0 && bleStatus !== 'connecting' && (
                <Button
                  variant="outlined"
                  color="primary"
                  fullWidth
                  onClick={async () => {
                    setAdapterWarning('');
                    const state = await checkAdapterState();
                    if (state === 'Off') {
                      setAdapterWarning('Bluetooth is off. Enable it in System Settings.');
                      return;
                    }
                    scan();
                  }}
                  disabled={bleStatus === 'scanning'}
                  startIcon={
                    bleStatus === 'scanning' ? (
                      <CircularProgress size={15} color="primary" />
                    ) : (
                      <BluetoothSearchingIcon sx={{ fontSize: 18 }} />
                    )
                  }
                  sx={{
                    fontSize: 13,
                    fontWeight: 600,
                    textTransform: 'none',
                    py: 1.25,
                    borderRadius: '10px',
                  }}
                >
                  {bleStatus === 'scanning' ? 'Scanning...' : 'Scan for Devices'}
                </Button>
              )}

              {/* Adapter warning */}
              {adapterWarning && (
                <Typography
                  sx={{ fontSize: 11, color: '#ef4444', textAlign: 'center', lineHeight: 1.5 }}
                >
                  {adapterWarning}
                </Typography>
              )}

              {/* Device list — hidden while connecting */}
              {bleDevices.length > 0 && bleStatus !== 'connecting' && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Typography
                    sx={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: textSecondary,
                      textTransform: 'uppercase',
                      letterSpacing: '0.6px',
                    }}
                  >
                    Devices found
                  </Typography>
                  {bleDevices.map(device => {
                    const rssi = device.rssi ?? null;
                    const signalBars = rssi == null ? 0 : rssi > -60 ? 3 : rssi > -75 ? 2 : 1;
                    return (
                      <Box
                        key={device.address}
                        onClick={() => bleStatus !== 'connecting' && handleConnect(device)}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          px: 1.75,
                          py: 1.25,
                          borderRadius: '10px',
                          border: '1px solid',
                          borderColor: borderColor,
                          cursor: bleStatus === 'connecting' ? 'default' : 'pointer',
                          transition: 'all 0.15s ease',
                          '&:hover':
                            bleStatus !== 'connecting'
                              ? {
                                  borderColor: 'primary.main',
                                  bgcolor: 'primary.100',
                                }
                              : {},
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                          <BluetoothConnectedIcon
                            sx={{ fontSize: 16, color: 'primary.main', flexShrink: 0 }}
                          />
                          <Box>
                            <Typography
                              sx={{
                                fontSize: 13,
                                fontWeight: 600,
                                color: textPrimary,
                                lineHeight: 1.3,
                              }}
                            >
                              {device.name || 'Unknown Device'}
                            </Typography>
                            <Typography
                              sx={{ fontSize: 10, color: textSecondary, fontFamily: 'monospace' }}
                            >
                              {device.address}
                            </Typography>
                          </Box>
                        </Box>
                        {/* Signal strength dots */}
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'flex-end',
                            gap: '3px',
                            flexShrink: 0,
                          }}
                        >
                          {[1, 2, 3].map(bar => (
                            <Box
                              key={bar}
                              sx={{
                                width: 4,
                                height: 4 + bar * 3,
                                borderRadius: '1px',
                                bgcolor:
                                  bar <= signalBars
                                    ? 'primary.main'
                                    : darkMode
                                      ? 'rgba(255,255,255,0.15)'
                                      : 'rgba(0,0,0,0.12)',
                              }}
                            />
                          ))}
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
              )}

              {/* Description — hidden once a device is found */}
              {bleDevices.length === 0 && bleStatus !== 'connecting' && (
                <Typography
                  sx={{ fontSize: 12, color: textSecondary, textAlign: 'center', lineHeight: 1.6 }}
                >
                  Make sure Reachy Mini is powered on and within range.
                </Typography>
              )}

              {/* Connecting state */}
              {bleStatus === 'connecting' && (
                <Box
                  sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}
                >
                  <CircularProgress size={14} color="primary" />
                  <Typography sx={{ fontSize: 12, color: textSecondary }}>Connecting...</Typography>
                </Box>
              )}
            </Box>
          )}

          {/* ============================================================ */}
          {/* STEP 2: PIN */}
          {/* ============================================================ */}
          {activeStep === 1 && (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                width: '100%',
                gap: 2,
              }}
            >
              <Typography sx={{ fontSize: 14, fontWeight: 600, color: textPrimary }}>
                Enter PIN
              </Typography>
              <Typography
                sx={{ fontSize: 12, color: textSecondary, textAlign: 'center', lineHeight: 1.5 }}
              >
                Enter the last 5 digits of your Reachy Mini serial number.
              </Typography>

              <TextField
                value={pinInput}
                onChange={e => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 5);
                  setPinInput(val);
                }}
                placeholder="00000"
                inputProps={{
                  maxLength: 5,
                  style: {
                    textAlign: 'center',
                    fontSize: 24,
                    fontWeight: 600,
                    letterSpacing: '8px',
                    color: textPrimary,
                  },
                }}
                sx={{
                  width: 200,
                  '& .MuiOutlinedInput-root': {
                    borderRadius: '10px',
                    '& fieldset': {
                      borderColor: borderColor,
                    },
                    '&:hover fieldset': {
                      borderColor: 'primary.main',
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: 'primary.main',
                    },
                  },
                }}
              />

              <Button
                variant="outlined"
                color="primary"
                onClick={handleSavePin}
                disabled={pinInput.length !== 5}
                sx={{
                  fontSize: 13,
                  fontWeight: 600,
                  textTransform: 'none',
                  py: 1,
                  px: 3,
                  borderRadius: '10px',
                }}
              >
                Continue
              </Button>
            </Box>
          )}

          {/* ============================================================ */}
          {/* STEP 3: COMMANDS */}
          {/* ============================================================ */}
          {activeStep === 2 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 2, flex: 1 }}>
              {/* Connected device header */}
              {connectedDevice && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <BluetoothConnectedIcon sx={{ fontSize: 12, color: '#22c55e' }} />
                  <Typography sx={{ fontSize: 10, color: textSecondary }}>
                    Connected —{' '}
                    <Box component="span" sx={{ fontFamily: 'monospace' }}>
                      {connectedDevice.address}
                    </Box>
                  </Typography>
                </Box>
              )}

              {/* Actions 2x2 grid */}
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                {[
                  { id: 'network_status', desc: 'Check WiFi network and IP' },
                  { id: 'hotspot', desc: 'Disconnects WiFi and restarts in hotspot mode.' },
                  { id: 'restart_daemon', desc: 'Restart the robot software' },
                  { id: 'software_reset', desc: 'Full reset — last resort' },
                ].map(({ id, desc }) => {
                  const cmd = COMMANDS.find(c => c.id === id);
                  const isDanger = cmd.danger;
                  const isHotspot = id === 'hotspot';
                  const isPending = isHotspot && hotspotPending;
                  return (
                    <Box key={id}>
                      <Button
                        variant="outlined"
                        color={isDanger ? undefined : 'primary'}
                        fullWidth
                        onClick={() => (isHotspot ? handleHotspot() : handleCommand(id))}
                        disabled={
                          isSending || bleStatus !== 'connected' || (hotspotPending && !isHotspot)
                        }
                        startIcon={
                          isPending ? (
                            <CircularProgress size={13} color="primary" />
                          ) : (
                            <cmd.icon sx={{ fontSize: 14 }} />
                          )
                        }
                        sx={{
                          fontSize: 11,
                          fontWeight: 600,
                          textTransform: 'none',
                          py: 0.75,
                          borderRadius: '8px',
                          justifyContent: 'flex-start',
                          ...(isDanger && {
                            borderColor: 'rgba(239,68,68,0.4)',
                            color: '#ef4444',
                            '&:hover': { borderColor: '#ef4444', bgcolor: 'rgba(239,68,68,0.06)' },
                            '&.Mui-disabled': { borderColor: borderColor, color: textSecondary },
                          }),
                        }}
                      >
                        {isPending ? `Switching… ${hotspotCountdown}s` : cmd.label}
                      </Button>
                      <Typography sx={{ fontSize: 10, color: textSecondary, mt: 0.4, px: 0.5 }}>
                        {desc}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>

              {/* Activity log */}
              <LogConsole
                logs={activityLog}
                includeStoreLogs={false}
                darkMode={darkMode}
                compact
                maxHeight={120}
                emptyMessage="Send a command to see responses here..."
              />

              {/* Journal link */}
              <Typography
                onClick={journalActive ? handleJournalStop : handleJournalStart}
                sx={{
                  fontSize: 11,
                  color: journalActive ? '#22c55e' : 'primary.main',
                  textAlign: 'center',
                  textDecoration: 'underline',
                  cursor: bleStatus === 'connected' ? 'pointer' : 'default',
                  opacity: bleStatus === 'connected' ? 1 : 0.4,
                }}
              >
                {journalActive ? 'Stop Reachy Mini logs' : 'Reachy Mini logs'}
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
    </FullscreenOverlay>
  );
}
