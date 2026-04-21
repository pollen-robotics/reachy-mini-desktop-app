import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Typography, Switch, CircularProgress } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import { buildApiUrl, fetchWithTimeout, DAEMON_CONFIG } from '../../../config/daemon';
import SectionHeader from './SectionHeader';

type DaemonStateKey = 'running' | 'starting' | 'stopping' | 'stopped' | 'not_initialized' | 'error';

const STATE_LABELS: Record<DaemonStateKey, string> = {
  running: 'Up and ready',
  starting: 'Waking up...',
  stopping: 'Going to sleep...',
  stopped: 'Stopped',
  not_initialized: 'Stopped',
  error: 'Error',
};

const STATE_COLORS: Record<DaemonStateKey, string> = {
  running: '#22c55e',
  starting: '#f59e0b',
  stopping: '#f59e0b',
  stopped: '#888',
  not_initialized: '#888',
  error: '#ef4444',
};

export interface SettingsDaemonCardProps {
  darkMode: boolean;
  cardStyle?: SxProps<Theme>;
}

export default function SettingsDaemonCard({
  darkMode,
  cardStyle,
}: SettingsDaemonCardProps): React.ReactElement {
  const [daemonState, setDaemonState] = useState<string | null>(null);
  const [isToggling, setIsToggling] = useState<boolean>(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const textPrimary = darkMode ? '#f5f5f5' : '#333';
  const textSecondary = darkMode ? '#888' : '#666';

  const isRunning = daemonState === 'running';
  const isTransitioning = daemonState === 'starting' || daemonState === 'stopping';
  const stateKey = daemonState as DaemonStateKey | null;
  const statusLabel = (stateKey && STATE_LABELS[stateKey]) || daemonState || 'Loading...';
  const statusColor = (stateKey && STATE_COLORS[stateKey]) || textSecondary;

  const fetchStatus = useCallback(async (): Promise<void> => {
    try {
      const response = await fetchWithTimeout(
        buildApiUrl('/api/daemon/status'),
        {},
        DAEMON_CONFIG.TIMEOUTS.COMMAND,
        { label: 'Daemon status', silent: true }
      );
      if (response.ok) {
        const data = await response.json();
        setDaemonState(data.state || null);
      }
    } catch {
      // Daemon unreachable
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    pollingRef.current = setInterval(fetchStatus, 2000);
    return () => {
      if (pollingRef.current !== null) {
        clearInterval(pollingRef.current);
      }
    };
  }, [fetchStatus]);

  const handleToggle = useCallback(async (): Promise<void> => {
    if (isToggling || isTransitioning) return;
    setIsToggling(true);

    try {
      if (isRunning) {
        await fetchWithTimeout(
          buildApiUrl('/api/daemon/stop?goto_sleep=true'),
          { method: 'POST' },
          DAEMON_CONFIG.TIMEOUTS.COMMAND,
          { label: 'Stop daemon', silent: true }
        );
      } else {
        await fetchWithTimeout(
          buildApiUrl('/api/daemon/start?wake_up=true'),
          { method: 'POST' },
          DAEMON_CONFIG.TIMEOUTS.COMMAND,
          { label: 'Start daemon', silent: true }
        );
      }
      for (let i = 0; i < 10; i++) {
        await new Promise<void>(r => setTimeout(r, 500));
        await fetchStatus();
      }
    } catch (err) {
      console.error('[Settings] Daemon toggle error:', err);
    } finally {
      setIsToggling(false);
    }
  }, [isRunning, isToggling, isTransitioning, fetchStatus]);

  return (
    <Box sx={cardStyle}>
      <SectionHeader title="Robot Control" icon={null} darkMode={darkMode} />

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: 1.5,
          borderRadius: '12px',
          bgcolor: darkMode ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)',
          cursor: isTransitioning || isToggling ? 'default' : 'pointer',
          transition: 'background 0.15s',
          '&:hover': {
            bgcolor:
              isTransitioning || isToggling
                ? undefined
                : darkMode
                  ? 'rgba(0,0,0,0.3)'
                  : 'rgba(0,0,0,0.04)',
          },
        }}
        onClick={handleToggle}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <PowerSettingsNewIcon
            sx={{ fontSize: 18, color: isRunning ? '#22c55e' : textSecondary }}
          />
          <Box>
            <Typography sx={{ fontSize: 13, fontWeight: 500, color: textPrimary }}>
              Motor Backend
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.25 }}>
              <Box
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  bgcolor: statusColor,
                }}
              />
              <Typography sx={{ fontSize: 11, color: textSecondary }}>{statusLabel}</Typography>
              {(isTransitioning || isToggling) && (
                <CircularProgress size={10} sx={{ color: textSecondary, ml: 0.5 }} />
              )}
            </Box>
          </Box>
        </Box>
        <Switch
          checked={isRunning}
          disabled={isTransitioning || isToggling}
          size="small"
          color="primary"
        />
      </Box>

      <Typography sx={{ fontSize: 11, color: textSecondary, mt: 1, ml: 0.5, lineHeight: 1.5 }}>
        {isRunning
          ? 'Turn off to disable motors and put the robot to sleep.'
          : 'Turn on to wake up the robot and enable motor control.'}
      </Typography>
    </Box>
  );
}
