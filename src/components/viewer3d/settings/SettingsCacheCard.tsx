import React, { useState } from 'react';
import { Box, Typography, Button, CircularProgress } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SectionHeader from './SectionHeader';
import { buildApiUrl, fetchWithTimeout, DAEMON_CONFIG } from '../../../config/daemon';
import { useToast } from '../../../hooks/useToast';

export interface SettingsCacheCardProps {
  darkMode: boolean;
  cardStyle?: SxProps<Theme>;
  buttonStyle?: SxProps<Theme>;
  onResetAppsClick: () => void;
  isResettingApps: boolean;
}

export default function SettingsCacheCard({
  darkMode,
  cardStyle,
  buttonStyle,
  onResetAppsClick,
  isResettingApps,
}: SettingsCacheCardProps): React.ReactElement {
  const [isClearing, setIsClearing] = useState<boolean>(false);
  const { showToast } = useToast();

  const handleClearCache = async (): Promise<void> => {
    setIsClearing(true);

    try {
      const response = await fetchWithTimeout(
        buildApiUrl('/cache/clear-hf'),
        { method: 'POST' },
        DAEMON_CONFIG.TIMEOUTS.COMMAND,
        { label: 'Clear HF cache', silent: true }
      );

      if (response.ok) {
        const data = await response.json();
        showToast(data.message || 'Cache cleared successfully', 'success');
      } else {
        const error = await response.json();
        showToast(error.detail || 'Failed to clear cache', 'error');
      }
    } catch (err) {
      console.error('Failed to clear HuggingFace cache:', err);
      showToast('Connection error', 'error');
    } finally {
      setIsClearing(false);
    }
  };

  const textSecondary = darkMode ? '#888' : '#666';
  const dangerColor = darkMode ? '#f87171' : '#dc2626';
  const dangerBorder = darkMode ? 'rgba(248, 113, 113, 0.5)' : 'rgba(220, 38, 38, 0.5)';
  const dangerHoverBg = darkMode ? 'rgba(248, 113, 113, 0.1)' : 'rgba(220, 38, 38, 0.08)';
  const disabledBorder = darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
  const disabledColor = darkMode ? '#555' : '#bbb';

  const dangerButtonStyle = {
    ...buttonStyle,
    fontSize: 12,
    py: 0.75,
    px: 2,
    borderRadius: '8px',
    color: dangerColor,
    borderColor: dangerBorder,
    '&:hover': {
      borderColor: dangerColor,
      bgcolor: dangerHoverBg,
    },
    '&:disabled': {
      borderColor: disabledBorder,
      color: disabledColor,
    },
  };

  return (
    <Box sx={cardStyle}>
      <SectionHeader title="Maintenance" icon={DeleteOutlineIcon} darkMode={darkMode} />

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Typography sx={{ fontSize: 12, color: textSecondary, lineHeight: 1.5 }}>
          Free up disk space by clearing cached AI models.
        </Typography>

        <Button
          variant="outlined"
          onClick={handleClearCache}
          disabled={isClearing}
          startIcon={
            isClearing ? <CircularProgress size={16} color="inherit" /> : <DeleteOutlineIcon />
          }
          sx={dangerButtonStyle}
        >
          {isClearing ? 'Clearing...' : 'Clear HuggingFace Cache'}
        </Button>

        <Typography sx={{ fontSize: 12, color: textSecondary, lineHeight: 1.5 }}>
          Uninstall all apps.
        </Typography>

        <Button
          variant="outlined"
          onClick={onResetAppsClick}
          disabled={isResettingApps}
          startIcon={
            isResettingApps ? <CircularProgress size={16} color="inherit" /> : <DeleteOutlineIcon />
          }
          sx={dangerButtonStyle}
        >
          {isResettingApps ? 'Resetting...' : 'Reset Apps Cache'}
        </Button>
      </Box>
    </Box>
  );
}
