import React from 'react';
import { Box, Typography, Button } from '@mui/material';
import StepLayout from '../components/StepLayout';

export default function WelcomeStep({ darkMode, onNext }) {
  const textSecondary = darkMode ? '#888' : '#64748b';

  return (
    <StepLayout
      darkMode={darkMode}
      icon="👋"
      title="Wake Me Up"
      subtitle="Let's make sure everything works. We'll test the microphone, motors, speaker, and camera in a few easy steps."
      showBack={false}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, mt: 2 }}>
        <Box
          sx={{
            display: 'flex',
            gap: 1,
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          {['🎤 Microphone', '⚙️ Motors', '🔊 Speaker', '📷 Camera'].map(tag => (
            <Box
              key={tag}
              sx={{
                px: 1.5,
                py: 0.5,
                borderRadius: '20px',
                bgcolor: darkMode ? 'rgba(255,255,255,0.06)' : '#f1f5f9',
                fontSize: 12,
                fontWeight: 500,
                color: textSecondary,
              }}
            >
              {tag}
            </Box>
          ))}
        </Box>

        <Button
          variant="contained"
          onClick={onNext}
          disableElevation
          sx={{
            mt: 2,
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
          Let's start!
        </Button>
      </Box>
    </StepLayout>
  );
}
