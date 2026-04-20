import React, { useRef, useCallback } from 'react';
import { Box, Typography } from '@mui/material';

export default function StepLayout({
  darkMode,
  illustration,
  illustrationNode,
  title,
  subtitle,
  lockHeight = true,
  children,
}) {
  const textPrimary = darkMode ? '#f5f5f5' : '#1e293b';
  const textSecondary = darkMode ? '#888' : '#64748b';

  const maxHeightRef = useRef(0);
  const containerRef = useRef(null);

  const measureRef = useCallback(
    node => {
      if (!node || !lockHeight) return;
      const observer = new ResizeObserver(entries => {
        const h = entries[0]?.contentRect?.height ?? 0;
        if (h > maxHeightRef.current) {
          maxHeightRef.current = h;
        }
        if (containerRef.current) {
          containerRef.current.style.minHeight = `${maxHeightRef.current}px`;
        }
      });
      observer.observe(node);
      return () => observer.disconnect();
    },
    [lockHeight]
  );

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
        gap: 2.5,
      }}
    >
      {illustrationNode
        ? illustrationNode
        : illustration && (
            <Box
              component="img"
              src={illustration}
              alt=""
              sx={{
                width: 150,
                height: 'auto',
                opacity: darkMode ? 0.85 : 1,
              }}
            />
          )}

      <Box sx={{ textAlign: 'center' }}>
        <Typography
          variant="h2"
          sx={{
            fontSize: 30,
            fontWeight: 700,
            color: textPrimary,
            letterSpacing: '-0.3px',
            mb: 0.5,
          }}
        >
          {title}
        </Typography>
        {subtitle && (
          <Typography
            sx={{
              fontSize: 15,
              color: textSecondary,
              lineHeight: 1.5,
              maxWidth: 360,
              mx: 'auto',
            }}
          >
            {subtitle}
          </Typography>
        )}
      </Box>

      <Box
        ref={containerRef}
        sx={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          mt: 1,
        }}
      >
        <Box
          ref={measureRef}
          sx={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
}
