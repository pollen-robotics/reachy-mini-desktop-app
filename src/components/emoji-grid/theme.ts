/**
 * Shared color tokens and theme helpers for the emoji-grid feature.
 *
 * `ACCENT_ORANGE` is the primary brand accent used across emotion /
 * expression UI elements. Kept local to this feature module to avoid
 * a sweeping refactor of the app-wide palette while still removing
 * duplication within this folder.
 */
export const ACCENT_ORANGE = '#FF9500';

/** Accent color with arbitrary alpha, e.g. `accentRgba(0.4)`. */
export function accentRgba(alpha: number): string {
  return `rgba(255, 149, 0, ${alpha})`;
}

export interface EmojiGridPalette {
  border: string;
  bg: string;
  text: string;
  muted: string;
  hoverBorder: string;
  hoverBg: string;
  activeBg: string;
  ghostBorder: string;
  ghostBg: string;
}

/**
 * Build the color palette used by both EmojiGrid and EmotionWheel so that
 * light / dark variants stay in sync across the feature.
 */
export function getEmojiGridPalette(darkMode: boolean): EmojiGridPalette {
  return {
    border: accentRgba(darkMode ? 0.25 : 0.3),
    bg: accentRgba(darkMode ? 0.06 : 0.04),
    text: darkMode ? '#fff' : '#333',
    muted: darkMode ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)',
    hoverBorder: accentRgba(darkMode ? 0.5 : 0.6),
    hoverBg: accentRgba(darkMode ? 0.12 : 0.1),
    activeBg: accentRgba(darkMode ? 0.25 : 0.2),
    ghostBorder: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
    ghostBg: darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)',
  };
}
