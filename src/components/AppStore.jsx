import React, { useState } from 'react';
import { Box, Typography, Button, Chip, IconButton } from '@mui/material';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';

/**
 * Application Store pour Reachy Mini
 * Affiche les apps installées et disponibles sur Hugging Face
 */

// Mock data - À remplacer par fetch depuis l'API HF
const HUGGINGFACE_APPS = [
  {
    id: 'hand-tracker',
    name: 'Hand Tracker',
    description: 'Make Reachy Mini follow your hand movements in real-time',
    icon: '👋',
    author: 'huggingface',
    category: 'Vision',
    downloads: 342,
  },
  {
    id: 'dance-mini',
    name: 'Dance Dance Mini',
    description: "Let's make Reachy Mini dance to the beat!",
    icon: '💃',
    author: 'community',
    category: 'Entertainment',
    downloads: 521,
  },
  {
    id: 'assembly-guide',
    name: 'Assembly Guide',
    description: 'Step-by-step interactive guide to assemble your Reachy Mini',
    icon: '🔧',
    author: 'huggingface',
    category: 'Tutorial',
    downloads: 1240,
  },
  {
    id: 'red-light-green-light',
    name: 'Red Light Green Light',
    description: 'Play the classic game with Reachy Mini',
    icon: '🚦',
    author: 'community',
    category: 'Game',
    downloads: 189,
  },
  {
    id: 'web-visualizer',
    name: '3D Web Visualizer',
    description: 'Advanced 3D visualization and control interface',
    icon: '🎮',
    author: 'huggingface',
    category: 'Tools',
    downloads: 654,
  },
];

