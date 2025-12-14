import React, { useCallback, useState, useRef, useEffect } from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { EmotionWheel, EmojiPicker } from '@components/emoji-grid';
import { CHOREOGRAPHY_DATASETS, EMOTIONS, DANCES, EMOTION_EMOJIS, DANCE_EMOJIS } from '@constants/choreographies';
import { useRobotCommands } from '@hooks/robot';
import { useActiveRobotContext } from '../../context';
import { useLogger } from '@/utils/logging';
import { openUrl } from '@/utils/tauriCompat';

// Constants
const BUSY_DEBOUNCE_MS = 150;
const EFFECT_DURATION_MS = 4000;

// Effect mapping for 3D visual effects
const EFFECT_MAP = {
  'goto_sleep': 'sleep',
  'wake_up': null,
  'loving1': 'love',
  'sad1': 'sad',
  'surprised1': 'surprised',
};

/**
 * Expressions Section V2 - Emotion Wheel + Library view
 * Displays a curated wheel of 12 emotions, with access to full library
 */
export default function ExpressionsSection({ 
  isActive: isActiveProp = false,
  isBusy: isBusyProp = false,
  darkMode = false,
}) {
  // View state: 'wheel' or 'library'
  const [currentView, setCurrentView] = useState('wheel');
  
  // Space key animation state
  const [spacePressed, setSpacePressed] = useState(false);
  
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space' && !e.repeat && currentView === 'wheel') {
        setSpacePressed(true);
      }
    };
    const handleKeyUp = (e) => {
      if (e.code === 'Space') {
        setSpacePressed(false);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [currentView]);
  
  // Get state and actions from context
  const { robotState, actions } = useActiveRobotContext();
  const { 
    isActive: isActiveFromContext,
    robotStatus, 
    isCommandRunning, 
    isAppRunning, 
    isInstalling 
  } = robotState;
  const { setRightPanelView, triggerEffect, stopEffect } = actions;
  
  const isActive = isActiveFromContext ?? isActiveProp;
  const isReady = robotStatus === 'ready';
  
  // Debounce isBusy
  const rawIsBusy = robotStatus === 'busy' || isCommandRunning || isAppRunning || isInstalling;
  const [debouncedIsBusy, setDebouncedIsBusy] = useState(rawIsBusy);
  const debounceTimeoutRef = useRef(null);
  
  useEffect(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    
    if (rawIsBusy && !debouncedIsBusy) {
      setDebouncedIsBusy(true);
    } else if (!rawIsBusy && debouncedIsBusy) {
      debounceTimeoutRef.current = setTimeout(() => {
        setDebouncedIsBusy(false);
      }, BUSY_DEBOUNCE_MS);
    }
    
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [rawIsBusy, debouncedIsBusy]);
  
  const { playRecordedMove } = useRobotCommands();
  const logger = useLogger();

  const effectTimeoutRef = useRef(null);

  const handleAction = useCallback((action) => {
    // Get emoji based on type
    let emoji = null;
    if (action.type === 'emotion') {
      emoji = EMOTION_EMOJIS[action.name] || null;
    } else if (action.type === 'dance') {
      emoji = DANCE_EMOJIS[action.name] || null;
    }
    
    const logMessage = emoji ? `${emoji} ${action.label}` : action.label;
    logger.userAction(logMessage);
    
    // Play the move based on type
    if (action.type === 'dance') {
      playRecordedMove(CHOREOGRAPHY_DATASETS.DANCES, action.name);
    } else {
      playRecordedMove(CHOREOGRAPHY_DATASETS.EMOTIONS, action.name);
    }
    
    const effectType = EFFECT_MAP[action.name];
    if (effectType) {
      triggerEffect(effectType);
      
      if (effectTimeoutRef.current) {
        clearTimeout(effectTimeoutRef.current);
      }
      
      effectTimeoutRef.current = setTimeout(() => {
        stopEffect();
        effectTimeoutRef.current = null;
      }, EFFECT_DURATION_MS);
    }
  }, [playRecordedMove, triggerEffect, stopEffect, logger]);

  useEffect(() => {
    return () => {
      if (effectTimeoutRef.current) {
        clearTimeout(effectTimeoutRef.current);
        effectTimeoutRef.current = null;
      }
    };
  }, []);

  const handleWheelAction = useCallback((action) => {
    if (debouncedIsBusy) return;
    handleAction(action);
  }, [debouncedIsBusy, handleAction]);

  const handleBack = () => {
    if (currentView === 'library') {
      // Go back to wheel
      setCurrentView('wheel');
    } else {
      // Close the panel
      setRightPanelView(null);
    }
  };

  const handleOpenLibrary = () => {
    setCurrentView('library');
  };

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'transparent',
        position: 'relative',
      }}
    >
      {/* Header with back button */}
      <Box
        sx={{
          px: 2,
          pt: 1.5,
          pb: 1,
          bgcolor: 'transparent',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton
            onClick={handleBack}
            size="small"
            sx={{
              color: '#FF9500',
              '&:hover': {
                bgcolor: darkMode ? 'rgba(255, 149, 0, 0.1)' : 'rgba(255, 149, 0, 0.05)',
              },
            }}
          >
            <ArrowBackIcon sx={{ fontSize: 20 }} />
          </IconButton>
          <Typography
            sx={{
              fontSize: 20,
              fontWeight: 700,
              color: darkMode ? '#f5f5f5' : '#333',
              letterSpacing: '-0.3px',
            }}
          >
            {currentView === 'wheel' ? 'Expressions' : 'All Libraries'}
          </Typography>
        </Box>
      </Box>

      {/* Content based on current view */}
      {currentView === 'wheel' ? (
        <>
          {/* Centered Emotion Wheel */}
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              px: 2,
              pb: 6,
            }}
          >
            <EmotionWheel
              onAction={handleWheelAction}
              darkMode={darkMode}
              disabled={debouncedIsBusy || !isActive}
              isBusy={debouncedIsBusy}
            />
          </Box>

          {/* Footer links */}
          <Box
            sx={{
              position: 'absolute',
              bottom: 24,
              left: 0,
              right: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 1,
            }}
          >
            {/* Line 1: Keyboard shortcut */}
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 1,
                color: darkMode ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)',
                fontSize: 11,
              }}
            >
              <Box
                component="span"
                sx={{
                  px: 1.5,
                  py: 0.25,
                  borderRadius: 1,
                  border: spacePressed 
                    ? '1px solid #FF9500' 
                    : `1px solid ${darkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'}`,
                  bgcolor: spacePressed 
                    ? 'rgba(255,149,0,0.15)' 
                    : 'transparent',
                  color: spacePressed 
                    ? '#FF9500' 
                    : 'inherit',
                  fontFamily: 'monospace',
                  fontSize: 8,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  transition: 'all 0.15s ease',
                  transform: spacePressed ? 'scale(1.05)' : 'scale(1)',
                }}
              >
                Space
              </Box>
              <span>random</span>
            </Box>

            {/* Line 2: Links */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
              }}
            >
              {/* See all libraries link */}
              <Box
                component="button"
                onClick={handleOpenLibrary}
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  color: darkMode ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)',
                  fontSize: 11,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  textDecoration: 'underline',
                  transition: 'all 0.2s ease',
                  whiteSpace: 'nowrap',
                  '&:hover': {
                    color: '#FF9500',
                  },
                }}
              >
                See all libraries
              </Box>

              {/* Separator */}
              <Box
                component="span"
                sx={{
                  color: darkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
                  fontSize: 11,
                }}
              >
                •
              </Box>

              {/* Emotion Wheel App link */}
              <Box
                component="a"
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  openUrl('https://huggingface.co/spaces/RemiFabre/emotions');
                }}
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.5,
                  color: darkMode ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)',
                  fontSize: 11,
                  textDecoration: 'underline',
                  transition: 'all 0.2s ease',
                  whiteSpace: 'nowrap',
                  '&:hover': {
                    color: '#FF9500',
                  },
                }}
              >
                <span>Emotion Wheel App</span>
                <OpenInNewIcon sx={{ fontSize: 12 }} />
              </Box>
            </Box>
          </Box>
        </>
      ) : (
        /* Library view - full emoji picker */
        <Box
          sx={{
            flex: 1,
            overflow: 'auto',
            px: 2,
            py: 2,
          }}
        >
          <EmojiPicker
            emotions={EMOTIONS}
            dances={DANCES}
            onAction={handleWheelAction}
            darkMode={darkMode}
            disabled={debouncedIsBusy || !isActive}
          />
        </Box>
      )}
    </Box>
  );
}
