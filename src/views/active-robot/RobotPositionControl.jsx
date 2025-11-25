import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Typography, IconButton, Tooltip, Slider, Chip } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ApiIcon from '@mui/icons-material/Api';
import { buildApiUrl, fetchWithTimeout, DAEMON_CONFIG } from '../../config/daemon';
import useAppStore from '../../store/useAppStore';

/**
 * 2D Joystick Component - Compact
 * Follows mouse directly for intuitive control
 */
const Joystick2D = ({ label, valueX, valueY, onChange, onDragEnd, minX = -1, maxX = 1, minY = -1, maxY = 1, size = 100, darkMode }) => {
  const containerRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [localStickX, setLocalStickX] = useState(size / 2);
  const [localStickY, setLocalStickY] = useState(size / 2);

  const centerX = size / 2;
  const centerY = size / 2;
  const maxRadius = size / 2 - 16;
  const stickRadius = 8;

  // Update local stick position when values change (from external updates)
  useEffect(() => {
    if (!isDragging) {
      const normalizedX = ((valueX - minX) / (maxX - minX)) * 2 - 1;
      const normalizedY = 1 - ((valueY - minY) / (maxY - minY)) * 2; // Inverted Y
      setLocalStickX(centerX + normalizedX * maxRadius);
      setLocalStickY(centerY - normalizedY * maxRadius);
    }
  }, [valueX, valueY, minX, maxX, minY, maxY, centerX, centerY, maxRadius, isDragging]);

  // Convert mouse coordinates to joystick values
  const getValuesFromMouse = useCallback((clientX, clientY) => {
    if (!containerRef.current) return { x: valueX, y: valueY };
    
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;
    
    // Calculate offset from center
    let dx = mouseX - centerX;
    let dy = mouseY - centerY;
    
    // Calculate distance from center
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Clamp mouse position to circle for visual feedback
    let displayX = mouseX;
    let displayY = mouseY;
    if (distance > maxRadius) {
      const angle = Math.atan2(dy, dx);
      displayX = centerX + Math.cos(angle) * maxRadius;
      displayY = centerY + Math.sin(angle) * maxRadius;
      dx = Math.cos(angle) * maxRadius;
      dy = Math.sin(angle) * maxRadius;
    }
    
    // Update local stick position for immediate visual feedback (clamped to circle)
    setLocalStickX(displayX);
    setLocalStickY(displayY);
    
    // Normalize to -1 to 1 range
    const normalizedX = dx / maxRadius; // Left is negative, right is positive
    const normalizedY = dy / maxRadius; // Top is negative, bottom is positive
    
    // Apply sensitivity reduction (reduce by 50% to make it less sensitive)
    const sensitivity = 0.5;
    const scaledX = normalizedX * sensitivity;
    const scaledY = normalizedY * sensitivity;
    
    // Convert normalized values (-1 to 1) to actual value range
    // X: left is min, right is max (corrected)
    // Y: top is min, bottom is max
    const newX = minX + (scaledX + 1) / 2 * (maxX - minX);
    const newY = minY + (scaledY + 1) / 2 * (maxY - minY);
    
    return { x: newX, y: newY };
  }, [centerX, centerY, maxRadius, minX, maxX, minY, maxY, valueX, valueY]);

  const handleMouseDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    const { x, y } = getValuesFromMouse(e.clientX, e.clientY);
    onChange(x, y, true);
  };

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;
    e.preventDefault();
    e.stopPropagation();
    const { x, y } = getValuesFromMouse(e.clientX, e.clientY);
    onChange(x, y, true);
  }, [isDragging, getValuesFromMouse, onChange]);

  const handleMouseUp = useCallback((e) => {
    if (!isDragging) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (onDragEnd) onDragEnd();
  }, [isDragging, onDragEnd]);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove, { passive: false });
      document.addEventListener('mouseup', handleMouseUp, { passive: false });
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const displayX = typeof valueX === 'number' ? valueX.toFixed(3) : '0.000';
  const displayY = typeof valueY === 'number' ? valueY.toFixed(3) : '0.000';

  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      gap: 1,
      p: 1.5,
      borderRadius: '12px',
      bgcolor: darkMode ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.01)',
      border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'}`,
      transition: 'all 0.2s ease',
      '&:hover': {
        bgcolor: darkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
        borderColor: darkMode ? 'rgba(255, 149, 0, 0.2)' : 'rgba(255, 149, 0, 0.3)',
      }
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
        <Typography sx={{ fontSize: 10, fontWeight: 700, color: darkMode ? '#f5f5f5' : '#333', letterSpacing: '-0.2px' }}>
          {label}
        </Typography>
        <Tooltip title="API: /api/move/set_target (continuous) → /api/move/goto (discrete)" arrow placement="top">
          <Chip 
            label="API" 
            size="small" 
            icon={<ApiIcon sx={{ fontSize: 10 }} />}
            sx={{ 
              height: 16, 
              fontSize: 7, 
              fontWeight: 600,
              bgcolor: darkMode ? 'rgba(255, 149, 0, 0.15)' : 'rgba(255, 149, 0, 0.1)',
              color: '#FF9500',
              border: 'none',
              '& .MuiChip-icon': { color: '#FF9500', fontSize: 10 }
            }} 
          />
        </Tooltip>
      </Box>
      <Box
        ref={containerRef}
        sx={{
          width: size,
          height: size,
          borderRadius: '10px',
          bgcolor: darkMode ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
          border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`,
          overflow: 'hidden',
          cursor: isDragging ? 'grabbing' : 'grab',
          position: 'relative',
          userSelect: 'none',
          transition: 'all 0.2s ease',
          '&:hover': {
            borderColor: 'rgba(255, 149, 0, 0.4)',
            boxShadow: darkMode ? '0 0 12px rgba(255, 149, 0, 0.2)' : '0 0 12px rgba(255, 149, 0, 0.15)',
          }
        }}
        onMouseDown={handleMouseDown}
      >
        <svg width={size} height={size} style={{ display: 'block' }}>
          <defs>
            <radialGradient id={`stickGrad-${label}`}>
              <stop offset="0%" stopColor="#FF9500" stopOpacity="1" />
              <stop offset="100%" stopColor="#FF9500" stopOpacity="0.7" />
            </radialGradient>
          </defs>
          
          <pattern id={`grid-${label}`} width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M 10 0 L 0 0 0 10" fill="none" stroke={darkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.03)'} strokeWidth="0.5"/>
          </pattern>
          <rect width="100%" height="100%" fill={`url(#grid-${label})`} />
          
          <g opacity={0.15}>
            <line x1={centerX} y1={0} x2={centerX} y2={size} stroke={darkMode ? '#fff' : '#000'} strokeWidth={1} />
            <line x1={0} y1={centerY} x2={size} y2={centerY} stroke={darkMode ? '#fff' : '#000'} strokeWidth={1} />
          </g>

          <circle cx={centerX} cy={centerY} r={maxRadius} fill="none" stroke="rgba(255, 149, 0, 0.2)" strokeWidth={1} strokeDasharray="2 2" />
          <line x1={centerX} y1={centerY} x2={localStickX} y2={localStickY} stroke="rgba(255, 149, 0, 0.5)" strokeWidth={1.5} strokeLinecap="round" />
          <circle cx={localStickX} cy={localStickY} r={stickRadius} fill={`url(#stickGrad-${label})`} stroke={darkMode ? '#1a1a1a' : '#fff'} strokeWidth={1.5} />
        </svg>
      </Box>
      <Box sx={{ display: 'flex', gap: 1.5, mt: 0.5, width: '100%', justifyContent: 'center' }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.25 }}>
          <Typography sx={{ fontSize: 8, color: darkMode ? '#888' : '#999', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            X
          </Typography>
          <Typography sx={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 600, color: darkMode ? '#f5f5f5' : '#333' }}>
            {displayX}
          </Typography>
        </Box>
        <Box sx={{ width: '1px', bgcolor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)' }} />
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.25 }}>
          <Typography sx={{ fontSize: 8, color: darkMode ? '#888' : '#999', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Y
          </Typography>
          <Typography sx={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 600, color: darkMode ? '#f5f5f5' : '#333' }}>
            {displayY}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};

/**
 * Simple Slider Control - Enhanced with more information
 */
const SimpleSlider = ({ label, value, onChange, onReset, min = -1, max = 1, unit = 'rad', darkMode, apiEndpoint }) => {
  const displayValue = typeof value === 'number' ? value.toFixed(unit === 'deg' ? 1 : 3) : (unit === 'deg' ? '0.0' : '0.000');
  const degrees = unit === 'rad' ? (value * (180 / Math.PI)).toFixed(1) : null; // More accurate conversion
  const percentage = ((value - min) / (max - min) * 100).toFixed(0);
  
  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: 1,
      p: 1.5,
      borderRadius: '12px',
      bgcolor: darkMode ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.01)',
      border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'}`,
      transition: 'all 0.2s ease',
      '&:hover': {
        bgcolor: darkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
        borderColor: darkMode ? 'rgba(255, 149, 0, 0.2)' : 'rgba(255, 149, 0, 0.3)',
      }
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Typography sx={{ fontSize: 10, fontWeight: 700, color: darkMode ? '#f5f5f5' : '#333', letterSpacing: '-0.2px' }}>
            {label}
          </Typography>
          {apiEndpoint && (
            <Tooltip title={`API: ${apiEndpoint}`} arrow placement="top">
              <Chip 
                label="API" 
                size="small" 
                icon={<ApiIcon sx={{ fontSize: 10 }} />}
                sx={{ 
                  height: 16, 
                  fontSize: 7, 
                  fontWeight: 600,
                  bgcolor: darkMode ? 'rgba(255, 149, 0, 0.15)' : 'rgba(255, 149, 0, 0.1)',
                  color: '#FF9500',
                  border: 'none',
                  '& .MuiChip-icon': { color: '#FF9500', fontSize: 10 }
                }} 
              />
            </Tooltip>
          )}
        </Box>
        <Tooltip title="Reset to center" arrow>
          <IconButton 
            size="small" 
            onClick={onReset} 
            sx={{ 
              width: 20, 
              height: 20,
              color: darkMode ? '#888' : '#999',
              '&:hover': {
                color: '#FF9500',
                bgcolor: darkMode ? 'rgba(255, 149, 0, 0.1)' : 'rgba(255, 149, 0, 0.05)',
              }
            }}
          >
            <RefreshIcon sx={{ fontSize: 10 }} />
          </IconButton>
        </Tooltip>
      </Box>
      <Slider 
        value={value} 
        onChange={(e, newValue) => onChange(newValue, true)}
        onChangeCommitted={(e, newValue) => onChange(newValue, false)}
        min={min} 
        max={max} 
        step={0.01} 
        sx={{ 
          color: '#FF9500', 
          height: 3,
          '& .MuiSlider-thumb': {
            width: 12,
            height: 12,
            boxShadow: '0 2px 6px rgba(255, 149, 0, 0.4)',
          },
          '& .MuiSlider-track': {
            height: 3,
          },
          '& .MuiSlider-rail': {
            height: 3,
            opacity: darkMode ? 0.2 : 0.3,
          }
        }} 
      />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mt: 0.5 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                <Typography sx={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 600, color: darkMode ? '#f5f5f5' : '#333' }}>
                  {displayValue}{unit === 'deg' ? '°' : ` ${unit}`}
                </Typography>
                {degrees && unit === 'rad' && (
                  <Typography sx={{ fontSize: 9, fontFamily: 'monospace', color: darkMode ? '#888' : '#999' }}>
                    {degrees}°
                  </Typography>
                )}
              </Box>
              <Typography sx={{ fontSize: 8, fontFamily: 'monospace', color: darkMode ? '#555' : '#aaa', fontWeight: 500 }}>
                {percentage}%
              </Typography>
            </Box>
    </Box>
  );
};

