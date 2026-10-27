import React from 'react';
import { Box, Typography, Button, TextField, CircularProgress } from '@mui/material';
import WifiIcon from '@mui/icons-material/Wifi';
import FullscreenOverlay from '../../FullscreenOverlay';
import NetworkSelect from '../../wifi/NetworkSelect';
import type { WifiStatus } from './SettingsWifiCard';
import { STATUS, accentAlpha } from '@styles/tokens';
import { useAppPalette, TYPO, FONT_WEIGHT, RADIUS } from '@styles';

export interface ChangeWifiOverlayProps {
  open: boolean;
  onClose: () => void;
  /** @deprecated Theme mode is now read from `useAppPalette()`. Prop kept for back-compat but ignored. */
  darkMode?: boolean;
  wifiStatus: WifiStatus | null;
  availableNetworks: unknown[];
  selectedSSID: string;
  wifiPassword: string;
  isConnecting: boolean;
  wifiError: string | null;
  onSSIDChange: (ssid: string) => void;
  onPasswordChange: (password: string) => void;
  onConnect: () => void;
  onRefresh: () => void;
}

export default function ChangeWifiOverlay({
  open,
  onClose,
  wifiStatus,
  availableNetworks,
  selectedSSID,
  wifiPassword,
  isConnecting,
  wifiError,
  onSSIDChange,
  onPasswordChange,
  onConnect,
  onRefresh,
}: ChangeWifiOverlayProps): React.ReactElement {
  const palette = useAppPalette();
  const textPrimary = palette.textPrimary;
  const textSecondary = palette.textSecondary;

  return (
    <FullscreenOverlay
      open={open}
      onClose={onClose}
      darkMode={palette.isDark}
      zIndex={10003}
      backdropOpacity={0.85}
      debugName="ChangeWifi"
      backdropBlur={12}
      showCloseButton={true}
    >
      <Box
        sx={{
          width: '100%',
          maxWidth: 400,
          mx: 'auto',
          px: 3,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
          <WifiIcon sx={{ fontSize: 28, color: textPrimary }} />
          <Typography
            variant="h5"
            sx={{
              fontWeight: FONT_WEIGHT.semibold,
              color: textPrimary,
            }}
          >
            Change Network
          </Typography>
        </Box>

        <Box
          sx={{
            mb: 3,
            p: 2,
            borderRadius: RADIUS.xl,
            bgcolor: palette.isDark ? accentAlpha(0.15) : accentAlpha(0.1),
            border: `1px solid ${palette.isDark ? accentAlpha(0.3) : accentAlpha(0.2)}`,
          }}
        >
          <Typography
            sx={{
              fontSize: TYPO.sm,
              color: palette.accentTextStrong,
              lineHeight: 1.6,
            }}
          >
            ⚠️ <strong>Important:</strong> If the new network is different from your computer's, you
            will <strong>lose connection</strong> to the robot.
          </Typography>
        </Box>

        {wifiStatus?.connected_network && (
          <Typography
            sx={{
              fontSize: TYPO.sm,
              color: textSecondary,
              mb: 2,
              textAlign: 'center',
            }}
          >
            Currently connected to:{' '}
            <strong style={{ color: textPrimary }}>{wifiStatus.connected_network}</strong>
          </Typography>
        )}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
          <NetworkSelect
            value={selectedSSID}
            onChange={onSSIDChange}
            networks={availableNetworks as string[]}
            disabled={isConnecting}
            onOpen={onRefresh}
            connectedNetwork={wifiStatus?.connected_network}
            darkMode={palette.isDark}
            zIndex={10004}
          />

          <TextField
            label="Password"
            type="password"
            value={wifiPassword}
            onChange={e => onPasswordChange(e.target.value)}
            size="small"
            fullWidth
            disabled={isConnecting}
          />

          {wifiError && (
            <Typography sx={{ fontSize: TYPO.xs, color: STATUS.error }}>⚠️ {wifiError}</Typography>
          )}
        </Box>

        <Button
          onClick={onConnect}
          variant="outlined"
          color="primary"
          disabled={!selectedSSID || isConnecting}
          fullWidth
          sx={{
            py: 1.25,
            borderRadius: RADIUS.lg,
            textTransform: 'none',
            fontWeight: FONT_WEIGHT.semibold,
            fontSize: TYPO.md,
          }}
        >
          {isConnecting ? <CircularProgress size={18} color="inherit" /> : 'Connect'}
        </Button>
      </Box>
    </FullscreenOverlay>
  );
}
