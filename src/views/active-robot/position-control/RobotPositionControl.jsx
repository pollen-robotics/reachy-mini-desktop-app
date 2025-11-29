import React from 'react';
import { Box, Typography, IconButton, Tooltip } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { Joystick2D, VerticalSlider, SimpleSlider, CircularSlider } from './components';
import { useRobotPosition } from './hooks';
import { EXTENDED_ROBOT_RANGES } from '../../../utils/inputConstants';
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
        {/* ANTENNAS - Left Card */}
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
            value={(localValues.antennas?.[0] || 0) * (180 / Math.PI)} // Convert rad to deg for display
            smoothedValue={smoothedValues?.antennas?.[0] !== undefined ? smoothedValues.antennas[0] * (180 / Math.PI) : undefined}
            onChange={(valueDeg, continuous) => {
              const valueRad = valueDeg * (Math.PI / 180); // Convert deg to rad for API
              handleAntennasChange('left', valueRad, continuous);
            }}
            min={-180} // Degrees: -180° to 180°
            max={180}
            unit="deg" // Display in degrees
            darkMode={darkMode}
          />
        </Box>

        {/* ANTENNAS - Right Card */}
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
            value={(localValues.antennas?.[1] || 0) * (180 / Math.PI)} // Convert rad to deg for display
            smoothedValue={smoothedValues?.antennas?.[1] !== undefined ? smoothedValues.antennas[1] * (180 / Math.PI) : undefined}
            onChange={(valueDeg, continuous) => {
              const valueRad = valueDeg * (Math.PI / 180); // Convert deg to rad for API
              handleAntennasChange('right', valueRad, continuous);
            }}
            min={-180} // Degrees: -180° to 180°
            max={180}
            unit="deg" // Display in degrees
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
              }
            }}>
              <Joystick2D
                label="Position X/Y"
                valueX={localValues.headPose.x}
                valueY={localValues.headPose.y}
                smoothedValueX={smoothedValues?.headPose?.x}
                smoothedValueY={smoothedValues?.headPose?.y}
                onChange={(x, y, continuous) => handleChange({ x, y }, continuous)}
                onDragEnd={handleDragEnd}
                minX={EXTENDED_ROBOT_RANGES.POSITION.min}
                maxX={EXTENDED_ROBOT_RANGES.POSITION.max}
                minY={EXTENDED_ROBOT_RANGES.POSITION.min}
                maxY={EXTENDED_ROBOT_RANGES.POSITION.max}
                size={135}
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
                valueX={localValues.headPose.yaw}
                valueY={localValues.headPose.pitch}
                smoothedValueX={smoothedValues?.headPose?.yaw}
                smoothedValueY={smoothedValues?.headPose?.pitch}
                onChange={(yaw, pitch, continuous) => handleChange({ yaw, pitch }, continuous)}
                onDragEnd={handleDragEnd}
                minX={EXTENDED_ROBOT_RANGES.YAW.min}
                maxX={EXTENDED_ROBOT_RANGES.YAW.max}
                minY={EXTENDED_ROBOT_RANGES.PITCH.min}
                maxY={EXTENDED_ROBOT_RANGES.PITCH.max}
                size={135}
                darkMode={darkMode}
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
          value={localValues.bodyYaw * (180 / Math.PI)} // Convert rad to deg for display
          smoothedValue={smoothedValues?.bodyYaw !== undefined ? smoothedValues.bodyYaw * (180 / Math.PI) : undefined}
          onChange={(valueDeg, continuous) => {
            const valueRad = valueDeg * (Math.PI / 180); // Convert deg to rad for API
            handleBodyYawChange(valueRad, continuous);
          }}
          min={-160} // Degrees: -160° to 160°
          max={160}
          unit="deg" // Display in degrees
          darkMode={darkMode}
          inverted={true} // Circle cut at top
          reverse={true} // Arc starts from opposite side (inverted direction)
        />
      </Box>
    </Box>
  );
}

