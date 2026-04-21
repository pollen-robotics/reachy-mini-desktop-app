import React from 'react';
import { Box, Typography, Button, CircularProgress, Link } from '@mui/material';
import hfLogo from '../../../../assets/hf-logo.svg';

export interface HfLoginOverlayProps {
  darkMode?: boolean;
  onLogin: () => void;
  onSkip?: () => void;
  isLoading?: boolean;
  isWaitingForAuth?: boolean;
  error?: string | null;
}

/**
 * Full-panel overlay shown when the user is not logged into Hugging Face.
 * Covers the entire RightPanel content with a blur backdrop and a centered login CTA.
 */
export default function HfLoginOverlay({
  darkMode,
  onLogin,
  onSkip,
  isLoading,
  isWaitingForAuth,
  error,
}: HfLoginOverlayProps): React.ReactElement {
  const busy = isLoading || isWaitingForAuth;

  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: darkMode ? 'rgba(20, 20, 20, 0.85)' : 'rgba(248, 248, 250, 0.88)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        px: 4,
        gap: 2.5,
      }}
    >
      {/* HF Logo */}
      <Box
        component="img"
        src={hfLogo}
        alt="Hugging Face"
        sx={{ width: 56, height: 56, mb: 0.5 }}
      />

      {/* Title */}
      <Typography
        sx={{
          fontSize: 16,
          fontWeight: 700,
          color: darkMode ? '#f0f0f0' : '#222',
          letterSpacing: '-0.2px',
          textAlign: 'center',
        }}
      >
        Sign in to Hugging Face
      </Typography>

      {/* Description */}
      <Typography
        sx={{
          fontSize: 12.5,
          color: darkMode ? '#888' : '#777',
          textAlign: 'center',
          lineHeight: 1.6,
          maxWidth: 280,
        }}
      >
        Connect your Hugging Face account to browse, install and manage applications on your Reachy
        Mini.
      </Typography>

      {/* Login button */}
      <Button
        disabled={busy}
        onClick={onLogin}
        startIcon={busy ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : null}
        sx={{
          mt: 0.5,
          py: 1.25,
          px: 4,
          fontSize: 13,
          fontWeight: 700,
          textTransform: 'none',
          borderRadius: '12px',
          color: '#fff',
          background: 'linear-gradient(135deg, #FF9500, #E08500)',
          boxShadow: '0 2px 12px rgba(255, 149, 0, 0.25)',
          transition: 'all 0.2s ease',
          '&:hover': {
            background: 'linear-gradient(135deg, #FFa520, #E89510)',
            boxShadow: '0 4px 16px rgba(255, 149, 0, 0.35)',
            transform: 'translateY(-1px)',
          },
          '&:disabled': {
            color: 'rgba(255,255,255,0.7)',
            background: darkMode ? 'rgba(255, 149, 0, 0.3)' : 'rgba(255, 149, 0, 0.4)',
            boxShadow: 'none',
            transform: 'none',
          },
        }}
      >
        {isWaitingForAuth ? 'Waiting for login...' : isLoading ? 'Connecting...' : 'Sign in'}
      </Button>

      {/* Waiting hint */}
      {isWaitingForAuth && (
        <Typography
          sx={{
            fontSize: 11,
            color: darkMode ? '#666' : '#999',
            textAlign: 'center',
          }}
        >
          Complete the login in your browser
        </Typography>
      )}

      {/* Error */}
      {error && (
        <Typography
          sx={{
            fontSize: 11,
            color: '#ef4444',
            textAlign: 'center',
            maxWidth: 280,
          }}
        >
          {error}
        </Typography>
      )}

      {/* Skip login link */}
      {!busy && onSkip && (
        <Link
          component="button"
          onClick={onSkip}
          underline="hover"
          sx={{
            mt: 0.5,
            fontSize: 11.5,
            color: darkMode ? '#666' : '#999',
            cursor: 'pointer',
            transition: 'color 0.15s ease',
            '&:hover': {
              color: darkMode ? '#999' : '#555',
            },
          }}
        >
          Continue without signing in
        </Link>
      )}
    </Box>
  );
}
