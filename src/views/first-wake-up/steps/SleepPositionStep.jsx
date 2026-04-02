import React, { useState, useCallback } from 'react';
import { Box, Typography, Button, CircularProgress } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import StepLayout from '../components/StepLayout';

export default function SleepPositionStep({ darkMode, api, onNext, onBack }) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState(null);
  const textSecondary = darkMode ? '#888' : '#64748b';

  const handleCheck = useCallback(async () => {
    setChecking(true);
    setResult(null);

    try {
      await api.disableMotors();
      await new Promise(r => setTimeout(r, 500));
      const validation = await api.checkSleepPosition();
      setResult(validation);

      if (validation?.all_ok) {
        setTimeout(() => onNext(), 1200);
      }
    } catch (err) {
      console.error('[SleepPosition] Check failed:', err);
    } finally {
      setChecking(false);
    }
  }, [api, onNext]);

  return (
    <StepLayout
      darkMode={darkMode}
      icon="😴"
      title="Make sure I'm sleeping well"
      subtitle="Position Reachy Mini in the sleeping pose, then click Check Position."
      stepNumber={1}
      onBack={onBack}
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
        {/* Result display */}
        {result && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 2,
              py: 1,
              borderRadius: '8px',
              bgcolor: result.all_ok
                ? darkMode
                  ? 'rgba(34, 197, 94, 0.1)'
                  : '#d1fae5'
                : darkMode
                  ? 'rgba(239, 68, 68, 0.1)'
                  : '#fee2e2',
            }}
          >
            {result.all_ok ? (
              <CheckCircleIcon sx={{ color: '#22c55e', fontSize: 20 }} />
            ) : (
              <ErrorOutlineIcon sx={{ color: '#ef4444', fontSize: 20 }} />
            )}
            <Typography
              sx={{
                fontSize: 13,
                fontWeight: 500,
                color: result.all_ok ? '#065f46' : '#991b1b',
              }}
            >
              {result.all_ok
                ? 'All motors in correct position!'
                : `${result.motors?.filter(m => m.status === 'error').length || 0} motor(s) need adjustment`}
            </Typography>
          </Box>
        )}

        {/* Swap warnings */}
        {result?.has_swaps && (
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

        {/* Motor details (only on error) */}
        {result?.has_errors && !result.has_swaps && (
          <Box sx={{ width: '100%', maxWidth: 360 }}>
            {result.motors
              .filter(m => m.status === 'error')
              .map(motor => (
                <Box
                  key={motor.name}
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    py: 0.5,
                    px: 1,
                    fontSize: 11,
                    color: textSecondary,
                    borderBottom: '1px solid',
                    borderColor: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                  }}
                >
                  <span>{motor.name.replace(/_/g, ' ')}</span>
                  <span>
                    {motor.actual}° (expected {motor.expected}°)
                  </span>
                </Box>
              ))}
          </Box>
        )}

        <Button
          variant="contained"
          onClick={handleCheck}
          disabled={checking}
          disableElevation
          sx={{
            px: 3,
            py: 1,
            borderRadius: '8px',
            fontSize: 13,
            fontWeight: 600,
            textTransform: 'none',
            background: 'linear-gradient(135deg, #FF9500, #FFB333)',
            '&:hover': {
              background: 'linear-gradient(135deg, #FFB333, #FFCC66)',
            },
            '&:disabled': {
              background: darkMode ? '#333' : '#e5e7eb',
              color: darkMode ? '#666' : '#9ca3af',
            },
          }}
        >
          {checking ? <CircularProgress size={18} sx={{ color: 'inherit', mr: 1 }} /> : null}
          {checking ? 'Checking...' : result?.has_errors ? 'Recheck Position' : 'Check Position'}
        </Button>
      </Box>
    </StepLayout>
  );
}
