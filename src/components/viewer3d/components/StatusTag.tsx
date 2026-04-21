import { Box, Typography } from '@mui/material';
import CircleIcon from '@mui/icons-material/Circle';
import { ROBOT_STATUS } from '../../../constants/robotStatus';
import type { BusyReason, RobotStatus } from '../../../types/robot';

export interface StatusTagInfo {
  label: string;
  color: string;
  animated?: boolean;
}

export interface StatusTagProps {
  isActive: boolean;
  isOn: boolean | null;
  isMoving: boolean;
  robotStatus: RobotStatus | null;
  busyReason: BusyReason | null;
  darkMode: boolean;
}

const BUSY_LABELS: Record<BusyReason, StatusTagInfo> = {
  moving: { label: 'Moving', color: '#a855f7' },
  command: { label: 'Executing', color: '#a855f7' },
  'app-running': { label: 'App Running', color: '#a855f7' },
  installing: { label: 'Installing', color: '#3b82f6' },
};

const BORDER_BY_COLOR: Record<string, string> = {
  '#22c55e': 'rgba(34, 197, 94, 0.3)',
  '#6b7280': 'rgba(107, 114, 128, 0.3)',
  '#3b82f6': 'rgba(59, 130, 246, 0.3)',
  '#a855f7': 'rgba(168, 85, 247, 0.35)',
  '#ef4444': 'rgba(239, 68, 68, 0.4)',
  '#999': 'rgba(153, 153, 153, 0.25)',
};

function resolveStatus(props: StatusTagProps): StatusTagInfo {
  const { isActive, isOn, isMoving, robotStatus, busyReason } = props;

  if (robotStatus) {
    switch (robotStatus) {
      case ROBOT_STATUS.DISCONNECTED:
        return { label: 'Offline', color: '#999' };
      case ROBOT_STATUS.READY_TO_START:
        return { label: 'Ready to Start', color: '#3b82f6' };
      case ROBOT_STATUS.STARTING:
        return { label: 'Starting', color: '#3b82f6', animated: true };
      case ROBOT_STATUS.SLEEPING:
        return { label: 'Sleeping', color: '#6b7280' };
      case ROBOT_STATUS.READY:
        if (isOn === true) return { label: 'Ready', color: '#22c55e' };
        if (isOn === false) return { label: 'Standby', color: '#6b7280' };
        return { label: 'Connected', color: '#3b82f6' };
      case ROBOT_STATUS.BUSY: {
        const info = (busyReason && BUSY_LABELS[busyReason]) || {
          label: 'Busy',
          color: '#a855f7',
        };
        return { ...info, animated: true };
      }
      case ROBOT_STATUS.STOPPING:
        return { label: 'Stopping', color: '#ef4444', animated: true };
      case ROBOT_STATUS.CRASHED:
        return { label: 'Crashed', color: '#ef4444' };
      default:
        return { label: 'Unknown', color: '#999' };
    }
  }

  if (!isActive) return { label: 'Offline', color: '#999' };
  if (isMoving) return { label: 'Moving', color: '#a855f7', animated: true };
  if (isOn === true) return { label: 'Ready', color: '#22c55e' };
  if (isOn === false) return { label: 'Standby', color: '#6b7280' };
  return { label: 'Connected', color: '#3b82f6' };
}

export default function StatusTag(props: StatusTagProps): React.ReactElement {
  const { darkMode } = props;
  const status = resolveStatus(props);
  const borderColor = BORDER_BY_COLOR[status.color] ?? 'rgba(0, 0, 0, 0.12)';

  return (
    <Box
      sx={{
        position: 'absolute',
        bottom: 12,
        left: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        px: 1.5,
        py: 0.75,
        borderRadius: '10px',
        bgcolor: darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        border: `1.5px solid ${borderColor}`,
        backdropFilter: 'blur(10px)',
        transition: 'none',
        zIndex: 10,
      }}
    >
      <CircleIcon
        sx={{
          fontSize: 7,
          color: status.color,
          ...(status.animated && {
            animation: 'pulse-dot 1.5s ease-in-out infinite',
            '@keyframes pulse-dot': {
              '0%, 100%': { opacity: 1, transform: 'scale(1)' },
              '50%': { opacity: 0.6, transform: 'scale(1.3)' },
            },
          }),
        }}
      />
      <Typography
        sx={{
          fontSize: 11,
          fontWeight: 600,
          color: status.color,
          letterSpacing: '0.2px',
        }}
      >
        {status.label}
      </Typography>
    </Box>
  );
}
