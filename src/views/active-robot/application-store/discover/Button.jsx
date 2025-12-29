import React from 'react';
import StoreOutlinedIcon from '@mui/icons-material/StoreOutlined';
import PulseButton from '@components/PulseButton';

/**
 * Discover Apps Button Component
 * Uses shared PulseButton with pulse/highlight animation
 */
export default function DiscoverAppsButton({ onClick, darkMode, disabled = false }) {
  return (
    <PulseButton
      onClick={onClick}
      disabled={disabled}
      startIcon={<StoreOutlinedIcon sx={{ fontSize: 16 }} />}
      darkMode={darkMode}
      size="small"
      sx={{ fontSize: 12, fontWeight: 700, letterSpacing: '-0.2px' }}
      >
        Discover apps
    </PulseButton>
  );
}
