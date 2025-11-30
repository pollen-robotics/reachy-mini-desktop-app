import React from 'react';
import { Box, Typography, IconButton, Tooltip } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { Joystick2D, VerticalSlider, SimpleSlider, CircularSlider } from './components';
import { useRobotPosition } from './hooks';
import { EXTENDED_ROBOT_RANGES } from '../../../utils/inputConstants';
import { mapRobotToDisplay, mapDisplayToRobot } from '../../../utils/inputMappings';
import antennasIcon from '../../../assets/reachy-antennas-icon.svg';
import headIcon from '../../../assets/reachy-head-icon.svg';
import bodyIcon from '../../../assets/reachy-body-icon.svg';

/**
 * Robot Position Control - Main component
 * Provides 5 controls for robot positioning (2 joysticks + 3 sliders)
 * @param {boolean} isActive - Whether the component is active
 * @param {boolean} darkMode - Dark mode flag
 * @param {Function} onResetReady - Callback to expose reset function to parent
 * @param {Function} onIsAtInitialPosition - Callback to notify parent if robot is at initial position
 */
export default function RobotPositionControl({ isActive, darkMode, onResetReady, onIsAtInitialPosition }) {
  const {
    localValues,
    smoothedValues,
    handleChange,
    handleBodyYawChange,
    handleAntennasChange,
    handleDragEnd,
    addFrontendLog,
    resetAllValues,
  } = useRobotPosition(isActive);

  // Check if robot is at initial position (all values at zero)
  const isAtInitialPosition = React.useMemo(() => {
    if (!localValues) return true;
    
    const headPose = localValues.headPose || {};
    const antennas = localValues.antennas || [0, 0];
    const bodyYaw = localValues.bodyYaw || 0;
    
    const headAtZero = 
      (headPose.x === 0 || Math.abs(headPose.x) < 0.0001) &&
      (headPose.y === 0 || Math.abs(headPose.y) < 0.0001) &&
      (headPose.z === 0 || Math.abs(headPose.z) < 0.0001) &&
      (headPose.pitch === 0 || Math.abs(headPose.pitch) < 0.0001) &&
      (headPose.yaw === 0 || Math.abs(headPose.yaw) < 0.0001) &&
      (headPose.roll === 0 || Math.abs(headPose.roll) < 0.0001);
    
    const antennasAtZero = 
      (antennas[0] === 0 || Math.abs(antennas[0]) < 0.0001) &&
      (antennas[1] === 0 || Math.abs(antennas[1]) < 0.0001);
    
    const bodyYawAtZero = bodyYaw === 0 || Math.abs(bodyYaw) < 0.0001;
    
    return headAtZero && antennasAtZero && bodyYawAtZero;
  }, [localValues]);

  // Global reset function - resets all position controls
  const handleGlobalReset = React.useCallback(() => {
    // Use the dedicated reset function from the hook (sends single API call)
    resetAllValues();
    addFrontendLog(`↺ Reset all position controls to center`);
  }, [resetAllValues, addFrontendLog]);

  // Expose reset function to parent via callback
  React.useEffect(() => {
    if (onResetReady) {
      onResetReady(handleGlobalReset);
    }
  }, [onResetReady, handleGlobalReset]);

  // Notify parent about initial position status
  React.useEffect(() => {
    if (onIsAtInitialPosition) {
      onIsAtInitialPosition(isAtInitialPosition);
    }
  }, [onIsAtInitialPosition, isAtInitialPosition]);

  if (!isActive) return null;

  return (
    <Box sx={{ px: 3, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {/* ANTENNAS - Top level title */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: -0.5 }}>
        <Box
          component="img"
          src={antennasIcon}
          alt="Antennas"
          sx={{
            width: 20,
            height: 20,
            filter: darkMode 
              ? 'brightness(0) invert(1)' // White in dark mode
              : 'brightness(0) invert(0)', // Black in light mode
            opacity: darkMode ? 0.7 : 0.6,
          }}
        />
        <Typography
          sx={{
            fontSize: '11px',
            fontWeight: 700,
            color: darkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)',
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
          }}
        >
          Antennas
        </Typography>
      </Box>

      {/* ANTENNAS - Left and Right Cards on same line */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
        {/* ANTENNAS - Left Card (controls Left antenna) */}
        <Box sx={{
          px: 1.5,
          py: 0.75,
          borderRadius: '8px',
          boxSizing: 'border-box',
          bgcolor: darkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
          border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`,
        }}>
          <CircularSlider
            label="Left"
            value={localValues.antennas?.[0] || 0}
            smoothedValue={smoothedValues?.antennas?.[0]}
            onChange={(valueRad, continuous) => {
              handleAntennasChange('left', valueRad, continuous);
            }}
            min={-Math.PI}
            max={Math.PI}
            unit="rad"
            darkMode={darkMode}
          />
        </Box>

        {/* ANTENNAS - Right Card (controls Right antenna) */}
        <Box sx={{
          px: 1.5,
          py: 0.75,
          borderRadius: '8px',
          boxSizing: 'border-box',
          bgcolor: darkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
          border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          width: '100%',
        }}>
          <CircularSlider
            label="Right"
            value={localValues.antennas?.[1] || 0}
            smoothedValue={smoothedValues?.antennas?.[1]}
            onChange={(valueRad, continuous) => {
              handleAntennasChange('right', valueRad, continuous);
            }}
            min={-Math.PI}
            max={Math.PI}
            unit="rad"
            darkMode={darkMode}
            alignRight={true}
          />
        </Box>
      </Box>

      {/* HEAD - Top level title */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: -0.5 }}>
        <Box
          component="img"
          src={headIcon}
          alt="Head"
          sx={{
            width: 20,
            height: 20,
            filter: darkMode 
              ? 'brightness(0) invert(1)' // White in dark mode
              : 'brightness(0) invert(0)', // Black in light mode
            opacity: darkMode ? 0.7 : 0.6,
          }}
        />
        <Typography
          sx={{
            fontSize: '11px',
            fontWeight: 700,
            color: darkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)',
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
          }}
        >
          Head
        </Typography>
      </Box>

      {/* HEAD - Position X/Y/Z and Pitch/Yaw Cards on same line */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
        {/* HEAD - Card 1: Position X/Y/Z */}
        <Box sx={{
          p: 1.5,
          borderRadius: '8px',
          boxSizing: 'border-box',
          bgcolor: darkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
          border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`,
        }}>
          <Box sx={{ 
            display: 'flex', 
            gap: 0, 
            alignItems: 'stretch',
          }}>
            <Box sx={{ 
              flex: '1 1 auto',
              display: 'flex',
              alignItems: 'center',
              '& > *': {
                bgcolor: 'transparent !important',
                border: 'none !important',
                p: 0,
                borderRadius: '0 !important',
                '&:hover': {
                  bgcolor: 'transparent !important',
                  border: 'none !important',
                }
              },
              '& > * > *': {
                p: '0 !important', // Remove padding from Joystick2D container
              }
            }}>
              <Joystick2D
                label="Position X/Y"
                valueX={mapRobotToDisplay(localValues.headPose.y, 'positionY')}
                valueY={mapRobotToDisplay(localValues.headPose.x, 'positionX')}
                smoothedValueX={smoothedValues?.headPose?.y != null ? mapRobotToDisplay(smoothedValues.headPose.y, 'positionY') : undefined}
                smoothedValueY={smoothedValues?.headPose?.x != null ? mapRobotToDisplay(smoothedValues.headPose.x, 'positionX') : undefined}
                onChange={(x, y, continuous) => {
                  // Reverse the display mapping to get back to robot coordinates
                  // Note: x and y are swapped in onChange (x is actually robot Y, y is actually robot X)
                  // mapDisplayToRobot applies the same transformation (its own inverse for -value)
                  const robotY = mapDisplayToRobot(x, 'positionY');
                  const robotX = mapDisplayToRobot(y, 'positionX');
                  handleChange({ x: robotX, y: robotY }, continuous);
                }}
                onDragEnd={handleDragEnd}
                minX={EXTENDED_ROBOT_RANGES.POSITION.min}
                maxX={EXTENDED_ROBOT_RANGES.POSITION.max}
                minY={EXTENDED_ROBOT_RANGES.POSITION.min}
                maxY={EXTENDED_ROBOT_RANGES.POSITION.max}
                size={120}
                darkMode={darkMode}
              />
            </Box>
            <Box sx={{ 
              flex: '0 0 auto',
              display: 'flex',
              alignItems: 'center',
              '& > *': {
                bgcolor: 'transparent !important',
                border: 'none !important',
                p: 0,
                borderRadius: '0 !important',
                '&:hover': {
                  bgcolor: 'transparent !important',
                  border: 'none !important',
                }
              }
            }}>
              <VerticalSlider
                label="Position Z"
                value={localValues.headPose.z}
                smoothedValue={smoothedValues?.headPose?.z}
                onChange={(z, continuous) => handleChange({ z }, continuous)}
                min={-0.05}
                max={0.05}
                unit="m"
                darkMode={darkMode}
                centered={true}
                height={120}
              />
            </Box>
          </Box>
        </Box>

        {/* HEAD - Card 2: Pitch/Yaw */}
        <Box sx={{
          p: 1.5,
          borderRadius: '8px',
          boxSizing: 'border-box',
          bgcolor: darkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
          border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`,
        }}>
          <Box sx={{ 
            display: 'flex', 
            gap: 0, 
            alignItems: 'stretch',
            justifyContent: 'center',
          }}>
            <Box sx={{ 
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              '& > *': {
                bgcolor: 'transparent !important',
                border: 'none !important',
                p: 0,
                borderRadius: '0 !important',
                '&:hover': {
                  bgcolor: 'transparent !important',
                  border: 'none !important',
                }
              }
            }}>
              <Joystick2D
                label="Pitch / Yaw"
                valueX={mapRobotToDisplay(localValues.headPose.yaw, 'yaw')}
                valueY={mapRobotToDisplay(localValues.headPose.pitch, 'pitch')}
                smoothedValueX={smoothedValues?.headPose?.yaw != null ? mapRobotToDisplay(smoothedValues.headPose.yaw, 'yaw') : undefined}
                smoothedValueY={smoothedValues?.headPose?.pitch != null ? mapRobotToDisplay(smoothedValues.headPose.pitch, 'pitch') : undefined}
                onChange={(yaw, pitch, continuous) => {
                  // Reverse the display mapping to get back to robot coordinates
                  const robotYaw = mapDisplayToRobot(yaw, 'yaw');
                  const robotPitch = mapDisplayToRobot(pitch, 'pitch');
                  handleChange({ yaw: robotYaw, pitch: robotPitch }, continuous);
                }}
                onDragEnd={handleDragEnd}
                minX={EXTENDED_ROBOT_RANGES.YAW.min}
                maxX={EXTENDED_ROBOT_RANGES.YAW.max}
                minY={EXTENDED_ROBOT_RANGES.PITCH.min}
                maxY={EXTENDED_ROBOT_RANGES.PITCH.max}
                size={120}
                darkMode={darkMode}
                labelAlign="right"
              />
            </Box>
          </Box>
        </Box>
      </Box>

      {/* HEAD - Card 2: Roll */}
      <Box sx={{
        px: 1.5,
        py: 0.75,
        borderRadius: '8px',
        boxSizing: 'border-box',
        bgcolor: darkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
        border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`,
      }}>
        <SimpleSlider
          label="Roll"
          value={localValues.headPose.roll}
          smoothedValue={smoothedValues?.headPose?.roll}
          onChange={(roll, continuous) => handleChange({ roll }, continuous)}
          min={-0.5}
          max={0.5}
          darkMode={darkMode}
          centered={false}
          showRollVisualization={true}
        />
      </Box>

      {/* BODY - Top level title */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: -0.5 }}>
        <Box
          component="img"
          src={bodyIcon}
          alt="Body"
          sx={{
            width: 20,
            height: 20,
            filter: darkMode 
              ? 'brightness(0) invert(1)' // White in dark mode
              : 'brightness(0) invert(0)', // Black in light mode
            opacity: darkMode ? 0.7 : 0.6,
          }}
        />
        <Typography
          sx={{
            fontSize: '11px',
            fontWeight: 700,
            color: darkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)',
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
          }}
        >
          Body
        </Typography>
      </Box>

      {/* BODY - Yaw Card */}
      <Box sx={{
        px: 1.5,
        py: 0.75,
        borderRadius: '8px',
        boxSizing: 'border-box',
        bgcolor: darkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
        border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`,
      }}>
        <CircularSlider
          label="Yaw"
          value={localValues.bodyYaw}
          smoothedValue={smoothedValues?.bodyYaw}
          onChange={(valueRad, continuous) => {
            handleBodyYawChange(valueRad, continuous);
          }}
          min={-160 * Math.PI / 180}
          max={160 * Math.PI / 180}
          unit="rad"
          darkMode={darkMode}
          inverted={true} // Circle cut at top
          reverse={true} // Arc starts from opposite side (inverted direction)
        />
      </Box>
    </Box>
  );
}

