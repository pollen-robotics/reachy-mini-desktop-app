import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Box, Typography, keyframes } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import StepLayout from '../components/StepLayout';
import { textSecondary as getTextSecondary, SUCCESS, ACCENT } from '../theme';
import useAppStore from '../../../store/useAppStore';
import Viewer3D from '../../../components/viewer3d';
import { useKinematicsWasm } from '../../../utils/kinematics-wasm/useKinematicsWasm';

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

const POSITION_ERROR_THRESHOLD = 30.0;
const POSITION_ERROR_THRESHOLD_BASE = 35.0;
const POSITION_ERROR_THRESHOLD_ANTENNAS = 35.0;
const SWAP_DETECTION_THRESHOLD = 15.0;

function radToDeg(rad) {
  return (rad * 180) / Math.PI;
}

// Sleep pose data from daemon (radians) - used for the 3D viewer
const SLEEP_HEAD_JOINTS_RAD = [0, -0.9848, 1.2625, -0.2439, 0.2056, -1.2364, 1.0032];
const SLEEP_ANTENNAS_RAD = [-3.05, 3.05];
const SLEEP_HEAD_POSE = [
  0.911, 0.004, 0.413, -0.021, -0.004, 1.0, -0.001, 0.001, -0.413, -0.001, 0.911, -0.044, 0.0, 0.0,
  0.0, 1.0,
];

const SLEEP_CAMERA_PRESET = {
  position: [0.15, 0.18, 0.4],
  fov: 50,
  target: [0, 0.08, 0],
  minDistance: 0.3,
  maxDistance: 0.5,
};

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

const CHECK_GROUPS = [
  {
    id: 'stewart',
    label: 'Head motors',
    motors: ['stewart_1', 'stewart_2', 'stewart_3', 'stewart_4', 'stewart_5', 'stewart_6'],
  },
  { id: 'body', label: 'Body rotation', motors: ['body_rotation'] },
  { id: 'antennas', label: 'Antennas', motors: ['right_antenna', 'left_antenna'] },
];

const CHECK_DELAY = 700;

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
`;

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
`;

function CheckRow({ label, status, darkMode }) {
  const textSecondary = getTextSecondary(darkMode);
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.2,
        py: 0.6,
        animation: `${fadeIn} 0.25s ease-out`,
      }}
    >
      {status === 'pending' && (
        <Box
          sx={{
            width: 18,
            height: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Box
            sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: textSecondary, opacity: 0.3 }}
          />
        </Box>
      )}
      {status === 'checking' && (
        <Box
          sx={{
            width: 18,
            height: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: ACCENT,
              animation: `${pulse} 1s ease-in-out infinite`,
            }}
          />
        </Box>
      )}
      {status === 'passed' && <CheckCircleIcon sx={{ color: SUCCESS, fontSize: 18 }} />}
      {status === 'failed' && <ErrorIcon sx={{ color: '#ef4444', fontSize: 18 }} />}
      <Typography
        sx={{
          fontSize: 13,
          fontWeight: status === 'checking' ? 600 : 500,
          color:
            status === 'passed'
              ? SUCCESS
              : status === 'failed'
                ? darkMode
                  ? '#fca5a5'
                  : '#991b1b'
                : status === 'checking'
                  ? darkMode
                    ? '#fff'
                    : '#111'
                  : textSecondary,
          transition: 'color 0.2s ease',
        }}
      >
        {label}
      </Typography>
    </Box>
  );
}

