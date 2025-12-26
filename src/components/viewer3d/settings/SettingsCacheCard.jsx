import React, { useState } from 'react';
import { Box, Typography, Button, CircularProgress } from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import SectionHeader from './SectionHeader';
import { buildApiUrl, fetchWithTimeout, DAEMON_CONFIG } from '../../../config/daemon';

/**
 * Cache Card Component
 * Allows clearing HuggingFace cache on the robot
 */
export default function SettingsCacheCard({
  darkMode,
  cardStyle,
  buttonStyle,
}) {
  const [isClearing, setIsClearing] = useState(false);
  const [result, setResult] = useState(null); // { success: boolean, message: string } | null

  const handleClearCache = async () => {
    setIsClearing(true);
    setResult(null);

    try {
      const response = await fetchWithTimeout(
        buildApiUrl('/cache/clear-hf'),
        { method: 'POST' },
        DAEMON_CONFIG.TIMEOUTS.COMMAND,
        { label: 'Clear HF cache', silent: true }
      );

      if (response.ok) {
        const data = await response.json();
        setResult({ success: true, message: data.message || 'Cache cleared' });
      } else {
        const error = await response.json();
        setResult({ success: false, message: error.detail || 'Failed to clear cache' });
      }
    } catch (err) {
      console.error('Failed to clear HuggingFace cache:', err);
      setResult({ success: false, message: 'Connection error' });
    } finally {
      setIsClearing(false);
      // Clear result after 3 seconds
      setTimeout(() => setResult(null), 3000);
    }
  };

  const textSecondary = darkMode ? '#888' : '#666';

  return (
    <Box sx={cardStyle}>
      <SectionHeader 
        title="Cache Management" 
        icon={DeleteOutlineIcon} 
        darkMode={darkMode}
      />

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Typography sx={{ fontSize: 12, color: textSecondary, lineHeight: 1.5 }}>
          Clear downloaded AI models from HuggingFace to free up disk space on the robot.
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Button
            variant="outlined"
            onClick={handleClearCache}
            disabled={isClearing}
            startIcon={isClearing ? <CircularProgress size={16} color="inherit" /> : <DeleteOutlineIcon />}
            sx={{
              ...buttonStyle,
              fontSize: 12,
              py: 0.75,
              px: 2,
              borderRadius: '8px',
              // Use warning color for destructive action
              color: darkMode ? '#f87171' : '#dc2626',
              borderColor: darkMode ? 'rgba(248, 113, 113, 0.5)' : 'rgba(220, 38, 38, 0.5)',
              '&:hover': {
                borderColor: darkMode ? '#f87171' : '#dc2626',
                bgcolor: darkMode ? 'rgba(248, 113, 113, 0.1)' : 'rgba(220, 38, 38, 0.08)',
              },
              '&:disabled': {
                borderColor: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                color: darkMode ? '#555' : '#bbb',
              },
            }}
          >
            {isClearing ? 'Clearing...' : 'Clear HuggingFace Cache'}
          </Button>

          {/* Result indicator */}
          {result && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {result.success ? (
                <CheckCircleOutlineIcon sx={{ fontSize: 16, color: '#22c55e' }} />
              ) : (
                <ErrorOutlineIcon sx={{ fontSize: 16, color: '#ef4444' }} />
              )}
              <Typography sx={{ 
                fontSize: 11, 
                color: result.success ? '#22c55e' : '#ef4444',
              }}>
                {result.message}
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}

