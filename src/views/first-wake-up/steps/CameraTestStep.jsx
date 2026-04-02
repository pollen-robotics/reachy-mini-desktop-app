import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Typography, Button, CircularProgress } from '@mui/material';
import StepLayout from '../components/StepLayout';

export default function CameraTestStep({ darkMode, api, onNext, onBack }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const imgRef = useRef(null);
  const textSecondary = darkMode ? '#888' : '#64748b';
  const feedUrl = api.getCameraFeedUrl();

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (loading) {
        setError(true);
        setLoading(false);
      }
    }, 10000);

    return () => clearTimeout(timeout);
  }, [loading]);

  const handleLoad = useCallback(() => {
    setLoading(false);
    setError(false);
  }, []);

  const handleError = useCallback(() => {
    setLoading(false);
    setError(true);
  }, []);

  return (
    <StepLayout
      darkMode={darkMode}
      icon="📷"
      title="Let's Look Around!"
      subtitle="Check if you can see the camera feed below."
      stepNumber={5}
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
        {/* Camera feed */}
        <Box
          sx={{
            width: '100%',
            maxWidth: 360,
            aspectRatio: '4/3',
            borderRadius: '12px',
            overflow: 'hidden',
            bgcolor: '#000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid',
            borderColor: darkMode ? 'rgba(255,255,255,0.08)' : '#e2e8f0',
          }}
        >
          {loading && !error && <CircularProgress size={32} sx={{ color: '#FF9500' }} />}
          {error && (
            <Typography sx={{ color: '#888', fontSize: 13 }}>Camera feed not available</Typography>
          )}
          <Box
            component="img"
            ref={imgRef}
            src={feedUrl}
            onLoad={handleLoad}
            onError={handleError}
            sx={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: loading || error ? 'none' : 'block',
            }}
          />
        </Box>

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Button
            onClick={onNext}
            sx={{
              fontSize: 12,
              color: textSecondary,
              textTransform: 'none',
              textDecoration: 'underline',
              '&:hover': { color: '#FF9500' },
            }}
          >
            Camera doesn't work
          </Button>

          <Button
            variant="contained"
            onClick={onNext}
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
            }}
          >
            Camera works ✓
          </Button>
        </Box>
      </Box>
    </StepLayout>
  );
}