export default function SleepPositionStep({ darkMode, onNext }) {
  const robotStateFull = useAppStore(state => state.robotStateFull);
  const textSecondary = getTextSecondary(darkMode);

  const validation = useMemo(() => validatePosition(robotStateFull?.data), [robotStateFull]);

  // Sequential check animation state
  // -1 = not started, 0..N = currently checking group at index, N+1 = all done
  const [checkIndex, setCheckIndex] = useState(-1);
  const [groupStatuses, setGroupStatuses] = useState(() => CHECK_GROUPS.map(() => 'pending'));
  const [allDone, setAllDone] = useState(false);
  const timersRef = useRef([]);
  const hasStartedRef = useRef(false);
  const advanceTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
      clearTimeout(advanceTimerRef.current);
    };
  }, []);

  const getGroupResult = useCallback(
    group => {
      if (!validation) return 'pending';
      const groupMotors = validation.motors.filter(m => group.motors.includes(m.name));
      return groupMotors.every(m => m.status === 'ok') ? 'passed' : 'failed';
    },
    [validation]
  );

  // Start the sequential check animation when all motors are OK
  useEffect(() => {
    if (!validation?.all_ok || hasStartedRef.current) return;
    hasStartedRef.current = true;

    CHECK_GROUPS.forEach((group, i) => {
      // Mark as "checking"
      const checkTimer = setTimeout(() => {
        setCheckIndex(i);
        setGroupStatuses(prev => {
          const next = [...prev];
          next[i] = 'checking';
          return next;
        });
      }, i * CHECK_DELAY);
      timersRef.current.push(checkTimer);

      // Mark as "passed" after a brief moment
      const passTimer = setTimeout(
        () => {
          setGroupStatuses(prev => {
            const next = [...prev];
            next[i] = getGroupResult(group);
            return next;
          });
        },
        i * CHECK_DELAY + CHECK_DELAY * 0.7
      );
      timersRef.current.push(passTimer);
    });

    const doneTimer = setTimeout(
      () => {
        setAllDone(true);
        setCheckIndex(CHECK_GROUPS.length);
      },
      CHECK_GROUPS.length * CHECK_DELAY + 200
    );
    timersRef.current.push(doneTimer);

    advanceTimerRef.current = setTimeout(() => onNext(), CHECK_GROUPS.length * CHECK_DELAY + 1200);
  }, [validation, getGroupResult, onNext]);

  // When motors are NOT all OK, show live error state (no sequential animation)
  const hasErrors = validation && !validation.all_ok;
  const errorMotors = validation?.motors?.filter(m => m.status === 'error') || [];

  const { isReady: wasmReady, calculatePassiveJoints } = useKinematicsWasm();
  const sleepPassiveJoints = useMemo(() => {
    if (!wasmReady) return null;
    return calculatePassiveJoints(SLEEP_HEAD_JOINTS_RAD, SLEEP_HEAD_POSE);
  }, [wasmReady, calculatePassiveJoints]);

  const viewer3d = useMemo(
    () => (
      <Box sx={{ width: '100%', height: 200, borderRadius: '12px', overflow: 'hidden' }}>
        <Viewer3D
          isActive={false}
          forceLoad={true}
          headJoints={SLEEP_HEAD_JOINTS_RAD}
          headPose={SLEEP_HEAD_POSE}
          passiveJoints={sleepPassiveJoints}
          antennas={SLEEP_ANTENNAS_RAD}
          hideControls={true}
          hideGrid={true}
          hideBorder={true}
          hideEffects={true}
          backgroundColor="transparent"
          cameraPreset={SLEEP_CAMERA_PRESET}
          autoRotate={true}
          autoRotateSpeed={0.6}
        />
      </Box>
    ),
    [sleepPassiveJoints]
  );

  return (
    <StepLayout
      darkMode={darkMode}
      illustrationNode={viewer3d}
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
          gap: 0.5,
          width: '100%',
          maxWidth: 280,
          mx: 'auto',
        }}
      >
        {/* Sequential check animation (when position is OK) */}
        {!hasErrors && (
          <>
            {CHECK_GROUPS.map(
              (group, i) =>
                groupStatuses[i] !== 'pending' && (
                  <CheckRow
                    key={group.id}
                    label={group.label}
                    status={groupStatuses[i]}
                    darkMode={darkMode}
                  />
                )
            )}

            {allDone && (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  mt: 1.5,
                  px: 2.5,
                  py: 1.2,
                  borderRadius: '8px',
                  bgcolor: darkMode ? 'rgba(34, 197, 94, 0.1)' : '#d1fae5',
                  animation: `${fadeIn} 0.3s ease-out`,
                }}
              >
                <CheckCircleIcon sx={{ color: SUCCESS, fontSize: 20 }} />
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: SUCCESS }}>
                  Perfect position!
                </Typography>
              </Box>
            )}

            {checkIndex === -1 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: textSecondary,
                    animation: `${pulse} 1.5s ease-in-out infinite`,
                  }}
                />
                <Typography sx={{ fontSize: 13, color: textSecondary, fontWeight: 500 }}>
                  Waiting for motor data...
                </Typography>
              </Box>
            )}
          </>
        )}

        {/* Error state (motors need adjustment) */}
        {hasErrors && (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  bgcolor: ACCENT,
                  animation: `${pulse} 1.5s ease-in-out infinite`,
                }}
              />
              <Typography sx={{ fontSize: 13, color: textSecondary, fontWeight: 500 }}>
                {errorMotors.length} motor{errorMotors.length > 1 ? 's' : ''} need adjustment
              </Typography>
            </Box>

            <Box sx={{ width: '100%' }}>
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

            {validation?.has_swaps && (
              <Box
                sx={{
                  px: 2,
                  py: 1.5,
                  mt: 1,
                  borderRadius: '8px',
                  bgcolor: darkMode ? 'rgba(245, 158, 11, 0.1)' : '#fef3c7',
                  width: '100%',
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
