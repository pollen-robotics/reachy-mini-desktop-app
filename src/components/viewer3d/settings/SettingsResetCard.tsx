import React from 'react';
import { Box, Typography, Button, CircularProgress } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import DeleteForeverOutlinedIcon from '@mui/icons-material/DeleteForeverOutlined';
import SectionHeader from './SectionHeader';

export interface SettingsResetCardProps {
  darkMode: boolean;
  cardStyle?: SxProps<Theme>;
  buttonStyle?: SxProps<Theme>;
  onResetAppsVenv: () => void;
  isResettingAppsVenv: boolean;
  onResetPythonEnv: () => void;
  isResettingPythonEnv: boolean;
}

export default function SettingsResetCard({
  darkMode,
  cardStyle,
  buttonStyle,
  onResetAppsVenv,
  isResettingAppsVenv,
  onResetPythonEnv,
  isResettingPythonEnv,
}: SettingsResetCardProps): React.ReactElement {
  const textSecondary = darkMode ? '#888' : '#666';
  const dangerColor = darkMode ? '#f87171' : '#dc2626';
  const dangerBorder = darkMode ? 'rgba(248, 113, 113, 0.5)' : 'rgba(220, 38, 38, 0.5)';
  const dangerHoverBg = darkMode ? 'rgba(248, 113, 113, 0.1)' : 'rgba(220, 38, 38, 0.08)';
  const disabledBorder = darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
  const disabledColor = darkMode ? '#555' : '#bbb';

  const isDisabled = isResettingAppsVenv || isResettingPythonEnv;

  return (
    <Box sx={cardStyle}>
      <SectionHeader title="Environment" icon={RestartAltIcon} darkMode={darkMode} />

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Typography sx={{ fontSize: 12, color: textSecondary, lineHeight: 1.5 }}>
          Reset the apps environment. Installed apps will need to be reinstalled.
        </Typography>

        <Button
          variant="outlined"
          onClick={onResetAppsVenv}
          disabled={isDisabled}
          startIcon={
            isResettingAppsVenv ? (
              <CircularProgress size={16} color="inherit" />
            ) : (
              <RestartAltIcon />
            )
          }
          sx={{
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
          }}
        >
          {isResettingAppsVenv ? 'Resetting...' : 'Reset Apps Environment'}
        </Button>

        <Typography sx={{ fontSize: 12, color: textSecondary, lineHeight: 1.5, mt: 1 }}>
          Delete all Python files and re-download everything. This may take a few minutes.
        </Typography>

        <Button
          variant="outlined"
          onClick={onResetPythonEnv}
          disabled={isDisabled}
          startIcon={
            isResettingPythonEnv ? (
              <CircularProgress size={16} color="inherit" />
            ) : (
              <DeleteForeverOutlinedIcon />
            )
          }
          sx={{
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
          }}
        >
          {isResettingPythonEnv ? 'Resetting...' : 'Full Environment Reset'}
        </Button>
      </Box>
    </Box>
  );
}