/**
 * Robot Position Control - Simple 5 controls layout
 */
export default function RobotPositionControl({ isActive, darkMode }) {
  const { robotStateFull } = useAppStore(); // ✅ Consume centralized data
  
  const [robotState, setRobotState] = useState({
    headPose: { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0 },
    bodyYaw: 0,
    antennas: [0, 0],
  });

  const [localValues, setLocalValues] = useState({
    headPose: { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0 },
    bodyYaw: 0,
  });

  const [isDragging, setIsDragging] = useState(false);
  const rafRef = useRef(null);
  const pendingPoseRef = useRef(null);
  const lastSentPoseRef = useRef(null);
  const isDraggingRef = useRef(false); // ✅ Use ref to track dragging state without causing re-renders
  const lastDragEndTimeRef = useRef(0); // ✅ Track when drag ended to prevent immediate updates

  // ✅ Update robotState from centralized data (NO POLLING)
  useEffect(() => {
    if (!isActive || !robotStateFull.data) return;

    const data = robotStateFull.data;

    // ✅ Don't update localValues if user is dragging or just finished dragging (within 500ms)
    const timeSinceDragEnd = Date.now() - lastDragEndTimeRef.current;
    
          if (data.head_pose) {
            const newState = {
              headPose: {
                x: data.head_pose.x || 0,
                y: data.head_pose.y || 0,
                z: data.head_pose.z || 0,
                pitch: data.head_pose.pitch || 0,
                yaw: data.head_pose.yaw || 0,
                roll: data.head_pose.roll || 0,
              },
              bodyYaw: typeof data.body_yaw === 'number' ? data.body_yaw : 0,
            antennas: data.antennas_position || [0, 0],
          };
          
          setRobotState(newState);
      
          // ✅ Only update localValues if user is not dragging (checked via ref)
      if (!isDraggingRef.current && timeSinceDragEnd >= 500) {
            setLocalValues({
              headPose: newState.headPose,
              bodyYaw: newState.bodyYaw,
            });
          }
        }
  }, [isActive, robotStateFull]);

  // Continuous update loop
  const startContinuousUpdates = useCallback(() => {
    if (rafRef.current) return;
    
    const updateLoop = () => {
      if (pendingPoseRef.current && isDragging) {
        const { headPose, antennas, bodyYaw } = pendingPoseRef.current;
        // Include bodyYaw in the key to detect changes
        const poseKey = JSON.stringify({ headPose, bodyYaw });
        
        if (lastSentPoseRef.current !== poseKey) {
          // ✅ Ensure bodyYaw is always a valid number (not undefined/null)
          const validBodyYaw = typeof bodyYaw === 'number' ? bodyYaw : 0;
          
          // ✅ If only body_yaw is changing (headPose and antennas are null), send ONLY body_yaw
          // This prevents IK from recalculating body_yaw based on head_pose (as per Python doc)
          if (headPose === null && antennas === null) {
            const requestBody = {
              target_body_yaw: validBodyYaw, // ✅ Send ONLY body_yaw
            };

            fetchWithTimeout(
              buildApiUrl('/api/move/set_target'),
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
              },
              200,
              { label: 'Continuous move (body_yaw)', silent: true }
            ).catch((error) => {
              console.error('❌ set_target (body_yaw only) error:', error);
            });
          } else {
            // Normal case: send everything
            const requestBody = {
              target_head_pose: headPose,
              target_antennas: antennas,
              target_body_yaw: validBodyYaw,
            };

            fetchWithTimeout(
              buildApiUrl('/api/move/set_target'),
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
              },
              200,
              { label: 'Continuous move', silent: true }
            ).catch((error) => {
              console.error('❌ set_target error:', error);
            });
          }
          
          lastSentPoseRef.current = poseKey;
        }
        pendingPoseRef.current = null;
      }
      
      if (isDragging) {
        rafRef.current = requestAnimationFrame(updateLoop);
      }
    };
    
    rafRef.current = requestAnimationFrame(updateLoop);
  }, [isDragging]);

  const stopContinuousUpdates = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    pendingPoseRef.current = null;
  }, []);

  useEffect(() => {
    if (!isDragging) {
      stopContinuousUpdates();
    }
    return () => stopContinuousUpdates();
  }, [isDragging, stopContinuousUpdates]);

  // Calculate dynamic duration based on distance
  const calculateDuration = useCallback((targetHeadPose, targetBodyYaw) => {
    const currentHeadPose = robotState.headPose;
    const currentBodyYaw = robotState.bodyYaw;

    // Calculate position distance (Euclidean distance in meters)
    const posDistance = Math.sqrt(
      Math.pow(targetHeadPose.x - currentHeadPose.x, 2) +
      Math.pow(targetHeadPose.y - currentHeadPose.y, 2) +
      Math.pow(targetHeadPose.z - currentHeadPose.z, 2)
    );

    // Calculate rotation distances (angular differences in radians)
    const rotDistance = Math.sqrt(
      Math.pow(targetHeadPose.pitch - currentHeadPose.pitch, 2) +
      Math.pow(targetHeadPose.yaw - currentHeadPose.yaw, 2) +
      Math.pow(targetHeadPose.roll - currentHeadPose.roll, 2)
    );

    // Calculate body yaw distance
    const bodyYawDistance = Math.abs(targetBodyYaw - currentBodyYaw);

    // Base duration: 0.3s for small movements
    // Scale up based on distances:
    // - Position: ~0.5s per 0.01m (5cm)
    // - Rotation: ~0.5s per 0.5 rad (~28.6°)
    // - Body yaw: ~0.5s per 0.5 rad (~28.6°)
    const baseDuration = 0.3;
    const positionDuration = posDistance * 50; // 0.01m = 0.5s
    const rotationDuration = rotDistance * 1.0; // 0.5 rad = 0.5s
    const bodyYawDuration = bodyYawDistance * 1.0; // 0.5 rad = 0.5s

    // Take the maximum of all durations, with a minimum of 0.3s and maximum of 3s
    const totalDuration = Math.max(
      baseDuration,
      Math.min(3.0, Math.max(positionDuration, rotationDuration, bodyYawDuration))
    );

    return totalDuration;
  }, [robotState]);

  // Send body_yaw only using set_target (more direct, no interpolation needed)
  const sendBodyYawOnly = useCallback((bodyYaw) => {
    if (!isActive) return;

    const validBodyYaw = typeof bodyYaw === 'number' ? bodyYaw : (robotState.bodyYaw || 0);

    // set_target only needs target_body_yaw, head_pose and antennas are optional
    const requestBody = {
      target_body_yaw: validBodyYaw,
    };

    fetchWithTimeout(
      buildApiUrl('/api/move/set_target'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      },
      DAEMON_CONFIG.TIMEOUTS.COMMAND,
      { label: 'Move Body Yaw', silent: true }
    ).then((response) => {
      if (!response.ok) {
        return response.text().then(text => {
          console.error('❌ set_target (body_yaw only) failed:', response.status, text);
          throw new Error(`HTTP ${response.status}: ${text}`);
        });
      }
      setTimeout(fetchRobotState, 400);
    }).catch((error) => {
      console.error('❌ set_target (body_yaw only) error:', error);
    });
  }, [isActive, fetchRobotState, robotState]);

  // Send command
  const sendCommand = useCallback((headPose, antennas, bodyYaw, continuous = false) => {
    if (!isActive) return;

    // ✅ Ensure bodyYaw is always a valid number (not undefined/null)
    const validBodyYaw = typeof bodyYaw === 'number' ? bodyYaw : (robotState.bodyYaw || 0);

    if (continuous) {
      pendingPoseRef.current = { headPose, antennas, bodyYaw: validBodyYaw };
      if (!rafRef.current) {
        startContinuousUpdates();
      }
    } else {
      // Calculate dynamic duration based on distance
      const duration = calculateDuration(headPose, validBodyYaw);

      const requestBody = {
        head_pose: headPose,
        antennas: antennas,
        body_yaw: validBodyYaw, // ✅ Always include body_yaw as a number
        duration: duration,
        interpolation: 'minjerk',
      };

      fetchWithTimeout(
        buildApiUrl('/api/move/goto'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        },
        DAEMON_CONFIG.TIMEOUTS.COMMAND,
        { label: 'Move', silent: true }
      ).then((response) => {
        setTimeout(fetchRobotState, 400);
      }).catch((error) => {
        console.error('❌ goto error:', error);
      });
    }
  }, [isActive, fetchRobotState, startContinuousUpdates, calculateDuration, robotState.bodyYaw]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    isDraggingRef.current = false; // ✅ Update ref immediately
    lastDragEndTimeRef.current = Date.now(); // ✅ Record when drag ended
    setTimeout(() => {
      const antennas = robotState.antennas || [0, 0];
      sendCommand(localValues.headPose, antennas, localValues.bodyYaw, false);
    }, 50);
  }, [localValues, robotState, sendCommand]);

  const handleChange = useCallback((updates, continuous = false) => {
    setLocalValues(prev => ({
      ...prev,
      headPose: { ...prev.headPose, ...updates }
    }));

    if (continuous) {
      setIsDragging(true);
      isDraggingRef.current = true; // ✅ Update ref immediately
      const antennas = robotState.antennas || [0, 0];
      // Use localValues.bodyYaw instead of robotState.bodyYaw to preserve user's body yaw setting
      sendCommand({ ...localValues.headPose, ...updates }, antennas, localValues.bodyYaw, true);
    } else {
      setIsDragging(false);
      isDraggingRef.current = false; // ✅ Update ref immediately
      lastDragEndTimeRef.current = Date.now(); // ✅ Record when drag ended
      const antennas = robotState.antennas || [0, 0];
      // Use localValues.bodyYaw instead of robotState.bodyYaw to preserve user's body yaw setting
      sendCommand({ ...localValues.headPose, ...updates }, antennas, localValues.bodyYaw, false);
    }
  }, [localValues, robotState.antennas, sendCommand]);

  const handleBodyYawChange = useCallback((value, continuous = false) => {
    // ✅ Ensure value is always a valid number (value is in radians from conversion)
    const validValue = typeof value === 'number' && !isNaN(value) ? value : 0;
    
    setLocalValues(prev => ({ ...prev, bodyYaw: validValue }));
    
    if (continuous) {
      setIsDragging(true);
      isDraggingRef.current = true; // ✅ Update ref immediately
      // ✅ For body_yaw only, send ONLY body_yaw without head_pose (as per Python doc)
      // This prevents IK from recalculating body_yaw based on head_pose
      pendingPoseRef.current = {
        headPose: null, // ✅ Don't send head_pose when only body_yaw changes
        antennas: null, // ✅ Don't send antennas when only body_yaw changes
        bodyYaw: validValue,
      };
      if (!rafRef.current) {
        startContinuousUpdates();
      }
    } else {
      setIsDragging(false);
      isDraggingRef.current = false; // ✅ Update ref immediately
      lastDragEndTimeRef.current = Date.now(); // ✅ Record when drag ended
      // ✅ For body_yaw only, send ONLY body_yaw without head_pose (as per Python doc)
      sendBodyYawOnly(validValue);
    }
  }, [robotState.bodyYaw, sendBodyYawOnly, startContinuousUpdates]);

  if (!isActive) return null;

  return (
    <Box sx={{ px: 3 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
        {/* 1. Position X/Y */}
        <Joystick2D
          label="Position X/Y"
          valueX={localValues.headPose.y}
          valueY={localValues.headPose.x}
          onChange={(x, y, continuous) => handleChange({ x: y, y: x }, continuous)}
          onDragEnd={handleDragEnd}
          minX={-0.05}
          maxX={0.05}
          minY={-0.05}
          maxY={0.05}
          size={100}
          darkMode={darkMode}
        />

        {/* 2. Orientation Pitch/Yaw */}
        <Joystick2D
          label="Pitch / Yaw"
          valueX={localValues.headPose.yaw}
          valueY={localValues.headPose.pitch}
          onChange={(yaw, pitch, continuous) => handleChange({ yaw, pitch }, continuous)}
          onDragEnd={handleDragEnd}
          minX={-1.2}
          maxX={1.2}
          minY={-0.8}
          maxY={0.8}
          size={100}
          darkMode={darkMode}
        />

        {/* 3. Position Z */}
        <SimpleSlider
          label="Position Z"
          value={localValues.headPose.z}
          onChange={(z, continuous) => handleChange({ z }, continuous)}
          onReset={() => handleChange({ z: 0 }, false)}
          min={-0.05}
          max={0.05}
          unit="m"
          darkMode={darkMode}
          apiEndpoint="/api/move/goto"
        />

        {/* 4. Roll */}
        <SimpleSlider
          label="Roll"
          value={localValues.headPose.roll}
          onChange={(roll, continuous) => handleChange({ roll }, continuous)}
          onReset={() => handleChange({ roll: 0 }, false)}
          min={-0.5}
          max={0.5}
          darkMode={darkMode}
          apiEndpoint="/api/move/goto"
        />

        {/* 5. Body Yaw */}
        {/* Limits from URDF: [-2.79253, 2.79253] radians = [-160°, 160°] */}
        {/* Work in degrees for better UX, convert to radians for API */}
        <SimpleSlider
          label="Body Yaw"
          value={localValues.bodyYaw * (180 / Math.PI)} // Convert rad to deg for display
          onChange={(valueDeg, continuous) => {
            const valueRad = valueDeg * (Math.PI / 180); // Convert deg to rad for API
            handleBodyYawChange(valueRad, continuous);
          }}
          onReset={() => handleBodyYawChange(0, false)}
          min={-160} // Degrees: -160° to 160°
          max={160}
          unit="deg" // Display in degrees
          darkMode={darkMode}
          apiEndpoint="/api/move/set_target"
        />
      </Box>
    </Box>
  );
}
