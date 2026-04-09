import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Box, Typography, keyframes } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import StepLayout from '../components/StepLayout';
import { textSecondary as getTextSecondary, SUCCESS, ACCENT } from '../theme';
import useAppStore from '../../../store/useAppStore';
import reachyMicrophone from '../../../assets/reachy-microphone.svg';

// Derived from daemon SLEEP_HEAD_JOINT_POSITIONS (radians) and SLEEP_ANTENNAS_JOINT_POSITIONS
// Source: reachy_mini/daemon/backend/abstract.py
const SLEEP_POSITION_DEGREES = {
  body_rotation: 0.0,
  stewart_1: -56.4,
  stewart_2: 72.3,
  stewart_3: -14.0,
  stewart_4: 11.8,
  stewart_5: -70.8,
  stewart_6: 57.5,
  right_antenna: -174.7,
  left_antenna: 174.7,
};

const POSITION_ERROR_THRESHOLD = 15.0;
const POSITION_ERROR_THRESHOLD_BASE = 20.0;
const POSITION_ERROR_THRESHOLD_ANTENNAS = 19.5;
const SWAP_DETECTION_THRESHOLD = 15.0;

function radToDeg(rad) {
  return (rad * 180) / Math.PI;
}

function detectMotorSwaps(motorsData) {
  const swaps = [];
  const checked = new Set();
  const names = Object.keys(motorsData);

  for (let i = 0; i < names.length; i++) {
    const a = names[i];
    if (!(a in SLEEP_POSITION_DEGREES)) continue;
    const actualA = motorsData[a];
    const expectedA = SLEEP_POSITION_DEGREES[a];
    if (Math.abs(actualA - expectedA) < SWAP_DETECTION_THRESHOLD) continue;

    for (let j = i + 1; j < names.length; j++) {
      const b = names[j];
      if (!(b in SLEEP_POSITION_DEGREES)) continue;
      const key = [a, b].sort().join(':');
      if (checked.has(key)) continue;

      const actualB = motorsData[b];
      const expectedB = SLEEP_POSITION_DEGREES[b];
      if (Math.abs(actualB - expectedB) < SWAP_DETECTION_THRESHOLD) continue;

      const diffAtoB = Math.abs(actualA - expectedB);
      const diffBtoA = Math.abs(actualB - expectedA);

      if (diffAtoB < SWAP_DETECTION_THRESHOLD && diffBtoA < SWAP_DETECTION_THRESHOLD) {
        const avgDiff = (diffAtoB + diffBtoA) / 2;
        swaps.push({
          motor_a: a,
          motor_b: b,
          confidence: avgDiff < 5 ? 'high' : avgDiff < 10 ? 'medium' : 'low',
        });
        checked.add(key);
      }
    }
  }
  return swaps;
}

