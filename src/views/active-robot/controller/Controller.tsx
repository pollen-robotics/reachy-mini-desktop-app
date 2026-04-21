import React, { useMemo, useEffect, useRef } from 'react';
import { Box, Typography } from '@mui/material';
import { ControllerProvider, useController } from './context/ControllerContext';
import { useControllerHandlers } from './hooks/useControllerHandlers';
import { useControllerSmoothing } from './hooks/useControllerSmoothing';
import { useControllerSync } from './hooks/useControllerSync';
import { useControllerAPI } from './hooks/useControllerAPI';
import { useControllerInput } from './hooks/useControllerInput';
import { logInfo } from '../../../utils/logging';
import { Joystick2D, VerticalSlider, SimpleSlider, CircularSlider } from './components';
import { EXTENDED_ROBOT_RANGES, INPUT_THRESHOLDS } from '../../../utils/inputConstants';
import { isHeadPoseZero, areAntennasZero, isZero } from '../../../utils/inputHelpers';
import { mapRobotToDisplay, mapDisplayToRobot } from '../../../utils/inputMappings';
import antennasIcon from '../../../assets/reachy-antennas-icon.svg';
import headIcon from '../../../assets/reachy-head-icon.svg';
import bodyIcon from '../../../assets/reachy-body-icon.svg';

interface ControllerInnerProps {
  darkMode: boolean;
  onResetReady?: (resetFn: () => void) => void;
  onIsAtInitialPosition?: (atInitial: boolean) => void;
}

