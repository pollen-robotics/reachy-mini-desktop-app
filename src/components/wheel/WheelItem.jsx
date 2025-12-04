import React, { memo } from 'react';
import { Box, Typography } from '@mui/material';

/**
 * Memoized wheel item component for better performance
 * Only re-renders when props actually change
 */
const WheelItem = memo(({
  item,
  x,
  y,
  rotation,
  isSelected,
  isDragging,
  isSpinning,
  isBusy,
  emojiSize,
  activeTab,
  onItemClick,
  listIndex,
}) => {
  const displayEmoji = item.emoji || (activeTab === 'emotions' ? '😐' : '🎵');

  return (
    <Box
      key={`wheel-item-${listIndex}`}
      role="option"
      aria-selected={isSelected}
      id={`wheel-item-${listIndex}`}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onItemClick(e, item, listIndex);
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
      }}
      sx={{
        position: 'absolute',
        left: `${x}px`,
        top: `${y}px`,
        transform: `translate(-50%, -50%) rotate(${-rotation}deg) ${isSelected ? 'scale(1.15)' : 'scale(1)'}`,
        width: emojiSize + 40,
        height: emojiSize + 40,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: isSelected ? 'pointer' : 'default',
        transition: isDragging || isSpinning ? 'none' : 'transform 0.2s ease-out',
        zIndex: 1,
        pointerEvents: 'auto',
        border: 'none',
        borderRadius: '0',
        opacity: isBusy && !isSelected ? 0.3 : 1,
        filter: isBusy && !isSelected ? 'grayscale(50%)' : 'none',
        willChange: isDragging || isSpinning ? 'transform' : 'auto', // Optimize animations
      }}
    >
      <Typography
        component="span"
        aria-label={item.label}
        sx={{
          fontSize: emojiSize,
          lineHeight: 1,
          userSelect: 'none',
        }}
      >
        {displayEmoji}
      </Typography>
    </Box>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for better memoization
  return (
    prevProps.x === nextProps.x &&
    prevProps.y === nextProps.y &&
    prevProps.rotation === nextProps.rotation &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isDragging === nextProps.isDragging &&
    prevProps.isSpinning === nextProps.isSpinning &&
    prevProps.isBusy === nextProps.isBusy &&
    prevProps.emojiSize === nextProps.emojiSize &&
    prevProps.item.emoji === nextProps.item.emoji &&
    prevProps.item.label === nextProps.item.label &&
    prevProps.listIndex === nextProps.listIndex
  );
});

WheelItem.displayName = 'WheelItem';

export default WheelItem;

