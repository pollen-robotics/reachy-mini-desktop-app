import React, { useState, useEffect } from 'react';
import { Box, Typography } from '@mui/material';
import unpluggedCableLeftSvg from '../../assets/unplugged-cable-left.svg';
import unpluggedCableRightSvg from '../../assets/unplugged-cable-right.svg';
import useAppStore from '../../store/useAppStore';
import { enableSimulationMode } from '../../utils/simulationMode';

/**
 * View displayed when robot is not detected via USB
 */
export default function RobotNotDetectedView({ startDaemon }) {
  const { darkMode, isStarting } = useAppStore();
  const [dots, setDots] = useState('');
  const [isLaunching, setIsLaunching] = useState(false);

  // 🎭 Handler for simulation mode launch
  const handleSimulationClick = () => {
    if (isLaunching || isStarting) {
      return; // Prevent multiple clicks
    }
    
    // Enable simulation mode (persists in localStorage)
    enableSimulationMode();
    
    setIsLaunching(true);
    // Let React render before starting
    requestAnimationFrame(() => {
      startDaemon?.();
    });
  };

  // Animated ellipsis dots
  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => {
        if (prev === '...') return '';
        return prev + '.';
      });
    }, 500); // Change every 500ms (slow enough)
    
    return () => clearInterval(interval);
  }, []);

  return (
    <Box
      sx={{
        width: '100vw',
        height: '100vh',
        background: darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)',
        backdropFilter: 'blur(40px)',
        WebkitBackdropFilter: 'blur(40px)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Robot Not Detected Content */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh', // TopBar is fixed, doesn't take space
          position: 'relative',
          zIndex: 2,
        }}
      >
        {/* Full-width illustration with overlapping cables */}
        <Box 
          sx={{ 
            width: '100%',
            maxWidth: '100%',
            mb: 4,
            px: 0,
            display: 'flex',
            justifyContent: 'center',
            overflow: 'visible',
            position: 'relative',
          }}
        >
          <Box
            sx={{
              width: '100%',
              maxWidth: '450px',
              height: 'auto',
              position: 'relative',
              overflow: 'visible',
            }}
          >
            {/* Câble gauche avec animation */}
            <img 
              src={unpluggedCableLeftSvg} 
              alt="USB Cable Left" 
              style={{ 
                width: '105%',
                height: 'auto',
                opacity: .9,
                position: 'absolute',
                top: 0,
                left: '-2.5%',
                animation: 'plugAnimation 2.5s ease-in-out infinite',
              }} 
            />
            
            {/* Câble droit statique */}
            <img 
              src={unpluggedCableRightSvg} 
              alt="USB Cable Right" 
              style={{ 
                width: '105%',
                height: 'auto',
                opacity: .9,
                position: 'relative',
                left: '-2.5%',
              }} 
            />
          </Box>
        </Box>
        
        {/* Animation CSS pour le câble gauche */}
        <style>
          {`
            @keyframes plugAnimation {
              0%, 100% {
                transform: translateX(0px);
              }
              50% {
                transform: translateX(8px);
              }
            }
          `}
        </style>
        
        <Box sx={{ px: 4 }}>
          <Typography
            sx={{
              fontSize: 24,
              fontWeight: 600,
              color: darkMode ? '#f5f5f5' : '#333',
              mb: 1,
              textAlign: 'center',
            }}
          >
            Looking for Reachy Mini
          </Typography>
          
          <Typography
            sx={{
              fontSize: 14,
              color: darkMode ? '#aaa' : '#666',
              textAlign: 'center',
              maxWidth: 360,
              lineHeight: 1.6,
            }}
          >
            Make sure your robot is connected via <strong>USB</strong>
          </Typography>

          {/* Invisible box with same height as "Start" button (minHeight: 42 + py: 1.25) */}
          <Box
            sx={{
              mt: 4,
              minHeight: 42,
              py: 1.25,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Typography
              sx={{
                fontSize: 13,
                color: darkMode ? '#888' : '#666',
                fontWeight: 600,
                letterSpacing: '0.5px',
              }}
            >
              {(isLaunching || isStarting) ? 'Starting simulation...' : `Scanning for USB connection${dots}`}
            </Typography>

            {/* Simulation mode link - discrete, centered */}
            <Box sx={{ mt: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
              <Typography
                sx={{
                  fontSize: 11,
                  color: darkMode ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.35)',
                  opacity: (isLaunching || isStarting) ? 0.4 : 1,
                  userSelect: 'none',
                }}
              >
                or
              </Typography>
            <Typography
              onClick={handleSimulationClick}
              sx={{
                fontSize: 11,
                color: darkMode ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.35)',
                  textDecoration: 'underline',
                  textUnderlineOffset: '3px',
                cursor: (isLaunching || isStarting) ? 'default' : 'pointer',
                opacity: (isLaunching || isStarting) ? 0.4 : 1,
                transition: 'all 0.2s ease',
                userSelect: 'none',
                '&:hover': {
                  color: (isLaunching || isStarting) 
                    ? (darkMode ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.35)')
                    : (darkMode ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)'),
                },
              }}
            >
                launch in simulation mode
            </Typography>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

