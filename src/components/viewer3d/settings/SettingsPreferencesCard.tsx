import React, { useEffect, useRef, useState } from 'react';
import { Box, Typography, Switch } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import PrivacyTipOutlinedIcon from '@mui/icons-material/PrivacyTipOutlined';
import useAppStore from '../../../store/useAppStore';
import { isTelemetryEnabled, setTelemetryEnabled } from '../../../utils/telemetry';
import {
  getDaemonTelemetry,
  markDaemonHandled,
  setDaemonTelemetry,
} from '../../../utils/telemetry/daemonTelemetry';
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

  const [telemetryEnabled, setTelemetryEnabledState] = useState<boolean>(isTelemetryEnabled());
  const [disabledByEnv, setDisabledByEnv] = useState(false);
  const [busy, setBusy] = useState(false);
  const clickedRef = useRef(false);

  // Show the connected robot's choice (it may have been changed from another
  // client). Display only: saving it would carry one robot's opt-out, or its
  // env override, into the app and onto every other robot.
  useEffect(() => {
    let cancelled = false;
    void getDaemonTelemetry().then(status => {
      // A click since the read started wins over this older answer.
      if (cancelled || clickedRef.current || status === null) return;
      setTelemetryEnabledState(status.enabled && !status.disabled_by_env);
      setDisabledByEnv(status.disabled_by_env);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleTelemetryToggle = async (): Promise<void> => {
    if (disabledByEnv || busy) return;
    clickedRef.current = true;
    const previous = telemetryEnabled;
    const newValue = !previous;
    const previousApp = isTelemetryEnabled();
    setTelemetryEnabled(newValue);
    setTelemetryEnabledState(newValue);
    setBusy(true);
    const status = await setDaemonTelemetry(newValue);
    if (status) {
      void markDaemonHandled();
    } else if (await getDaemonTelemetry()) {
      // The robot has the API but refused the write: undo the click.
      setTelemetryEnabled(previousApp);
      setTelemetryEnabledState(previous);
    }
    setBusy(false);
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
          cursor: disabledByEnv ? 'default' : 'pointer',
          transition: transition('background', DURATION.fast),
          '&:hover': {
            bgcolor: disabledByEnv ? rowBg : rowBgHover,
          },
        }}
        onClick={() => void handleTelemetryToggle()}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <PrivacyTipOutlinedIcon sx={{ fontSize: TYPO.xl, color: textSecondary }} />
          <Box>
            <Typography
              sx={{ fontSize: TYPO.body, fontWeight: FONT_WEIGHT.medium, color: textPrimary }}
            >
              Share anonymous usage data
            </Typography>
            {disabledByEnv && (
              <Typography sx={{ fontSize: TYPO.sm, color: textSecondary }}>
                Turned off by an environment variable on the robot.
              </Typography>
            )}
          </Box>
        </Box>
        <Switch
          checked={telemetryEnabled}
          disabled={disabledByEnv || busy}
          size="small"
          color="primary"
        />
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
