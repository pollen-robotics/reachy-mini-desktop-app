import React, { useReducer, useRef, useEffect, useCallback } from 'react';
import { Box, Typography, useTheme, alpha } from '@mui/material';
import CameraAltOutlinedIcon from '@mui/icons-material/CameraAltOutlined';
import MicNoneOutlinedIcon from '@mui/icons-material/MicNoneOutlined';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import useAppStore from '../../store/useAppStore';
import { usePermissions } from '../../hooks/system';
import { logInfo, logError } from '../../utils/logging/logger';
import { isMacOS } from '../../utils/platform';
import LogConsole from '@components/LogConsole';
import LockedReachy from '../../assets/locked-reachy.svg';
import SleepingReachy from '../../assets/sleeping-reachy.svg';

/**
 * Permission Card Component
 * Square card similar to ConnectionCard in FindingRobotView
 */
const PermissionCard = ({ icon: Icon, label, subtitle, granted, onClick, darkMode }) => {
  const theme = useTheme();
  // Colors - primary from theme for interactive, success (green) for granted
  const primaryColor = theme.palette.primary.main;
  const successColor = theme.palette.success?.main || '#22c55e';

  return (
    <Box
      onClick={onClick}
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
        borderColor: granted ? successColor : primaryColor,
        bgcolor: granted
          ? alpha(successColor, darkMode ? 0.1 : 0.05)
          : alpha(primaryColor, darkMode ? 0.1 : 0.05),
        cursor: granted ? 'default' : 'pointer',
        transition: 'all 0.2s ease',
        flex: 1,
        minWidth: 110,
        minHeight: 110,
        '&:hover': granted
          ? {}
          : {
              bgcolor: alpha(primaryColor, darkMode ? 0.15 : 0.1),
            },
      }}
    >
      {/* Granted checkmark - top right */}
      {granted && (
        <Box
          sx={{
            position: 'absolute',
            top: 6,
            right: 6,
            width: 16,
            height: 16,
            borderRadius: '50%',
            bgcolor: darkMode ? 'rgba(26, 26, 26, 1)' : 'rgba(253, 252, 250, 1)',
            border: `1.5px solid ${successColor}`,
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
          <CheckRoundedIcon sx={{ fontSize: 10, color: successColor }} />
        </Box>
      )}

      {/* Icon */}
      <Icon
        sx={{
          fontSize: 28,
          color: granted ? successColor : primaryColor,
        }}
      />

      {/* Label */}
      <Typography
        sx={{
          fontSize: 13,
          fontWeight: 600,
          color: granted ? successColor : primaryColor,
          textAlign: 'center',
          lineHeight: 1.2,
        }}
      >
        {label}
      </Typography>

      {/* Subtitle */}
      {subtitle && (
        <Typography
          sx={{
            fontSize: 10,
            fontWeight: 400,
            color: granted ? successColor : alpha(primaryColor, 0.7),
            textAlign: 'center',
            lineHeight: 1.1,
          }}
        >
          {subtitle}
        </Typography>
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
    refresh: refreshPermissions,
  } = usePermissions({ checkInterval: 2000 });

  const [state, dispatch] = useReducer(permissionsViewReducer, {
    cameraRequested: false,
    microphoneRequested: false,
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
            logError(message);
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
        const errorMsg = error?.message || error?.toString() || 'Unknown plugin error';
        logError(`[Permissions] ❌ Plugin error: ${errorMsg}`);
      }
    };
    testPlugin();
  }, []);

  // Generic permission request handler
  const requestPermission = useCallback(
    async type => {
      if (!isMacOS()) {
        logInfo(`[Permissions] ℹ️ Non-macOS platform - permissions handled automatically`);
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
        const errorMsg = error?.message || error?.toString() || 'Unknown error';
        logError(`[Permissions] ${type}: ${errorMsg}`);
        try {
          await invoke(`open_${type}_settings`);
        } catch (settingsError) {
          const settingsErrorMsg =
            settingsError?.message || settingsError?.toString() || 'Unknown error';
          logError(`[Permissions] ❌ Failed to open settings: ${settingsErrorMsg}`);
        }
      }
    },
    [refreshPermissions]
  );

  const openSettings = useCallback(async type => {
    if (!isMacOS()) {
      logInfo(`[Permissions] ℹ️ Non-macOS platform - no settings to open`);
      return;
    }

    try {
      await invoke(`open_${type}_settings`);
    } catch (error) {
      const errorMsg = error?.message || error?.toString() || 'Unknown error';
      logError(`[Permissions] ❌ Failed to open ${type} settings: ${errorMsg}`);
    }
  }, []);

  // Track permission changes for logging
  const prevCameraGranted = useRef(null);
  const prevMicrophoneGranted = useRef(null);

  useEffect(() => {
    if (prevCameraGranted.current === null) {
      prevCameraGranted.current = cameraGranted;
      prevMicrophoneGranted.current = microphoneGranted;
      return;
    }

    if (!prevCameraGranted.current && cameraGranted) {
      logInfo('✅ Camera permission granted');
    }
    if (!prevMicrophoneGranted.current && microphoneGranted) {
      logInfo('✅ Microphone permission granted');
    }

    prevCameraGranted.current = cameraGranted;
    prevMicrophoneGranted.current = microphoneGranted;
  }, [cameraGranted, microphoneGranted]);

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
      {/* LogConsole at bottom */}
      <Box
        sx={{
          position: 'fixed',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'calc(100% - 32px)',
          maxWidth: '420px',
          zIndex: 1000,
          opacity: 0.2,
          transition: 'opacity 0.3s ease-in-out',
          '&:hover': { opacity: 1 },
        }}
      >
        <LogConsole
          logs={[]}
          darkMode={darkMode}
          includeStoreLogs={true}
          compact={true}
          showTimestamp={false}
          lines={3}
          sx={{
            bgcolor: darkMode ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.7)',
            border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.12)'}`,
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
        />
      </Box>

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

            {/* Permission cards - 2 square cards */}
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                gap: 1.5,
                width: '100%',
                maxWidth: 280,
                mb: 2.5,
              }}
            >
              <PermissionCard
                icon={CameraAltOutlinedIcon}
                label="Camera"
                subtitle={cameraGranted ? 'Granted' : 'Required'}
                granted={cameraGranted}
                onClick={() => {
                  if (!cameraGranted) {
                    state.cameraRequested ? openSettings('camera') : requestPermission('camera');
                  }
                }}
                darkMode={darkMode}
              />

              <PermissionCard
                icon={MicNoneOutlinedIcon}
                label="Microphone"
                subtitle={microphoneGranted ? 'Granted' : 'Required'}
                granted={microphoneGranted}
                onClick={() => {
                  if (!microphoneGranted) {
                    state.microphoneRequested
                      ? openSettings('microphone')
                      : requestPermission('microphone');
                  }
                }}
                darkMode={darkMode}
              />
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
