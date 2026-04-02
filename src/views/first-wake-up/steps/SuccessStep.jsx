import React, { useEffect } from 'react';
import { Box, Typography, Button } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import StepLayout from '../components/StepLayout';

export default function SuccessStep({ darkMode, api, onComplete }) {
  // Mark first wake-up as completed and play enthusiastic emotion
  useEffect(() => {
    api.setFirstWakeUpCompleted();
    api.playMove('enthusiastic1').catch(() => {});
  }, [api]);

  return (
    <StepLayout
      darkMode={darkMode}
      title="We're Ready to Play!"
      subtitle="Everything is working correctly. Reachy Mini is ready for action!"
      showBack={false}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, py: 2 }}>
        <CheckCircleIcon sx={{ fontSize: 56, color: '#22c55e' }} />

        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 0.5,
            alignItems: 'center',
          }}
        >
          {['🎤 Microphone', '⚙️ Motors', '🔊 Speaker', '📷 Camera'].map(item => (
            <Box
              key={item}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 2,
                py: 0.5,
              }}
            >
              <CheckCircleIcon sx={{ fontSize: 14, color: '#22c55e' }} />
              <Typography sx={{ fontSize: 13, color: darkMode ? '#ccc' : '#475569' }}>
                {item}
              </Typography>
            </Box>
          ))}
        </Box>

        <Button
          variant="contained"
          onClick={onComplete}
          disableElevation
          sx={{
            mt: 1,
            px: 4,
            py: 1.2,
            borderRadius: '8px',
            fontSize: 14,
            fontWeight: 600,
            textTransform: 'none',
            background: 'linear-gradient(135deg, #FF9500, #FFB333)',
            '&:hover': {
              background: 'linear-gradient(135deg, #FFB333, #FFCC66)',
              transform: 'translateY(-1px)',
              boxShadow: '0 4px 8px rgba(255, 153, 0, 0.3)',
            },
          }}
        >
          Let's go!
        </Button>
      </Box>
    </StepLayout>
  );
}
