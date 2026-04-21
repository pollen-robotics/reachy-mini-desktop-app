import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Typography, LinearProgress } from '@mui/material';
import WifiIcon from '@mui/icons-material/Wifi';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import FullscreenOverlay from '../../FullscreenOverlay';

export interface WifiConnectingOverlayProps {
  /** Controls visibility of the overlay. */
  open: boolean;
  /** SSID the robot is being reconfigured to join. Used for display only. */
  targetSsid: string;
  darkMode: boolean;
  /**
   * Total duration of the countdown, in seconds. Defaults to 20s which matches
   * the typical time NetworkManager takes to tear down the current connection,
   * associate with the new SSID, negotiate DHCP and let the daemon come back.
   */
  durationSeconds?: number;
  /**
   * Called once the countdown hits zero. The caller is expected to close the
   * settings view and ``resetAll()`` the store so the app falls back to
   * ``FindingRobotView`` (the Reachy selection screen).
   */
  onTimeout: () => void;
}

/**
 * Full-screen modal shown while Reachy is reconfiguring its WiFi.
 *
 * UX goals:
 *   - Tell the user the robot is **currently reconfiguring its network** and
 *     the app link will drop for a short moment (~20s).
 *   - Make it clear that a wrong password is not destructive: NetworkManager
 *     will fall back to the previous known network on failure.
 *   - After the countdown we return the user to the robot-selection screen
 *     (owner handles that via ``onTimeout``).
 *
 * This component is purely presentational: it only owns the countdown timer.
 * The actual POST to ``/wifi/connect`` and the ``resetAll()`` transition are
 * driven by the caller (``SettingsOverlay``).
 */
export default function WifiConnectingOverlay({
  open,
  targetSsid,
  darkMode,
  durationSeconds = 20,
  onTimeout,
}: WifiConnectingOverlayProps): React.ReactElement {
  const [remaining, setRemaining] = useState<number>(durationSeconds);
  // Keep the latest ``onTimeout`` in a ref so the interval effect doesn't need
  // the callback in its dependency list (would cause the interval to restart
  // on every parent re-render and reset the countdown).
  const onTimeoutRef = useRef(onTimeout);
  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  useEffect(() => {
    if (!open) {
      setRemaining(durationSeconds);
      return;
    }

    setRemaining(durationSeconds);
    const startedAt = Date.now();
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const next = Math.max(0, durationSeconds - elapsed);
      setRemaining(next);
      if (next === 0) {
        clearInterval(interval);
        onTimeoutRef.current();
      }
    }, 250);

    return () => clearInterval(interval);
  }, [open, durationSeconds]);

  const progressPct = useMemo(() => {
    if (durationSeconds <= 0) return 100;
    return ((durationSeconds - remaining) / durationSeconds) * 100;
  }, [durationSeconds, remaining]);

  const textPrimary = darkMode ? '#f5f5f5' : '#222';
  const textSecondary = darkMode ? '#aaa' : '#555';
  const textMuted = darkMode ? '#888' : '#777';

  return (
    <FullscreenOverlay
      open={open}
      onClose={() => {
        /* non-dismissable: user must wait for the countdown */
      }}
      darkMode={darkMode}
      zIndex={10005}
      backdropOpacity={0.92}
      backdropBlur={16}
      debugName="WifiConnecting"
      showCloseButton={false}
    >
      <Box
        sx={{
          width: '100%',
          maxWidth: 460,
          mx: 'auto',
          px: 3,
          textAlign: 'center',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            mb: 2.5,
          }}
        >
          <Box
            sx={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              bgcolor: darkMode ? 'rgba(255, 149, 0, 0.14)' : 'rgba(255, 149, 0, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
            }}
          >
            <WifiIcon
              color="primary"
              sx={{
                fontSize: 36,
                animation: 'wifiPulse 1.6s ease-in-out infinite',
                '@keyframes wifiPulse': {
                  '0%, 100%': { opacity: 0.55 },
                  '50%': { opacity: 1 },
                },
              }}
            />
          </Box>
        </Box>

        <Typography
          variant="h5"
          sx={{
            fontWeight: 700,
            color: textPrimary,
            mb: 1,
            letterSpacing: '0.2px',
          }}
        >
          Reconfiguring Reachy&apos;s WiFi
        </Typography>

        {targetSsid && (
          <Typography
            sx={{
              fontSize: 13,
              color: textSecondary,
              mb: 3,
            }}
          >
            Connecting to <strong style={{ color: textPrimary }}>{targetSsid}</strong>&hellip;
          </Typography>
        )}

        <Box
          sx={{
            mb: 2.5,
            px: 1,
          }}
        >
          <LinearProgress
            variant="determinate"
            value={progressPct}
            color="primary"
            sx={{
              height: 6,
              borderRadius: 3,
              bgcolor: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
              '& .MuiLinearProgress-bar': {
                borderRadius: 3,
                transition: 'transform 0.25s linear',
              },
            }}
          />
          <Typography
            sx={{
              mt: 1,
              fontSize: 12,
              color: textMuted,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            Returning to robot selection in {remaining}s&hellip;
          </Typography>
        </Box>

        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 1.25,
            textAlign: 'left',
            p: 2,
            borderRadius: '12px',
            bgcolor: darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
            border: `1px solid ${darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
            mb: 1.5,
          }}
        >
          <InfoOutlinedIcon
            color="primary"
            sx={{
              fontSize: 18,
              mt: '2px',
              flexShrink: 0,
            }}
          />
          <Typography
            sx={{
              fontSize: 12.5,
              color: textSecondary,
              lineHeight: 1.6,
            }}
          >
            Reachy is switching networks, so the app will lose its link for about{' '}
            {durationSeconds} seconds. You&apos;ll then be taken back to the robot selection
            screen to reconnect.
          </Typography>
        </Box>

        <Typography
          sx={{
            fontSize: 11.5,
            color: textMuted,
            lineHeight: 1.6,
            px: 0.5,
          }}
        >
          If the password is wrong, Reachy will automatically fall back to its previous network -
          nothing is lost, you can just try again from the selection screen.
        </Typography>
      </Box>
    </FullscreenOverlay>
  );
}
