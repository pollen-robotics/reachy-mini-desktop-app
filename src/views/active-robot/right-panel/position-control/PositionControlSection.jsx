import React, { useRef, useState } from 'react';
import { Accordion, AccordionSummary, AccordionDetails, Box, Typography, IconButton, Tooltip, Chip } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import RefreshIcon from '@mui/icons-material/Refresh';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import SportsEsportsIcon from '@mui/icons-material/SportsEsports';
import RobotPositionControl from '../../position-control';
import { useGamepadConnected, useActiveDevice } from '../../../../utils/InputManager';
import { useWindowFocus } from '../../../../hooks/system/useWindowFocus';

/**
 * Position Control Section - Wrapper with Accordion
 */
export default function PositionControlSection({ 
  isActive = false,
  isBusy = false,
  darkMode = false,
}) {
  const positionControlResetRef = useRef(null);
  const [isAtInitialPosition, setIsAtInitialPosition] = useState(true);
  
  // Check if gamepad is connected and which device is active
  const isGamepadConnected = useGamepadConnected();
  const activeDevice = useActiveDevice();
  const hasWindowFocus = useWindowFocus();

  return (
    <Accordion
      defaultExpanded={true}
      sx={{
        boxShadow: 'none !important',
        bgcolor: 'transparent !important',
        backgroundColor: 'transparent !important',
        '&:before': { display: 'none' },
        '&.Mui-expanded': { margin: 0 },
        mt: 0,
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon sx={{ color: darkMode ? '#666' : '#bbb', opacity: 0.5 }} />}
        sx={{
          px: 3,
          py: 1,
          pt: 0,
          minHeight: 'auto',
          bgcolor: 'transparent !important',
          backgroundColor: 'transparent !important',
          '&.Mui-expanded': { minHeight: 'auto' },
          '& .MuiAccordionSummary-content': {
            margin: '12px 0',
            '&.Mui-expanded': { margin: '12px 0' },
          },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography
            sx={{
              fontSize: 20,
              fontWeight: 700,
              color: darkMode ? '#f5f5f5' : '#333',
              letterSpacing: '-0.3px',
            }}
          >
            Position Control
          </Typography>
          <Tooltip 
            title={
              <Box sx={{ p: 1 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 700, mb: 1, color: '#fff' }}>
                  API Documentation
                </Typography>
                <Typography sx={{ fontSize: 11, mb: 1, color: '#f0f0f0', lineHeight: 1.6 }}>
                  <strong>Endpoint:</strong> POST /api/move/set_target
                </Typography>
                <Typography sx={{ fontSize: 11, mb: 1, color: '#f0f0f0', lineHeight: 1.6 }}>
                  <strong>Request Body:</strong>
                </Typography>
                <Box component="pre" sx={{ fontSize: 10, mb: 1, color: '#e0e0e0', fontFamily: 'monospace', whiteSpace: 'pre-wrap', bgcolor: 'rgba(0,0,0,0.3)', p: 1, borderRadius: 1 }}>
{`{
  "target_head_pose": {
    "x": float,    // Position X (m), range: -0.05 to 0.05
    "y": float,    // Position Y (m), range: -0.05 to 0.05
    "z": float,    // Position Z/Height (m), range: -0.05 to 0.05
    "pitch": float, // Rotation pitch (rad), range: -0.8 to 0.8
    "yaw": float,   // Rotation yaw (rad), range: -1.2 to 1.2
    "roll": float   // Rotation roll (rad), range: -0.5 to 0.5
  },
  "target_antennas": [float, float], // [left, right] (rad), range: -π to π
  "target_body_yaw": float           // Body rotation (rad), range: -160° to 160°
}`}
                </Box>
                <Typography sx={{ fontSize: 11, mb: 0.5, color: '#f0f0f0', lineHeight: 1.6 }}>
                  <strong>Controls:</strong>
                </Typography>
                <Typography sx={{ fontSize: 10, mb: 1, color: '#e0e0e0', lineHeight: 1.6 }}>
                  • Drag joysticks/sliders for continuous movement<br/>
                  • Release to send final position<br/>
                  • All movements use set_target (no interpolation)<br/>
                  • Controls disabled when movements are active
                </Typography>
              </Box>
            }
            arrow 
            placement="right"
            componentsProps={{
              tooltip: {
                sx: {
                  maxWidth: 420,
                  bgcolor: 'rgba(26, 26, 26, 0.98)',
                  border: '1px solid rgba(255, 149, 0, 0.3)',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
                }
              },
              arrow: {
                sx: {
                  color: 'rgba(26, 26, 26, 0.98)',
                }
              }
            }}
          >
            <InfoOutlinedIcon sx={{ fontSize: 16, color: darkMode ? '#888' : '#999', cursor: 'help', ml: 0.75 }} />
          </Tooltip>
          {/* Input device indicator - only show if gamepad is connected */}
          {isGamepadConnected && (
            <Tooltip 
              title={activeDevice === 'gamepad' && hasWindowFocus
                ? 'Gamepad active' 
                : 'Gamepad connected'}
            >
              <Chip
                icon={<SportsEsportsIcon />}
                label=""
                size="small"
                color={activeDevice === 'gamepad' && hasWindowFocus ? 'primary' : 'default'}
                sx={{
                  height: 20,
                  width: 20,
                  minWidth: 20,
                  ml: 0.5,
                  opacity: hasWindowFocus ? 1 : 0.4, // Gray out when window loses focus
                  bgcolor: darkMode 
                    ? (activeDevice === 'gamepad' && hasWindowFocus
                        ? 'rgba(255, 149, 0, 0.2)' 
                        : 'rgba(255, 255, 255, 0.05)')
                    : (activeDevice === 'gamepad' && hasWindowFocus
                        ? 'rgba(255, 149, 0, 0.15)'
                        : 'rgba(0, 0, 0, 0.05)'),
                  border: `1px solid ${darkMode 
                    ? (activeDevice === 'gamepad' && hasWindowFocus
                        ? 'rgba(255, 149, 0, 0.3)' 
                        : 'rgba(255, 255, 255, 0.1)')
                    : (activeDevice === 'gamepad' && hasWindowFocus
                        ? 'rgba(255, 149, 0, 0.3)'
                        : 'rgba(0, 0, 0, 0.1)')}`,
                  '& .MuiChip-icon': {
                    fontSize: '0.9rem',
                    color: darkMode 
                      ? (activeDevice === 'gamepad' && hasWindowFocus
                          ? '#FF9500' 
                          : 'rgba(255, 255, 255, 0.6)')
                      : (activeDevice === 'gamepad' && hasWindowFocus
                          ? '#FF9500'
                          : 'rgba(0, 0, 0, 0.6)'),
                    margin: 0,
                  },
                  '& .MuiChip-label': {
                    display: 'none',
                  },
                }}
              />
            </Tooltip>
          )}
          {!isAtInitialPosition && (
            <Tooltip title="Reset all position controls" arrow>
              <IconButton 
                size="small" 
                onClick={(e) => {
                  e.stopPropagation(); // Prevent accordion from closing
                  if (positionControlResetRef.current) {
                    positionControlResetRef.current();
                  }
                }}
                disabled={!isActive || isBusy}
                sx={{ 
                  ml: 0.5,
                  color: darkMode ? '#888' : '#999',
                  '&:hover': {
                    color: '#FF9500',
                    bgcolor: darkMode ? 'rgba(255, 149, 0, 0.1)' : 'rgba(255, 149, 0, 0.05)',
                  }
                }}
              >
                <RefreshIcon sx={{ fontSize: 16, color: darkMode ? '#888' : '#999' }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 0, pt: 0, pb: 3, bgcolor: 'transparent !important', backgroundColor: 'transparent !important' }}>
        <RobotPositionControl
          isActive={isActive}
          darkMode={darkMode}
          onResetReady={(resetFn) => {
            positionControlResetRef.current = resetFn;
          }}
          onIsAtInitialPosition={(isAtInitial) => {
            setIsAtInitialPosition(isAtInitial);
          }}
        />
      </AccordionDetails>
    </Accordion>
  );
}

