import React, { useEffect } from 'react';
import { Button } from '@mui/material';
import StepLayout from '../components/StepLayout';
import { primaryButtonSx } from '../theme';
import { CHOREOGRAPHY_DATASETS } from '../../../constants/choreographies';
import reachyFiesta from '../../../assets/reachy-fiesta.svg';

export default function SuccessStep({ darkMode, api, onComplete }) {
  useEffect(() => {
    api.playRecordedMove(CHOREOGRAPHY_DATASETS.EMOTIONS, 'enthusiastic1').catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <StepLayout
      darkMode={darkMode}
      illustration={reachyFiesta}
      title="We're All Set!"
      subtitle={
        <>
          All my systems are <b>good to go</b>! I can move, hear, speak and see. I'm so excited to
          start playing with you!
        </>
      }
    >
      <Button variant="outlined" onClick={onComplete} sx={{ ...primaryButtonSx, fontSize: 14 }}>
        Let's go!
      </Button>
    </StepLayout>
  );
}