export default function ApplicationStore() {
  const [installedApps, setInstalledApps] = useState([]);
  const [installingApps, setInstallingApps] = useState(new Set());

  const handleInstall = (appId) => {
    setInstallingApps(prev => new Set([...prev, appId]));
    
    // Simulation d'installation
    setTimeout(() => {
      setInstalledApps(prev => [...prev, appId]);
      setInstallingApps(prev => {
        const next = new Set(prev);
        next.delete(appId);
        return next;
      });
    }, 2000);
  };

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        overflowX: 'hidden',
        // Scrollbar styling
        '&::-webkit-scrollbar': {
          width: '6px',
        },
        '&::-webkit-scrollbar-track': {
          background: 'transparent',
        },
        '&::-webkit-scrollbar-thumb': {
          background: 'rgba(0, 0, 0, 0.1)',
          borderRadius: '3px',
        },
        '&:hover::-webkit-scrollbar-thumb': {
          background: 'rgba(0, 0, 0, 0.15)',
        },
      }}
    >
      {/* Header */}
      <Box sx={{ px: 3, pt: 2, pb: 2 }}>
        <Typography
          sx={{
            fontSize: 20,
            fontWeight: 700,
            color: '#333',
            letterSpacing: '-0.3px',
            mb: 0.5,
          }}
        >
          App Store
        </Typography>
        <Typography
          sx={{
            fontSize: 12,
            color: '#999',
            fontWeight: 500,
          }}
        >
          Extend Reachy's capabilities
        </Typography>
      </Box>

      {/* Installed Apps Section */}
      <Box sx={{ px: 3, mb: 3 }}>
        <Typography
          sx={{
            fontSize: 11,
            fontWeight: 700,
            color: '#666',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            mb: 1.5,
          }}
        >
          Installed Apps
        </Typography>
        
        {installedApps.length === 0 ? (
          <Box
            sx={{
              py: 3,
              px: 2,
              textAlign: 'center',
              borderRadius: '12px',
              bgcolor: 'rgba(0, 0, 0, 0.02)',
              border: '1px dashed rgba(0, 0, 0, 0.08)',
            }}
          >
            <Typography
              sx={{
                fontSize: 12,
                color: '#999',
                fontWeight: 500,
              }}
            >
              No apps installed yet
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {installedApps.map(appId => {
              const app = HUGGINGFACE_APPS.find(a => a.id === appId);
              return (
                <Box
                  key={appId}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    p: 1.5,
                    borderRadius: '10px',
                    bgcolor: 'rgba(34, 197, 94, 0.05)',
                    border: '1px solid rgba(34, 197, 94, 0.2)',
                  }}
                >
                  <Box sx={{ fontSize: 24 }}>{app.icon}</Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#333' }}>
                      {app.name}
                    </Typography>
                  </Box>
                  <CheckCircleOutlineIcon sx={{ fontSize: 16, color: '#22c55e' }} />
                </Box>
              );
            })}
          </Box>
        )}
      </Box>

      {/* Discover from Hugging Face */}
      <Box sx={{ px: 3, pb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1.5 }}>
          <Typography
            sx={{
              fontSize: 11,
              fontWeight: 700,
              color: '#666',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Discover
          </Typography>
          <Typography
            sx={{
              fontSize: 10,
              color: '#999',
              fontWeight: 500,
            }}
          >
            from 🤗 Hugging Face
          </Typography>
        </Box>
        
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {HUGGINGFACE_APPS.map((app) => {
            const isInstalled = installedApps.includes(app.id);
            const isInstalling = installingApps.has(app.id);
            
            return (
              <Box
                key={app.id}
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  p: 2,
                  borderRadius: '12px',
                  bgcolor: 'white',
                  border: (theme) => `1px solid ${theme.palette.divider}`,
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
                    borderColor: 'rgba(255, 149, 0, 0.3)',
                  },
                }}
              >
                {/* Header avec icône, titre et bouton */}
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 1 }}>
                  <Box
                    sx={{
                      fontSize: 32,
                      width: 44,
                      height: 44,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '10px',
                      bgcolor: 'rgba(255, 149, 0, 0.08)',
                      flexShrink: 0,
                    }}
                  >
                    {app.icon}
                  </Box>
                  
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      sx={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: '#333',
                        mb: 0.3,
                        lineHeight: 1.3,
                      }}
                    >
                      {app.name}
                    </Typography>
                    
                    <Typography
                      sx={{
                        fontSize: 11,
                        color: '#666',
                        lineHeight: 1.5,
                        mb: 1,
                      }}
                    >
                      {app.description}
                    </Typography>
                    
                    {/* Tags */}
                    <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                      <Chip
                        label={app.category}
                        size="small"
                        sx={{
                          height: 18,
                          fontSize: 9,
                          fontWeight: 600,
                          bgcolor: 'rgba(0, 0, 0, 0.04)',
                          color: '#666',
                          '& .MuiChip-label': { px: 1 },
                        }}
                      />
                      <Chip
                        label={`${app.downloads} downloads`}
                        size="small"
                        sx={{
                          height: 18,
                          fontSize: 9,
                          fontWeight: 500,
                          bgcolor: 'transparent',
                          color: '#999',
                          border: 'none',
                          '& .MuiChip-label': { px: 0.5 },
                        }}
                      />
                    </Box>
                  </Box>
                  
                  {/* Install Button */}
                  <Button
                    size="small"
                    disabled={isInstalled || isInstalling}
                    onClick={() => handleInstall(app.id)}
                    startIcon={isInstalled ? <CheckCircleOutlineIcon sx={{ fontSize: 14 }} /> : <DownloadOutlinedIcon sx={{ fontSize: 14 }} />}
                    sx={{
                      minWidth: 'auto',
                      px: 1.5,
                      py: 0.5,
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: 'none',
                      borderRadius: '8px',
                      flexShrink: 0,
                      bgcolor: isInstalled ? 'rgba(34, 197, 94, 0.08)' : 'transparent',
                      color: isInstalled ? '#22c55e' : '#FF9500',
                      border: isInstalled ? '1px solid rgba(34, 197, 94, 0.2)' : (theme) => `1px solid ${theme.palette.divider}`,
                      transition: 'all 0.2s ease',
                      '&:hover': {
                        bgcolor: isInstalled ? 'rgba(34, 197, 94, 0.12)' : 'rgba(255, 149, 0, 0.06)',
                        borderColor: isInstalled ? 'rgba(34, 197, 94, 0.3)' : '#FF9500',
                      },
                      '&:disabled': {
                        bgcolor: isInstalled ? 'rgba(34, 197, 94, 0.08)' : 'rgba(0, 0, 0, 0.02)',
                        color: isInstalled ? '#22c55e' : '#999',
                        borderColor: isInstalled ? 'rgba(34, 197, 94, 0.2)' : (theme) => theme.palette.divider,
                      },
                    }}
                  >
                    {isInstalling ? 'Installing...' : isInstalled ? 'Installed' : 'Install'}
                  </Button>
                </Box>
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}

