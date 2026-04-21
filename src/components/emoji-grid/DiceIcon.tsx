import React from 'react';
import { ACCENT_ORANGE } from './theme';

/**
 * Dot positions for each dice face, expressed as [col, row] pairs on a 3x3
 * grid where 0 = 25%, 1 = 50%, 2 = 75% of the face. Defined at module level
 * so we don't rebuild the map on every render.
 */
const DOT_PATTERNS: Readonly<Record<number, readonly [number, number][]>> = {
  1: [[1, 1]],
  2: [
    [0, 0],
    [2, 2],
  ],
  3: [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  4: [
    [0, 0],
    [2, 0],
    [0, 2],
    [2, 2],
  ],
  5: [
    [0, 0],
    [2, 0],
    [1, 1],
    [0, 2],
    [2, 2],
  ],
  6: [
    [0, 0],
    [2, 0],
    [0, 1],
    [2, 1],
    [0, 2],
    [2, 2],
  ],
};

const DOT_GRID_POSITIONS = [0.25, 0.5, 0.75] as const;

export interface DiceIconProps {
  value?: number;
  size?: number;
  color?: string;
  isShaking?: boolean;
}

/**
 * DiceIcon - A single die rendered with CSS dots.
 * Purely presentational, memoized to avoid re-renders on parent state churn.
 */
export const DiceIcon = React.memo(function DiceIcon({
  value = 6,
  size = 32,
  color = ACCENT_ORANGE,
  isShaking = false,
}: DiceIconProps) {
  const dotSize = size * 0.16;
  const dots = DOT_PATTERNS[value] ?? DOT_PATTERNS[6];

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.2,
        border: `1px solid ${color}`,
        position: 'relative',
        boxSizing: 'border-box',
        animation: isShaking ? 'diceShake 0.1s ease-in-out infinite' : 'none',
        pointerEvents: 'none',
      }}
    >
      {dots.map(([col, row], i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            width: dotSize,
            height: dotSize,
            borderRadius: '50%',
            backgroundColor: color,
            left: `calc(${DOT_GRID_POSITIONS[col] * 100}% - ${dotSize / 2}px)`,
            top: `calc(${DOT_GRID_POSITIONS[row] * 100}% - ${dotSize / 2}px)`,
          }}
        />
      ))}
    </div>
  );
});
