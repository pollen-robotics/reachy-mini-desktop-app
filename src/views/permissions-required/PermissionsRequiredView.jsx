import React, { useReducer } from 'react';
import { Box, Typography, Button, Stack } from '@mui/material';
import CameraAltOutlinedIcon from '@mui/icons-material/CameraAltOutlined';
import MicNoneOutlinedIcon from '@mui/icons-material/MicNoneOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import { invoke } from '@tauri-apps/api/core';
import useAppStore from '../../store/useAppStore';
import { usePermissions } from '../../hooks/system';
import { logInfo, logError, logWarning, logSuccess } from '../../utils/logging/logger';
import LogConsole from '../active-robot/LogConsole';
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
  const buttonStyles = {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'none',
    borderRadius: '10px',
    bgcolor: darkMode ? '#121212' : '#ffffff',
    color: '#FF9500',
    border: '1px solid #FF9500',
    width: '100%',
    px: 2,
    py: 0.5,
    position: 'relative',
    overflow: 'visible',
    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
    animation: 'permissionsPulse 3s ease-in-out infinite',
    '@keyframes permissionsPulse': {
      '0%, 100%': {
        boxShadow: darkMode
          ? '0 0 0 0 rgba(255, 149, 0, 0.4)'
          : '0 0 0 0 rgba(255, 149, 0, 0.3)',
      },
      '50%': {
        boxShadow: darkMode
          ? '0 0 0 8px rgba(255, 149, 0, 0)'
          : '0 0 0 8px rgba(255, 149, 0, 0)',
      },
    },
    '&:hover': {
      bgcolor: darkMode ? '#1a1a1a' : '#f5f5f5',
      borderColor: '#FF9500',
      transform: 'translateY(-2px)',
      boxShadow: darkMode
        ? '0 6px 16px rgba(255, 149, 0, 0.2)'
        : '0 6px 16px rgba(255, 149, 0, 0.15)',
      animation: 'none',
    },
    '&:active': {
      transform: 'translateY(0)',
      boxShadow: darkMode
        ? '0 2px 8px rgba(255, 149, 0, 0.2)'
        : '0 2px 8px rgba(255, 149, 0, 0.15)',
    },
  };

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
        <Button
          variant="outlined"
          color="primary"
          onClick={requested ? onOpenSettings : onRequest}
          sx={buttonStyles}
        >
          {requested ? 'Open Settings' : 'Ask Access'}
        </Button>
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
  const { cameraGranted, microphoneGranted } = usePermissions({ checkInterval: 2000 });
  
  const [state, dispatch] = useReducer(permissionsViewReducer, {
    cameraRequested: false,
    microphoneRequested: false,
    isRestarting: false,
    restartStarted: false,
  });

  // Test plugin availability on mount
  React.useEffect(() => {
    const testPlugin = async () => {
      logInfo('[Permissions] 🔍 Testing plugin availability on mount...');
      logInfo(`[Permissions] Environment: ${process.env.NODE_ENV}`);
      logInfo(`[Permissions] Tauri API available: ${typeof invoke === 'function'}`);
      try {
        logInfo('[Permissions] Attempting to invoke plugin command...');
        const testResult = await invoke('check_camera_permission');
        logSuccess(`[Permissions] ✅ Plugin is available, camera check result: ${testResult} (type: ${typeof testResult})`);
      } catch (error) {
        logError(`[Permissions] ❌ Plugin not available or error: ${error.message}`);
        logError(`[Permissions] Error name: ${error.name}`);
        logError(`[Permissions] Error code: ${error.code || 'N/A'}`);
        if (error.stack) {
          logError(`[Permissions] Stack: ${error.stack.substring(0, 300)}...`);
        }
        // Try to get more details if available
        if (error.cause) {
          logError(`[Permissions] Error cause: ${JSON.stringify(error.cause)}`);
        }
      }
    };
    testPlugin();
  }, []);

  // Generic permission request handler
  const requestPermission = async (type) => {
    logInfo(`[Permissions] 🔐 Starting ${type} permission request flow...`);
    logInfo(`[Permissions] Timestamp: ${new Date().toISOString()}`);
    try {
      const checkCommand = `check_${type}_permission`;
      const requestCommand = `request_${type}_permission`;
      const settingsCommand = `open_${type}_settings`;
      
      logInfo(`[Permissions] 📋 Step 1: Checking ${type} permission status...`);
      logInfo(`[Permissions] Command: ${checkCommand}`);
      logInfo(`[Permissions] Invoke function available: ${typeof invoke === 'function'}`);
      
      const startTime = Date.now();
      let currentStatus;
      try {
        currentStatus = await invoke(checkCommand);
      } catch (checkError) {
        logError(`[Permissions] ❌ Check command failed: ${checkError.message}`);
        logError(`[Permissions] Check error name: ${checkError.name}`);
        logError(`[Permissions] Check error code: ${checkError.code || 'N/A'}`);
        throw checkError; // Re-throw to be caught by outer catch
      }
      const checkDuration = Date.now() - startTime;
      
      logInfo(`[Permissions] ✅ Check completed in ${checkDuration}ms, status: ${currentStatus} (type: ${typeof currentStatus})`);
      logInfo(`[Permissions] Status is boolean: ${typeof currentStatus === 'boolean'}`);
      logInfo(`[Permissions] Status value: ${String(currentStatus)}`);
      
      if (currentStatus === true) {
        logSuccess(`[Permissions] ✅ ${type} permission already granted, no action needed`);
        return;
      }
      
      logInfo(`[Permissions] 📋 Step 2: Requesting ${type} permission...`);
      logInfo(`[Permissions] Command: ${requestCommand}`);
      
      const requestStartTime = Date.now();
      let result;
      try {
        result = await invoke(requestCommand);
      } catch (requestError) {
        logError(`[Permissions] ❌ Request command failed: ${requestError.message}`);
        logError(`[Permissions] Request error name: ${requestError.name}`);
        logError(`[Permissions] Request error code: ${requestError.code || 'N/A'}`);
        throw requestError; // Re-throw to be caught by outer catch
      }
      const requestDuration = Date.now() - requestStartTime;
      
      logInfo(`[Permissions] ✅ Request completed in ${requestDuration}ms, result: ${result} (type: ${typeof result})`);
      logInfo(`[Permissions] Result is null: ${result === null}`);
      logInfo(`[Permissions] Result is false: ${result === false}`);
      logInfo(`[Permissions] Result is true: ${result === true}`);
      
      if (type === 'camera') {
        dispatch({ type: 'SET_CAMERA_REQUESTED' });
      } else {
        dispatch({ type: 'SET_MICROPHONE_REQUESTED' });
      }
      
      if (result === null) {
        // Popup shown, waiting for user response
        logInfo(`[Permissions] ⏳ ${type} permission popup shown, waiting for user response...`);
        logInfo(`[Permissions] This is expected behavior - macOS is showing the permission dialog`);
        return;
      }
      
      if (result === false) {
        // Permission denied or already asked, open settings
        logWarning(`[Permissions] ⚠️ ${type} permission denied or already asked, opening System Settings...`);
        logInfo(`[Permissions] Command: ${settingsCommand}`);
        try {
          await invoke(settingsCommand);
          logSuccess(`[Permissions] ✅ System Settings opened for ${type}`);
        } catch (settingsError) {
          logError(`[Permissions] ❌ Failed to open settings: ${settingsError.message}`);
          throw settingsError;
        }
      } else if (result === true) {
        logSuccess(`[Permissions] ✅ ${type} permission granted!`);
      } else {
        logWarning(`[Permissions] ⚠️ Unexpected result type: ${result} (${typeof result})`);
        logWarning(`[Permissions] Result JSON: ${JSON.stringify(result)}`);
      }
    } catch (error) {
      logError(`[Permissions] ❌ Failed to request ${type} permission`);
      logError(`[Permissions] Error message: ${error.message}`);
      logError(`[Permissions] Error name: ${error.name}`);
      logError(`[Permissions] Error code: ${error.code || 'N/A'}`);
      if (error.stack) {
        const stackPreview = error.stack.substring(0, 400);
        logError(`[Permissions] Stack: ${stackPreview}${error.stack.length > 400 ? '...' : ''}`);
      }
      if (error.cause) {
        logError(`[Permissions] Error cause: ${JSON.stringify(error.cause)}`);
      }
      
      // Try to open settings as fallback
      logInfo(`[Permissions] 🔄 Attempting fallback: opening System Settings...`);
      try {
        await invoke(`open_${type}_settings`);
        logSuccess(`[Permissions] ✅ Fallback successful: System Settings opened`);
      } catch (settingsError) {
        logError(`[Permissions] ❌ Fallback failed: ${settingsError.message}`);
        logError(`[Permissions] Fallback error name: ${settingsError.name}`);
        logError(`[Permissions] Fallback error code: ${settingsError.code || 'N/A'}`);
      }
    }
  };

  const openSettings = async (type) => {
    logInfo(`[Permissions] 🔧 Opening System Settings for ${type}...`);
    try {
      await invoke(`open_${type}_settings`);
      logSuccess(`[Permissions] ✅ System Settings opened for ${type}`);
    } catch (error) {
      logError(`[Permissions] ❌ Failed to open ${type} settings: ${error.message}`);
    }
  };

  // Log permission state changes
  React.useEffect(() => {
    logInfo(`[Permissions] 📊 Permission state - Camera: ${cameraGranted ? '✅ Granted' : '❌ Not granted'}, Microphone: ${microphoneGranted ? '✅ Granted' : '❌ Not granted'}`);
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
              variant="h5"
              sx={{
                fontWeight: 400,
                color: darkMode ? '#fff' : '#1a1a1a',
                mb: 2,
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
              variant="h5"
              sx={{
                fontWeight: 400,
                color: darkMode ? '#fff' : '#1a1a1a',
                mb: 2,
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
