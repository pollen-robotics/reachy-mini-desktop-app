import React, { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Button, CircularProgress } from '@mui/material';
import UsbIcon from '@mui/icons-material/Usb';
import WifiIcon from '@mui/icons-material/Wifi';
import SportsEsportsIcon from '@mui/icons-material/SportsEsports';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import useAppStore from '../../store/useAppStore';
import { useRobotDiscovery } from '../../hooks/system';
import { useConnection, ConnectionMode } from '../../hooks/useConnection';
import idleReachyGif from '../../assets/videos/idle-reachy.gif';

/**
 * Connection card with icon, label, and status indicator
 */
function ConnectionCard({ 
  icon: Icon, 
  label,
  subtitle,
  available, 
  selected,
  onClick, 
  disabled,
  darkMode,
  alwaysAvailable = false,
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
        pt: 2.5,
        borderRadius: '14px',
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
        minWidth: 90,
        minHeight: 100,
        '&:hover': isClickable && !selected ? {
          borderColor: darkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.15)',
          bgcolor: darkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
        } : {},
      }}
    >
      {/* Status indicator - top left */}
      {!alwaysAvailable && (
        <Box
          sx={{
            position: 'absolute',
            top: 8,
            left: 8,
            width: 8,
            height: 8,
            borderRadius: '50%',
            bgcolor: available ? '#22c55e' : '#ef4444',
            boxShadow: available 
              ? '0 0 6px rgba(34, 197, 94, 0.5)' 
              : '0 0 6px rgba(239, 68, 68, 0.5)',
          }}
        />
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
          fontSize: 12,
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
          sx={{
            fontSize: 9,
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
  const { darkMode } = useAppStore();
  const { isScanning, usbRobot, wifiRobot } = useRobotDiscovery();
  const { connect, isConnecting } = useConnection();
  const [selectedMode, setSelectedMode] = useState(null);
  const [dots, setDots] = useState('');

  // Animated ellipsis dots
  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => prev === '...' ? '' : prev + '.');
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // Auto-select USB if it becomes available and nothing selected
  useEffect(() => {
    if (usbRobot.available && !selectedMode && !isConnecting) {
      setSelectedMode('usb');
    }
  }, [usbRobot.available, selectedMode, isConnecting]);

  // Auto-select WiFi if it becomes available and nothing selected (and no USB)
  useEffect(() => {
    if (wifiRobot.available && !selectedMode && !usbRobot.available && !isConnecting) {
      setSelectedMode('wifi');
    }
  }, [wifiRobot.available, selectedMode, usbRobot.available, isConnecting]);

  /**
   * Handle Start button click
   * Uses unified connect() from useConnection - same API for all modes
   */
  const handleStart = useCallback(async () => {
    if (!selectedMode || isConnecting) return;
    
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
  }, [selectedMode, isConnecting, usbRobot, wifiRobot, connect]);

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
        {/* Reachy GIF */}
        <Box 
          sx={{ 
            width: 160,
            height: 160,
            mb: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <img
            src={idleReachyGif}
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
            fontSize: 22,
              fontWeight: 600,
              color: darkMode ? '#f5f5f5' : '#333',
            mb: 0.5,
              textAlign: 'center',
            }}
          >
          Reachy Mini
          </Typography>
          
        {/* Subtitle - scanning status */}
            <Typography
              sx={{
                fontSize: 13,
                color: darkMode ? '#888' : '#666',
            textAlign: 'center',
            mb: 3,
            minHeight: 20,
              }}
            >
          {isScanning 
            ? `Scanning${dots}`
            : usbRobot.available || wifiRobot.available
              ? 'Select connection type'
              : 'No robot found'
          }
            </Typography>

        {/* Connection options - 3 cards */}
        <Box
                sx={{
            display: 'flex',
            gap: 1.5,
            width: '100%',
            maxWidth: 340,
            mb: 3,
          }}
        >
          <ConnectionCard
            icon={UsbIcon}
            label="USB"
            subtitle={usbRobot.available ? usbRobot.portName?.split('/').pop() : null}
            available={usbRobot.available}
            selected={selectedMode === ConnectionMode.USB}
            onClick={() => usbRobot.available && setSelectedMode(ConnectionMode.USB)}
            disabled={isConnecting}
            darkMode={darkMode}
          />
          
          <ConnectionCard
            icon={WifiIcon}
            label="WiFi"
            subtitle={wifiRobot.available ? wifiRobot.host : null}
            available={wifiRobot.available}
            selected={selectedMode === ConnectionMode.WIFI}
            onClick={() => wifiRobot.available && setSelectedMode(ConnectionMode.WIFI)}
            disabled={isConnecting}
            darkMode={darkMode}
          />
          
          <ConnectionCard
            icon={SportsEsportsIcon}
            label="Simulation"
            subtitle="MuJoCo"
            available={true}
            alwaysAvailable={true}
            selected={selectedMode === ConnectionMode.SIMULATION}
            onClick={() => setSelectedMode(ConnectionMode.SIMULATION)}
            disabled={isConnecting}
            darkMode={darkMode}
          />
        </Box>

        {/* Start Button - Primary Outlined */}
        <Button
          variant="outlined"
          onClick={handleStart}
          disabled={!canStart || isConnecting}
          startIcon={isConnecting ? (
            <CircularProgress size={18} sx={{ color: 'inherit' }} />
          ) : (
            <PlayArrowRoundedIcon sx={{ fontSize: 22 }} />
          )}
              sx={{
            minWidth: 140,
            minHeight: 44,
            borderRadius: '12px',
            fontSize: 14,
            fontWeight: 600,
            textTransform: 'none',
            borderWidth: 1,
            borderColor: canStart ? 'primary.main' : (darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'),
            color: canStart ? 'primary.main' : (darkMode ? '#666' : '#999'),
                '&:hover': {
              borderWidth: 1,
              bgcolor: canStart ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
            },
            '&:disabled': {
              borderWidth: 1,
              borderColor: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
              color: darkMode ? '#555' : '#bbb',
                },
              }}
            >
          {isConnecting ? 'Connecting...' : 'Start'}
        </Button>
      </Box>
    </Box>
  );
}
