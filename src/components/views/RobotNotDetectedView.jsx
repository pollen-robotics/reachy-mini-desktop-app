import React, { useState, useEffect } from 'react';
import { Box, Typography } from '@mui/material';
import { getCurrentWindow } from '@tauri-apps/api/window';
import unpluggedCableSvg from '../../assets/unplugged-cable.svg';
import useAppStore from '../../store/useAppStore';

/**
 * Vue affichée quand le robot n'est pas détecté via USB
 */
export default function RobotNotDetectedView() {
  const appWindow = window.mockGetCurrentWindow ? window.mockGetCurrentWindow() : getCurrentWindow();
  const { darkMode } = useAppStore();
  const [dots, setDots] = useState('');

  // Animation des points suspensifs
  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => {
        if (prev === '...') return '';
        return prev + '.';
      });
    }, 500); // Changement toutes les 500ms (assez lent)
    
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
      {/* Effet de scan en zig-zag continu (haut-bas-haut-bas) */}
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          pointerEvents: 'none',
          zIndex: 1,
          background: 'linear-gradient(180deg, transparent 0%, transparent 35%, rgba(255, 149, 0, 0.08) 43%, rgba(255, 149, 0, 0.16) 50%, rgba(255, 149, 0, 0.08) 57%, transparent 65%, transparent 100%)',
          backgroundSize: '100% 150%',
          animation: 'scanZigZag 2s linear infinite alternate',
          '@keyframes scanZigZag': {
            '0%': {
              backgroundPosition: '0% 100%',
            },
            '100%': {
              backgroundPosition: '0% 0%',
            },
          },
        }}
      />
      {/* Robot Not Detected Content */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: 'calc(100vh - 44px)',
          position: 'relative',
          zIndex: 2,
        }}
      >
        {/* Illustration pleine largeur */}
        <Box 
          sx={{ 
            width: '100%',
            maxWidth: '100%',
            mb: 4,
            px: 0,
            display: 'flex',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          <img 
            src={unpluggedCableSvg} 
            alt="USB Unplugged" 
            style={{ 
              width: '100%',
              maxWidth: '450px',
              height: 'auto',
              opacity: .9,
            }} 
          />
        </Box>
        
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
            Robot Not Detected
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
            Connect your Reachy Mini via <strong>USB</strong> to get started
          </Typography>

          {/* Box invisible de même hauteur que le bouton "Start" (minHeight: 42 + py: 1.25) */}
          <Box
            sx={{
              mt: 4,
              minHeight: 42,
              py: 1.25,
              display: 'flex',
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
              Scanning for USB connection{dots}
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

