import React from 'react';
import { Box, IconButton } from '@mui/material';
import CasinoOutlinedIcon from '@mui/icons-material/CasinoOutlined';

/**
 * Dice button component for random spin - discrete, centered at bottom
 */
export default function WheelDiceButton({ 
  onRandomSpin, 
  isSpinning, 
  isActive, 
  isBusy, 
  isReady, 
  darkMode, 
  activeTab,
  isDiceShaking 
}) {
  return (
    <Box sx={{ 
      position: 'absolute', 
      bottom: 16, 
      left: '50%', 
      transform: 'translateX(-50%)',
      zIndex: 100,
      mt: 3
    }}>
      {/* Container for shake animation - separates positioning from animation */}
      <Box
        sx={{
          animation: isDiceShaking ? 'shake 0.5s ease-in-out' : 'none',
          '@keyframes shake': {
            '0%, 100%': { transform: 'translateX(0) rotate(0deg)' },
            '10%, 30%, 50%, 70%, 90%': { transform: 'translateX(-4px) rotate(-5deg)' },
            '20%, 40%, 60%, 80%': { transform: 'translateX(4px) rotate(5deg)' },
          },
        }}
      >
        <IconButton
          onClick={onRandomSpin}
          disabled={isSpinning || !isActive || isBusy || !isReady}
          aria-label="Random spin"
          aria-describedby="dice-button-description"
          sx={{
            color: '#FF9500',
            width: 40,
            height: 40,
            padding: 0,
            border: '1.5px solid #FF9500',
            borderRadius: '50%',
            '&:hover': {
              color: '#FF9500',
              bgcolor: 'rgba(255, 149, 0, 0.1)',
              borderColor: '#FF9500',
            },
            '&.Mui-disabled': {
              color: darkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)',
              borderColor: darkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)',
            },
            transition: 'all 0.2s ease',
          }}
        >
          <CasinoOutlinedIcon sx={{ fontSize: 24 }} />
        </IconButton>
      </Box>
      <span 
        id="dice-button-description" 
        style={{ 
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: 0,
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0
        }}
      >
        Spin the wheel randomly to select a random {activeTab === 'emotions' ? 'emotion' : 'dance'}
      </span>
    </Box>
  );
}

