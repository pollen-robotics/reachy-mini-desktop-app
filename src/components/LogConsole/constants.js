export const FONT_SIZES = {
  COMPACT: 9,
  NORMAL: 10,
};


export const PADDING = {
  SIMPLE: 16,
  COMPACT: { horizontal: 8, vertical: 4 },
  NORMAL: { horizontal: 16, vertical: 4 },
};

export const EMPTY_ARRAY = [];

/**
 * Common text selection styles (DRY)
 */
export const TEXT_SELECT_STYLES = {
  userSelect: 'text',
  WebkitUserSelect: 'text',
  MozUserSelect: 'text',
  msUserSelect: 'text',
};

/**
 * Common ellipsis styles for long text (DRY)
 */
export const ELLIPSIS_STYLES = {
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  minWidth: 0,
};

/**
 * Calculate item padding based on compact mode
 * @param {boolean} compact - Compact mode
 * @returns {number} Padding in theme units (0.2 or 0.3)
 */
export const getItemPadding = (compact) => {
  return compact ? 0.2 : 0.3;
};

/**
 * Calculate item padding in pixels
 * @param {boolean} compact - Compact mode
 * @returns {number} Padding in pixels (1.6px or 2.4px)
 */
export const getItemPaddingPx = (compact) => {
  return compact ? 0.2 * 8 : 0.3 * 8;
};
