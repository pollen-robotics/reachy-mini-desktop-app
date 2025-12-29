import React from 'react';
import { Box, Typography, Button, CircularProgress } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import qrCodeImage from '../../../assets/reachy-mini-access-point-QR-code.png';

export default function Step2ConnectHotspot({
  darkMode,
  textPrimary,
  textSecondary,
  reachyHotspots,
  isDaemonReachable,
  onOpenWifiSettings,
}) {
  const hotspotName = reachyHotspots[0]?.ssid || 'reachy-mini-ap';
  const [copiedField, setCopiedField] = React.useState(null);

  const handleCopy = async (text, field) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
    } catch (e) {
      console.error('Failed to copy:', e);
    }
  };

  const CredentialRow = ({ label, value, field }) => (
    <Box 
      onClick={() => handleCopy(value, field)}
      sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        py: 0.75,
        px: 1.5,
        borderRadius: '8px',
        bgcolor: darkMode ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        '&:hover': {
          bgcolor: darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
        },
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.25 }}>
        <Typography sx={{ fontSize: 9, color: textSecondary, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {label}
        </Typography>
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: textPrimary, fontFamily: 'monospace' }}>
          {value}
        </Typography>
      </Box>
      {copiedField === field ? (
        <CheckIcon sx={{ fontSize: 14, color: '#22c55e' }} />
      ) : (
        <ContentCopyIcon sx={{ fontSize: 14, color: textSecondary }} />
      )}
    </Box>
  );
  
  return (
    <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
      {isDaemonReachable ? (
        <>
          <Typography sx={{ fontSize: 15, fontWeight: 600, color: '#22c55e', mb: 1 }}>
            ✓ Connected to Reachy!
          </Typography>
          <Typography sx={{ fontSize: 12, color: textSecondary }}>
            Moving to WiFi configuration...
          </Typography>
        </>
      ) : (
        <>
          {/* QR Code + Credentials - Side by side */}
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 2,
            width: '100%',
            mb: 2.5,
          }}>
            {/* QR Code - 4/10 */}
            <Box sx={{ 
              width: '40%',
              flexShrink: 0,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
            }}>
              <Box sx={{ 
                bgcolor: '#fff', 
                p: 1, 
                borderRadius: '10px',
                width: 110,
                height: 110,
                boxShadow: darkMode ? '0 4px 12px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.1)',
              }}>
                <img 
                  src={qrCodeImage} 
                  alt="QR Code" 
                  style={{ width: '100%', height: '100%', display: 'block', objectFit: 'contain' }} 
                />
              </Box>
            </Box>

            {/* Credentials - 6/10 */}
            <Box sx={{ width: '60%', display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              <Typography sx={{ fontSize: 10, color: textSecondary, mb: 0.5, textAlign: 'left' }}>
                Scan QR or connect manually:
              </Typography>
              <CredentialRow label="Network" value={hotspotName} field="network" />
              <CredentialRow label="Password" value="reachy-mini" field="password" />
            </Box>
          </Box>

          {/* Primary Button */}
          <Button
            variant="outlined"
            endIcon={<OpenInNewIcon sx={{ fontSize: 16 }} />}
            onClick={onOpenWifiSettings}
            fullWidth
            sx={{
              fontSize: 13,
              fontWeight: 600,
              textTransform: 'none',
              borderColor: '#FF9500',
              color: '#FF9500',
              py: 1,
              borderRadius: '10px',
              mb: 2,
              '&:hover': {
                borderColor: '#e68600',
                bgcolor: 'rgba(255, 149, 0, 0.08)',
              },
            }}
          >
            Open WiFi Settings
          </Button>

          {/* Detection status */}
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 1,
          }}>
            <CircularProgress size={12} sx={{ color: '#FF9500' }} />
            <Typography sx={{ fontSize: 11, color: textSecondary }}>
              Detecting connection — we'll auto-advance when connected
            </Typography>
          </Box>
        </>
      )}
    </Box>
  );
}

