import React, { useReducer, useRef, useEffect, useCallback } from 'react';
import { Box, Typography, useTheme, alpha } from '@mui/material';
import CameraAltOutlinedIcon from '@mui/icons-material/CameraAltOutlined';
import MicNoneOutlinedIcon from '@mui/icons-material/MicNoneOutlined';
import LanOutlinedIcon from '@mui/icons-material/LanOutlined';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import BluetoothOutlinedIcon from '@mui/icons-material/BluetoothOutlined';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import KeyboardArrowRightRoundedIcon from '@mui/icons-material/KeyboardArrowRightRounded';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import useAppStore from '../../store/useAppStore';
import { usePermissions } from '../../hooks/system';

import { isMacOS } from '../../utils/platform';
import LockedReachy from '../../assets/locked-reachy.svg';
import SleepingReachy from '../../assets/sleeping-reachy.svg';

/**
 * Permission Row Component - horizontal list item design that scales to any number of permissions
 */
const PermissionRow = ({ icon: Icon, label, subtitle, granted, onClick, darkMode }) => {
  const theme = useTheme();
  const primaryColor = theme.palette.primary.main;
  const successColor = theme.palette.success?.main || '#22c55e';
  const rowColor = granted ? successColor : primaryColor;
  const isClickable = !granted;

  return (
    <Box
      onClick={isClickable ? onClick : undefined}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        px: 1.5,
        py: 0.875,
        borderRadius: '10px',
        border: '1px solid',
        borderColor: alpha(rowColor, granted ? 0.4 : 0.35),
        bgcolor: alpha(rowColor, darkMode ? 0.08 : 0.04),
        cursor: isClickable ? 'pointer' : 'default',
        transition: 'all 0.2s ease',
        '&:hover': isClickable ? { bgcolor: alpha(rowColor, darkMode ? 0.14 : 0.09) } : {},
      }}
    >
      {/* Icon badge */}
      <Box
        sx={{
          width: 34,
          height: 34,
          borderRadius: '8px',
          bgcolor: alpha(rowColor, darkMode ? 0.18 : 0.12),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon sx={{ fontSize: 17, color: rowColor }} />
      </Box>

      {/* Labels */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 12, fontWeight: 600, color: rowColor, lineHeight: 1.25 }}>
          {label}
        </Typography>
        {subtitle && (
          <Typography
            sx={{
              fontSize: 10,
              color: granted ? alpha(successColor, 0.8) : alpha(primaryColor, 0.6),
              lineHeight: 1.25,
            }}
          >
            {subtitle}
          </Typography>
        )}
      </Box>

      {/* Right indicator */}
      {granted ? (
        <Box
          sx={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            bgcolor: alpha(successColor, 0.15),
            border: `1.5px solid ${successColor}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            animation: 'checkmarkPop 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
            '@keyframes checkmarkPop': {
              '0%': { transform: 'scale(0)', opacity: 0 },
              '100%': { transform: 'scale(1)', opacity: 1 },
            },
          }}
        >
          <CheckRoundedIcon sx={{ fontSize: 11, color: successColor }} />
        </Box>
      ) : (
        <KeyboardArrowRightRoundedIcon
          sx={{ fontSize: 18, color: alpha(primaryColor, 0.45), flexShrink: 0 }}
        />
      )}
    </Box>
  );
};

/**
 * Reducer for managing permissions view state
 */
const permissionsViewReducer = (state, action) => {
  switch (action.type) {
    case 'SET_CAMERA_REQUESTED':
      return { ...state, cameraRequested: true };
    case 'SET_MICROPHONE_REQUESTED':
      return { ...state, microphoneRequested: true };
    case 'SET_LOCAL_NETWORK_REQUESTED':
      return { ...state, localNetworkRequested: true };
    case 'SET_LOCATION_REQUESTED':
      return { ...state, locationRequested: true };
    case 'SET_BLUETOOTH_REQUESTED':
      return { ...state, bluetoothRequested: true };
    default:
      return state;
  }
};

/**
 * PermissionsRequiredView
 * Blocks the app until permissions are granted
 */
export default function PermissionsRequiredView({ isRestarting: externalIsRestarting }) {
  const { darkMode } = useAppStore();
  const {
    cameraGranted,
    microphoneGranted,
    localNetworkGranted,
    locationGranted,
    bluetoothGranted,
    refresh: refreshPermissions,
  } = usePermissions({ checkInterval: 2000 });

  const [state, dispatch] = useReducer(permissionsViewReducer, {
    cameraRequested: false,
    microphoneRequested: false,
    localNetworkRequested: false,
    locationRequested: false,
    bluetoothRequested: false,
    isRestarting: false,
    restartStarted: false,
  });

  const permissionPollingRef = useRef(null);
  const unlistenRustLogRef = useRef(null);

  // Cleanup polling interval on unmount
  useEffect(() => {
    return () => {
      if (permissionPollingRef.current) {
        clearInterval(permissionPollingRef.current);
        permissionPollingRef.current = null;
      }
    };
  }, []);

  // Listen to Rust logs
  useEffect(() => {
    let isMounted = true;

    const setupRustLogListener = async () => {
      if (unlistenRustLogRef.current) {
        unlistenRustLogRef.current();
        unlistenRustLogRef.current = null;
      }

      try {
        const unlisten = await listen('rust-log', event => {
          if (!isMounted) return;
          const message =
            typeof event.payload === 'string' ? event.payload : event.payload?.toString() || '';
          if (message.includes('❌') || message.includes('error') || message.includes('Error')) {
            // Error detected in Rust log
          }
        });

        if (isMounted) {
          unlistenRustLogRef.current = unlisten;
        } else {
          unlisten();
        }
      } catch (error) {
        console.error('Failed to setup rust-log listener:', error);
      }
    };

    setupRustLogListener();

    return () => {
      isMounted = false;
      if (unlistenRustLogRef.current) {
        unlistenRustLogRef.current();
        unlistenRustLogRef.current = null;
      }
    };
  }, []);

  // Test plugin availability on mount (macOS only)
  useEffect(() => {
    if (!isMacOS()) return;
    const testPlugin = async () => {
      try {
        await invoke('plugin:macos-permissions|check_camera_permission');
      } catch (error) {
        // Plugin error - non-critical
      }
    };
    testPlugin();
  }, []);

  // Generic permission request handler for camera/microphone (uses plugin)
  const requestPermission = useCallback(
    async type => {
      if (!isMacOS()) {
        return;
      }

      try {
        const checkCommand = `plugin:macos-permissions|check_${type}_permission`;
        const requestCommand = `plugin:macos-permissions|request_${type}_permission`;
        const settingsCommand = `open_${type}_settings`;

        const currentStatus = await invoke(checkCommand);
        if (currentStatus === true) return;

        const result = await invoke(requestCommand);

        if (type === 'camera') {
          dispatch({ type: 'SET_CAMERA_REQUESTED' });
        } else if (type === 'microphone') {
          dispatch({ type: 'SET_MICROPHONE_REQUESTED' });
        }

        if (result === null) {
          if (permissionPollingRef.current) {
            clearInterval(permissionPollingRef.current);
          }

          let checkCount = 0;
          const maxChecks = 20;

          permissionPollingRef.current = setInterval(async () => {
            checkCount++;
            await refreshPermissions();

            try {
              const status = await invoke(checkCommand);
              if (status === true) {
                if (permissionPollingRef.current) {
                  clearInterval(permissionPollingRef.current);
                  permissionPollingRef.current = null;
                }
                await refreshPermissions();
              }
            } catch (error) {
              // Ignore errors during polling
            }

            if (checkCount >= maxChecks) {
              if (permissionPollingRef.current) {
                clearInterval(permissionPollingRef.current);
                permissionPollingRef.current = null;
              }
            }
          }, 500);

          return;
        }

        if (result === false) {
          await invoke(settingsCommand);
        }
      } catch (error) {
        try {
          await invoke(`open_${type}_settings`);
        } catch {
          // Failed to open settings
        }
      }
    },
    [refreshPermissions]
  );

  // Local Network permission request handler (uses custom Rust command)
  // Flow mirrors Camera/Microphone: request -> poll -> detect granted/denied.
  // The Rust side returns None on EPERM because macOS may deny the operation
  // immediately while the privacy dialog is still visible. We poll until the
  // user makes a choice instead of opening System Settings prematurely.
  const requestLocalNetworkPermission = useCallback(async () => {
    if (!isMacOS()) {
      return;
    }

    try {
      const result = await invoke('request_local_network_permission');
      dispatch({ type: 'SET_LOCAL_NETWORK_REQUESTED' });

      if (result === true) {
        await refreshPermissions();
        return;
      }

      // null or false: dialog may be showing, poll for the user's choice
      if (permissionPollingRef.current) {
        clearInterval(permissionPollingRef.current);
      }

      let checkCount = 0;
      const maxChecks = 20;

      permissionPollingRef.current = setInterval(async () => {
        checkCount++;

        try {
          const status = await invoke('check_local_network_permission');
          if (status === true) {
            if (permissionPollingRef.current) {
              clearInterval(permissionPollingRef.current);
              permissionPollingRef.current = null;
            }
            await refreshPermissions();
          } else if (status === false) {
            // User denied - stop polling, open System Settings
            if (permissionPollingRef.current) {
              clearInterval(permissionPollingRef.current);
              permissionPollingRef.current = null;
            }
            await refreshPermissions();
            await invoke('open_local_network_settings');
          }
        } catch (error) {
          // Ignore errors during polling
        }

        if (checkCount >= maxChecks) {
          if (permissionPollingRef.current) {
            clearInterval(permissionPollingRef.current);
            permissionPollingRef.current = null;
          }
          await refreshPermissions();
        }
      }, 500);
    } catch (error) {
      try {
        await invoke('open_local_network_settings');
      } catch {
        // Failed to open settings
      }
    }
  }, [refreshPermissions]);

  // Location permission request handler (uses custom Rust command)
  const requestLocationPermission = useCallback(async () => {
    if (!isMacOS()) return;

    try {
      const result = await invoke('request_location_permission');
      dispatch({ type: 'SET_LOCATION_REQUESTED' });

      if (result === true) {
        await refreshPermissions();
        return;
      }

      // null = dialog pending, poll for user's choice
      if (permissionPollingRef.current) {
        clearInterval(permissionPollingRef.current);
      }

      let checkCount = 0;
      const maxChecks = 20;

      permissionPollingRef.current = setInterval(async () => {
        checkCount++;

        try {
          const status = await invoke('check_location_permission');
          if (status === true) {
            if (permissionPollingRef.current) {
              clearInterval(permissionPollingRef.current);
              permissionPollingRef.current = null;
            }
            await refreshPermissions();
          } else if (status === false) {
            if (permissionPollingRef.current) {
              clearInterval(permissionPollingRef.current);
              permissionPollingRef.current = null;
            }
            await refreshPermissions();
            await invoke('open_location_settings');
          }
        } catch (error) {
          // Ignore errors during polling
        }

        if (checkCount >= maxChecks) {
          if (permissionPollingRef.current) {
            clearInterval(permissionPollingRef.current);
            permissionPollingRef.current = null;
          }
          await refreshPermissions();
        }
      }, 500);
    } catch (error) {
      try {
        await invoke('open_location_settings');
      } catch {
        // Failed to open settings
      }
    }
  }, [refreshPermissions]);

  // Bluetooth permission request handler (uses custom Rust command)
  const requestBluetoothPermission = useCallback(async () => {
    if (!isMacOS()) return;

    try {
      const result = await invoke('request_bluetooth_permission');
      dispatch({ type: 'SET_BLUETOOTH_REQUESTED' });

      if (result === true) {
        await refreshPermissions();
        return;
      }

      // null = dialog pending, poll for user's choice
      if (permissionPollingRef.current) {
        clearInterval(permissionPollingRef.current);
      }

      let checkCount = 0;
      const maxChecks = 20;

      permissionPollingRef.current = setInterval(async () => {
        checkCount++;

        try {
          const status = await invoke('check_bluetooth_permission');
          if (status === true) {
            if (permissionPollingRef.current) {
              clearInterval(permissionPollingRef.current);
              permissionPollingRef.current = null;
            }
            await refreshPermissions();
          } else if (status === false) {
            if (permissionPollingRef.current) {
              clearInterval(permissionPollingRef.current);
              permissionPollingRef.current = null;
            }
            await refreshPermissions();
            await invoke('open_bluetooth_settings');
          }
        } catch (error) {
          // Ignore errors during polling
        }

        if (checkCount >= maxChecks) {
          if (permissionPollingRef.current) {
            clearInterval(permissionPollingRef.current);
            permissionPollingRef.current = null;
          }
          await refreshPermissions();
        }
      }, 500);
    } catch (error) {
      try {
        await invoke('open_bluetooth_settings');
      } catch {
        // Failed to open settings
      }
    }
  }, [refreshPermissions]);

  const openSettings = useCallback(async type => {
    if (!isMacOS()) {
      return;
    }

    try {
      await invoke(`open_${type}_settings`);
    } catch (error) {
      // Failed to open settings
    }
  }, []);

  const bgColor = darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)';

  return (
    <Box
      sx={{
        width: '100vw',
        height: '100vh',
        background: bgColor,
        backdropFilter: 'blur(40px)',
        WebkitBackdropFilter: 'blur(40px)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
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
        {state.isRestarting || externalIsRestarting ? (
          <>
            {/* Restarting view */}
            <Box
              sx={{
                width: 140,
                height: 140,
                mb: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <img
                src={SleepingReachy}
                alt="Reachy Mini"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </Box>
            <Typography
              sx={{
                fontSize: 20,
                fontWeight: 600,
                color: darkMode ? '#f5f5f5' : '#333',
                mb: 0.25,
                textAlign: 'center',
              }}
            >
              Restarting...
            </Typography>
            <Typography
              sx={{ fontSize: 12, color: darkMode ? '#888' : '#666', textAlign: 'center', mb: 2.5 }}
            >
              All permissions granted. The app will restart in a moment.
            </Typography>
          </>
        ) : (
          <>
            {/* Normal permissions view */}
            <Box
              sx={{
                width: 140,
                height: 140,
                mb: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <img
                src={LockedReachy}
                alt="Reachy Mini"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </Box>

            <Typography
              sx={{
                fontSize: 20,
                fontWeight: 600,
                color: darkMode ? '#f5f5f5' : '#333',
                mb: 0.25,
                textAlign: 'center',
              }}
            >
              Access Required
            </Typography>

            <Typography
              sx={{ fontSize: 12, color: darkMode ? '#888' : '#666', textAlign: 'center', mb: 2.5 }}
            >
              Grant permissions to use Reachy
            </Typography>

            {/* Permission list */}
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                width: '100%',
                maxWidth: 300,
                mb: 2.5,
              }}
            >
              <PermissionRow
                icon={CameraAltOutlinedIcon}
                label="Camera"
                subtitle={cameraGranted ? 'Granted' : 'Required'}
                granted={cameraGranted}
                onClick={() => {
                  state.cameraRequested ? openSettings('camera') : requestPermission('camera');
                }}
                darkMode={darkMode}
              />

              <PermissionRow
                icon={MicNoneOutlinedIcon}
                label="Microphone"
                subtitle={microphoneGranted ? 'Granted' : 'Required'}
                granted={microphoneGranted}
                onClick={() => {
                  state.microphoneRequested
                    ? openSettings('microphone')
                    : requestPermission('microphone');
                }}
                darkMode={darkMode}
              />

              {/* Local Network - macOS Sequoia+ requires this permission for LAN communication */}
              {isMacOS() && (
                <PermissionRow
                  icon={LanOutlinedIcon}
                  label="Local Network"
                  subtitle={localNetworkGranted ? 'Granted' : 'Required'}
                  granted={localNetworkGranted}
                  onClick={() => {
                    state.localNetworkRequested
                      ? openSettings('local_network')
                      : requestLocalNetworkPermission();
                  }}
                  darkMode={darkMode}
                />
              )}

              {/* Location - macOS requires this for CoreWLAN to return WiFi SSIDs */}
              {isMacOS() && (
                <PermissionRow
                  icon={LocationOnOutlinedIcon}
                  label="Location"
                  subtitle={locationGranted ? 'Granted' : 'For WiFi detection'}
                  granted={locationGranted}
                  onClick={() => {
                    state.locationRequested
                      ? openSettings('location')
                      : requestLocationPermission();
                  }}
                  darkMode={darkMode}
                />
              )}

              {/* Bluetooth - macOS requires this for BLE-based WiFi setup */}
              {isMacOS() && (
                <PermissionRow
                  icon={BluetoothOutlinedIcon}
                  label="Bluetooth"
                  subtitle={bluetoothGranted ? 'Granted' : 'For BLE setup'}
                  granted={bluetoothGranted}
                  onClick={() => {
                    state.bluetoothRequested
                      ? openSettings('bluetooth')
                      : requestBluetoothPermission();
                  }}
                  darkMode={darkMode}
                />
              )}
            </Box>

            {/* Helper text */}
            <Typography sx={{ fontSize: 11, color: darkMode ? '#555' : '#aaa' }}>
              Click on a card to grant access
            </Typography>
          </>
        )}
      </Box>
    </Box>
  );
}
