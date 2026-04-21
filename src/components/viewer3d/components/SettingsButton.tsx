import { Box, IconButton, Tooltip } from '@mui/material';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';

export interface SettingsButtonProps {
  onClick: () => void;
  disabled: boolean;
  darkMode: boolean;
}

export default function SettingsButton({
  onClick,
  disabled,
  darkMode,
}: SettingsButtonProps): React.ReactElement {
  return (
    <Box
      sx={{
        position: 'absolute',
        top: 12,
        right: 12,
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        zIndex: 10,
      }}
    >
      <Tooltip title="Settings" placement="top" arrow>
        <span>
          <IconButton
            onClick={onClick}
            size="small"
            disabled={disabled}
            sx={{
              width: 36,
              height: 36,
              transition: 'all 0.2s ease',
              color: disabled ? (darkMode ? '#666' : '#999') : '#FF9500',
              bgcolor: darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(255, 255, 255, 0.95)',
              border: '1px solid',
              borderColor: disabled
                ? darkMode
                  ? 'rgba(255, 255, 255, 0.1)'
                  : 'rgba(0, 0, 0, 0.1)'
                : darkMode
                  ? 'rgba(255, 149, 0, 0.5)'
                  : 'rgba(255, 149, 0, 0.4)',
              backdropFilter: 'blur(10px)',
              boxShadow: darkMode
                ? '0 2px 8px rgba(0, 0, 0, 0.3)'
                : '0 2px 8px rgba(0, 0, 0, 0.08)',
              opacity: disabled ? 0.4 : 1,
              '&:hover': {
                bgcolor: darkMode ? 'rgba(255, 149, 0, 0.15)' : 'rgba(255, 149, 0, 0.1)',
                borderColor: '#FF9500',
                transform: disabled ? 'none' : 'scale(1.05)',
              },
              '&:active': {
                transform: disabled ? 'none' : 'scale(0.95)',
              },
              '&.Mui-disabled': {
                bgcolor: darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.6)',
                color: darkMode ? '#666' : '#999',
                borderColor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
              },
            }}
          >
            <SettingsOutlinedIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  );
}
