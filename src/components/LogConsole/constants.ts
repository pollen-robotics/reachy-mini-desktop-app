export const FONT_SIZES = {
  COMPACT: 9,
  NORMAL: 10,
} as const;

export const PADDING = {
  SIMPLE: 16,
  COMPACT: { horizontal: 8, vertical: 4 },
  NORMAL: { horizontal: 16, vertical: 4 },
} as const;

/**
 * Stable empty array reference. Used for `useAppStore` selectors that need to
 * return "no data" without creating a new array identity on every render
 * (Zustand bails out on reference equality).
 */
export const EMPTY_ARRAY: readonly never[] = [];

/**
 * Common text selection styles (DRY)
 */
export const TEXT_SELECT_STYLES = {
  userSelect: 'text',
  WebkitUserSelect: 'text',
  MozUserSelect: 'text',
  msUserSelect: 'text',
} as const;

/**
 * Common ellipsis styles for long text (DRY)
 */
export const ELLIPSIS_STYLES = {
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  minWidth: 0,
} as const;

export const getItemPadding = (compact: boolean): number => {
  return compact ? 0.2 : 0.3;
};

export const getItemPaddingPx = (compact: boolean): number => {
  return compact ? 0.2 * 8 : 0.3 * 8;
};
