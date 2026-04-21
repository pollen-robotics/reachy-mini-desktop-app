import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  CircularProgress,
  Select,
  MenuItem,
  IconButton,
  Menu,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  TextField,
  InputAdornment,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import type { SvgIconComponent } from '@mui/icons-material';
import UsbOutlinedIcon from '@mui/icons-material/UsbOutlined';
import PulseButton from '@components/PulseButton';
import WifiOutlinedIcon from '@mui/icons-material/WifiOutlined';
import ViewInArOutlinedIcon from '@mui/icons-material/ViewInArOutlined';
import PlayArrowOutlinedIcon from '@mui/icons-material/PlayArrowOutlined';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import useAppStore from '../../store/useAppStore';
import { useRobotDiscovery } from '../../hooks/system';
import { useConnection, ConnectionMode } from '../../hooks/useConnection';
import type { ConnectionMode as ConnectionModeType } from '../../types/robot';
import { useExternalDaemonProbe } from '../../hooks/daemon';
import { invoke } from '@tauri-apps/api/core';
import { useToast } from '../../hooks/useToast';
import { probeWifiHost, type WifiProbeResult } from '../../utils/probeWifiHost';
import reachyBuste from '../../assets/reachy-buste.png';

// LocalStorage key for persisting last connection mode
const LAST_CONNECTION_MODE_KEY = 'reachy-mini-last-connection-mode';

interface ConnectionCardProps {
  icon: SvgIconComponent;
  label: string;
  subtitle?: string | null;
  fullSubtitle?: string | null;
  available: boolean;
  selected: boolean;
  onClick?: () => void;
  disabled?: boolean;
  darkMode: boolean;
  alwaysAvailable?: boolean;
  betaTag?: boolean;
  scanning?: boolean;
}

/**
 * Connection card with icon, label, and status indicator
 */
