import { useMemo } from 'react';
import { EMOTIONS, DANCES, QUICK_EMOTIONS, EMOTION_EMOJIS, DANCE_EMOJIS } from '@constants/choreographies';

/**
 * Hook to map and prepare wheel items based on active tab
 * @param {string} activeTab - 'emotions' or 'dances'
 * @param {Array} actions - Available actions from store
 * @returns {Array} Array of display items with name, label, emoji, originalAction, type
 */
export const useWheelItems = (activeTab, actions) => {
  return useMemo(() => {
    if (activeTab === 'emotions') {
      return EMOTIONS.map((emotionName) => {
        const quickEmotion = QUICK_EMOTIONS.find(qe => qe.name === emotionName);
        const action = actions.find(a => a.name === emotionName && a.type === 'emotion');
        
        return {
          name: emotionName,
          label: quickEmotion?.label || emotionName.replace(/_/g, ' ').replace(/\d+/g, '').trim(),
          emoji: EMOTION_EMOJIS[emotionName] || '😐',
          originalAction: action,
          type: 'emotion',
        };
      });
    } else {
      return DANCES.map((danceName) => {
        const action = actions.find(a => a.name === danceName && a.type === 'dance');
        
        return {
          name: danceName,
          label: action?.label || danceName.replace(/_/g, ' '),
          emoji: DANCE_EMOJIS[danceName] || '🎵',
          originalAction: action,
          type: 'dance',
        };
      });
    }
  }, [activeTab, actions]);
};

