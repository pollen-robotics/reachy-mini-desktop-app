import React, { useEffect, useState } from 'react';
import { Box, Typography, Button, Stack } from '@mui/material';
import CameraAltOutlinedIcon from '@mui/icons-material/CameraAltOutlined';
import MicNoneOutlinedIcon from '@mui/icons-material/MicNoneOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import { invoke } from '@tauri-apps/api/core';
import useAppStore from '../../store/useAppStore';
import HowToCreateApp from '../../assets/reachy-how-to-create-app.svg';

/**
 * PermissionsRequiredView
 * Blocks the app until permissions are granted
 */
export default function PermissionsRequiredView() {
  const { darkMode } = useAppStore();
  const [cameraGranted, setCameraGranted] = useState(false);
  const [microphoneGranted, setMicrophoneGranted] = useState(false);
  const [cameraRequested, setCameraRequested] = useState(false);
  const [microphoneRequested, setMicrophoneRequested] = useState(false);

  useEffect(() => {
    const checkPermissions = async () => {
      try {
        const [camera, mic] = await invoke('check_permissions');
        setCameraGranted(camera);
        setMicrophoneGranted(mic);
      } catch (error) {
        console.error('Error checking permissions:', error);
        setCameraGranted(false);
        setMicrophoneGranted(false);
      }
    };

    checkPermissions();
    const interval = setInterval(checkPermissions, 2000);
    return () => clearInterval(interval);
  }, []);

  const requestCameraPermission = async () => {
    try {
      const requested = await invoke('request_camera_permission');
      if (requested) {
        setCameraRequested(true);
      } else {
        // Already asked, open settings instead
        await invoke('open_camera_settings');
      }
    } catch (error) {
      console.error('Failed to request Camera permission:', error);
    }
  };

  const requestMicrophonePermission = async () => {
    try {
      const requested = await invoke('request_microphone_permission');
      if (requested) {
        setMicrophoneRequested(true);
      } else {
        // Already asked, open settings instead
        await invoke('open_microphone_settings');
      }
    } catch (error) {
      console.error('Failed to request Microphone permission:', error);
    }
  };

  const openCameraSettings = async () => {
    try {
      await invoke('open_camera_settings');
    } catch (error) {
      console.error('Failed to open Camera Settings:', error);
    }
  };

  const openMicrophoneSettings = async () => {
    try {
      await invoke('open_microphone_settings');
    } catch (error) {
      console.error('Failed to open Microphone Settings:', error);
    }
  };

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
      }}
    >
      <Box sx={{ maxWidth: 600, textAlign: 'center' }}>
        {/* Reachy image */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            mb: 3,
          }}
        >
          <Box
            component="img"
            src={HowToCreateApp}
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
          {/* Camera Card */}
          <Box
            sx={{
              width: '50%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 3,
              borderRadius: 2,
              backgroundColor: cameraGranted
                ? (darkMode ? 'rgba(34, 197, 94, 0.06)' : 'rgba(34, 197, 94, 0.04)')
                : 'transparent',
              border: cameraGranted
                ? `1px solid ${darkMode ? 'rgba(34, 197, 94, 0.5)' : 'rgba(34, 197, 94, 0.4)'}`
                : `2px dashed ${darkMode ? '#555' : '#ccc'}`,
              transition: 'all 0.3s ease',
            }}
          >
            <CameraAltOutlinedIcon
              sx={{
                fontSize: 20,
                color: cameraGranted
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
                color: cameraGranted
                  ? (darkMode ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.85)')
                  : (darkMode ? '#fff' : '#1a1a1a'),
                mb: 2,
                textAlign: 'center',
              }}
            >
              Camera
            </Typography>
            {cameraGranted ? (
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
                onClick={cameraRequested ? openCameraSettings : requestCameraPermission}
                sx={{
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
                }}
              >
                {cameraRequested ? 'Open Settings' : 'Ask Access'}
              </Button>
            )}
          </Box>

          {/* Microphone Card */}
          <Box
            sx={{
              width: '50%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 3,
              borderRadius: 2,
              backgroundColor: microphoneGranted
                ? (darkMode ? 'rgba(34, 197, 94, 0.06)' : 'rgba(34, 197, 94, 0.04)')
                : 'transparent',
              border: microphoneGranted
                ? `1px solid ${darkMode ? 'rgba(34, 197, 94, 0.5)' : 'rgba(34, 197, 94, 0.4)'}`
                : `2px dashed ${darkMode ? '#555' : '#ccc'}`,
              transition: 'all 0.3s ease',
            }}
          >
            <MicNoneOutlinedIcon
              sx={{
                fontSize: 20,
                color: microphoneGranted
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
                color: microphoneGranted
                  ? (darkMode ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.85)')
                  : (darkMode ? '#fff' : '#1a1a1a'),
                mb: 2,
                textAlign: 'center',
              }}
            >
              Microphone
            </Typography>
            {microphoneGranted ? (
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
                onClick={microphoneRequested ? openMicrophoneSettings : requestMicrophonePermission}
                sx={{
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
                }}
              >
                {microphoneRequested ? 'Open Settings' : 'Ask Access'}
              </Button>
            )}
          </Box>
        </Stack>
      </Box>
    </Box>
  );
}

