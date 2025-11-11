import React, { useMemo } from 'react';
import { Box, Typography, Button, CircularProgress } from '@mui/material';
import { getCurrentWindow } from '@tauri-apps/api/window';
import reachyBusteSvg from '../../assets/reachy-buste.svg';
import useAppStore from '../../store/useAppStore';

// 🤖 Messages de démarrage (titre fixe)
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
 * Vue affichée quand le robot est connecté mais le daemon n'est pas encore démarré
 */
export default function ReadyToStartView({ startDaemon, isStarting, usbPortName }) {
  const appWindow = window.mockGetCurrentWindow ? window.mockGetCurrentWindow() : getCurrentWindow();
  const { darkMode } = useAppStore();
  
  // Choisir un message aléatoire (mémorisé - ne change jamais)
  const randomMessage = useMemo(() => {
    return START_MESSAGES[Math.floor(Math.random() * START_MESSAGES.length)];
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
      }}
    >
      {/* Titlebar */}
      <Box
        onMouseDown={async (e) => {
          e.preventDefault();
          try {
            await appWindow.startDragging();
          } catch (err) {
            console.error('Drag error:', err);
          }
        }}
        sx={{
          height: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          cursor: 'move',
          userSelect: 'none',
        }}
      >
        <Box sx={{ width: 12, height: 12 }} />
        <Box sx={{ height: 20 }} /> {/* Espace pour le drag */}
        <Box sx={{ width: 20, height: 20 }} />
      </Box>

      {/* Start daemon view */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: 'calc(100% - 44px)',
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
            onClick={startDaemon}
            disabled={isStarting}
            variant="contained"
            color="primary"
            startIcon={isStarting ? (
              <CircularProgress size={14} thickness={3} sx={{ color: 'rgba(255, 255, 255, 0.8)' }} />
            ) : null}
            sx={{
              px: 3.5,
              py: 1.25,
              minHeight: 42,
              fontSize: 14,
              fontWeight: 600,
              textTransform: 'none',
              borderRadius: '20px',
              bgcolor: darkMode ? '#fff' : '#000',
              color: darkMode ? '#000' : '#fff',
              position: 'relative',
              overflow: 'hidden',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.06), inset 0 -1px 1px rgba(255, 255, 255, 0.15)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              letterSpacing: '-0.01em',
              '&::before': {
                content: '""',
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'radial-gradient(circle at 50% 0%, rgba(255, 149, 0, 0.15), transparent 70%)',
                opacity: 0,
                transition: 'opacity 0.3s ease',
              },
              '&:hover::before': {
                opacity: !isStarting ? 1 : 0,
              },
              '&:hover': {
                bgcolor: !isStarting ? (darkMode ? '#f5f5f5' : '#1a1a1a') : (darkMode ? '#fff' : '#000'),
                transform: !isStarting ? 'translateY(-1px)' : 'none',
                boxShadow: !isStarting 
                  ? '0 4px 12px rgba(0, 0, 0, 0.15), 0 2px 4px rgba(0, 0, 0, 0.08), inset 0 -1px 1px rgba(255, 255, 255, 0.2)'
                  : '0 2px 8px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.06), inset 0 -1px 1px rgba(255, 255, 255, 0.15)',
              },
              '&:active': {
                transform: !isStarting ? 'translateY(0px)' : 'none',
                boxShadow: '0 1px 4px rgba(0, 0, 0, 0.12)',
              },
              '&:disabled': {
                bgcolor: darkMode ? '#f5f5f5' : '#1a1a1a',
                color: darkMode ? 'rgba(0, 0, 0, 0.5)' : 'rgba(255, 255, 255, 0.7)',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
              },
            }}
          >
            {isStarting ? 'Starting...' : 'Start'}
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

