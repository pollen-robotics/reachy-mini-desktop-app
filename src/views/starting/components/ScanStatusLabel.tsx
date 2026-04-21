/**
 * ScanStatusLabel - Uppercase status label
 *
 * Displays the current scan step label (e.g., "Scanning Hardware", "Connecting to Daemon")
 */

import React from 'react';
import { Typography } from '@mui/material';

export interface ScanStatusLabelProps {
  label: string;
  darkMode: boolean;
}

function ScanStatusLabel({ label, darkMode }: ScanStatusLabelProps) {
  return (
    <Typography
      sx={{
        fontSize: 11,
        fontWeight: 600,
        color: darkMode ? '#666' : '#999',
        letterSpacing: '1px',
        textTransform: 'uppercase',
      }}
    >
      {label}
    </Typography>
  );
}

export default React.memo(ScanStatusLabel);
