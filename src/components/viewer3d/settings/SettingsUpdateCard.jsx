import React from 'react';
import { 
  Box, 
  Typography, 
  IconButton, 
  Button,
  CircularProgress,
  Checkbox,
  FormControlLabel,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import NewReleasesOutlinedIcon from '@mui/icons-material/NewReleasesOutlined';
import SectionHeader from './SectionHeader';

/**
 * Update Card Component
 * Displays daemon/system update status and controls
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
          <FormControlLabel
            control={
              <Checkbox
                checked={preRelease}
                onChange={(e) => onPreReleaseChange(e.target.checked)}
                size="small"
                color="primary"
                sx={{
                  color: darkMode ? '#555' : '#ccc',
                  p: 0.5,
                }}
              />
            }
            label={
              <Typography sx={{ fontSize: 10, color: textMuted }}>
                beta
              </Typography>
            }
            sx={{ m: 0 }}
          />
        }
      />

      {/* Update Status */}
      {isCheckingUpdate ? (
        <Box sx={{ 
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center', 
          justifyContent: 'center',
          gap: 1.5,
          height: 159,
        }}>
          <CircularProgress size={24} color="primary" />
          <Typography sx={{ fontSize: 12, color: textSecondary }}>
            Checking for updates...
          </Typography>
        </Box>
      ) : updateInfo ? (
        <Box sx={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: 2,
          minHeight: 159,
        }}>
          {/* Status badge with refresh */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              {updateInfo.is_available ? (
                <NewReleasesOutlinedIcon sx={{ fontSize: 20, color: textSecondary }} />
              ) : (
                <CheckCircleOutlineIcon sx={{ fontSize: 20, color: textSecondary }} />
              )}
              <Typography sx={{ 
                fontSize: 13, 
                fontWeight: 600,
                color: textPrimary,
              }}>
                {updateInfo.is_available ? 'Update available' : 'Up to date'}
              </Typography>
            </Box>
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
          
          {/* Version info */}
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center',
            gap: 2,
            p: 1.5,
            borderRadius: '10px',
            bgcolor: darkMode ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.03)',
          }}>
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontSize: 9, color: textMuted, mb: 0.25, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Current
              </Typography>
              <Typography sx={{ fontSize: 12, fontFamily: 'monospace', color: textSecondary }}>
                {updateInfo.current_version}
              </Typography>
            </Box>
            <Box sx={{ width: '1px', height: 28, bgcolor: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', flexShrink: 0 }} />
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontSize: 9, color: textMuted, mb: 0.25, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Available
              </Typography>
              <Typography sx={{ 
                fontSize: 12, 
                fontFamily: 'monospace', 
                color: textSecondary,
                fontWeight: updateInfo.is_available ? 600 : 400,
              }}>
                {updateInfo.available_version}
              </Typography>
            </Box>
          </Box>
          
          {/* Update button */}
          {updateInfo.is_available && (
            <Button
              variant="outlined"
              onClick={onUpdateClick}
              disabled={isUpdating}
              fullWidth
              sx={{
                ...buttonStyle, 
                fontSize: 14,
                fontWeight: 600,
                py: 1.25,
                borderRadius: '10px',
              }}
            >
              {isUpdating ? <CircularProgress size={20} color="primary" /> : 'Update Now'}
            </Button>
          )}
        </Box>
      ) : (
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          height: 159,
        }}>
          <Button
            variant="outlined"
            onClick={onCheckUpdate}
            sx={{ ...buttonStyle, fontSize: 12 }}
          >
            Check for updates
          </Button>
        </Box>
      )}
    </Box>
  );
}

