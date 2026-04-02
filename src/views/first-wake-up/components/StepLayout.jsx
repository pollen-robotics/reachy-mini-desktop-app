import React from 'react';
import { Box, Typography, IconButton } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

/**
 * Shared layout wrapper for first wake-up steps.
 * Provides consistent structure: title, subtitle, content area, footer.
 */
export default function StepLayout({
  darkMode,
  icon,
  title,
  subtitle,
  stepNumber,
  totalSteps = 6,
  children,
  footer,
  onBack,
  showBack = true,
}) {
  const textPrimary = darkMode ? '#f5f5f5' : '#1e293b';
  const textSecondary = darkMode ? '#888' : '#64748b';

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
        height: '100%',
        position: 'relative',
      }}
    >
      {/* Header */}
      <Box sx={{ textAlign: 'center', mb: 2 }}>
        {icon && <Typography sx={{ fontSize: 40, mb: 1, lineHeight: 1 }}>{icon}</Typography>}
        <Typography
          variant="h2"
          sx={{
            fontSize: 22,
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
              fontSize: 13,
              color: textSecondary,
              lineHeight: 1.5,
              maxWidth: 340,
              mx: 'auto',
            }}
          >
            {subtitle}
          </Typography>
        )}
      </Box>

      {/* Content */}
      <Box
        sx={{
          flex: 1,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 0,
        }}
      >
        {children}
      </Box>

      {/* Footer */}
      {footer && (
        <Box sx={{ mt: 2, width: '100%', display: 'flex', justifyContent: 'center' }}>{footer}</Box>
      )}

      {/* Bottom bar: back button + step indicator */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          mt: 2,
          pt: 1,
        }}
      >
        {showBack && onBack ? (
          <IconButton
            size="small"
            onClick={onBack}
            sx={{
              color: textSecondary,
              fontSize: 12,
              '&:hover': { color: '#FF9500' },
            }}
          >
            <ArrowBackIcon sx={{ fontSize: 16 }} />
          </IconButton>
        ) : (
          <Box sx={{ width: 32 }} />
        )}

        {stepNumber != null && (
          <Typography sx={{ fontSize: 11, fontWeight: 500, color: textSecondary }}>
            Step {stepNumber} of {totalSteps}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
