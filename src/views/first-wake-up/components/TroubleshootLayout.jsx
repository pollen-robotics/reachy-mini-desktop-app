import React from 'react';
import { Box, Typography, Button, keyframes } from '@mui/material';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import ForumIcon from '@mui/icons-material/Forum';
import {
  ACCENT,
  ACCENT_HOVER,
  DISCORD_URL,
  FAQ_URL,
  textSecondary as getTextSecondary,
} from '../theme';
import reachyDetective from '../../../assets/reachy-detective.svg';

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
`;

function GenericLink({ icon: Icon, label, href, darkMode }) {
  const color = darkMode ? '#aaa' : '#64748b';
  const shared = {
    display: 'flex',
    alignItems: 'center',
    gap: 0.5,
    fontSize: 12,
    fontWeight: 500,
    color,
    transition: 'color 0.15s',
    '&:hover': { color: ACCENT },
  };

  if (href) {
    return (
      <Box
        component="a"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        sx={{ ...shared, textDecoration: 'none', cursor: 'pointer' }}
      >
        <Icon sx={{ fontSize: 15 }} />
        {label}
      </Box>
    );
  }

  return (
    <Box sx={shared}>
      <Icon sx={{ fontSize: 15 }} />
      {label}
    </Box>
  );
}

export default function TroubleshootLayout({ darkMode, title, tips, onBack }) {
  const textPrimary = darkMode ? '#f5f5f5' : '#1e293b';
  const textSecondary = getTextSecondary(darkMode);
  const cardBg = darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)';
  const cardBorder = darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const dividerColor = darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
        gap: 2,
        animation: `${fadeIn} 0.3s ease-out`,
      }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
        <Box
          component="img"
          src={reachyDetective}
          alt=""
          sx={{ width: 150, height: 'auto', opacity: darkMode ? 0.85 : 1 }}
        />
        <Typography
          sx={{
            fontSize: 22,
            fontWeight: 700,
            color: textPrimary,
            textAlign: 'center',
            letterSpacing: '-0.3px',
          }}
        >
          {title}
        </Typography>
      </Box>

      {/* Specific tips side by side */}
      {tips && tips.length > 0 && (
        <Box
          sx={{
            width: '100%',
            maxWidth: 520,
            display: 'flex',
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 1.5,
            justifyContent: 'center',
          }}
        >
          {tips.map((tip, i) => (
            <Box
              key={i}
              sx={{
                flex: '1 1 150px',
                maxWidth: tips.length === 1 ? 380 : '50%',
                display: 'flex',
                flexDirection: 'column',
                gap: 0.5,
                px: 2.5,
                py: 2,
                borderRadius: '12px',
                backgroundColor: cardBg,
                border: `1px solid ${cardBorder}`,
              }}
            >
              <Typography
                sx={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: ACCENT,
                  lineHeight: 1,
                }}
              >
                {i + 1}
              </Typography>
              <Typography sx={{ fontSize: 14, color: textSecondary, lineHeight: 1.55 }}>
                {tip}
              </Typography>
            </Box>
          ))}
        </Box>
      )}

      {/* Divider */}
      <Box sx={{ width: '100%', maxWidth: 400, borderTop: `1px solid ${dividerColor}` }} />

      {/* Generic tips footer */}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: 2,
        }}
      >
        <GenericLink icon={RestartAltIcon} label="Update & reboot" darkMode={darkMode} />
        <GenericLink icon={MenuBookIcon} label="Check the FAQ" href={FAQ_URL} darkMode={darkMode} />
        <GenericLink
          icon={ForumIcon}
          label="Discord support"
          href={DISCORD_URL}
          darkMode={darkMode}
        />
      </Box>

      {/* Back button */}
      <Button
        variant="outlined"
        onClick={onBack}
        sx={{
          fontSize: 13,
          fontWeight: 600,
          textTransform: 'none',
          color: ACCENT,
          borderColor: ACCENT,
          borderRadius: '8px',
          px: 3,
          py: 0.8,
          '&:hover': {
            borderColor: ACCENT_HOVER,
            backgroundColor: 'rgba(255, 149, 0, 0.06)',
          },
        }}
      >
        ← Back to test
      </Button>
    </Box>
  );
}
