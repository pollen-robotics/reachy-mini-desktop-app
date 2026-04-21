import React, { type ErrorInfo, type ReactNode } from 'react';
import { Box, Typography, Button } from '@mui/material';

export interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Global error boundary that catches unhandled render errors and displays a
 * recovery UI instead of a blank white screen.
 *
 * Class component because React error boundaries require `componentDidCatch`
 * and `getDerivedStateFromError` (no hook equivalent).
 */
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary] Uncaught render error:', error, info.componentStack);

    try {
      // Synchronous require keeps the boundary working even if telemetry fails.

      const { telemetry } = require('../utils/telemetry') as {
        telemetry: { appCrash: (props: Record<string, unknown>) => void };
      };
      telemetry.appCrash({
        error_type: 'react_render_crash',
        error_message: error?.message,
        stack: error?.stack?.slice(0, 500),
      });
    } catch {
      // Telemetry unavailable - swallow silently
    }
  }

  handleRecover = (): void => {
    this.setState({ hasError: false, error: null });
  };

  handleFullReset = (): void => {
    try {
      const useStore = require('../store/useStore').useStore as {
        getState: () => { resetAll: () => void };
      };
      useStore.getState().resetAll();
    } catch {
      // Store unavailable
    }
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const isDark =
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;

    return (
      <Box
        sx={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 3,
          bgcolor: isDark ? '#1a1a1a' : '#fafafc',
          color: isDark ? '#fff' : '#1a1a1a',
          px: 4,
          textAlign: 'center',
        }}
      >
        <Typography variant="h5" fontWeight={600}>
          Something went wrong
        </Typography>

        <Typography
          sx={{
            fontSize: 13,
            color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)',
            maxWidth: 420,
            lineHeight: 1.6,
          }}
        >
          An unexpected error occurred in the interface. The robot daemon is still running in the
          background.
        </Typography>

        {this.state.error && (
          <Box
            className="selectable-text"
            sx={{
              mt: 1,
              px: 2,
              py: 1.5,
              borderRadius: '8px',
              bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
              maxWidth: 500,
              overflow: 'auto',
            }}
          >
            <Typography
              sx={{
                fontFamily: 'monospace',
                fontSize: 11,
                color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)',
                wordBreak: 'break-word',
                cursor: 'text',
              }}
            >
              {this.state.error.message}
            </Typography>
          </Box>
        )}

        <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
          <Button variant="contained" onClick={this.handleRecover}>
            Retry
          </Button>
          <Button variant="outlined" onClick={this.handleFullReset}>
            Reset &amp; Reconnect
          </Button>
        </Box>
      </Box>
    );
  }
}

export default ErrorBoundary;
