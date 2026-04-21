import {
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Typography,
  CircularProgress,
  Box,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';

export interface NetworkSelectProps {
  value: string;
  onChange: (value: string) => void;
  networks?: string[];
  disabled?: boolean;
  onOpen?: (source?: string) => void;
  isLoading?: boolean;
  connectedNetwork?: string | null;
  showLabel?: boolean;
  darkMode?: boolean;
  zIndex?: number;
  sx?: SxProps<Theme>;
}

/**
 * NetworkSelect - Reusable WiFi network dropdown
 *
 * Used in:
 * - ChangeWifiOverlay (Settings)
 * - WiFiConfiguration (Setup flow)
 */
export default function NetworkSelect({
  value,
  onChange,
  networks = [],
  disabled = false,
  onOpen,
  isLoading = false,
  connectedNetwork = null,
  showLabel = false,
  darkMode = false,
  zIndex = 10004,
  sx = {},
}: NetworkSelectProps) {
  const textSecondary = darkMode ? '#888' : '#666';

  const selectContent = (
    <Select
      value={value}
      onChange={(e: SelectChangeEvent<string>) => onChange(e.target.value)}
      disabled={disabled}
      onOpen={() => {
        if (onOpen) onOpen('NetworkSelect-onOpen');
      }}
      size="small"
      fullWidth
      label={showLabel ? 'Network' : undefined}
      displayEmpty
      notched={showLabel}
      MenuProps={{
        sx: { zIndex },
        PaperProps: {
          sx: {
            maxHeight: 200,
            bgcolor: darkMode ? '#1e1e1e' : '#fff',
            // Custom scrollbar
            '&::-webkit-scrollbar': {
              width: '6px',
            },
            '&::-webkit-scrollbar-track': {
              bgcolor: 'transparent',
            },
            '&::-webkit-scrollbar-thumb': {
              bgcolor: darkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
              borderRadius: '3px',
              '&:hover': {
                bgcolor: darkMode ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)',
              },
            },
          },
        },
      }}
      renderValue={(val: unknown) => {
        if (!val) {
          return <span style={{ color: textSecondary }}>Select a network</span>;
        }
        return val as string;
      }}
      sx={sx}
    >
      {isLoading && networks.length === 0 ? (
        <MenuItem value="" disabled sx={{ color: textSecondary, fontSize: 12 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CircularProgress size={14} thickness={3} sx={{ color: textSecondary }} />
            <em>Scanning networks...</em>
          </Box>
        </MenuItem>
      ) : networks.length === 0 ? (
        <MenuItem value="" disabled sx={{ color: textSecondary, fontSize: 12 }}>
          <em>No networks found</em>
        </MenuItem>
      ) : (
        networks.map((network, i) => {
          const isCurrentNetwork = Boolean(connectedNetwork && network === connectedNetwork);
          return (
            <MenuItem
              key={`${network}-${i}`}
              value={network}
              disabled={isCurrentNetwork}
              sx={{
                fontSize: 13,
                display: 'flex',
                justifyContent: 'space-between',
                '&.Mui-disabled': {
                  opacity: 1,
                  color: darkMode ? '#888' : '#666',
                },
              }}
            >
              {network}
              {isCurrentNetwork && (
                <Typography component="span" sx={{ fontSize: 10, color: '#22c55e', ml: 1 }}>
                  ✓ connected
                </Typography>
              )}
            </MenuItem>
          );
        })
      )}
    </Select>
  );

  if (showLabel) {
    return (
      <FormControl size="small" fullWidth>
        <InputLabel shrink>Network</InputLabel>
        {selectContent}
      </FormControl>
    );
  }

  return selectContent;
}
