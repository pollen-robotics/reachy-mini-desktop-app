import React, { useState } from 'react';
import { Box, Typography, Switch } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import PrivacyTipOutlinedIcon from '@mui/icons-material/PrivacyTipOutlined';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import useAppStore from '../../../store/useAppStore';
import type { FullAppState } from '../../../store/useStore';
import { isTelemetryEnabled, setTelemetryEnabled } from '../../../utils/telemetry';
import SectionHeader from './SectionHeader';
import { DURATION, blackAlpha, transition } from '@styles/tokens';
import { useAppPalette, TYPO, FONT_WEIGHT, RADIUS } from '@styles';

export interface SettingsPreferencesCardProps {
  /** @deprecated Theme mode is now read from `useAppPalette()`. Prop kept for back-compat but ignored. */
  darkMode?: boolean;
  cardStyle?: SxProps<Theme>;
}

export default function SettingsPreferencesCard({
  cardStyle,
}: SettingsPreferencesCardProps): React.ReactElement {
  const palette = useAppPalette();
  const textPrimary = palette.textPrimary;
  const textSecondary = palette.textSecondary;

  const rowBg = palette.isDark ? blackAlpha(0.2) : blackAlpha(0.02);
  const rowBgHover = palette.isDark ? blackAlpha(0.3) : blackAlpha(0.04);

  const isFullscreen = useAppStore((state: FullAppState) => state.isFullscreen);

  const [telemetryEnabled, setTelemetryEnabledState] = useState<boolean>(isTelemetryEnabled());

  const handleTelemetryToggle = (): void => {
    const newValue = !telemetryEnabled;
    setTelemetryEnabled(newValue);
    setTelemetryEnabledState(newValue);
  };

  return (
    <Box sx={cardStyle}>
      <SectionHeader title="Preferences" icon={null} darkMode={palette.isDark} />

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: 1.5,
          borderRadius: RADIUS.xl,
          bgcolor: rowBg,
          cursor: 'pointer',
          transition: transition('background', DURATION.fast),
          mb: 1.5,
          '&:hover': {
            bgcolor: rowBgHover,
          },
        }}
        onClick={() => useAppStore.getState().toggleDarkMode()}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {palette.isDark ? (
            <DarkModeOutlinedIcon sx={{ fontSize: TYPO.xl, color: textSecondary }} />
          ) : (
            <LightModeOutlinedIcon sx={{ fontSize: TYPO.xl, color: textSecondary }} />
          )}
          <Typography
            sx={{ fontSize: TYPO.body, fontWeight: FONT_WEIGHT.medium, color: textPrimary }}
          >
            {palette.isDark ? 'Dark Mode' : 'Light Mode'}
          </Typography>
        </Box>
        <Switch checked={palette.isDark} size="small" color="primary" />
      </Box>

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: 1.5,
          borderRadius: RADIUS.xl,
          bgcolor: rowBg,
          cursor: 'pointer',
          transition: transition('background', DURATION.fast),
          mb: 1.5,
          '&:hover': {
            bgcolor: rowBgHover,
          },
        }}
        onClick={() => useAppStore.getState().toggleFullscreen()}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {isFullscreen ? (
            <FullscreenExitIcon sx={{ fontSize: TYPO.xl, color: textSecondary }} />
          ) : (
            <FullscreenIcon sx={{ fontSize: TYPO.xl, color: textSecondary }} />
          )}
          <Typography
            sx={{ fontSize: TYPO.body, fontWeight: FONT_WEIGHT.medium, color: textPrimary }}
          >
            Fullscreen
          </Typography>
        </Box>
        <Switch checked={isFullscreen} size="small" color="primary" />
      </Box>

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: 1.5,
          borderRadius: RADIUS.xl,
          bgcolor: rowBg,
          cursor: 'pointer',
          transition: transition('background', DURATION.fast),
          '&:hover': {
            bgcolor: rowBgHover,
          },
        }}
        onClick={handleTelemetryToggle}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <PrivacyTipOutlinedIcon sx={{ fontSize: TYPO.xl, color: textSecondary }} />
          <Typography
            sx={{ fontSize: TYPO.body, fontWeight: FONT_WEIGHT.medium, color: textPrimary }}
          >
            Share anonymous usage data
          </Typography>
        </Box>
        <Switch checked={telemetryEnabled} size="small" color="primary" />
      </Box>

      <Box
        component="a"
        href="https://pollen-robotics.com/privacy"
        target="_blank"
        rel="noopener noreferrer"
        sx={{
          fontSize: TYPO.xs,
          color: 'primary.main',
          textDecoration: 'none',
          display: 'inline-block',
          width: 'fit-content',
          mt: 1,
          ml: 0.5,
          '&:hover': {
            textDecoration: 'underline',
          },
        }}
      >
        Learn more about privacy →
      </Box>
    </Box>
  );
}
