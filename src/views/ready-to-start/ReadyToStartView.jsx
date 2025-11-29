import React, { useMemo, useState } from 'react';
import { Box, Typography, Button, CircularProgress } from '@mui/material';
import reachyBusteSvg from '../../assets/reachy-buste.svg';
import useAppStore from '../../store/useAppStore';

// 🤖 Startup messages (fixed title)
const START_MESSAGES = [
  { 
    text: 'Press the button to ', 
    bold: 'bring Reachy to life',
    suffix: '' 
  },
  { 
    text: 'Give ', 
    bold: 'life', 
    suffix: ' to your robot' 
  },
  { 
    text: 'Time to ', 
    bold: 'wake up', 
    suffix: ' Reachy' 
  },
  { 
    text: 'Press to ', 
    bold: 'activate', 
    suffix: ' the robot' 
  },
];

/**
 * View displayed when robot is connected but daemon is not started yet
 * Simplified version without update logic (handled in UpdateView)
 */
export default function ReadyToStartView({ 
  startDaemon, 
  isStarting, 
  usbPortName,
}) {
  const { darkMode } = useAppStore();
  const [isButtonLoading, setIsButtonLoading] = useState(false);
  
  // Choose a random message (memoized - never changes)
  const randomMessage = useMemo(() => {
    return START_MESSAGES[Math.floor(Math.random() * START_MESSAGES.length)];
  }, []);
  
  const handleStartClick = () => {
    setIsButtonLoading(true);
    // Let React render the spinner before starting the daemon
    setTimeout(() => {
      startDaemon();
    }, 0);
  };

  return (
    <Box
      sx={{
        width: '100vw',
        height: '100vh',
        background: darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)',
        backdropFilter: 'blur(40px)',
        WebkitBackdropFilter: 'blur(40px)',
        overflow: 'hidden',
      }}
    >
      {/* Start daemon view */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100vh', // TopBar is fixed, doesn't take space
          px: 4,
          position: 'relative',
        }}
      >
        {/* Centered content */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
          }}
        >
              <Box sx={{ mb: 4 }}>
                <img 
                  src={reachyBusteSvg} 
                  alt="Reachy Buste" 
                  style={{ 
                    width: '220px', 
                    height: '220px',
                    mb: 0
                  }} 
                />
              </Box>
              
              <Typography
                sx={{
                  fontSize: 24,
                  fontWeight: 600,
                  color: darkMode ? '#f5f5f5' : '#333',
                  mb: 1,
                  mt: 0,
                  textAlign: 'center',
                }}
              >
                Ready to Start
              </Typography>
              
              <Typography
                sx={{
                  fontSize: 14,
                  color: darkMode ? '#aaa' : '#666',
                  textAlign: 'center',
                  maxWidth: 360,
                  lineHeight: 1.6,
                  mb: 3,
                }}
              >
                {randomMessage.text}
                <Box component="span" sx={{ fontWeight: 700, color: darkMode ? '#f5f5f5' : '#333' }}>
                  {randomMessage.bold}
                </Box>
                {randomMessage.suffix}
              </Typography>

                  <Button
                    onClick={handleStartClick}
                    disabled={isButtonLoading || isStarting}
                    variant="outlined"
                    startIcon={(isButtonLoading || isStarting) ? (
                      <CircularProgress size={16} thickness={4} sx={{ color: '#FF9500' }} />
                    ) : null}
                    sx={{
                      px: 3.5,
                      py: 1.25,
                      minHeight: 44,
                      fontSize: 13,
                      fontWeight: 600,
                      textTransform: 'none',
                      borderRadius: '12px',
                      bgcolor: 'transparent',
                      color: '#FF9500',
                      border: '1px solid #FF9500',
                      position: 'relative',
                      overflow: 'hidden',
                      boxShadow: darkMode 
                        ? '0 2px 8px rgba(255, 149, 0, 0.15)' 
                        : '0 2px 8px rgba(255, 149, 0, 0.12)',
                      transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                      letterSpacing: '0.2px',
                      '&:hover': {
                        bgcolor: !(isButtonLoading || isStarting) ? 'rgba(255, 149, 0, 0.08)' : 'transparent',
                        borderColor: '#FF9500',
                        transform: !(isButtonLoading || isStarting) ? 'translateY(-2px)' : 'none',
                        boxShadow: !(isButtonLoading || isStarting) 
                          ? (darkMode 
                            ? '0 6px 16px rgba(255, 149, 0, 0.2)' 
                            : '0 6px 16px rgba(255, 149, 0, 0.15)')
                          : (darkMode 
                            ? '0 2px 8px rgba(255, 149, 0, 0.15)' 
                            : '0 2px 8px rgba(255, 149, 0, 0.12)'),
                      },
                      '&:active': {
                        transform: !(isButtonLoading || isStarting) ? 'translateY(0)' : 'none',
                        boxShadow: darkMode 
                          ? '0 2px 8px rgba(255, 149, 0, 0.15)' 
                          : '0 2px 8px rgba(255, 149, 0, 0.12)',
                      },
                      '&:disabled': {
                        bgcolor: 'transparent',
                        color: darkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)',
                        borderColor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.12)',
                        boxShadow: 'none',
                      },
                    }}
                  >
                    {(isButtonLoading || isStarting) ? 'Starting...' : 'Start'}
                  </Button>
        </Box>

            {/* Bottom text - absolute positioning */}
          <Box 
            sx={{ 
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              pb: 3, 
              textAlign: 'center',
            }}
          >
            <Typography
              sx={{
                fontSize: 11,
                color: darkMode ? '#666' : '#bbb',
              }}
            >
              Reachy connected via USB
            </Typography>
            {usbPortName && (
              <Typography
                sx={{
                  fontSize: 10,
                  color: darkMode ? '#888' : '#666',
                  fontFamily: 'SF Mono, Monaco, Menlo, monospace',
                  mt: 0.5,
                }}
              >
                {usbPortName}
              </Typography>
            )}
          </Box>
      </Box>
    </Box>
  );
}

