import React from 'react';
import { 
  Box, 
  Typography, 
  Button,
  TextField,
  CircularProgress,
} from '@mui/material';
import WifiIcon from '@mui/icons-material/Wifi';
import FullscreenOverlay from '../../FullscreenOverlay';
import NetworkSelect from '../../wifi/NetworkSelect';

/**
 * Change WiFi Network Overlay
 * Allows user to connect Reachy to a different WiFi network
 */
export default function ChangeWifiOverlay({
  open,
  onClose,
  darkMode,
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
}) {
  const textPrimary = darkMode ? '#f5f5f5' : '#333';
  const textSecondary = darkMode ? '#888' : '#666';

  return (
    <FullscreenOverlay
      open={open}
      onClose={onClose}
      darkMode={darkMode}
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
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
          <WifiIcon sx={{ fontSize: 28, color: textPrimary }} />
          <Typography
            variant="h5"
            sx={{
              fontWeight: 600,
              color: textPrimary,
            }}
          >
            Change Network
          </Typography>
        </Box>
        
        {/* Warning */}
        <Box
          sx={{
            mb: 3,
            p: 2,
            borderRadius: '12px',
            bgcolor: darkMode ? 'rgba(255, 152, 0, 0.15)' : 'rgba(255, 152, 0, 0.1)',
            border: `1px solid ${darkMode ? 'rgba(255, 152, 0, 0.3)' : 'rgba(255, 152, 0, 0.2)'}`,
          }}
        >
          <Typography sx={{ 
            fontSize: 12, 
            color: darkMode ? '#FFB74D' : '#F57C00',
            lineHeight: 1.6,
          }}>
            ⚠️ <strong>Important:</strong> If the new network is different from your computer's, 
            you will <strong>lose connection</strong> to the robot.
          </Typography>
        </Box>
        
        {/* Current network info */}
        {wifiStatus?.connected_network && (
          <Typography sx={{ 
            fontSize: 12, 
            color: textSecondary, 
            mb: 2,
            textAlign: 'center',
          }}>
            Currently connected to: <strong style={{ color: textPrimary }}>{wifiStatus.connected_network}</strong>
          </Typography>
        )}
        
        {/* Form */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
          <NetworkSelect
            value={selectedSSID}
            onChange={onSSIDChange}
            networks={availableNetworks}
            disabled={isConnecting}
            onOpen={onRefresh}
            connectedNetwork={wifiStatus?.connected_network}
            darkMode={darkMode}
            zIndex={10004}
          />

          <TextField
            label="Password"
            type="password"
            value={wifiPassword}
            onChange={(e) => onPasswordChange(e.target.value)}
            size="small"
            fullWidth
            disabled={isConnecting}
          />
          
          {wifiError && (
            <Typography sx={{ fontSize: 11, color: '#ef4444' }}>
              ⚠️ {wifiError}
            </Typography>
          )}
        </Box>
        
        {/* Action */}
        <Button 
          onClick={onConnect}
          variant="outlined"
          color="primary"
          disabled={!selectedSSID || !wifiPassword || isConnecting}
          fullWidth
          sx={{ 
            py: 1.25,
            borderRadius: '10px',
            textTransform: 'none',
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          {isConnecting ? (
            <CircularProgress size={18} color="inherit" />
          ) : (
            'Connect'
          )}
        </Button>
      </Box>
    </FullscreenOverlay>
  );
}

