import React, { useState } from 'react';
import { Collapse, CircularProgress } from '@mui/material';
import type { EmojiGridAction } from '@constants/choreographies';
import { ACCENT_ORANGE, accentRgba, getEmojiGridPalette } from './theme';

const ROWS_VISIBLE = 3;
const COLUMNS = 6;
const GAP = 12;
const SPINNER_SIZE = 20;
const EMOJI_FONT_SIZE = 24;

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
  darkMode = false,
  disabled = false,
  searchQuery = '',
  activeActionName = null,
  isExecuting = false,
}: EmojiGridProps) {
  const [expanded, setExpanded] = useState<boolean>(false);
  const palette = getEmojiGridPalette(darkMode);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const matchesSearch = (item: EmojiGridItem): boolean => {
    if (!normalizedQuery) return true;
    return (
      !!item.name?.toLowerCase().includes(normalizedQuery) ||
      !!item.label?.toLowerCase().includes(normalizedQuery)
    );
  };

  const itemsVisible = COLUMNS * ROWS_VISIBLE;
  const hasMore = items.length > itemsVisible;
  const visibleItems = items.slice(0, itemsVisible);
  const hiddenItems = items.slice(itemsVisible);
  const itemWidth = `calc((100% - ${GAP * (COLUMNS - 1)}px) / ${COLUMNS})`;

  const renderItem = (item: EmojiGridItem, index: number) => {
    const isGhosted = Boolean(normalizedQuery) && !matchesSearch(item);
    const isActiveItem = activeActionName === item.name;
    const showSpinner = isActiveItem && isExecuting;
    const isInteractive = !disabled && !isGhosted;

    const itemBorderColor = isGhosted ? palette.ghostBorder : palette.border;
    const itemBgColor = isGhosted ? palette.ghostBg : palette.bg;
    const itemOpacity = isGhosted ? 0.25 : disabled ? 0.5 : 1;
    // Highlight border when the item is the one currently executing.
    const borderColor = isActiveItem && disabled ? ACCENT_ORANGE : itemBorderColor;

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
          width: itemWidth,
          border: `1px solid ${borderColor}`,
          background: itemBgColor,
          opacity: itemOpacity,
          filter: isGhosted ? 'grayscale(100%)' : 'none',
          cursor: isInteractive ? 'pointer' : 'default',
        }}
      >
        {showSpinner ? (
          <CircularProgress size={SPINNER_SIZE} thickness={3} sx={{ color: ACCENT_ORANGE }} />
        ) : (
          <span className="emoji-grid-item__emoji">{item.emoji}</span>
        )}
      </button>
    );
  };

  const gridStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: GAP,
    width: '100%',
    boxSizing: 'border-box',
  };

  return (
    <div style={{ width: '100%', marginBottom: 10 }}>
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
          background: ${palette.hoverBg} !important;
          border-color: ${palette.hoverBorder} !important;
          transform: scale(1.03);
          box-shadow: 0 2px 8px ${accentRgba(0.15)};
        }
        .emoji-grid-item[data-interactive="true"]:active {
          background: ${palette.activeBg} !important;
          transform: scale(0.97);
          box-shadow: 0 1px 4px ${accentRgba(0.2)};
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
          color: ${palette.muted};
        }
        .emoji-grid-toggle:hover {
          color: ${ACCENT_ORANGE};
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
              color: palette.muted,
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
