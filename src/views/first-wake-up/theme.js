export const ACCENT = '#FF9500';
export const ACCENT_LIGHT = '#FFC107';
export const ACCENT_HOVER = '#FFB333';
export const SUCCESS = '#22c55e';

export const ACCENT_GRADIENT = `linear-gradient(90deg, ${ACCENT_LIGHT}, ${ACCENT})`;

export const textSecondary = darkMode => (darkMode ? '#888' : '#64748b');

export const primaryButtonSx = {
  px: 4,
  py: 1.2,
  borderRadius: '8px',
  fontSize: 13,
  fontWeight: 600,
  textTransform: 'none',
  color: ACCENT,
  borderColor: ACCENT,
  '&:hover': { borderColor: ACCENT_HOVER, backgroundColor: 'rgba(255, 149, 0, 0.06)' },
};

export const successButtonSx = {
  px: 3,
  py: 1,
  borderRadius: '8px',
  fontSize: 13,
  fontWeight: 600,
  textTransform: 'none',
  color: SUCCESS,
  borderColor: SUCCESS,
  '&:hover': { borderColor: '#4ade80', backgroundColor: 'rgba(34, 197, 94, 0.06)' },
};

export const troubleshootLinkSx = darkMode => ({
  fontSize: 12,
  color: darkMode ? '#888' : '#64748b',
  textTransform: 'none',
  textDecoration: 'underline',
  '&:hover': { color: ACCENT },
});
