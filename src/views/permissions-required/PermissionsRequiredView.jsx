import React, { useReducer } from 'react';
import { Box, Typography, Stack } from '@mui/material';
import CameraAltOutlinedIcon from '@mui/icons-material/CameraAltOutlined';
import PulseButton from '@components/PulseButton';
import MicNoneOutlinedIcon from '@mui/icons-material/MicNoneOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
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
 * Reusable card for displaying permission status and actions
 */
const PermissionCard = ({ 
  icon: Icon, 
  title, 
  granted, 
  requested, 
  onRequest, 
  onOpenSettings, 
  darkMode 
}) => {
  return (
    <Box
      sx={{
        width: '50%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 3,
        borderRadius: 2,
        backgroundColor: granted
          ? (darkMode ? 'rgba(34, 197, 94, 0.06)' : 'rgba(34, 197, 94, 0.04)')
          : 'transparent',
        border: granted
          ? `1px solid ${darkMode ? 'rgba(34, 197, 94, 0.5)' : 'rgba(34, 197, 94, 0.4)'}`
          : `2px dashed ${darkMode ? '#555' : '#ccc'}`,
        transition: 'all 0.3s ease',
      }}
    >
      <Icon
        sx={{
          fontSize: 20,
          color: granted
            ? (darkMode ? '#22c55e' : '#16a34a')
            : (darkMode ? '#666' : '#999'),
          mb: 1.5,
          transition: 'color 0.3s ease',
        }}
      />
      <Typography
        variant="body1"
        sx={{
          fontWeight: 600,
          color: granted
            ? (darkMode ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.85)')
            : (darkMode ? '#fff' : '#1a1a1a'),
          mb: 2,
          textAlign: 'center',
        }}
      >
        {title}
      </Typography>
      {granted ? (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 0.75,
            width: '100%',
            px: 2,
            py: 0.75,
            borderRadius: '10px',
            bgcolor: 'transparent',
            border: `1px solid ${darkMode ? 'rgba(34, 197, 94, 0.5)' : 'rgba(34, 197, 94, 0.4)'}`,
          }}
        >
          <CheckCircleOutlinedIcon
            sx={{
              fontSize: 16,
              color: darkMode ? '#22c55e' : '#16a34a',
            }}
          />
          <Typography
            sx={{
              fontSize: 11,
              fontWeight: 600,
              color: darkMode ? '#22c55e' : '#16a34a',
              textTransform: 'none',
            }}
          >
            Granted
          </Typography>
        </Box>
      ) : (
        <PulseButton
          onClick={requested ? onOpenSettings : onRequest}
          darkMode={darkMode}
          size="small"
          fullWidth
        >
          {requested ? 'Open Settings' : 'Ask Access'}
        </PulseButton>
      )}
    </Box>
  );
};

/**
 * Reducer for managing permissions view state
 * Handles permission requests, restart flow, and UI state
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
 * Uses usePermissions hook for real-time detection (checks every 2 seconds)
 */
