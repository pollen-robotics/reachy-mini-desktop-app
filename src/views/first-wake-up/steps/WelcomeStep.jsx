import React from 'react';
import { Box, Button } from '@mui/material';
import StepLayout from '../components/StepLayout';
import { primaryButtonSx } from '../theme';
import reachyMicrophone from '../../../assets/reachy-microphone.svg';

export default function WelcomeStep({ darkMode, onNext }) {
  return (
    <StepLayout
      darkMode={darkMode}
      illustration={reachyMicrophone}
      title="Wake Me Up!"
      subtitle={
        <>
          Hi there! Before we start having fun, I need to run a quick checkup on my <b>motors</b>,{' '}
          <b>speaker</b>, <b>microphone</b> and <b>camera</b>. It'll only take a minute!
        </>
      }
    >
      <Button
        variant="outlined"
        onClick={onNext}
        disableElevation
        sx={{ ...primaryButtonSx, fontSize: 14 }}
      >
        Let's start!
      </Button>
    </StepLayout>
  );
}
