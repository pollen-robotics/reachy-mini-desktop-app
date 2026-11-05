import React from 'react';
import { Box, ButtonBase, Tooltip, Typography } from '@mui/material';
import NfcIcon from '@mui/icons-material/Nfc';
import { ACCENT, DURATION, accentAlpha, transition } from '@styles/tokens';
import { useAppPalette, TYPO, FONT_WEIGHT, BLUR } from '@styles';
import type { NfcState } from './nfcState';
import { NFC_STATE_COLOR } from './nfcStateColor';

const SIZE = 36;

const LABEL_OPEN = { maxWidth: 140, opacity: 1, ml: '6px', mr: '4px' } as const;

const NFC_STATE_LABEL: Record<NfcState, string> = {
  disabled: 'NFC off',
  unavailable: 'NFC unavailable',
  idle: 'No tag',
  tag: 'Tag detected',
};

export interface NfcStatusButtonProps {
  state: NfcState;
  onClick: () => void;
  disabled?: boolean;
}

export default function NfcStatusButton({
  state,
  onClick,
  disabled = false,
}: NfcStatusButtonProps): React.ReactElement {
  const palette = useAppPalette();
  const unavailable = state === 'unavailable';
  const muted = unavailable || state === 'disabled';
  const dotColor = NFC_STATE_COLOR[state];
  const label = NFC_STATE_LABEL[state];

  return (
    <Tooltip title="NFC Reader" placement="top" arrow>
      <Box component="span" sx={{ display: 'inline-flex', '&:hover .nfc-label': LABEL_OPEN }}>
        <ButtonBase
          onClick={onClick}
          disabled={disabled}
          aria-label={`NFC reader: ${label}`}
          sx={{
            boxSizing: 'border-box',
            height: SIZE,
            minWidth: SIZE,
            px: '8px',
            borderRadius: `${SIZE / 2}px`,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            color: muted ? palette.textMuted : ACCENT.main,
            bgcolor: palette.surfaceCard,
            border: '1px solid',
            borderColor: unavailable ? palette.border : palette.accentBorderStrong,
            backdropFilter: BLUR.md,
            boxShadow: palette.shadowSm,
            transition: transition('all', DURATION.base),
            '&.Mui-disabled': { opacity: 0.4 },
            '& .nfc-label': {
              maxWidth: 0,
              opacity: 0,
              ml: 0,
            },
            '&:hover, &:focus-visible': {
              bgcolor: palette.isDark ? accentAlpha(0.15) : accentAlpha(0.1),
              borderColor: ACCENT.main,
              '& .nfc-label': LABEL_OPEN,
            },
          }}
        >
          <Box sx={{ position: 'relative', display: 'flex', flexShrink: 0 }}>
            <NfcIcon sx={{ fontSize: TYPO.xl }} />
            {unavailable && (
              <Box
                sx={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: '120%',
                  height: '1.5px',
                  bgcolor: 'currentColor',
                  borderRadius: '1px',
                  boxShadow: `0 0 0 1px ${palette.surfaceCard}`,
                  transform: 'translate(-50%, -50%) rotate(-45deg)',
                }}
              />
            )}
            {!muted && (
              <Box
                sx={{
                  position: 'absolute',
                  top: -2,
                  right: -3,
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  bgcolor: dotColor,
                  border: `1.5px solid ${palette.surfaceCard}`,
                  transition: transition('background-color', DURATION.base),
                }}
              />
            )}
          </Box>
          <Typography
            component="span"
            className="nfc-label"
            sx={{
              fontSize: TYPO.sm,
              fontWeight: FONT_WEIGHT.semibold,
              color: muted ? palette.textMuted : palette.textPrimary,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              transition: transition(['max-width', 'opacity', 'margin'], DURATION.medium),
            }}
          >
            {label}
          </Typography>
        </ButtonBase>
      </Box>
    </Tooltip>
  );
}
