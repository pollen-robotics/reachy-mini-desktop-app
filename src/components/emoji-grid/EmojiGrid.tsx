import React, { useMemo, useRef, useState } from 'react';
import { Collapse, CircularProgress } from '@mui/material';
import type { EmojiGridAction } from '@constants/choreographies';
import { ACCENT, accentAlpha } from '@styles/tokens';
import { useAppPalette } from '@styles';
import { useResizeObserver } from '@hooks/useResizeObserver';

const ROWS_VISIBLE = 3;
const GAP = 12;
const SPINNER_SIZE = 20;
const EMOJI_FONT_SIZE = 24;

/**
 * Tile sizing is driven by the container width, not a fixed column count.
 * The right panel is fluid (`flex: 1 1 0`) and further scaled by the fullscreen
 * webview zoom, so a hard-coded column count made each square grow/shrink
 * without bound as the panel resized. Instead we keep tiles near a target edge
 * and adapt the column count (clamped) so boxes stay a consistent size.
 */
const PREFERRED_TILE_PX = 48;
const MIN_COLUMNS = 5;
const MAX_COLUMNS = 10;
/** Column count used before the container has been measured. */
const FALLBACK_COLUMNS = 6;

export interface EmojiGridItem {
  name?: string;
  label?: string;
  emoji?: React.ReactNode;
  originalAction?: EmojiGridAction;
}

export interface EmojiGridProps {
  items?: EmojiGridItem[];
  title?: string;
  onAction?: (action: EmojiGridAction) => void;
  /** @deprecated Theme mode is now read from `useAppPalette()`. Prop kept for back-compat but ignored. */
  darkMode?: boolean;
  disabled?: boolean;
  searchQuery?: string;
  activeActionName?: string | null;
  isExecuting?: boolean;
}

/**
 * Simple emoji grid - displays emojis in a responsive flex layout.
 * Shows `ROWS_VISIBLE` rows by default, with an animated "show more" accordion.
 *
 * Hover / active visuals are driven by a single <style> block scoped via a
 * dedicated class name, instead of imperative DOM mutations in mouse handlers.
 */
