import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Box, Typography, Button, CircularProgress } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import StepLayout from '../components/StepLayout';
import { primaryButtonSx, textSecondary as getTextSecondary, SUCCESS, ACCENT } from '../theme';
import sleepingReachy from '../../../assets/sleeping-reachy.svg';

const POLL_INTERVAL = 800;

export default function SleepPositionStep({ darkMode, api, onNext }) {
  const [phase, setPhase] = useState('idle');
  const [result, setResult] = useState(null);
  const activeRef = useRef(false);
  const textSecondary = getTextSecondary(darkMode);

  const handleCheck = useCallback(async () => {
    setPhase('checking');
    setResult(null);

    try {
      const validation = await api.checkSleepPosition();
      setResult(validation);

      if (validation?.all_ok) {
        setPhase('success');
        setTimeout(() => onNext(), 1500);
      } else {
        setPhase('error');
      }
    } catch (err) {
      console.error('[SleepPosition] Check failed:', err);
      setPhase('idle');
    }
  }, [api, onNext]);

  // Live polling when in error state using recursive setTimeout
  useEffect(() => {
    if (phase !== 'error') {
      activeRef.current = false;
      return;
    }

    activeRef.current = true;

    async function tick() {
      if (!activeRef.current) return;
      try {
        const validation = await api.checkSleepPosition();
        if (!activeRef.current) return;
        if (validation) {
          setResult({ ...validation });
          if (validation.all_ok) {
            activeRef.current = false;
            setPhase('success');
            setTimeout(() => onNext(), 1500);
            return;
          }
        }
      } catch {
        // Ignore
      }
      if (activeRef.current) {
        setTimeout(tick, POLL_INTERVAL);
      }
    }

    setTimeout(tick, POLL_INTERVAL);

    return () => {
      activeRef.current = false;
    };
  }, [phase, api, onNext]);

  const isChecking = phase === 'checking';
  const isSuccess = phase === 'success';
  const isError = phase === 'error';

  return (
    <StepLayout
      darkMode={darkMode}
      illustration={sleepingReachy}
      title="Make sure I'm sleeping well"
      subtitle="Position Reachy Mini in the sleeping pose, then check."
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
          width: '100%',
        }}
      >
        {isChecking && <CircularProgress size={28} sx={{ color: ACCENT, my: 1 }} />}

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
              All motors in correct position!
            </Typography>
          </Box>
        )}

        {isError && result && (
          <>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 2.5,
                py: 1,
                borderRadius: '8px',
                bgcolor: darkMode ? 'rgba(239, 68, 68, 0.1)' : '#fee2e2',
              }}
            >
              <ErrorOutlineIcon sx={{ color: '#ef4444', fontSize: 18 }} />
              <Typography
                sx={{ fontSize: 12, fontWeight: 500, color: darkMode ? '#fca5a5' : '#991b1b' }}
              >
                {result.motors?.filter(m => m.status === 'error').length || 0} motor(s) need
                adjustment
              </Typography>
            </Box>

            {result.has_swaps && (
              <Box
                sx={{
                  px: 2,
                  py: 1.5,
                  borderRadius: '8px',
                  bgcolor: darkMode ? 'rgba(245, 158, 11, 0.1)' : '#fef3c7',
                  width: '100%',
                  maxWidth: 360,
                }}
              >
                <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#92400e', mb: 0.5 }}>
                  Possible motor inversions:
                </Typography>
                {result.detected_swaps.map((swap, i) => (
                  <Typography key={i} sx={{ fontSize: 11, color: '#92400e' }}>
                    {swap.motor_a.replace(/_/g, ' ')} ↔ {swap.motor_b.replace(/_/g, ' ')}
                  </Typography>
                ))}
              </Box>
            )}

            <Box sx={{ width: '100%', maxWidth: 360 }}>
              {result.motors
                ?.filter(m => m.status === 'error')
                .map(motor => (
                  <Box
                    key={motor.name}
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      py: 0.4,
                      px: 1,
                      fontSize: 11,
                      color: darkMode ? '#fca5a5' : '#991b1b',
                      borderBottom: '1px solid',
                      borderColor: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                    }}
                  >
                    <span>{motor.name.replace(/_/g, ' ')}</span>
                    <Typography
                      component="span"
                      sx={{
                        fontSize: 11,
                        fontVariantNumeric: 'tabular-nums',
                        color: textSecondary,
                      }}
                    >
                      {motor.actual}° → {motor.expected}°
                    </Typography>
                  </Box>
                ))}
            </Box>

            <Button
              variant="outlined"
              onClick={handleCheck}
              sx={{ ...primaryButtonSx, px: 3, py: 1 }}
            >
              Recheck Position
            </Button>
          </>
        )}

        {phase === 'idle' && (
          <Button variant="outlined" onClick={handleCheck} sx={primaryButtonSx}>
            Check Position
          </Button>
        )}
      </Box>
    </StepLayout>
  );
}
