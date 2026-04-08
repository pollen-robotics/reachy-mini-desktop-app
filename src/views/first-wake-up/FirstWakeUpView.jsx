import React, { useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Box, Button, Chip, keyframes } from '@mui/material';
import UsbIcon from '@mui/icons-material/Usb';
import WifiIcon from '@mui/icons-material/Wifi';
import useAppStore from '../../store/useAppStore';
import FullscreenOverlay from '../../components/FullscreenOverlay';
import { WebRTCStreamProvider } from '../../contexts/WebRTCStreamContext';
import { useFirstWakeUpApi } from './useFirstWakeUpApi';
import { ACCENT } from './theme';
import {
  WelcomeStep,
  SleepPositionStep,
  MicrophoneTestStep,
  MotorTestStep,
  SpeakerTestStep,
  CameraTestStep,
  SuccessStep,
} from './steps';

const TOTAL_STEPS = 7;

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
`;

function ProgressBar({ current, total, darkMode }) {
  const progress = (current / (total - 1)) * 100;
  return (
    <Box
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        zIndex: 20,
        bgcolor: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
      }}
    >
      <Box
        sx={{
          height: '100%',
          width: `${progress}%`,
          bgcolor: ACCENT,
          borderRadius: '0 2px 2px 0',
          transition: 'width 0.4s ease',
        }}
      />
    </Box>
  );
}

function ConnectionBadge({ darkMode }) {
  const { connectionMode } = useAppStore();
  const isUsb = connectionMode === 'usb';
  const isWifi = connectionMode === 'wifi';
  if (!isUsb && !isWifi) return null;

  const Icon = isUsb ? UsbIcon : WifiIcon;
  const label = isUsb ? 'USB' : 'WiFi';

  return (
    <Chip
      icon={<Icon sx={{ fontSize: 14 }} />}
      label={label}
      size="small"
      variant="outlined"
      sx={{
        position: 'fixed',
        top: 16,
        left: 16,
        zIndex: 10000001,
        WebkitAppRegion: 'no-drag',
        fontSize: 11,
        fontWeight: 600,
        height: 24,
        borderColor: darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)',
        color: darkMode ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)',
        '& .MuiChip-icon': { color: darkMode ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)' },
      }}
    />
  );
}

export default function FirstWakeUpView({ onComplete }) {
  const { darkMode } = useAppStore();
  const api = useFirstWakeUpApi();
  const [activeStep, setActiveStep] = useState(0);
  const robotWokenRef = useRef(false);

  const goNext = useCallback(() => {
    setActiveStep(prev => Math.min(prev + 1, TOTAL_STEPS - 1));
  }, []);

  const markRobotWoken = useCallback(() => {
    robotWokenRef.current = true;
  }, []);

  const handleComplete = useCallback(async () => {
    if (!robotWokenRef.current) {
      try {
        await api.enableMotors();
        await new Promise(r => setTimeout(r, 300));
        await api.playMove('wake_up');
      } catch (err) {
        console.error('[FirstWakeUp] Wake up on skip failed:', err);
      }
    }
    api.setFirstWakeUpCompleted();
    if (onComplete) onComplete();
  }, [api, onComplete]);

  return (
    <WebRTCStreamProvider>
      <FullscreenOverlay
        open={true}
        onClose={null}
        darkMode={darkMode}
        showCloseButton={false}
        centered={true}
        backdropBlur={40}
        debugName="FirstWakeUp"
      >
        <ProgressBar current={activeStep} total={TOTAL_STEPS} darkMode={darkMode} />

        {createPortal(
          <>
            <ConnectionBadge darkMode={darkMode} />
            <Button
              variant="outlined"
              onClick={handleComplete}
              sx={{
                position: 'fixed',
                top: 16,
                right: 16,
                zIndex: 10000001,
                WebkitAppRegion: 'no-drag',
                fontSize: 12,
                fontWeight: 500,
                textTransform: 'none',
                px: 2,
                py: 0.5,
                borderRadius: '8px',
                color: darkMode ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)',
                borderColor: darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)',
                '&:hover': {
                  color: darkMode ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)',
                  borderColor: darkMode ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)',
                  backgroundColor: 'transparent',
                },
              }}
            >
              Skip setup
            </Button>
          </>,
          document.body
        )}

        <Box
          key={activeStep}
          sx={{
            width: '100%',
            maxWidth: 420,
            px: 3,
            display: 'flex',
            flexDirection: 'column',
            animation: `${fadeIn} 0.3s ease-out`,
          }}
        >
          {activeStep === 0 && <WelcomeStep darkMode={darkMode} onNext={goNext} />}
          {activeStep === 1 && <SleepPositionStep darkMode={darkMode} onNext={goNext} />}
          {activeStep === 2 && (
            <MotorTestStep
              darkMode={darkMode}
              api={api}
              onNext={goNext}
              onRobotWoken={markRobotWoken}
            />
          )}
          {activeStep === 3 && <SpeakerTestStep darkMode={darkMode} api={api} onNext={goNext} />}
          {activeStep === 4 && <MicrophoneTestStep darkMode={darkMode} onNext={goNext} />}
          {activeStep === 5 && <CameraTestStep darkMode={darkMode} onNext={goNext} />}
          {activeStep === 6 && (
            <SuccessStep darkMode={darkMode} api={api} onComplete={handleComplete} />
          )}
        </Box>
      </FullscreenOverlay>
    </WebRTCStreamProvider>
  );
}
