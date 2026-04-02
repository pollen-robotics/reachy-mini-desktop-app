import React, { useState, useCallback } from 'react';
import { Box, Typography, Stepper, Step, StepLabel } from '@mui/material';
import useAppStore from '../../store/useAppStore';
import FullscreenOverlay from '../../components/FullscreenOverlay';
import { useFirstWakeUpApi } from './useFirstWakeUpApi';
import {
  WelcomeStep,
  SleepPositionStep,
  MicrophoneTestStep,
  MotorTestStep,
  SpeakerTestStep,
  CameraTestStep,
  SuccessStep,
} from './steps';

const STEP_LABELS = [
  'Welcome',
  'Sleep Position',
  'Microphone',
  'Motors',
  'Speaker',
  'Camera',
  'Ready!',
];

/**
 * FirstWakeUpView - First-time diagnostic wizard for Reachy Mini.
 * Tests: sleep position, microphone, motors, speaker, camera.
 * Shown after daemon startup when first wake-up has not been completed.
 */
export default function FirstWakeUpView({ onComplete }) {
  const { darkMode } = useAppStore();
  const api = useFirstWakeUpApi();
  const [activeStep, setActiveStep] = useState(0);

  const textPrimary = darkMode ? '#f5f5f5' : '#333';
  const textSecondary = darkMode ? '#888' : '#666';

  const goNext = useCallback(() => {
    setActiveStep(prev => Math.min(prev + 1, STEP_LABELS.length - 1));
  }, []);

  const goBack = useCallback(() => {
    setActiveStep(prev => Math.max(prev - 1, 0));
  }, []);

  const handleComplete = useCallback(() => {
    if (onComplete) onComplete();
  }, [onComplete]);

  return (
    <FullscreenOverlay
      open={true}
      onClose={null}
      darkMode={darkMode}
      showCloseButton={false}
      centered={true}
      backdropBlur={40}
      debugName="FirstWakeUp"
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          px: 3,
          py: 3,
          width: '100%',
          maxWidth: 500,
        }}
      >
        {/* Title */}
        <Typography
          variant="h1"
          sx={{
            fontSize: 20,
            fontWeight: 700,
            color: textPrimary,
            mb: 2,
            textAlign: 'center',
            letterSpacing: '-0.3px',
          }}
        >
          First Wake Up
        </Typography>

        {/* Stepper */}
        <Box
          sx={{
            width: '100%',
            maxWidth: 480,
            mb: 2,
            mx: 'auto',
          }}
        >
          <Stepper activeStep={activeStep} alternativeLabel sx={{ width: '100%' }}>
            {STEP_LABELS.map((label, index) => (
              <Step key={label} completed={activeStep > index}>
                <StepLabel
                  sx={{
                    '& .MuiStepLabel-label': {
                      fontSize: 8,
                      color: textSecondary,
                      mt: 0.5,
                      '&.Mui-active': { color: '#FF9500', fontWeight: 600 },
                      '&.Mui-completed': { color: '#22c55e' },
                    },
                    '& .MuiStepIcon-root': {
                      fontSize: 18,
                      color: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                      '&.Mui-active': { color: '#FF9500' },
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
            position: 'relative',
            width: '100%',
            maxWidth: 420,
            minHeight: 360,
            bgcolor: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
            borderRadius: '12px',
            border: '1px solid',
            borderColor: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
            p: 3,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {activeStep === 0 && <WelcomeStep darkMode={darkMode} onNext={goNext} />}
          {activeStep === 1 && (
            <SleepPositionStep darkMode={darkMode} api={api} onNext={goNext} onBack={goBack} />
          )}
          {activeStep === 2 && (
            <MicrophoneTestStep darkMode={darkMode} api={api} onNext={goNext} onBack={goBack} />
          )}
          {activeStep === 3 && (
            <MotorTestStep darkMode={darkMode} api={api} onNext={goNext} onBack={goBack} />
          )}
          {activeStep === 4 && (
            <SpeakerTestStep darkMode={darkMode} api={api} onNext={goNext} onBack={goBack} />
          )}
          {activeStep === 5 && (
            <CameraTestStep darkMode={darkMode} api={api} onNext={goNext} onBack={goBack} />
          )}
          {activeStep === 6 && (
            <SuccessStep darkMode={darkMode} api={api} onComplete={handleComplete} />
          )}
        </Box>
      </Box>
    </FullscreenOverlay>
  );
}
