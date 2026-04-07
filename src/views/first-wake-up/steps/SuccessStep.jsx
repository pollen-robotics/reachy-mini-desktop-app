import React, { useEffect } from 'react';
import { Box, Typography, Button } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import StepLayout from '../components/StepLayout';
import { primaryButtonSx, SUCCESS } from '../theme';
import { CHOREOGRAPHY_DATASETS } from '../../../constants/choreographies';
import rocketSvg from '../../../assets/rocket.svg';

const CHECKLIST = ['Motors', 'Speaker', 'Microphone', 'Camera'];

export default function SuccessStep({ darkMode, api, onComplete }) {
  useEffect(() => {
    api.playRecordedMove(CHOREOGRAPHY_DATASETS.EMOTIONS, 'enthusiastic1').catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <StepLayout
      darkMode={darkMode}
      illustration={rocketSvg}
      title="We're Ready to Play!"
      subtitle="Everything is working correctly. Reachy Mini is ready for action!"
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, alignItems: 'center' }}>
          {CHECKLIST.map(item => (
            <Box key={item} sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 0.5 }}>
              <CheckCircleIcon sx={{ fontSize: 14, color: SUCCESS }} />
              <Typography sx={{ fontSize: 13, color: darkMode ? '#ccc' : '#475569' }}>
                {item}
              </Typography>
            </Box>
          ))}
        </Box>

        <Button variant="outlined" onClick={onComplete} sx={{ ...primaryButtonSx, fontSize: 14 }}>
          Let's go!
        </Button>
      </Box>
    </StepLayout>
  );
}
