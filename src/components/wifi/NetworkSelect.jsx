import React from 'react';
import { 
  Select, 
  MenuItem, 
  FormControl, 
  InputLabel,
  Typography,
} from '@mui/material';

/**
 * NetworkSelect - Reusable WiFi network dropdown
 * 
 * Used in:
 * - ChangeWifiOverlay (Settings)
 * - WiFiConfiguration (Setup flow)
 * 
 * @param {string} value - Selected SSID
 * @param {function} onChange - Callback when selection changes
 * @param {string[]} networks - List of available networks
 * @param {boolean} disabled - Disable the select
 * @param {function} onOpen - Callback when dropdown opens (for auto-refresh)
 * @param {boolean} isLoading - Show loading state
 * @param {string} connectedNetwork - Currently connected network (will be marked and disabled)
 * @param {boolean} showLabel - Show "Network" label (default: false)
 * @param {boolean} darkMode - Dark mode styling
 * @param {number} zIndex - Menu z-index (default: 10004)
 * @param {object} sx - Additional styles
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
}) {
  const textSecondary = darkMode ? '#888' : '#666';
  
  const selectContent = (
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      onOpen={onOpen}
      size="small"
      fullWidth
      label={showLabel ? "Network" : undefined}
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
          }
        }
      }}
      renderValue={(val) => {
        if (!val) {
          return (
            <span style={{ color: textSecondary }}>
              Select a network
            </span>
          );
        }
        return val;
      }}
      sx={sx}
    >
      {isLoading && networks.length === 0 ? (
        <MenuItem value="" disabled sx={{ color: textSecondary, fontSize: 12 }}>
          <em>Scanning networks...</em>
        </MenuItem>
      ) : networks.length === 0 ? (
        <MenuItem value="" disabled sx={{ color: textSecondary, fontSize: 12 }}>
          <em>No networks found</em>
        </MenuItem>
      ) : (
        networks.map((network, i) => {
          const isCurrentNetwork = connectedNetwork && network === connectedNetwork;
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

