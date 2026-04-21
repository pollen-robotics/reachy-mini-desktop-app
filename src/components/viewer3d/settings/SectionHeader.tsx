import React from 'react';
import { Box, Typography } from '@mui/material';
import type { SvgIconComponent } from '@mui/icons-material';

export interface SectionHeaderProps {
  title: string;
  icon?: SvgIconComponent | null;
  darkMode: boolean;
  action?: React.ReactNode;
}

export default function SectionHeader({
  title,
  icon: Icon,
  darkMode,
  action,
}: SectionHeaderProps): React.ReactElement {
  const textColor = darkMode ? '#888' : '#666';

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        mb: 2,
        pb: 1.5,
        borderBottom: `1px solid ${darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {Icon && <Icon sx={{ fontSize: 18, color: textColor }} />}
        <Typography
          sx={{
            fontSize: 14,
            fontWeight: 700,
            color: darkMode ? '#f5f5f5' : '#333',
            letterSpacing: '-0.2px',
          }}
        >
          {title}
        </Typography>
      </Box>
      {action}
    </Box>
  );
}