export function EmojiGrid({
  items = [],
  title = '',
  onAction,
  disabled = false,
  searchQuery = '',
  activeActionName = null,
  isExecuting = false,
}: EmojiGridProps) {
  const [expanded, setExpanded] = useState<boolean>(false);
  const palette = useAppPalette();

  // Measure the actual container width so the tile size stays consistent while
  // the fluid right panel (and fullscreen zoom) resizes it.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { width: containerWidth } = useResizeObserver(containerRef);

  const columns = useMemo(() => {
    if (containerWidth <= 0) return FALLBACK_COLUMNS;
    const raw = Math.round((containerWidth + GAP) / (PREFERRED_TILE_PX + GAP));
    return Math.max(MIN_COLUMNS, Math.min(MAX_COLUMNS, raw));
  }, [containerWidth]);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const matchesSearch = (item: EmojiGridItem): boolean => {
    if (!normalizedQuery) return true;
    return (
      !!item.name?.toLowerCase().includes(normalizedQuery) ||
      !!item.label?.toLowerCase().includes(normalizedQuery)
    );
  };

  const itemsVisible = columns * ROWS_VISIBLE;
  const hasMore = items.length > itemsVisible;
  const visibleItems = items.slice(0, itemsVisible);
  const hiddenItems = items.slice(itemsVisible);

  const renderItem = (item: EmojiGridItem, index: number) => {
    const isGhosted = Boolean(normalizedQuery) && !matchesSearch(item);
    const isActiveItem = activeActionName === item.name;
    const showSpinner = isActiveItem && isExecuting;
    const isInteractive = !disabled && !isGhosted;

    const itemBorderColor = isGhosted ? palette.ghostBorder : palette.accentBorder;
    const itemBgColor = isGhosted ? palette.ghostBg : palette.accentSurface;
    const itemOpacity = isGhosted ? 0.25 : disabled ? 0.5 : 1;
    const borderColor = isActiveItem && disabled ? ACCENT.main : itemBorderColor;

    const handleClick = () => {
      if (isInteractive && onAction && item.originalAction) {
        onAction(item.originalAction);
      }
    };

    return (
      <button
        key={item.name ?? index}
        className="emoji-grid-item"
        data-interactive={isInteractive ? 'true' : 'false'}
        onClick={handleClick}
        disabled={disabled || isGhosted}
        title={item.label}
        style={{
          border: `1px solid ${borderColor}`,
          background: itemBgColor,
          opacity: itemOpacity,
          filter: isGhosted ? 'grayscale(100%)' : 'none',
          cursor: isInteractive ? 'pointer' : 'default',
        }}
      >
        {showSpinner ? (
          <CircularProgress size={SPINNER_SIZE} thickness={3} sx={{ color: ACCENT.main }} />
        ) : (
          <span className="emoji-grid-item__emoji">{item.emoji}</span>
        )}
      </button>
    );
  };

  // CSS Grid (not flex-wrap): `1fr` columns fill the row exactly with no
  // sub-pixel wrapping, and `alignItems: start` keeps items from being
  // vertically stretched — so the tiles' `aspect-ratio: 1 / 1` is honored and
  // they stay square instead of turning into rectangles as the panel resizes.
  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(${columns}, 1fr)`,
    alignItems: 'start',
    gap: GAP,
    width: '100%',
    boxSizing: 'border-box',
  };

  return (
    <div ref={containerRef} style={{ width: '100%', marginBottom: 10 }}>
      <style>{`
        .emoji-grid-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          aspect-ratio: 1 / 1;
          border-radius: 12px;
          box-sizing: border-box;
          position: relative;
          transition: background 0.2s ease, border-color 0.2s ease,
            transform 0.2s ease, box-shadow 0.2s ease;
        }
        .emoji-grid-item__emoji {
          font-size: ${EMOJI_FONT_SIZE}px;
          line-height: 1;
        }
        .emoji-grid-item[data-interactive="true"]:hover {
          background: ${palette.accentSurfaceHover} !important;
          border-color: ${palette.accentBorderStrong} !important;
          transform: scale(1.03);
          box-shadow: 0 2px 8px ${accentAlpha(0.15)};
        }
        .emoji-grid-item[data-interactive="true"]:active {
          background: ${palette.accentSurfaceActive} !important;
          transform: scale(0.97);
          box-shadow: 0 1px 4px ${accentAlpha(0.2)};
        }
        .emoji-grid-toggle {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          border: none;
          border-radius: 4px;
          background: transparent;
          font-size: 11px;
          font-weight: 400;
          cursor: pointer;
          transition: color 0.15s;
          color: ${palette.textMuted};
        }
        .emoji-grid-toggle:hover {
          color: ${ACCENT.main};
        }
      `}</style>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 24,
          paddingLeft: 2,
          paddingRight: 2,
        }}
      >
        {title && (
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: palette.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            {title} <span style={{ fontWeight: 400, opacity: 0.7 }}>({items.length})</span>
          </div>
        )}

        {hasMore && (
          <button type="button" className="emoji-grid-toggle" onClick={() => setExpanded(v => !v)}>
            {expanded ? 'Less' : `+${hiddenItems.length} more`}
            <span
              style={{
                transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s ease',
                display: 'inline-block',
                fontSize: 8,
              }}
            >
              ▼
            </span>
          </button>
        )}
      </div>

      <div style={gridStyle}>{visibleItems.map(renderItem)}</div>

      {hasMore && (
        <Collapse in={expanded} timeout={300}>
          <div style={{ ...gridStyle, marginTop: GAP }}>
            {hiddenItems.map((item, idx) => renderItem(item, itemsVisible + idx))}
          </div>
        </Collapse>
      )}
    </div>
  );
}
