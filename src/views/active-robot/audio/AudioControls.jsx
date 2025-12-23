import React from 'react';
import { Box, Typography, IconButton, Slider, Tooltip } from '@mui/material';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import AudioLevelBars from './AudioLevelBars';

/**
 * Audio Controls Component - Speaker and Microphone controls
 * Simplified and robust sizing for Tauri context
 */
function AudioControls({
  volume,
  microphoneVolume,
  speakerDevice,
  microphoneDevice,
  speakerPlatform,
  microphonePlatform,
  onVolumeChange,
  onMicrophoneChange,
  onMicrophoneVolumeChange,
  onSpeakerMute,
  onMicrophoneMute,
  darkMode,
  disabled = false,
}) {
  // Shared styles
  const cardStyle = {
    height: 64,
    borderRadius: '14px',
    bgcolor: darkMode ? '#1a1a1a' : '#ffffff',
    border: darkMode ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid rgba(0, 0, 0, 0.15)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  };

  const sliderStyle = {
    mb: 0,
    color: '#FF9500',
    height: 3,
    '& .MuiSlider-thumb': {
      width: 12,
      height: 12,
      backgroundColor: '#FF9500',
      border: `1.5px solid ${darkMode ? '#1a1a1a' : '#fff'}`,
      boxShadow: 'none',
      '&:hover': { boxShadow: '0 0 0 6px rgba(255, 149, 0, 0.12)' },
      '&.Mui-focusVisible': { boxShadow: '0 0 0 6px rgba(255, 149, 0, 0.16)' },
      '&.Mui-active': { boxShadow: '0 0 0 6px rgba(255, 149, 0, 0.16)' },
    },
    '& .MuiSlider-track': {
      backgroundColor: '#FF9500',
      border: 'none',
      height: 1.5,
    },
    '& .MuiSlider-rail': {
      backgroundColor: darkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)',
      height: 1.5,
      opacity: 1,
    },
  };

  const deviceTextStyle = {
    fontSize: 9,
    fontWeight: 500,
    color: darkMode ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.4)',
    fontFamily: 'SF Mono, Monaco, Menlo, monospace',
    letterSpacing: '0.02em',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };

  const platformTextStyle = {
    fontSize: 8,
    fontWeight: 400,
    color: darkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)',
    fontFamily: 'SF Mono, Monaco, Menlo, monospace',
    letterSpacing: '0.02em',
  };

  const renderControl = (label, tooltip, device, platform, volume, isActive, onMute, onVolumeChange) => (
    <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0.75, opacity: disabled ? 0.5 : 1, transition: 'opacity 0.2s ease' }}>
      {/* Label */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Typography sx={{ fontSize: 11, fontWeight: 600, color: darkMode ? '#888' : '#999', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {label}
        </Typography>
        <Tooltip title={tooltip} arrow placement="top">
          <InfoOutlinedIcon sx={{ fontSize: 12, color: darkMode ? '#666' : '#999', opacity: 0.6, cursor: 'help' }} />
        </Tooltip>
      </Box>

      {/* Card */}
      <Box sx={{ ...cardStyle, width: '100%', boxSizing: 'border-box' }}>
        {/* Controls row */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, p: 1.5, pb: 0, minWidth: 0 }}>
          {/* Device info */}
          <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0.25, overflow: 'hidden' }}>
            <Typography sx={deviceTextStyle}>{device}</Typography>
            {platform && <Typography sx={platformTextStyle}>{platform}</Typography>}
          </Box>

          {/* Mute button and slider */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
            <IconButton
              onClick={onMute}
              disabled={disabled}
              size="small"
              sx={{
                width: 20,
                height: 20,
                padding: 0,
                flexShrink: 0,
                color: isActive ? (darkMode ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)') : (darkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)'),
                '&:hover': {
                  color: isActive ? '#FF9500' : (darkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)'),
                  bgcolor: 'transparent',
                },
              }}
            >
              {isActive ? (
                label === 'Speaker' ? <VolumeUpIcon sx={{ fontSize: 14 }} /> : <MicIcon sx={{ fontSize: 14 }} />
              ) : (
                label === 'Speaker' ? <VolumeOffIcon sx={{ fontSize: 14 }} /> : <MicOffIcon sx={{ fontSize: 14 }} />
              )}
            </IconButton>
            <Box sx={{ width: 60, height: 24, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <Slider value={volume} onChange={(e, val) => onVolumeChange(val)} disabled={disabled} size="small" sx={sliderStyle} />
            </Box>
          </Box>
        </Box>

        {/* Visualizer - responsive width */}
        {/* Temporarily disabled - no example curve for now
        <Box sx={{ width: '100%', height: '28px', flexShrink: 0, overflow: 'hidden', boxSizing: 'border-box' }}>
          <AudioLevelBars 
            isActive={isActive} 
            color={darkMode ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.3)'} 
            barCount={8} 
          />
        </Box>
        */}
      </Box>
    </Box>
  );

  return (
    <Box sx={{ width: '100%', mb: 1.5, display: 'flex', gap: 1.5, alignItems: 'stretch', minWidth: 0, boxSizing: 'border-box' }}>
      {renderControl(
        'Speaker',
        "Adjust the robot's audio output volume",
        speakerDevice || 'Built-in Speaker',
        speakerPlatform,
        volume,
        volume > 0,
        onSpeakerMute,
        onVolumeChange
      )}
      {renderControl(
        'Microphone',
        "Adjust the robot's microphone input volume",
        microphoneDevice || 'USB Microphone',
        microphonePlatform,
        microphoneVolume,
        microphoneVolume > 0,
        onMicrophoneMute,
        onMicrophoneVolumeChange || ((val) => onMicrophoneChange(val > 0))
      )}
    </Box>
  );
}

export default React.memo(AudioControls);