function validatePosition(stateData) {
  if (!stateData?.head_joints || !stateData?.antennas_position) return null;

  const motorsData = {
    body_rotation: radToDeg(stateData.head_joints[0]),
    stewart_1: radToDeg(stateData.head_joints[1]),
    stewart_2: radToDeg(stateData.head_joints[2]),
    stewart_3: radToDeg(stateData.head_joints[3]),
    stewart_4: radToDeg(stateData.head_joints[4]),
    stewart_5: radToDeg(stateData.head_joints[5]),
    stewart_6: radToDeg(stateData.head_joints[6]),
    right_antenna: radToDeg(stateData.antennas_position[0]),
    left_antenna: radToDeg(stateData.antennas_position[1]),
  };

  const results = [];
  let allOk = true;

  for (const [name, actual] of Object.entries(motorsData)) {
    if (!(name in SLEEP_POSITION_DEGREES)) continue;
    const expected = SLEEP_POSITION_DEGREES[name];
    const diff = Math.abs(actual - expected);

    let threshold = POSITION_ERROR_THRESHOLD;
    if (name === 'body_rotation') threshold = POSITION_ERROR_THRESHOLD_BASE;
    if (name.includes('antenna')) threshold = POSITION_ERROR_THRESHOLD_ANTENNAS;

    const status = diff > threshold ? 'error' : 'ok';
    if (status === 'error') allOk = false;

    results.push({ name, actual, expected, diff, status, threshold });
  }

  const swaps = allOk ? [] : detectMotorSwaps(motorsData);

  return {
    motors: results,
    all_ok: allOk,
    detected_swaps: swaps,
    has_swaps: swaps.length > 0,
  };
}

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
`;

export default function SleepPositionStep({ darkMode, onNext }) {
  const robotStateFull = useAppStore(state => state.robotStateFull);
  const [phase, setPhase] = useState('checking');
  const successTimerRef = useRef(null);
  const textSecondary = getTextSecondary(darkMode);

  const validation = useMemo(() => validatePosition(robotStateFull?.data), [robotStateFull]);

  useEffect(() => {
    if (!validation) return;
    if (validation.all_ok && phase !== 'success') {
      setPhase('success');
      successTimerRef.current = setTimeout(() => onNext(), 1500);
    } else if (!validation.all_ok && phase !== 'error') {
      setPhase('error');
    }
  }, [validation, phase, onNext]);

  useEffect(() => {
    return () => clearTimeout(successTimerRef.current);
  }, []);

  const isSuccess = phase === 'success';
  const errorMotors = validation?.motors?.filter(m => m.status === 'error') || [];

  return (
    <StepLayout
      darkMode={darkMode}
      illustration={reachyMicrophone}
      title="Tuck Me In"
      subtitle={
        <>
          Before waking up, I need to be in my <b>sleeping pose</b>. Gently place my{' '}
          <b>head down</b> and tuck my <b>antennas back</b>.
        </>
      }
      lockHeight={false}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 1.5,
          width: '100%',
        }}
      >
        {isSuccess && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 2.5,
              py: 1.2,
              borderRadius: '8px',
              bgcolor: darkMode ? 'rgba(34, 197, 94, 0.1)' : '#d1fae5',
            }}
          >
            <CheckCircleIcon sx={{ color: SUCCESS, fontSize: 20 }} />
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: SUCCESS }}>
              Perfect position!
            </Typography>
          </Box>
        )}

        {!isSuccess && (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  bgcolor: errorMotors.length > 0 ? ACCENT : textSecondary,
                  animation: `${pulse} 1.5s ease-in-out infinite`,
                }}
              />
              <Typography sx={{ fontSize: 13, color: textSecondary, fontWeight: 500 }}>
                {errorMotors.length > 0
                  ? `${errorMotors.length} motor${errorMotors.length > 1 ? 's' : ''} need adjustment`
                  : 'Checking position...'}
              </Typography>
            </Box>

            {errorMotors.length > 0 && (
              <Box sx={{ width: '100%', maxWidth: 320 }}>
                {errorMotors.map(motor => (
                  <Box
                    key={motor.name}
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      py: 0.5,
                      px: 1,
                      borderBottom: '1px solid',
                      borderColor: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: 12,
                        color: darkMode ? '#fca5a5' : '#991b1b',
                        fontWeight: 500,
                      }}
                    >
                      {motor.name.replace(/_/g, ' ')}
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: 12,
                        fontVariantNumeric: 'tabular-nums',
                        color: textSecondary,
                      }}
                    >
                      {Math.round(motor.actual)}° → {Math.round(motor.expected)}°
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}

            {validation?.has_swaps && (
              <Box
                sx={{
                  px: 2,
                  py: 1.5,
                  borderRadius: '8px',
                  bgcolor: darkMode ? 'rgba(245, 158, 11, 0.1)' : '#fef3c7',
                  width: '100%',
                  maxWidth: 320,
                }}
              >
                <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#92400e', mb: 0.5 }}>
                  Possible motor inversions:
                </Typography>
                {validation.detected_swaps.map((swap, i) => (
                  <Typography key={i} sx={{ fontSize: 11, color: '#92400e' }}>
                    {swap.motor_a.replace(/_/g, ' ')} ↔ {swap.motor_b.replace(/_/g, ' ')}
                  </Typography>
                ))}
              </Box>
            )}
          </>
        )}
      </Box>
    </StepLayout>
  );
}
