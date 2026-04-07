import React from 'react';
import { Box, Button } from '@mui/material';
import StepLayout from '../components/StepLayout';
import { primaryButtonSx } from '../theme';
import reachyBuste from '../../../assets/reachy-buste.svg';

export default function WelcomeStep({ darkMode, onNext }) {
  return (
    <StepLayout
      darkMode={darkMode}
      illustration={reachyBuste}
      title="Wake Me Up"
      subtitle={
        <>
          Let's make sure everything works. We'll test the <b>microphone</b>, <b>motors</b>,{' '}
          <b>speaker</b>, and <b>camera</b> in a few easy steps.
        </>
      }
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <Button
          variant="outlined"
          onClick={onNext}
          disableElevation
          sx={{ ...primaryButtonSx, fontSize: 14 }}
        >
          Let's start!
        </Button>
      </Box>
    </StepLayout>
  );
}
