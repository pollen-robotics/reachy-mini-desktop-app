import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Typography, Button, CircularProgress } from '@mui/material';
import UsbOutlinedIcon from '@mui/icons-material/UsbOutlined';
import WifiOutlinedIcon from '@mui/icons-material/WifiOutlined';
import ViewInArOutlinedIcon from '@mui/icons-material/ViewInArOutlined';
import PlayArrowOutlinedIcon from '@mui/icons-material/PlayArrowOutlined';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import useAppStore from '../../store/useAppStore';
import { useRobotDiscovery } from '../../hooks/system';
import { useConnection, ConnectionMode } from '../../hooks/useConnection';
import reachyBuste from '../../assets/reachy-buste.png';

// LocalStorage key for persisting last connection mode
const LAST_CONNECTION_MODE_KEY = 'reachy-mini-last-connection-mode';

/**
 * Connection card with icon, label, and status indicator
 */
function ConnectionCard({ 
  icon: Icon, 
  label,
  subtitle,
  fullSubtitle = null,
  available, 
  selected,
  onClick, 
  disabled,
  darkMode,
  alwaysAvailable = false,
  betaTag = false,
}) {
  const isClickable = (available || alwaysAvailable) && !disabled;
  const isAvailable = available || alwaysAvailable;
  
  return (
    <Box
      onClick={isClickable ? onClick : undefined}
      sx={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0.5,
        p: 2,
        borderRadius: '12px',
        border: '1px solid',
        borderColor: selected 
          ? 'primary.main'
          : (darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'),
        bgcolor: selected
          ? (darkMode ? 'rgba(99, 102, 241, 0.1)' : 'rgba(99, 102, 241, 0.05)')
          : 'transparent',
        cursor: isClickable ? 'pointer' : 'default',
        opacity: isAvailable ? 1 : 0.5,
        transition: 'all 0.2s ease',
        flex: 1,
        minWidth: 85,
        minHeight: 88,
        '&:hover': isClickable && !selected ? {
          borderColor: darkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.15)',
          bgcolor: darkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
        } : {},
      }}
    >
      {/* Status indicator - top left (subtle circle) */}
      {!alwaysAvailable && !selected && (
        <Box
          sx={{
            position: 'absolute',
            top: 6,
            right: 6,
            width: 16,
            height: 16,
            borderRadius: '50%',
            bgcolor: darkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Box
            sx={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              bgcolor: available ? '#22c55e' : '#ef4444',
            }}
          />
        </Box>
      )}
      
      {/* Beta tag - top left for alwaysAvailable cards */}
      {betaTag && (
        <Box
          sx={{
            position: 'absolute',
            top: 6,
            left: 6,
            px: 0.5,
            py: 0.15,
            borderRadius: '4px',
            bgcolor: darkMode ? 'rgba(255, 149, 0, 0.15)' : 'rgba(255, 149, 0, 0.1)',
            border: `1px solid ${darkMode ? 'rgba(255, 149, 0, 0.3)' : 'rgba(255, 149, 0, 0.25)'}`,
          }}
        >
          <Typography
            sx={{
              fontSize: 8,
              fontWeight: 600,
              color: '#FF9500',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              lineHeight: 1,
            }}
          >
            beta
          </Typography>
        </Box>
      )}
      
      {/* Selection checkmark - top right (outlined) */}
      {selected && (
        <Box
          sx={{
            position: 'absolute',
            top: 6,
            right: 6,
            width: 16,
            height: 16,
            borderRadius: '50%',
            bgcolor: darkMode ? 'rgba(26, 26, 26, 1)' : 'rgba(253, 252, 250, 1)',
            border: '1.5px solid',
            borderColor: 'primary.main',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'checkmarkPop 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
            '@keyframes checkmarkPop': {
              '0%': { transform: 'scale(0)', opacity: 0 },
              '100%': { transform: 'scale(1)', opacity: 1 },
            },
          }}
        >
          <CheckRoundedIcon 
            sx={{ 
              fontSize: 10, 
              color: 'primary.main',
            }} 
          />
        </Box>
      )}
      
      {/* Icon */}
      <Icon 
        sx={{ 
          fontSize: 28, 
          color: selected
            ? 'primary.main'
            : isAvailable
              ? (darkMode ? '#e0e0e0' : '#444')
              : (darkMode ? '#666' : '#999'),
        }} 
      />
      
      {/* Label */}
      <Typography
        sx={{
          fontSize: 13,
          fontWeight: selected ? 600 : 500,
          color: selected
            ? 'primary.main'
            : isAvailable
              ? (darkMode ? '#e0e0e0' : '#444')
              : (darkMode ? '#666' : '#999'),
          textAlign: 'center',
          lineHeight: 1.2,
        }}
      >
        {label}
      </Typography>
      
      {/* Subtitle (port name, host, etc.) */}
      {subtitle && (
        <Typography
          title={fullSubtitle || undefined}
          sx={{
            fontSize: 10,
            fontWeight: 400,
            color: darkMode ? '#666' : '#999',
            textAlign: 'center',
            lineHeight: 1.1,
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            px: 0.5,
          }}
        >
          {subtitle}
        </Typography>
      )}
    </Box>
  );
}

