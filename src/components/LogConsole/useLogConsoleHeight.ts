import { useMemo } from 'react';
import { FONT_SIZES, PADDING, getItemPaddingPx } from './constants';

export interface UseLogConsoleHeightParams {
  lines?: number | null;
  height?: number | string | null;
  maxHeight?: number | string | null;
  compact: boolean;
  simpleStyle: boolean;
}

/**
 * Hook to calculate LogConsole height based on various props
 */
export const useLogConsoleHeight = ({
  lines,
  height,
  maxHeight,
  compact,
  simpleStyle,
}: UseLogConsoleHeightParams): number | null => {
  const fixedItemHeight = useFixedItemHeight(compact);

  // Calculate container height based on priority: lines > height > maxHeight > null (flex)
  return useMemo(() => {
    // Priority 1: lines prop (calculate from number of lines)
    if (lines != null && typeof lines === 'number' && lines > 0) {
      const verticalPadding = simpleStyle
        ? PADDING.SIMPLE * 2
        : compact
          ? PADDING.COMPACT.vertical * 2
          : PADDING.NORMAL.vertical * 2;
      const calculatedHeight = lines * fixedItemHeight + verticalPadding;
      return Math.round(calculatedHeight);
    }

    // Priority 2: height prop
    if (height && height !== 'auto') {
      if (typeof height === 'number') return height;
      if (typeof height === 'string' && height.includes('px')) {
        return parseInt(height.replace('px', ''), 10);
      }
      // If height is '100%', return null to let flex handle it
      if (height === '100%') return null;
    }

    // Priority 3: maxHeight prop
    if (maxHeight) {
      if (typeof maxHeight === 'number') return maxHeight;
      if (typeof maxHeight === 'string' && maxHeight.includes('px')) {
        return parseInt(maxHeight.replace('px', ''), 10);
      }
    }

    // Priority 4: no default height, return null for flex/auto
    return null;
  }, [lines, height, maxHeight, fixedItemHeight, compact, simpleStyle]);
};

/**
 * Calculate fixed item height for virtualizer
 */
export const useFixedItemHeight = (compact: boolean): number => {
  return useMemo(() => {
    const fontSize = compact ? FONT_SIZES.COMPACT : FONT_SIZES.NORMAL;
    const lineHeight = compact ? 1.4 : 1.6;
    const baseHeight = fontSize * lineHeight;
    // Include spacing in fixedItemHeight so virtualizer calculates correctly
    // Spacing: 1.6px (compact) or 2.4px (normal)
    const spacing = getItemPaddingPx(compact);
    return Math.round(baseHeight + spacing);
  }, [compact]);
};