export default function PermissionsRequiredView({ isRestarting: externalIsRestarting }) {
  const { darkMode } = useAppStore();
  // Use the hook for real-time permission detection
  const { cameraGranted, microphoneGranted, refresh: refreshPermissions } = usePermissions({ checkInterval: 2000 });
  
  const [state, dispatch] = useReducer(permissionsViewReducer, {
    cameraRequested: false,
    microphoneRequested: false,
    isRestarting: false,
    restartStarted: false,
  });

  // Listen to Rust logs from backend (only show errors)
  React.useEffect(() => {
    let unlistenRustLog;
    
    const setupRustLogListener = async () => {
      try {
        unlistenRustLog = await listen('rust-log', (event) => {
          const message = typeof event.payload === 'string' 
            ? event.payload 
            : event.payload?.toString() || '';
          
          // Only show errors from Rust backend
          if (message.includes("❌") || message.includes("error") || message.includes("Error")) {
            logError(message);
          }
        });
      } catch (error) {
        console.error('Failed to setup rust-log listener:', error);
      }
    };
    
    setupRustLogListener();
    
    return () => {
      if (unlistenRustLog) {
        unlistenRustLog();
      }
    };
  }, []);

  // Test plugin availability on mount (silent) - macOS only
  React.useEffect(() => {
    if (!isMacOS()) {
      return; // Skip on non-macOS platforms
    }

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
  const requestPermission = async (type) => {
    // Skip on non-macOS platforms - permissions are handled by the webview
    if (!isMacOS()) {
      logInfo(`[Permissions] ℹ️ Non-macOS platform - permissions handled automatically`);
      return;
    }

    try {
      const checkCommand = `plugin:macos-permissions|check_${type}_permission`;
      const requestCommand = `plugin:macos-permissions|request_${type}_permission`;
      const settingsCommand = `open_${type}_settings`;

      // Check current status
      let currentStatus;
      try {
        currentStatus = await invoke(checkCommand);
      } catch (checkError) {
        throw checkError;
      }

      if (currentStatus === true) {
        return;
      }

      // Request permission
      let result;
      try {
        result = await invoke(requestCommand);
      } catch (requestError) {
        throw requestError;
      }

      if (type === 'camera') {
        dispatch({ type: 'SET_CAMERA_REQUESTED' });
      } else {
        dispatch({ type: 'SET_MICROPHONE_REQUESTED' });
      }

      if (result === null) {
        // Popup shown, start polling silently
        let checkCount = 0;
        const maxChecks = 20;
        const permCheckCommand = type === 'camera'
          ? 'plugin:macos-permissions|check_camera_permission'
          : 'plugin:macos-permissions|check_microphone_permission';

        const aggressiveInterval = setInterval(async () => {
          checkCount++;
          await refreshPermissions();

          try {
            const status = await invoke(permCheckCommand);
            if (status === true) {
              clearInterval(aggressiveInterval);
              await refreshPermissions();
            }
          } catch (error) {
            // Ignore errors during polling
          }

          if (checkCount >= maxChecks) {
            clearInterval(aggressiveInterval);
          }
        }, 500);

        return;
      }

      if (result === false) {
        // Permission denied, open settings
        try {
          await invoke(settingsCommand);
        } catch (settingsError) {
          throw settingsError;
        }
      }
    } catch (error) {
      const errorMsg = error?.message || error?.toString() || 'Unknown error';
      logError(`[Permissions]${type}: ${errorMsg}`);
      // Try to open settings as fallback
      try {
        await invoke(`open_${type}_settings`);
      } catch (settingsError) {
        const settingsErrorMsg = settingsError?.message || settingsError?.toString() || 'Unknown error';
        logError(`[Permissions] ❌ Failed to open settings: ${settingsErrorMsg}`);
      }
    }
  };

  const openSettings = async (type) => {
    // Skip on non-macOS platforms
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
  };

  // Track previous permission states to detect actual changes
  const prevCameraGranted = React.useRef(null);
  const prevMicrophoneGranted = React.useRef(null);

  // Only log when a permission is granted (not initial state)
  React.useEffect(() => {
    // Skip initial render
    if (prevCameraGranted.current === null) {
      prevCameraGranted.current = cameraGranted;
      prevMicrophoneGranted.current = microphoneGranted;
      return;
    }

    // Log only when permission changes from false to true
    if (!prevCameraGranted.current && cameraGranted) {
      logInfo('✅ Camera permission granted');
    }
    if (!prevMicrophoneGranted.current && microphoneGranted) {
      logInfo('✅ Microphone permission granted');
    }

    prevCameraGranted.current = cameraGranted;
    prevMicrophoneGranted.current = microphoneGranted;
  }, [cameraGranted, microphoneGranted]);

  return (
    <Box
      sx={{
        width: '100%',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: darkMode ? '#1a1a1a' : '#f5f5f5',
        padding: 3,
        paddingLeft: 6,
        paddingRight: 6,
        position: 'relative',
      }}
    >
      {/* Temporary LogConsole for debugging permissions */}
      <Box
        sx={{
          position: 'fixed',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'calc(100% - 32px)',
          maxWidth: '420px',
          zIndex: 1000,
          opacity: 0.5, // Semi-transparent by default
          transition: 'opacity 0.3s ease-in-out',
          '&:hover': {
            opacity: 1, // Full opacity on hover
          },
        }}
      >
        <LogConsole
          logs={[]}
          darkMode={darkMode}
          includeStoreLogs={true}
          compact={true}
          showTimestamp={false}
          lines={4}
          sx={{
            bgcolor: darkMode ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.7)',
            border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.12)'}`,
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
        />
      </Box>

      <Box sx={{ maxWidth: 600, textAlign: 'center' }}>
        {(state.isRestarting || externalIsRestarting) ? (
          <>
            {/* Restarting view */}
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                mb: 3,
              }}
            >
              <Box
                component="img"
                src={SleepingReachy}
                alt="Reachy Mini"
                sx={{
                  width: 160,
                  height: 'auto',
                  opacity: darkMode ? 0.8 : 0.9,
                }}
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
              variant="body2"
              sx={{
                color: darkMode ? '#aaa' : '#666',
                mb: 3,
              }}
            >
              All permissions granted. The app will restart in a moment.
            </Typography>
          </>
        ) : (
          <>
            {/* Normal permissions view */}
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                mb: 3,
              }}
            >
              <Box
                component="img"
                src={LockedReachy}
                alt="Reachy Mini"
                sx={{
                  width: 160,
                  height: 'auto',
                  opacity: darkMode ? 0.8 : 0.9,
                }}
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
              variant="body2"
              sx={{
                color: darkMode ? '#aaa' : '#666',
                mb: 3,
                lineHeight: 1.5,
              }}
            >
              <Box component="span" sx={{ fontWeight: 600 }}>
                Reachy
              </Box>{' '}
              requires{' '}
              <Box component="span" sx={{ fontWeight: 600 }}>
                access
              </Box>{' '}
              to your{' '}
              <Box component="span" sx={{ fontWeight: 600 }}>
                camera
              </Box>{' '}
              and{' '}
              <Box component="span" sx={{ fontWeight: 600 }}>
                microphone
              </Box>{' '}
              to function properly.
            </Typography>

            <Stack direction="row" spacing={2} sx={{ mb: 3, width: '100%' }}>
              <PermissionCard
                icon={CameraAltOutlinedIcon}
                title="Camera"
                granted={cameraGranted}
                requested={state.cameraRequested}
                onRequest={() => requestPermission('camera')}
                onOpenSettings={() => openSettings('camera')}
                darkMode={darkMode}
              />
              <PermissionCard
                icon={MicNoneOutlinedIcon}
                title="Microphone"
                granted={microphoneGranted}
                requested={state.microphoneRequested}
                onRequest={() => requestPermission('microphone')}
                onOpenSettings={() => openSettings('microphone')}
                darkMode={darkMode}
              />
            </Stack>
          </>
        )}
      </Box>
    </Box>
  );
}
