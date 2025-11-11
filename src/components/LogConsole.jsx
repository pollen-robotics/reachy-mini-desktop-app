import React, { useEffect, useRef } from 'react';
import { Box, Typography } from '@mui/material';
import useAppStore from '../store/useAppStore';

export default function LogConsole({ logs, darkMode = false }) {
  const scrollRef = useRef(null);
  const { frontendLogs } = useAppStore();
  const isFirstLoadRef = useRef(true);
  
  // Normaliser les logs : daemon (string) + frontend (object)
  const normalizedLogs = [
    ...logs.map(log => ({ 
      message: log, 
      source: 'daemon',
      timestamp: null // Daemon logs n'ont pas de timestamp séparé
    })),
    ...frontendLogs
  ];

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: isFirstLoadRef.current ? 'auto' : 'smooth' // Pas d'animation au 1er chargement
      });
      
      // Après le premier chargement, utiliser smooth
      if (isFirstLoadRef.current) {
        isFirstLoadRef.current = false;
      }
    }
  }, [normalizedLogs.length]);

  return (
    <Box
      ref={scrollRef}
      sx={{
        width: '100%',
        height: 100,
        borderRadius: '12px',
        bgcolor: darkMode ? '#262626' : '#ffffff',
        border: darkMode ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.12)',
        overflowY: 'auto',
        overflowX: 'hidden',
        px: 2,
        py: .5,
        fontFamily: 'SF Mono, Monaco, Menlo, monospace',
        fontSize: 10,
        transition: 'all 0.3s ease',
        '&::-webkit-scrollbar': {
          width: '4px',
        },
        '&::-webkit-scrollbar-track': {
          background: 'transparent',
        },
        '&::-webkit-scrollbar-thumb': {
          background: 'transparent',
          borderRadius: '2px',
        },
        '&:hover::-webkit-scrollbar-thumb': {
          background: darkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
        },
      }}
    >
      {normalizedLogs.length === 0 ? (
        <Typography sx={{ fontSize: 10, color: darkMode ? '#666' : '#999', fontFamily: 'inherit', textAlign: 'center' }}>
          No logs
        </Typography>
      ) : (
        normalizedLogs.map((log, index) => {
          const isDaemon = log.source === 'daemon';
          const isFrontend = log.source === 'frontend';
          const message = log.message;
          
          // Détection du type de log pour la couleur (basé sur les mots-clés)
          const isSuccess = message.includes('SUCCESS') || message.includes('✓');
          const isError = message.includes('FAILED') || message.includes('ERROR') || message.includes('❌');
          const isCommand = message.includes('→') || message.includes('▶️') || message.includes('📥');
          
          return (
            <Typography
              key={index}
              sx={{
                fontSize: 10,
                color: darkMode ? 
                  (isError ? '#ff8888' : 
                   isSuccess ? '#88ff88' : 
                   isCommand ? '#ffaa66' : 
                   isFrontend ? '#66ccff' :  // Bleu clair pour frontend
                   '#aaa') :                  // Gris pour daemon
                  (isError ? '#cc6666' : 
                   isSuccess ? '#66cc66' : 
                   isCommand ? '#ff8844' : 
                   isFrontend ? '#3399ff' :  // Bleu pour frontend
                   '#999'),                   // Gris pour daemon
                fontFamily: 'inherit',
                lineHeight: 1.6,
                mb: 0.3,
                fontWeight: isFrontend ? 500 : 400, // Frontend en gras
                opacity: isDaemon ? 0.85 : 1, // Daemon légèrement plus transparent
              }}
            >
              {log.timestamp && `[${log.timestamp}] `}{message}
            </Typography>
          );
        })
      )}
    </Box>
  );
}