function ConnectionCard({
  icon: Icon,
  label,
  subtitle,
  fullSubtitle = null,
  available,
  selected,
  onClick,
  disabled,
  darkMode,
  alwaysAvailable = false,
  betaTag = false,
  scanning = false,
}: ConnectionCardProps) {
  const isClickable = (available || alwaysAvailable) && !disabled;
  const isAvailable = available || alwaysAvailable;

  return (
    <Box
      onClick={isClickable ? onClick : undefined}
      sx={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0.5,
        p: 2,
        borderRadius: '12px',
        border: '1px solid',
        borderColor: selected
          ? 'primary.main'
          : darkMode
            ? 'rgba(255, 255, 255, 0.1)'
            : 'rgba(0, 0, 0, 0.08)',
        bgcolor: selected
          ? darkMode
            ? 'rgba(99, 102, 241, 0.1)'
            : 'rgba(99, 102, 241, 0.05)'
          : 'transparent',
        cursor: isClickable ? 'pointer' : 'default',
        opacity: isAvailable ? 1 : 0.5,
        transition: 'all 0.2s ease',
        flex: 1,
        minWidth: 110,
        minHeight: 110,
        '&:hover':
          isClickable && !selected
            ? {
                borderColor: darkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.15)',
                bgcolor: darkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
              }
            : {},
      }}
    >
      {/* Status indicator - top left (subtle circle) */}
      {!alwaysAvailable && !selected && (
        <Box
          sx={{
            position: 'absolute',
            top: 6,
            right: 6,
            width: 16,
            height: 16,
            borderRadius: '50%',
            bgcolor: darkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Box
            sx={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              bgcolor: available ? '#22c55e' : '#ef4444',
            }}
          />
        </Box>
      )}

      {/* Scanning spinner - top left, shown while actively searching */}
      {scanning && (
        <Box
          sx={{
            position: 'absolute',
            top: 7,
            left: 7,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <CircularProgress
            size={10}
            thickness={4}
            sx={{ color: darkMode ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)' }}
          />
        </Box>
      )}

      {/* Beta tag - top left for alwaysAvailable cards */}
      {betaTag && (
        <Box
          sx={{
            position: 'absolute',
            top: 6,
            left: 6,
            px: 0.5,
            py: 0.15,
            borderRadius: '4px',
            bgcolor: darkMode ? 'rgba(255, 149, 0, 0.15)' : 'rgba(255, 149, 0, 0.1)',
            border: `1px solid ${darkMode ? 'rgba(255, 149, 0, 0.3)' : 'rgba(255, 149, 0, 0.25)'}`,
          }}
        >
          <Typography
            sx={{
              fontSize: 8,
              fontWeight: 600,
              color: '#FF9500',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              lineHeight: 1,
            }}
          >
            beta
          </Typography>
        </Box>
      )}

      {/* Selection checkmark - top right (outlined) */}
      {selected && (
        <Box
          sx={{
            position: 'absolute',
            top: 6,
            right: 6,
            width: 16,
            height: 16,
            borderRadius: '50%',
            bgcolor: darkMode ? 'rgba(26, 26, 26, 1)' : 'rgba(253, 252, 250, 1)',
            border: '1.5px solid',
            borderColor: 'primary.main',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'checkmarkPop 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
            '@keyframes checkmarkPop': {
              '0%': { transform: 'scale(0)', opacity: 0 },
              '100%': { transform: 'scale(1)', opacity: 1 },
            },
          }}
        >
          <CheckRoundedIcon
            sx={{
              fontSize: 10,
              color: 'primary.main',
            }}
          />
        </Box>
      )}

      {/* Icon */}
      <Icon
        sx={{
          fontSize: 28,
          color: selected
            ? 'primary.main'
            : isAvailable
              ? darkMode
                ? '#e0e0e0'
                : '#444'
              : darkMode
                ? '#666'
                : '#999',
        }}
      />

      {/* Label */}
      <Typography
        sx={{
          fontSize: 13,
          fontWeight: selected ? 600 : 500,
          color: selected
            ? 'primary.main'
            : isAvailable
              ? darkMode
                ? '#e0e0e0'
                : '#444'
              : darkMode
                ? '#666'
                : '#999',
          textAlign: 'center',
          lineHeight: 1.2,
        }}
      >
        {label}
      </Typography>

      {/* Subtitle (port name, host, etc.) */}
      {subtitle && (
        <Typography
          title={fullSubtitle || undefined}
          sx={{
            fontSize: 10,
            fontWeight: 400,
            color: darkMode ? '#666' : '#999',
            textAlign: 'center',
            lineHeight: 1.1,
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            px: 0.5,
          }}
        >
          {subtitle}
        </Typography>
      )}
    </Box>
  );
}

/**
 * FindingRobotView - Main connection selection view
 * User selects connection type and clicks Start
 *
 * Uses useConnection hook for unified connection handling
 */
export default function FindingRobotView() {
  const { darkMode, setShowFirstTimeWifiSetup, setShowBluetoothSupportView, clearApps } =
    useAppStore();
  const { isScanning, usbRobot, wifiRobot, wifiRobots, selectWifiRobot } = useRobotDiscovery();
  const { connect, isConnecting, isDisconnecting } = useConnection();
  const [selectedMode, setSelectedMode] = useState<ConnectionModeType | null>(null);
  const [dots, setDots] = useState<string>('');
  const hasRestoredFromStorage = useRef<boolean>(false);
  const { showToast } = useToast();

  // Settings menu for environment reset
  const [settingsAnchor, setSettingsAnchor] = useState<HTMLElement | null>(null);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [pendingReset, setPendingReset] = useState<'apps' | 'full' | null>(null); // 'apps' | 'full' | null
  const [manualIp, setManualIp] = useState<string>('');

  const handleResetAppsVenv = useCallback(() => {
    setSettingsAnchor(null);
    setPendingReset('apps');
  }, []);

  const handleResetPythonEnv = useCallback(() => {
    setSettingsAnchor(null);
    setPendingReset('full');
  }, []);

  const confirmReset = useCallback(async () => {
    const type = pendingReset;
    setPendingReset(null);
    setIsResetting(true);
    try {
      if (type === 'apps') {
        await invoke('reset_apps_venv');
        clearApps();
        showToast('Apps environment reset successfully', 'success');
      } else {
        await invoke('reset_python_env');
        clearApps();
        showToast('Python environment reset successfully', 'success');
      }
    } catch (err) {
      showToast(`Failed: ${err}`, 'error');
    } finally {
      setIsResetting(false);
    }
  }, [pendingReset, showToast, clearApps]);

  // Block interactions during connection state changes
  const isBusy = isConnecting || isDisconnecting || isResetting;

  // Animated ellipsis dots
  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => (prev === '...' ? '' : prev + '.'));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // Robust external-daemon detection (see `useExternalDaemonProbe` for full
  // rationale). Three validation layers + hysteresis + visibility gating +
  // post-shutdown grace window, to avoid falsely labeling our own dying
  // daemon as "external".
  const { available: externalDaemonAvailable, probe: probeExternalDaemon } = useExternalDaemonProbe(
    { enabled: !isBusy }
  );

  const handleConnectExternal = useCallback(async () => {
    // Last-chance revalidation: the banner might be a few seconds stale, and
    // we don't want to hand off to a daemon that just died. If the probe
    // fails here, surface a toast instead of attempting a doomed connection.
    const stillAvailable = await probeExternalDaemon();
    if (!stillAvailable) {
      showToast('External daemon is no longer reachable.', 'error');
      return;
    }
    await connect(ConnectionMode.EXTERNAL);
  }, [probeExternalDaemon, connect, showToast]);

  /**
   * Pre-flight probe for a WiFi target. Returns true if the host answers like
   * a Reachy daemon; otherwise surfaces a tailored toast and returns false so
   * the caller bails without going through the 90s startup timeout.
   */
  const verifyWifiHost = useCallback(
    async (host: string): Promise<boolean> => {
      const result = await probeWifiHost(host);
      if (result.ok) return true;

      const messages: Record<Exclude<WifiProbeResult['reason'], null>, string> = {
        unreachable: `Cannot reach ${host}. Check the robot is powered on and on the same network.`,
        wrong_service: `${host} responded but does not look like a Reachy daemon.`,
        daemon_error: `The daemon at ${host} reported an error state. Restart the robot and try again.`,
      };
      const reason = result.reason ?? 'unreachable';
      showToast(messages[reason], 'error');
      return false;
    },
    [showToast]
  );

  // Restore last selected mode from localStorage on mount
  // Only run once, and only pre-select if that mode is currently available
  useEffect(() => {
    if (hasRestoredFromStorage.current || selectedMode || isBusy) return;

    try {
      const savedMode = localStorage.getItem(LAST_CONNECTION_MODE_KEY) as ConnectionModeType | null;
      if (savedMode) {
        // Only pre-select if the saved mode is available
        // 🧹 Don't pre-select Simulation if real USB is available (prevents confusion after crash)
        const isAvailable =
          (savedMode === ConnectionMode.USB && usbRobot.available) ||
          (savedMode === ConnectionMode.WIFI && wifiRobots.available) ||
          (savedMode === ConnectionMode.SIMULATION && !usbRobot.available);

        if (isAvailable) {
          setSelectedMode(savedMode);
          hasRestoredFromStorage.current = true;
        }
      }
    } catch (e) {
      // localStorage might not be available
    }
  }, [usbRobot.available, wifiRobots.available, selectedMode, isBusy]);

  // Auto-select USB if it becomes available and nothing selected (fallback if no saved preference)
  useEffect(() => {
    if (usbRobot.available && !selectedMode && !isBusy && !hasRestoredFromStorage.current) {
      setSelectedMode(ConnectionMode.USB);
    }
  }, [usbRobot.available, selectedMode, isBusy]);

  // Auto-select WiFi if it becomes available and nothing selected (and no USB, fallback)
  useEffect(() => {
    if (
      wifiRobots.available &&
      !selectedMode &&
      !usbRobot.available &&
      !isBusy &&
      !hasRestoredFromStorage.current
    ) {
      setSelectedMode(ConnectionMode.WIFI);
    }
  }, [wifiRobots.available, selectedMode, usbRobot.available, isBusy]);

  // Auto-deselect if selected mode becomes unavailable
  // USB/WiFi can become unavailable if cable is unplugged or network changes
  useEffect(() => {
    if (isBusy) return; // Don't deselect during connection

    if (selectedMode === ConnectionMode.USB && !usbRobot.available) {
      setSelectedMode(null);
    }
    if (selectedMode === ConnectionMode.WIFI && !wifiRobots.available) {
      setSelectedMode(null);
    }
    // Simulation is always available, no need to check
  }, [selectedMode, usbRobot.available, wifiRobots.available, isBusy]);

  // Save selected mode to localStorage when user makes a selection
  const handleSelectMode = useCallback((mode: ConnectionModeType) => {
    setSelectedMode(mode);
    try {
      localStorage.setItem(LAST_CONNECTION_MODE_KEY, mode);
    } catch (e) {
      // localStorage might not be available
    }
  }, []);

  /**
   * Handle Start button click
   * Uses unified connect() from useConnection - same API for all modes
   */
  const handleStart = useCallback(async () => {
    if (isBusy) return;
    if (!selectedMode && !manualIp.trim()) return;

    const connectWifi = async (host: string): Promise<void> => {
      if (!(await verifyWifiHost(host))) return;
      const ok = await connect(ConnectionMode.WIFI, { host });
      if (!ok) {
        // Pre-flight passed but the local proxy failed to bind (e.g. port
        // already held by another process). Surface it so the user can act.
        showToast(
          'Could not start the local proxy on port 8000. Close any other app using it and try again.',
          'error'
        );
      }
    };

    // Manual IP always takes priority - connect as WiFi regardless of selected mode
    if (manualIp.trim()) {
      await connectWifi(manualIp.trim());
      return;
    }

    // 🔌 Unified connection API - same for USB, WiFi, and Simulation
    switch (selectedMode) {
      case ConnectionMode.USB:
        await connect(ConnectionMode.USB, { portName: usbRobot.portName ?? undefined });
        break;
      case ConnectionMode.WIFI:
        {
          const host = wifiRobots.selectedRobot?.displayHost;
          if (!host) return;
          await connectWifi(host);
        }
        break;
      case ConnectionMode.SIMULATION:
        await connect(ConnectionMode.SIMULATION);
        break;
    }
  }, [
    selectedMode,
    isBusy,
    usbRobot,
    wifiRobots,
    manualIp,
    connect,
    verifyWifiHost,
    showToast,
  ]);

  const canStart =
    // Manual IP always allows starting (as WiFi)
    manualIp.trim() ||
    (selectedMode &&
      ((selectedMode === ConnectionMode.USB && usbRobot.available) ||
        (selectedMode === ConnectionMode.WIFI && wifiRobots.selectedRobot) ||
        selectedMode === ConnectionMode.SIMULATION));

  return (
    <Box
      sx={{
        width: '100vw',
        height: '100vh',
        background: darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)',
        backdropFilter: 'blur(40px)',
        WebkitBackdropFilter: 'blur(40px)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Settings gear icon (top-right) */}
      <IconButton
        onClick={(e: React.MouseEvent<HTMLButtonElement>) => setSettingsAnchor(e.currentTarget)}
        disabled={isResetting}
        sx={{
          position: 'absolute',
          top: 40,
          right: 12,
          zIndex: 10,
          color: darkMode ? '#666' : '#999',
          '&:hover': { color: darkMode ? '#aaa' : '#666' },
        }}
        size="small"
      >
        {isResetting ? (
          <CircularProgress size={18} sx={{ color: 'inherit' }} />
        ) : (
          <SettingsOutlinedIcon sx={{ fontSize: 18 }} />
        )}
      </IconButton>
      <Menu
        anchorEl={settingsAnchor}
        open={Boolean(settingsAnchor)}
        onClose={() => setSettingsAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: {
              bgcolor: darkMode ? 'rgba(32, 32, 32, 0.95)' : 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid',
              borderColor: darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
              borderRadius: '10px',
              boxShadow: darkMode
                ? '0 8px 32px rgba(0, 0, 0, 0.5)'
                : '0 8px 32px rgba(0, 0, 0, 0.08)',
              minWidth: 220,
              py: 0.5,
            },
          },
        }}
      >
        <Box sx={{ px: 1.5, pt: 0.75, pb: 0.75 }}>
          <Typography
            sx={{
              fontSize: 11,
              fontWeight: 500,
              color: darkMode ? '#777' : '#999',
              letterSpacing: '0.2px',
            }}
          >
            Local environment (USB &amp; Sim)
          </Typography>
        </Box>
        <MenuItem
          onClick={handleResetAppsVenv}
          sx={{
            fontSize: 12,
            fontWeight: 450,
            color: darkMode ? '#ccc' : '#444',
            borderRadius: '6px',
            mx: 0.5,
            px: 1,
            minHeight: 32,
            '&:hover': { bgcolor: darkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)' },
          }}
        >
          Reset apps environment
        </MenuItem>
        <MenuItem
          onClick={handleResetPythonEnv}
          sx={{
            fontSize: 12,
            fontWeight: 450,
            color: '#ef4444',
            borderRadius: '6px',
            mx: 0.5,
            px: 1,
            minHeight: 32,
            '&:hover': { bgcolor: darkMode ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.06)' },
          }}
        >
          Full environment reset
        </MenuItem>
      </Menu>

      {/* Reset confirmation dialog */}
      <Dialog
        open={pendingReset !== null}
        onClose={() => setPendingReset(null)}
        slotProps={{
          backdrop: {
            sx: {
              bgcolor: darkMode ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.2)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
            },
          },
        }}
        PaperProps={{
          sx: {
            bgcolor: darkMode ? 'rgba(32, 32, 32, 0.95)' : 'rgba(255, 255, 255, 0.97)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid',
            borderColor: darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
            borderRadius: '14px',
            boxShadow: darkMode
              ? '0 16px 48px rgba(0, 0, 0, 0.5)'
              : '0 16px 48px rgba(0, 0, 0, 0.1)',
            maxWidth: 340,
            p: 1,
          },
        }}
      >
        <DialogTitle
          sx={{
            fontWeight: 600,
            fontSize: 16,
            color: darkMode ? '#f5f5f5' : '#222',
            pb: 0.5,
          }}
        >
          {pendingReset === 'full' ? 'Full environment reset?' : 'Reset apps environment?'}
        </DialogTitle>
        <DialogContent>
          <DialogContentText
            sx={{
              color: darkMode ? '#999' : '#666',
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            {pendingReset === 'full'
              ? 'This will delete all Python files and require a full re-setup. It may take a few minutes.'
              : 'All installed apps will need to be reinstalled.'}
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 1.5, gap: 1 }}>
          <Button
            onClick={() => setPendingReset(null)}
            sx={{
              color: darkMode ? '#999' : '#666',
              fontSize: 12,
              fontWeight: 500,
              textTransform: 'none',
              borderRadius: '8px',
              px: 2,
              '&:hover': {
                bgcolor: darkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
              },
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={confirmReset}
            sx={{
              color: '#fff',
              bgcolor: '#ef4444',
              fontSize: 12,
              fontWeight: 600,
              textTransform: 'none',
              borderRadius: '8px',
              px: 2,
              '&:hover': { bgcolor: '#dc2626' },
            }}
          >
            Reset
          </Button>
        </DialogActions>
      </Dialog>

      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          position: 'relative',
          zIndex: 2,
          px: 4,
        }}
      >
        {/* Reachy Buste */}
        <Box
          sx={{
            width: 180,
            height: 180,
            mb: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <img
            src={reachyBuste}
            alt="Reachy Mini"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
            }}
          />
        </Box>

        {/* Title */}
        <Typography
          sx={{
            fontSize: 26,
            fontWeight: 600,
            color: darkMode ? '#f5f5f5' : '#333',
            mb: 0.5,
            textAlign: 'center',
          }}
        >
          Connect to Reachy
        </Typography>

        {/* Subtitle - scanning status */}
        <Typography
          sx={{
            fontSize: 14,
            color: darkMode ? '#888' : '#666',
            textAlign: 'center',
            mb: 2.5,
            minHeight: 20,
          }}
        >
          {isScanning
            ? `Looking for robots${dots}`
            : usbRobot.available || wifiRobots.available
              ? 'Choose how to connect'
              : 'No robot detected'}
        </Typography>

        {/* External daemon banner */}
        {externalDaemonAvailable && !isBusy && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              maxWidth: 380,
              mb: 1.5,
              px: 2,
              py: 1,
              borderRadius: '10px',
              bgcolor: darkMode ? 'rgba(99, 102, 241, 0.08)' : 'rgba(99, 102, 241, 0.05)',
              border: '1px solid',
              borderColor: darkMode ? 'rgba(99, 102, 241, 0.25)' : 'rgba(99, 102, 241, 0.2)',
            }}
          >
            <Typography
              sx={{
                fontSize: 12,
                fontWeight: 500,
                color: darkMode ? '#c4c6f7' : '#5b5fc7',
              }}
            >
              External daemon detected on localhost:8000
            </Typography>
            <Box
              component="button"
              onClick={handleConnectExternal}
              sx={{
                ml: 1.5,
                px: 1.5,
                py: 0.5,
                borderRadius: '6px',
                border: '1px solid',
                borderColor: 'primary.main',
                bgcolor: 'transparent',
                color: 'primary.main',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                '&:hover': {
                  bgcolor: darkMode ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.08)',
                },
              }}
            >
              Connect
            </Box>
          </Box>
        )}

        {/* Connection options - 3 cards */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            gap: 1.5,
            width: '100%',
            maxWidth: 380,
            mb: 2.5,
          }}
        >
          <ConnectionCard
            icon={UsbOutlinedIcon}
            label="Reachy Lite"
            subtitle={usbRobot.available ? usbRobot.portName?.split('/').pop() : null}
            fullSubtitle={usbRobot.available ? usbRobot.portName : null}
            available={usbRobot.available}
            selected={selectedMode === ConnectionMode.USB}
            onClick={() => usbRobot.available && handleSelectMode(ConnectionMode.USB)}
            disabled={isBusy}
            darkMode={darkMode}
          />

          <ConnectionCard
            icon={WifiOutlinedIcon}
            label="Reachy WiFi"
            subtitle={
              wifiRobots.available
                ? wifiRobots.robots.length > 1
                  ? `${wifiRobots.robots.length} robots`
                  : wifiRobot.host
                : null
            }
            fullSubtitle={wifiRobot.available ? wifiRobot.host : null}
            available={wifiRobots.available}
            selected={selectedMode === ConnectionMode.WIFI}
            onClick={() => wifiRobots.available && handleSelectMode(ConnectionMode.WIFI)}
            disabled={isBusy}
            darkMode={darkMode}
            scanning={isScanning}
          />

          <ConnectionCard
            icon={ViewInArOutlinedIcon}
            label="Simulation"
            subtitle="Beta"
            available={true}
            alwaysAvailable={true}
            selected={selectedMode === ConnectionMode.SIMULATION}
            onClick={() => handleSelectMode(ConnectionMode.SIMULATION)}
            disabled={isBusy}
            darkMode={darkMode}
          />
        </Box>

        {/* WiFi robot selector - shown when WiFi selected and 2+ robots */}
        {selectedMode === ConnectionMode.WIFI && wifiRobots.robots.length > 1 && (
          <Select
            value={wifiRobots.selectedRobot?.ip || ''}
            onChange={(e: SelectChangeEvent<string>) => {
              const robot = wifiRobots.robots.find(r => r.ip === e.target.value);
              if (robot) selectWifiRobot(robot);
            }}
            displayEmpty
            size="small"
            sx={{
              width: '100%',
              maxWidth: 380,
              mb: 2.5,
              fontSize: 13,
              color: darkMode ? '#e0e0e0' : '#333',
              '.MuiOutlinedInput-notchedOutline': {
                borderColor: darkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.12)',
              },
              '&:hover .MuiOutlinedInput-notchedOutline': {
                borderColor: darkMode ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.2)',
              },
              '.MuiSvgIcon-root': {
                color: darkMode ? '#888' : '#666',
              },
            }}
            MenuProps={{
              PaperProps: {
                sx: {
                  bgcolor: darkMode ? '#2a2a2a' : '#fff',
                  color: darkMode ? '#e0e0e0' : '#333',
                },
              },
            }}
          >
            <MenuItem value="" disabled>
              Select a robot...
            </MenuItem>
            {wifiRobots.robots.map(robot => (
              <MenuItem key={robot.ip} value={robot.ip}>
                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 500 }}>{robot.name}</Typography>
                  <Typography sx={{ fontSize: 11, color: darkMode ? '#888' : '#999' }}>
                    {robot.displayHost}
                  </Typography>
                </Box>
              </MenuItem>
            ))}
          </Select>
        )}

        {/* Manual IP entry - always visible for WiFi connection */}
        <TextField
          value={manualIp}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            setManualIp(e.target.value);
            // Auto-select WiFi mode when user starts typing an IP
            if (e.target.value.trim() && selectedMode !== ConnectionMode.WIFI) {
              handleSelectMode(ConnectionMode.WIFI);
            }
          }}
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter' && manualIp.trim()) {
              if (selectedMode !== ConnectionMode.WIFI) {
                handleSelectMode(ConnectionMode.WIFI);
              }
              handleStart();
            }
          }}
          placeholder="Connect by IP address..."
          size="small"
          variant="outlined"
          disabled={isBusy}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <WifiOutlinedIcon sx={{ fontSize: 16, color: darkMode ? '#555' : '#bbb' }} />
              </InputAdornment>
            ),
          }}
          sx={{
            width: '100%',
            maxWidth: 380,
            mb: 2.5,
            '& .MuiOutlinedInput-root': {
              fontSize: 13,
              color: darkMode ? '#e0e0e0' : '#333',
              bgcolor: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
              borderRadius: '10px',
              '& fieldset': {
                borderColor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
              },
              '&:hover fieldset': {
                borderColor: darkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)',
              },
              '&.Mui-focused fieldset': {
                borderColor: '#FF9500',
                borderWidth: 1,
              },
            },
            '& .MuiInputBase-input::placeholder': {
              color: darkMode ? '#555' : '#bbb',
              opacity: 1,
            },
          }}
        />

        {/* Start Button - Primary Outlined */}
        <PulseButton
          onClick={handleStart}
          disabled={!canStart || isBusy}
          endIcon={
            isConnecting || isDisconnecting ? (
              <CircularProgress size={18} sx={{ color: 'inherit' }} />
            ) : (
              <PlayArrowOutlinedIcon sx={{ fontSize: 22 }} />
            )
          }
          darkMode={darkMode}
          sx={{ minWidth: 140, minHeight: 44 }}
        >
          {isConnecting ? 'Connecting...' : isDisconnecting ? 'Stopping...' : 'Start'}
        </PulseButton>

        {/* Setup / troubleshooting links */}
        <Box
          sx={{
            position: 'absolute',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            textAlign: 'center',
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            whiteSpace: 'nowrap',
          }}
        >
          <Box
            component="span"
            onClick={() => setShowFirstTimeWifiSetup(true)}
            sx={{
              fontSize: 12,
              color: 'primary.main',
              cursor: 'pointer',
              fontWeight: 500,
              textDecoration: 'underline',
            }}
          >
            First time WiFi setup
          </Box>
          <Box
            component="span"
            sx={{
              fontSize: 12,
              color: 'text.secondary',
              userSelect: 'none',
            }}
          >
            ·
          </Box>
          <Box
            component="span"
            onClick={() => setShowBluetoothSupportView(true)}
            sx={{
              fontSize: 12,
              color: 'primary.main',
              cursor: 'pointer',
              fontWeight: 500,
              textDecoration: 'underline',
            }}
          >
            Troubleshooting
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
