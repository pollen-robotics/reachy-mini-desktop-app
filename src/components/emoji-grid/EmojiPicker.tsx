import { useMemo } from 'react';
import { EmojiGrid, type EmojiGridItem } from './EmojiGrid';
import {
  DANCE_EMOJIS,
  EMOTION_EMOJIS,
  WHEEL_EMOTIONS,
  labelFromActionName,
  type EmojiGridAction,
} from '@constants/choreographies';

const FALLBACK_EMOTION_EMOJI = '😐';
const FALLBACK_DANCE_EMOJI = '🎵';

type NamedItem = string | { name: string };

export interface EmojiPickerProps {
  emotions?: readonly NamedItem[];
  dances?: readonly NamedItem[];
  onAction?: (action: EmojiGridAction) => void;
  darkMode?: boolean;
  disabled?: boolean;
  searchQuery?: string;
  activeActionName?: string | null;
  isExecuting?: boolean;
}

function extractName(item: NamedItem): string {
  return typeof item === 'string' ? item : item.name;
}

function buildEmotionItem(name: string): EmojiGridItem & { name: string } {
  const label = labelFromActionName(name);
  return {
    name,
    emoji: (EMOTION_EMOJIS as Record<string, string>)[name] ?? FALLBACK_EMOTION_EMOJI,
    label,
    originalAction: { name, type: 'emotion', label },
  };
}

function buildDanceItem(name: string): EmojiGridItem & { name: string } {
  const label = name.replace(/_/g, ' ');
  return {
    name,
    emoji: (DANCE_EMOJIS as Record<string, string>)[name] ?? FALLBACK_DANCE_EMOJI,
    label,
    originalAction: { name, type: 'dance', label },
  };
}

/**
 * Emoji picker with two grids - Emotions and Dances.
 * Simple grid layout, 3 rows visible with an animated "show more" accordion.
 * Emotions featured in the wheel are sorted first so the two views stay consistent.
 */
export function EmojiPicker({
  emotions = [],
  dances = [],
  onAction,
  darkMode = false,
  disabled = false,
  searchQuery = '',
  activeActionName = null,
  isExecuting = false,
}: EmojiPickerProps) {
  const emotionItems = useMemo<EmojiGridItem[]>(() => {
    const wheelOrder = new Map<string, number>(WHEEL_EMOTIONS.map((name, i) => [name, i]));

    const featured: (EmojiGridItem & { name: string })[] = [];
    const others: (EmojiGridItem & { name: string })[] = [];

    emotions.forEach(item => {
      const entry = buildEmotionItem(extractName(item));
      if (wheelOrder.has(entry.name)) {
        featured.push(entry);
      } else {
        others.push(entry);
      }
    });

    featured.sort((a, b) => (wheelOrder.get(a.name) ?? 0) - (wheelOrder.get(b.name) ?? 0));
    return [...featured, ...others];
  }, [emotions]);

  const danceItems = useMemo<EmojiGridItem[]>(
    () => dances.map(item => buildDanceItem(extractName(item))),
    [dances]
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 28,
        width: '100%',
      }}
    >
      {emotionItems.length > 0 && (
        <EmojiGrid
          items={emotionItems}
          title="Emotions"
          onAction={onAction}
          darkMode={darkMode}
          disabled={disabled}
          searchQuery={searchQuery}
          activeActionName={activeActionName}
          isExecuting={isExecuting}
        />
      )}

      {danceItems.length > 0 && (
        <EmojiGrid
          items={danceItems}
          title="Dances"
          onAction={onAction}
          darkMode={darkMode}
          disabled={disabled}
          searchQuery={searchQuery}
          activeActionName={activeActionName}
          isExecuting={isExecuting}
        />
      )}
    </div>
  );
}