/**
 * FindingRobotView - Main connection selection view
 * User selects connection type and clicks Start
 * 
 * Uses useConnection hook for unified connection handling
 */
export default function FindingRobotView() {
  const { darkMode, setShowFirstTimeWifiSetup } = useAppStore();
  const { isScanning, usbRobot, wifiRobot } = useRobotDiscovery();
  const { connect, isConnecting, isDisconnecting } = useConnection();
  const [selectedMode, setSelectedMode] = useState(null);
  const [dots, setDots] = useState('');
  const hasRestoredFromStorage = useRef(false);
  
  // Block interactions during connection state changes
  const isBusy = isConnecting || isDisconnecting;

  // Animated ellipsis dots
  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => prev === '...' ? '' : prev + '.');
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // Restore last selected mode from localStorage on mount
  // Only run once, and only pre-select if that mode is currently available
  useEffect(() => {
    if (hasRestoredFromStorage.current || selectedMode || isBusy) return;
    
    try {
      const savedMode = localStorage.getItem(LAST_CONNECTION_MODE_KEY);
      if (savedMode) {
        // Only pre-select if the saved mode is available
        const isAvailable = 
          (savedMode === ConnectionMode.USB && usbRobot.available) ||
          (savedMode === ConnectionMode.WIFI && wifiRobot.available) ||
          savedMode === ConnectionMode.SIMULATION;
        
        if (isAvailable) {
          console.log(`🔌 Restored last connection mode: ${savedMode}`);
          setSelectedMode(savedMode);
          hasRestoredFromStorage.current = true;
        }
      }
    } catch (e) {
      // localStorage might not be available
    }
  }, [usbRobot.available, wifiRobot.available, selectedMode, isBusy]);

  // Auto-select USB if it becomes available and nothing selected (fallback if no saved preference)
  useEffect(() => {
    if (usbRobot.available && !selectedMode && !isBusy && !hasRestoredFromStorage.current) {
      setSelectedMode(ConnectionMode.USB);
    }
  }, [usbRobot.available, selectedMode, isBusy]);

  // Auto-select WiFi if it becomes available and nothing selected (and no USB, fallback)
  useEffect(() => {
    if (wifiRobot.available && !selectedMode && !usbRobot.available && !isBusy && !hasRestoredFromStorage.current) {
      setSelectedMode(ConnectionMode.WIFI);
    }
  }, [wifiRobot.available, selectedMode, usbRobot.available, isBusy]);

  // Auto-deselect if selected mode becomes unavailable
  // USB/WiFi can become unavailable if cable is unplugged or network changes
  useEffect(() => {
    if (isBusy) return; // Don't deselect during connection
    
    if (selectedMode === ConnectionMode.USB && !usbRobot.available) {
      console.log('🔌 USB became unavailable, deselecting');
      setSelectedMode(null);
    }
    if (selectedMode === ConnectionMode.WIFI && !wifiRobot.available) {
      console.log('🔌 WiFi became unavailable, deselecting');
      setSelectedMode(null);
    }
    // Simulation is always available, no need to check
  }, [selectedMode, usbRobot.available, wifiRobot.available, isBusy]);

  // Save selected mode to localStorage when user makes a selection
  const handleSelectMode = useCallback((mode) => {
    setSelectedMode(mode);
    try {
      localStorage.setItem(LAST_CONNECTION_MODE_KEY, mode);
    } catch (e) {
      // localStorage might not be available
    }
  }, []);

  /**
   * Handle Start button click
   * Uses unified connect() from useConnection - same API for all modes
   */
  const handleStart = useCallback(async () => {
    if (!selectedMode || isBusy) return;
    
    // 🔌 Unified connection API - same for USB, WiFi, and Simulation
    switch (selectedMode) {
      case ConnectionMode.USB:
        await connect(ConnectionMode.USB, { portName: usbRobot.portName });
        break;
      case ConnectionMode.WIFI:
        await connect(ConnectionMode.WIFI, { host: wifiRobot.host });
        break;
      case ConnectionMode.SIMULATION:
        await connect(ConnectionMode.SIMULATION);
        break;
    }
  }, [selectedMode, isBusy, usbRobot, wifiRobot, connect]);

  const canStart = selectedMode && (
    (selectedMode === ConnectionMode.USB && usbRobot.available) ||
    (selectedMode === ConnectionMode.WIFI && wifiRobot.available) ||
    selectedMode === ConnectionMode.SIMULATION
  );

  return (
    <Box
      sx={{
        width: '100vw',
        height: '100vh',
        background: darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(253, 252, 250, 0.85)',
        backdropFilter: 'blur(40px)',
        WebkitBackdropFilter: 'blur(40px)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          position: 'relative',
          zIndex: 2,
          px: 4,
        }}
      >
        {/* Reachy Buste */}
        <Box 
          sx={{ 
            width: 180,
            height: 180,
            mb: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <img
            src={reachyBuste}
            alt="Reachy Mini"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
            }} 
          />
        </Box>
        
        {/* Title */}
        <Typography
          sx={{
            fontSize: 20,
            fontWeight: 600,
            color: darkMode ? '#f5f5f5' : '#333',
            mb: 0.25,
            textAlign: 'center',
          }}
        >
          Connect to Reachy
        </Typography>
          
        {/* Subtitle - scanning status */}
        <Typography
          sx={{
            fontSize: 12,
            color: darkMode ? '#888' : '#666',
            textAlign: 'center',
            mb: 2.5,
            minHeight: 18,
          }}
        >
          {isScanning 
            ? `Looking for robots${dots}`
            : usbRobot.available || wifiRobot.available
              ? 'Choose how to connect'
              : 'No robot detected'
          }
        </Typography>

        {/* Connection options - 3 cards */}
        <Box
          sx={{
            display: 'flex',
            gap: 1.5,
            width: '100%',
            maxWidth: 320,
            mb: 2.5,
          }}
        >
          <ConnectionCard
            icon={UsbOutlinedIcon}
            label="Reachy Lite"
            subtitle={usbRobot.available ? usbRobot.portName?.split('/').pop() : null}
            fullSubtitle={usbRobot.available ? usbRobot.portName : null}
            available={usbRobot.available}
            selected={selectedMode === ConnectionMode.USB}
            onClick={() => usbRobot.available && handleSelectMode(ConnectionMode.USB)}
            disabled={isBusy}
            darkMode={darkMode}
          />
          
          <ConnectionCard
            icon={WifiOutlinedIcon}
            label="Reachy WiFi"
            subtitle={wifiRobot.available ? wifiRobot.host : null}
            fullSubtitle={wifiRobot.available ? wifiRobot.host : null}
            available={wifiRobot.available}
            selected={selectedMode === ConnectionMode.WIFI}
            onClick={() => wifiRobot.available && handleSelectMode(ConnectionMode.WIFI)}
            disabled={isBusy}
            darkMode={darkMode}
          />
          
          <ConnectionCard
            icon={ViewInArOutlinedIcon}
            label="Simulation"
            subtitle="Beta"
            available={true}
            alwaysAvailable={true}
            selected={selectedMode === ConnectionMode.SIMULATION}
            onClick={() => handleSelectMode(ConnectionMode.SIMULATION)}
            disabled={isBusy}
            darkMode={darkMode}
          />
        </Box>

        {/* Start Button - Primary Outlined */}
        <Button
          variant="outlined"
          onClick={handleStart}
          disabled={!canStart || isBusy}
          endIcon={isBusy ? (
            <CircularProgress size={18} sx={{ color: 'inherit' }} />
          ) : (
            <PlayArrowOutlinedIcon sx={{ fontSize: 22 }} />
          )}
              sx={{
            minWidth: 140,
            minHeight: 44,
            borderRadius: '12px',
            fontSize: 14,
            fontWeight: 600,
            textTransform: 'none',
            borderWidth: 1,
            borderColor: canStart ? '#FF9500' : (darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'),
            color: canStart ? '#FF9500' : (darkMode ? '#666' : '#999'),
            // Pulse animation when ready
            animation: (canStart && !isBusy) ? 'startPulse 3s ease-in-out infinite' : 'none',
            '@keyframes startPulse': {
              '0%, 100%': {
                boxShadow: darkMode
                  ? '0 0 0 0 rgba(255, 149, 0, 0.4)'
                  : '0 0 0 0 rgba(255, 149, 0, 0.3)',
              },
              '50%': {
                boxShadow: darkMode
                  ? '0 0 0 8px rgba(255, 149, 0, 0)'
                  : '0 0 0 8px rgba(255, 149, 0, 0)',
              },
            },
                '&:hover': {
              borderWidth: 1,
              bgcolor: canStart ? 'rgba(255, 149, 0, 0.1)' : 'transparent',
              borderColor: canStart ? '#FF9500' : (darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'),
              animation: 'none', // Stop pulse on hover
            },
            '&:disabled': {
              borderWidth: 1,
              borderColor: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
              color: darkMode ? '#555' : '#bbb',
              animation: 'none',
                },
              }}
            >
          {isBusy ? (isDisconnecting ? 'Stopping...' : 'Connecting...') : 'Start'}
        </Button>

        {/* First time WiFi setup link */}
        <Box
          sx={{
            position: 'absolute',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            textAlign: 'center',
          }}
        >
          <Typography
            sx={{
              fontSize: 12,
              color: darkMode ? '#888' : '#666',
            }}
          >
            First time connecting to your WiFi Reachy?{' '}
            <Box
              component="span"
              onClick={() => setShowFirstTimeWifiSetup(true)}
              sx={{
                color: '#FF9500',
                cursor: 'pointer',
                fontWeight: 500,
                textDecoration: 'none',
                '&:hover': {
                  textDecoration: 'underline',
                },
              }}
            >
              Click here
            </Box>
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
