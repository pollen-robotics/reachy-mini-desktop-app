/**
 * BoldMessage - Text with bold emphasis
 *
 * Renders "text **bold** suffix" pattern used throughout scan messages.
 */

import React from 'react';
import { Box, Typography } from '@mui/material';

export interface BoldMessageProps {
  text?: string;
  bold: string;
  suffix?: string;
  darkMode: boolean;
  fontSize?: number;
}

function BoldMessage({ text, bold, suffix, darkMode, fontSize = 14 }: BoldMessageProps) {
  return (
    <Typography
      component="span"
      sx={{
        fontSize,
        fontWeight: 500,
        color: darkMode ? '#f5f5f5' : '#333',
        lineHeight: 1.5,
      }}
    >
      {text && `${text} `}
      <Box component="span" sx={{ fontWeight: 700 }}>
        {bold}
      </Box>
      {suffix && ` ${suffix}`}
    </Typography>
  );
}

export default React.memo(BoldMessage);
