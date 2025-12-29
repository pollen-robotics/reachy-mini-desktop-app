import React from 'react';
import { 
  Box, 
  Typography, 
  IconButton, 
  Button,
  CircularProgress,
  Switch,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import NewReleasesOutlinedIcon from '@mui/icons-material/NewReleasesOutlined';
import SectionHeader from './SectionHeader';

/**
 * Update Card Component
 * Simplified UX - shows only what's needed
 */
export default function SettingsUpdateCard({
  darkMode,
  title = "System Update",
  updateInfo,
  isCheckingUpdate,
  isUpdating,
  preRelease,
  onPreReleaseChange,
  onCheckUpdate,
  onUpdateClick,
  cardStyle,
  buttonStyle,
}) {
  const textPrimary = darkMode ? '#f5f5f5' : '#333';
  const textSecondary = darkMode ? '#888' : '#666';
  const textMuted = darkMode ? '#666' : '#999';

  return (
    <Box sx={cardStyle}>
      <SectionHeader 
        title={title}
        icon={SystemUpdateAltIcon} 
        darkMode={darkMode}
        action={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {/* Beta toggle */}
            <Box 
              onClick={() => onPreReleaseChange(!preRelease)}
              sx={{ 
                display: 'flex',
                alignItems: 'center',
                cursor: 'pointer',
              }}
            >
              <Switch
                checked={preRelease}
                onChange={(e) => onPreReleaseChange(e.target.checked)}
                size="small"
                sx={{
                  transform: 'scale(0.75)',
                  '& .MuiSwitch-switchBase': {
                    '&.Mui-checked': {
                      color: 'primary.main',
                      '& + .MuiSwitch-track': {
                        bgcolor: 'primary.main',
                        opacity: 0.5,
                      },
                    },
                  },
                  '& .MuiSwitch-track': {
                    bgcolor: darkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)',
                  },
                }}
              />
              <Typography sx={{ 
                fontSize: 10, 
                color: preRelease ? 'primary.main' : textMuted,
                mr: 1,
              }}>
                Beta
              </Typography>
            </Box>
            
            {/* Refresh button */}
            <IconButton
              onClick={onCheckUpdate}
              size="small"
              disabled={isCheckingUpdate}
              sx={{ 
                color: textMuted,
                p: 0.5,
                '&:hover': { color: textSecondary },
              }}
            >
              <RefreshIcon sx={{ 
                fontSize: 16,
                animation: isCheckingUpdate ? 'spin 1s linear infinite' : 'none',
                '@keyframes spin': {
                  '0%': { transform: 'rotate(0deg)' },
                  '100%': { transform: 'rotate(360deg)' },
                },
              }} />
            </IconButton>
          </Box>
        }
      />

      {/* Update Status - constant height container */}
      <Box sx={{ minHeight: 140, display: 'flex', flexDirection: 'column' }}>
        {isCheckingUpdate ? (
          // Loading state
          <Box sx={{ 
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center', 
            justifyContent: 'center',
            gap: 1.5,
          }}>
            <CircularProgress size={24} color="primary" />
            <Typography sx={{ fontSize: 12, color: textSecondary }}>
              Checking for updates...
            </Typography>
          </Box>
        ) : updateInfo ? (
          // Has update info
          <Box sx={{ 
            flex: 1,
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            gap: 1.5,
          }}>
            {updateInfo.is_available ? (
              // Update available
              <>
                <NewReleasesOutlinedIcon sx={{ fontSize: 32, color: 'primary.main' }} />
                <Box>
                  <Typography sx={{ 
                    fontSize: 14, 
                    fontWeight: 600,
                    color: textPrimary,
                    mb: 0.5,
                  }}>
                    Update available
              </Typography>
              <Typography sx={{ 
                    fontSize: 13, 
                    color: textSecondary,
                fontFamily: 'monospace', 
              }}>
                    {updateInfo.current_version} → {updateInfo.available_version}
              </Typography>
            </Box>
            <Button
              variant="outlined"
              onClick={onUpdateClick}
              disabled={isUpdating}
              sx={{
                ...buttonStyle, 
                    fontSize: 13,
                fontWeight: 600,
                    py: 1,
                    px: 4,
                borderRadius: '10px',
              }}
            >
                  {isUpdating ? <CircularProgress size={18} color="primary" /> : 'Update Now'}
            </Button>
              </>
            ) : (
              // Up to date
              <>
                <CheckCircleOutlineIcon sx={{ fontSize: 32, color: '#22c55e' }} />
                <Box>
                  <Typography sx={{ 
                    fontSize: 14, 
                    fontWeight: 600,
                    color: textPrimary,
                    mb: 0.5,
                  }}>
                    You're up to date
                  </Typography>
                  <Typography sx={{ 
                    fontSize: 12, 
                    color: textMuted,
                    fontFamily: 'monospace',
                  }}>
                    Version {updateInfo.current_version}
                  </Typography>
                </Box>
              </>
          )}
        </Box>
      ) : (
          // No info yet
        <Box sx={{ 
            flex: 1,
          display: 'flex', 
            flexDirection: 'column',
          alignItems: 'center', 
          justifyContent: 'center',
            gap: 1.5,
        }}>
            <Typography sx={{ fontSize: 12, color: textSecondary }}>
              Check for available updates
            </Typography>
          <Button
            variant="outlined"
            onClick={onCheckUpdate}
              size="small"
            sx={{ ...buttonStyle, fontSize: 12 }}
          >
              Check now
          </Button>
        </Box>
      )}
        
      </Box>
    </Box>
  );
}