function ControllerInner({
  darkMode,
  onResetReady,
  onIsAtInitialPosition,
}: ControllerInnerProps): React.ReactElement {
  const { isDragging } = useController();
  const { sendCommand, forceSendCommand } = useControllerAPI();

  const wasDraggingRef = useRef<boolean>(false);
  useEffect(() => {
    if (isDragging && !wasDraggingRef.current) {
      logInfo('Manual control started');
    } else if (!isDragging && wasDraggingRef.current) {
      logInfo('Manual control ended');
    }
    wasDraggingRef.current = isDragging;
  }, [isDragging]);

  const {
    localValues,
    handleChange,
    handleBodyYawChange,
    handleAntennasChange,
    handleDragEnd,
    resetAllValues,
  } = useControllerHandlers({
    sendCommand: forceSendCommand as unknown as (
      headPose: Parameters<typeof sendCommand>[0],
      antennas: Parameters<typeof sendCommand>[1],
      bodyYaw: Parameters<typeof sendCommand>[2]
    ) => void,
  });

  const { smoothedValues } = useControllerSmoothing({ sendCommand });

  useControllerSync();

  useControllerInput();

  const isAtInitialPosition = useMemo<boolean>(() => {
    const { headPose, antennas, bodyYaw } = localValues;
    const tolerance = INPUT_THRESHOLDS.INITIAL_POSITION;
    return (
      isHeadPoseZero(headPose, tolerance) &&
      areAntennasZero(antennas, tolerance) &&
      isZero(bodyYaw, tolerance)
    );
  }, [localValues]);

  useEffect(() => {
    onResetReady?.(resetAllValues);
  }, [onResetReady, resetAllValues]);

  useEffect(() => {
    onIsAtInitialPosition?.(isAtInitialPosition);
  }, [onIsAtInitialPosition, isAtInitialPosition]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, width: '100%', flex: 1 }}>
      {/* ANTENNAS */}
      <SectionTitle icon={antennasIcon} label="Antennas" darkMode={darkMode} />
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
        <ControlCard darkMode={darkMode}>
          <CircularSlider
            label="Left"
            value={localValues.antennas?.[0] || 0}
            smoothedValue={smoothedValues?.antennas?.[0]}
            onChange={(v, continuous) => handleAntennasChange('left', v, continuous)}
            min={-Math.PI}
            max={Math.PI}
            unit="rad"
            darkMode={darkMode}
          />
        </ControlCard>
        <ControlCard darkMode={darkMode} alignRight>
          <CircularSlider
            label="Right"
            value={localValues.antennas?.[1] || 0}
            smoothedValue={smoothedValues?.antennas?.[1]}
            onChange={(v, continuous) => handleAntennasChange('right', v, continuous)}
            min={-Math.PI}
            max={Math.PI}
            unit="rad"
            darkMode={darkMode}
            alignRight
          />
        </ControlCard>
      </Box>

      {/* HEAD */}
      <SectionTitle icon={headIcon} label="Head" darkMode={darkMode} />
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
        {/* Position X/Y/Z */}
        <ControlCard darkMode={darkMode} padding={1}>
          <Box sx={{ display: 'flex', gap: 0, alignItems: 'stretch' }}>
            <Box sx={{ flex: '1 1 auto', display: 'flex', alignItems: 'center' }}>
              <Joystick2D
                label="Position X/Y"
                valueX={mapRobotToDisplay(localValues.headPose.y, 'positionY')}
                valueY={mapRobotToDisplay(localValues.headPose.x, 'positionX')}
                smoothedValueX={
                  smoothedValues?.headPose?.y != null
                    ? mapRobotToDisplay(smoothedValues.headPose.y, 'positionY')
                    : undefined
                }
                smoothedValueY={
                  smoothedValues?.headPose?.x != null
                    ? mapRobotToDisplay(smoothedValues.headPose.x, 'positionX')
                    : undefined
                }
                onChange={(x, y, continuous) => {
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
            <Box sx={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', px: 2.5 }}>
              <VerticalSlider
                label="Position Z"
                value={localValues.headPose.z}
                smoothedValue={smoothedValues?.headPose?.z}
                onChange={(z, continuous) => handleChange({ z }, continuous)}
                min={-0.05}
                max={0.05}
                unit="m"
                darkMode={darkMode}
                centered
                height={120}
              />
            </Box>
          </Box>
        </ControlCard>

        {/* Pitch/Yaw */}
        <ControlCard darkMode={darkMode} padding={1}>
          <Box sx={{ display: 'flex', justifyContent: 'center' }}>
            <Joystick2D
              label="Pitch / Yaw"
              valueX={mapRobotToDisplay(localValues.headPose.yaw, 'yaw')}
              valueY={mapRobotToDisplay(localValues.headPose.pitch, 'pitch')}
              smoothedValueX={
                smoothedValues?.headPose?.yaw != null
                  ? mapRobotToDisplay(smoothedValues.headPose.yaw, 'yaw')
                  : undefined
              }
              smoothedValueY={
                smoothedValues?.headPose?.pitch != null
                  ? mapRobotToDisplay(smoothedValues.headPose.pitch, 'pitch')
                  : undefined
              }
              onChange={(yaw, pitch, continuous) => {
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
        </ControlCard>
      </Box>

      {/* Roll */}
      <ControlCard darkMode={darkMode}>
        <SimpleSlider
          label="Roll"
          value={localValues.headPose.roll}
          smoothedValue={smoothedValues?.headPose?.roll}
          onChange={(roll, continuous) => handleChange({ roll }, continuous)}
          min={-0.5}
          max={0.5}
          darkMode={darkMode}
          showRollVisualization
        />
      </ControlCard>

      {/* BODY */}
      <SectionTitle icon={bodyIcon} label="Body" darkMode={darkMode} />
      <ControlCard darkMode={darkMode}>
        <CircularSlider
          label="Yaw"
          value={localValues.bodyYaw}
          smoothedValue={smoothedValues?.bodyYaw}
          onChange={(v, continuous) => handleBodyYawChange(v, continuous)}
          min={(-160 * Math.PI) / 180}
          max={(160 * Math.PI) / 180}
          unit="rad"
          darkMode={darkMode}
          inverted
          reverse
        />
      </ControlCard>
    </Box>
  );
}

interface ControllerProps {
  isActive: boolean;
  darkMode: boolean;
  onResetReady?: (resetFn: () => void) => void;
  onIsAtInitialPosition?: (atInitial: boolean) => void;
}

export default function Controller({
  isActive,
  darkMode,
  onResetReady,
  onIsAtInitialPosition,
}: ControllerProps): React.ReactElement | null {
  if (!isActive) return null;

  return (
    <ControllerProvider isActive={isActive}>
      <ControllerInner
        darkMode={darkMode}
        onResetReady={onResetReady}
        onIsAtInitialPosition={onIsAtInitialPosition}
      />
    </ControllerProvider>
  );
}

// =============================================================================
// UI Components (extracted for readability)
// =============================================================================

interface SectionTitleProps {
  icon: string;
  label: string;
  darkMode: boolean;
}

function SectionTitle({ icon, label, darkMode }: SectionTitleProps): React.ReactElement {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: -0.5 }}>
      <Box
        component="img"
        src={icon}
        alt={label}
        sx={{
          width: 20,
          height: 20,
          filter: darkMode ? 'brightness(0) invert(1)' : 'brightness(0) invert(0)',
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
        {label}
      </Typography>
    </Box>
  );
}

interface ControlCardProps {
  children: React.ReactNode;
  darkMode: boolean;
  alignRight?: boolean;
  padding?: number;
}

function ControlCard({
  children,
  darkMode,
  alignRight = false,
  padding = 0.5,
}: ControlCardProps): React.ReactElement {
  return (
    <Box
      sx={{
        px: 1,
        py: padding,
        borderRadius: '8px',
        bgcolor: darkMode ? 'rgba(26, 26, 26, 0.8)' : '#ffffff',
        border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`,
        ...(alignRight && {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          width: '100%',
        }),
      }}
    >
      {children}
    </Box>
  );
}
