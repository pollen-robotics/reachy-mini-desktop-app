import React, { useReducer, useMemo, useEffect, useRef } from 'react';
import { Box, Typography, IconButton } from '@mui/material';
import CasinoOutlinedIcon from '@mui/icons-material/CasinoOutlined';
import { EMOTIONS, DANCES } from '@constants/choreographies';

/**
 * Quick Actions Plutchik's Wheel of Emotions Component
 * Represents the actual Plutchik's emotion wheel with 8 basic emotions
 */

// Plutchik's 8 basic emotions in order (starting from top, clockwise)
// Mapped to available choreography emotions
const PLUTCHIK_EMOTIONS = [
  { name: 'joy', label: 'Joy', emoji: '😊', choreographyName: 'cheerful1' },
  { name: 'trust', label: 'Trust', emoji: '🤝', choreographyName: 'welcoming1' },
  { name: 'fear', label: 'Fear', emoji: '😨', choreographyName: 'fear1' },
  { name: 'surprise', label: 'Surprise', emoji: '😲', choreographyName: 'surprised1' },
  { name: 'sadness', label: 'Sadness', emoji: '😢', choreographyName: 'sad1' },
  { name: 'disgust', label: 'Disgust', emoji: '🤢', choreographyName: 'disgusted1' },
  { name: 'anger', label: 'Anger', emoji: '😠', choreographyName: 'rage1' },
  { name: 'anticipation', label: 'Anticipation', emoji: '🤔', choreographyName: 'thoughtful1' },
];

// Wheel dimensions configuration
const WHEEL_CONFIG = {
  size: 190,
  outerRadius: 92.5,
  innerRadius: 40,
  emojiSize: 24,
  emojiOffset: 12, // Half of emojiSize for centering
};

// State management with reducer
const initialState = {
  activeTab: 'emotions',
  selectedIndex: 0,
  wheelState: 'idle', // 'idle' | 'hovering' | 'spinning'
  activeIndex: null, // Index currently active (hover or turning)
};

function wheelReducer(state, action) {
  switch (action.type) {
    case 'SET_TAB':
      return {
        ...state,
        activeTab: action.tab,
        selectedIndex: 0,
        wheelState: 'idle',
        activeIndex: null,
      };
    case 'HOVER_SEGMENT':
      return {
        ...state,
        wheelState: 'hovering',
        activeIndex: action.index,
        selectedIndex: action.index,
      };
    case 'LEAVE_SEGMENT':
      return {
        ...state,
        wheelState: state.wheelState === 'spinning' ? 'spinning' : 'idle',
        activeIndex: state.wheelState === 'spinning' ? state.activeIndex : null,
      };
    case 'START_SPINNING':
      return {
        ...state,
        wheelState: 'spinning',
        activeIndex: null,
      };
    case 'UPDATE_SPINNING':
      return {
        ...state,
        activeIndex: action.index,
        selectedIndex: action.index,
      };
    case 'STOP_SPINNING':
      return {
        ...state,
        wheelState: 'idle',
        activeIndex: null,
      };
    case 'SELECT_INDEX':
      return {
        ...state,
        selectedIndex: action.index,
      };
    default:
      return state;
  }
}

// Legacy export - use SpinningWheel instead
export default function QuickActionsDonut({
  actions = [],
  onActionClick = null,
  isReady = false,
  isActive = false,
  isBusy = false,
  darkMode = false,
}) {
  const [state, dispatch] = useReducer(wheelReducer, initialState);
  const spinIntervalRef = useRef(null);
  const spinSpeedRef = useRef(0);

  // Separate actions by type
  const emotionsActions = useMemo(() => 
    actions.filter(action => action.type === 'emotion'),
    [actions]
  );
  
  const dancesActions = useMemo(() => 
    actions.filter(action => action.type === 'dance'),
    [actions]
  );

  // Map Plutchik emotions to available actions from choreographies
  const emotionsDisplayActions = useMemo(() => {
    return PLUTCHIK_EMOTIONS.map((emotion) => {
      const matchingAction = emotionsActions.find(action => 
        action.name === emotion.choreographyName
      );
      
      return {
        ...emotion,
        originalAction: matchingAction,
        emoji: emotion.emoji,
        label: emotion.label,
        name: emotion.choreographyName,
      };
    });
  }, [emotionsActions]);

  // Map dances to display actions (take first 8 or all if less)
  const dancesDisplayActions = useMemo(() => {
    return dancesActions.slice(0, 8).map((dance) => ({
      ...dance,
      originalAction: dance,
    }));
  }, [dancesActions]);

  // Current display actions based on active tab
  const displayActions = useMemo(() => {
    return state.activeTab === 'emotions' ? emotionsDisplayActions : dancesDisplayActions;
  }, [state.activeTab, emotionsDisplayActions, dancesDisplayActions]);

  // Wheel geometry calculations
  const wheelGeometry = useMemo(() => {
    const { size, outerRadius, innerRadius } = WHEEL_CONFIG;
    const centerX = size / 2;
    const centerY = size / 2;
    const emojiRadius = (outerRadius + innerRadius) / 2;
    const angleStep = (2 * Math.PI) / displayActions.length;
    const startAngleOffset = -Math.PI / 2; // Start from top

    return {
      size,
      outerRadius,
      innerRadius,
      centerX,
      centerY,
      emojiRadius,
      angleStep,
      startAngleOffset,
    };
  }, [displayActions.length]);

  if (displayActions.length === 0) return null;

  const handleActionClick = (action, index) => {
    if (!isActive || isBusy || !isReady || state.wheelState === 'spinning') return;
    dispatch({ type: 'SELECT_INDEX', index });
    if (onActionClick) {
      const actionToCall = action.originalAction || action;
      onActionClick(actionToCall);
    }
  };

  const handleWheelClick = () => {
    const currentAction = displayActions[state.selectedIndex];
    if (currentAction && isActive && !isBusy && isReady) {
      handleActionClick(currentAction, state.selectedIndex);
    }
  };

  const handleTabChange = (tab) => {
    dispatch({ type: 'SET_TAB', tab });
  };

  const handleSpinWheel = () => {
    if (state.wheelState === 'spinning' || !isActive || isBusy || !isReady || displayActions.length === 0) return;
    
    dispatch({ type: 'START_SPINNING' });
    
    // Initial speed (ms between segment changes)
    spinSpeedRef.current = 50;
    const totalSegments = displayActions.length;
    const minSpins = 2; // Minimum number of full rotations
    const totalSteps = minSpins * totalSegments + Math.floor(Math.random() * totalSegments);
    
    let currentStep = 0;
    let currentIndex = state.selectedIndex;
    
    const spin = () => {
      currentStep++;
      currentIndex = (currentIndex + 1) % totalSegments;
      dispatch({ type: 'UPDATE_SPINNING', index: currentIndex });
      
      // Increase delay progressively (deceleration)
      const progress = currentStep / totalSteps;
      const decelerationFactor = 1 + (progress * progress * 8); // Quadratic deceleration
      spinSpeedRef.current = 50 * decelerationFactor;
      
      if (currentStep < totalSteps) {
        spinIntervalRef.current = setTimeout(spin, spinSpeedRef.current);
      } else {
        // Final selection
        const finalAction = displayActions[currentIndex];
        if (onActionClick && finalAction) {
          const actionToCall = finalAction.originalAction || finalAction;
          onActionClick(actionToCall);
        }
        // Reset states after a short delay to show final selection
        setTimeout(() => {
          dispatch({ type: 'STOP_SPINNING' });
        }, 500);
      }
    };
    
    spin();
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (spinIntervalRef.current) {
        clearTimeout(spinIntervalRef.current);
      }
    };
  }, []);

  const currentAction = displayActions[state.selectedIndex];
  const { size, outerRadius, innerRadius, centerX, centerY, emojiRadius, angleStep, startAngleOffset } = wheelGeometry;
  const isSpinning = state.wheelState === 'spinning';
  const isInteractive = isActive && !isBusy && isReady && !isSpinning;

  const tabButtonStyle = (isActiveTab) => ({
    fontSize: 13,
    fontWeight: 400,
    color: isActive ? '#FF9500' : (darkMode ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.4)'),
    textDecoration: isActive ? 'underline' : 'none',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    textTransform: 'none',
    letterSpacing: '0.3px',
    transition: 'all 0.2s ease',
    '&:hover': { color: '#FF9500' },
  });

  return (
    <Box sx={{ width: '100%', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* Centered tabs */}
      <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', justifyContent: 'center', mb: 2, zIndex: 1 }}>
        <Typography component="button" onClick={() => handleTabChange('emotions')} sx={tabButtonStyle(state.activeTab === 'emotions')}>
          Emotions
          <Typography component="span" sx={{ fontSize: 10, ml: 0.5, opacity: 0.6 }}>
            ({EMOTIONS.length})
          </Typography>
        </Typography>
        <Box sx={{ width: 1, height: 12, bgcolor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)' }} />
        <Typography component="button" onClick={() => handleTabChange('dances')} sx={tabButtonStyle(state.activeTab === 'dances')}>
          Dances
          <Typography component="span" sx={{ fontSize: 10, ml: 0.5, opacity: 0.6 }}>
            ({DANCES.length})
          </Typography>
        </Typography>
      </Box>

      {/* Wheel */}
    <Box
      sx={{
        position: 'relative',
          width: size,
          height: size,
        mx: 'auto',
          mb: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      >
      {/* Outer Wheel - Plutchik's emotion wheel segments */}
      <svg
        width={size}
        height={size}
        style={{ position: 'absolute', top: 0, left: 0 }}
      >
        {/* Draw segments */}
        {displayActions.map((action, index) => {
          const startAngle = index * angleStep + startAngleOffset;
          const endAngle = startAngle + angleStep;
          const isSegmentActive = index === state.activeIndex;
          const largeArcFlag = angleStep > Math.PI ? 1 : 0;
          
          // Calculate arc points
          const outerStartX = centerX + outerRadius * Math.cos(startAngle);
          const outerStartY = centerY + outerRadius * Math.sin(startAngle);
          const outerEndX = centerX + outerRadius * Math.cos(endAngle);
          const outerEndY = centerY + outerRadius * Math.sin(endAngle);
          const innerStartX = centerX + innerRadius * Math.cos(startAngle);
          const innerStartY = centerY + innerRadius * Math.sin(startAngle);
          const innerEndX = centerX + innerRadius * Math.cos(endAngle);
          const innerEndY = centerY + innerRadius * Math.sin(endAngle);
          
          // Create path for segment
          const pathData = [
            `M ${innerStartX} ${innerStartY}`,
            `L ${outerStartX} ${outerStartY}`,
            `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${outerEndX} ${outerEndY}`,
            `L ${innerEndX} ${innerEndY}`,
            `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerStartX} ${innerStartY}`,
            'Z'
          ].join(' ');
          
          return (
            <path
              key={action.name || index}
              d={pathData}
              fill={isSegmentActive 
                ? (darkMode ? 'rgba(255, 149, 0, 0.1)' : 'rgba(255, 149, 0, 0.075)')
                : 'transparent'
              }
              stroke={isSegmentActive 
                ? '#FF9500' 
                : (darkMode ? 'rgba(255, 149, 0, 0.4)' : 'rgba(255, 149, 0, 0.35)')
              }
              strokeWidth={1}
              opacity={isInteractive ? 1 : 0.3}
              style={{
                cursor: isInteractive ? 'pointer' : 'not-allowed',
                transition: isSpinning ? 'all 0.05s ease' : 'all 0.2s ease',
              }}
              onClick={() => handleActionClick(action, index)}
              onMouseEnter={() => {
                if (isInteractive) {
                  dispatch({ type: 'HOVER_SEGMENT', index });
                }
              }}
              onMouseLeave={() => {
                if (!isSpinning) {
                  dispatch({ type: 'LEAVE_SEGMENT' });
                }
              }}
            />
          );
        })}
      </svg>

      {/* Emojis on each segment - Plutchik emotions */}
      {displayActions.map((action, index) => {
        const segmentCenterAngle = index * angleStep + startAngleOffset + angleStep / 2;
        const emojiX = centerX + emojiRadius * Math.cos(segmentCenterAngle);
        const emojiY = centerY + emojiRadius * Math.sin(segmentCenterAngle);
        const isSegmentActive = index === state.activeIndex;

        return (
          <Box
            key={action.name || index}
            onClick={() => handleActionClick(action, index)}
            onMouseEnter={() => {
              if (isInteractive) {
                dispatch({ type: 'HOVER_SEGMENT', index });
              }
            }}
            onMouseLeave={() => {
              if (!isSpinning) {
                dispatch({ type: 'LEAVE_SEGMENT' });
              }
            }}
        sx={{
          position: 'absolute',
              left: `${emojiX - WHEEL_CONFIG.emojiOffset}px`,
              top: `${emojiY - WHEEL_CONFIG.emojiOffset}px`,
              width: WHEEL_CONFIG.emojiSize,
              height: WHEEL_CONFIG.emojiSize,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: isInteractive ? 'pointer' : 'not-allowed',
              opacity: isInteractive ? 1 : 0.3,
              transition: isSpinning ? 'all 0.05s ease' : 'all 0.2s ease',
              transform: isSegmentActive ? 'scale(1.2)' : 'scale(1)',
              zIndex: isSegmentActive ? 10 : 5,
            }}
          >
            <Typography
              sx={{
                fontSize: 20,
                lineHeight: 1,
                filter: isSegmentActive ? 'none' : (isInteractive ? 'grayscale(30%)' : 'grayscale(100%)'),
                transition: 'filter 0.2s ease',
        }}
            >
              {action.emoji}
            </Typography>
          </Box>
        );
      })}

      {/* Central Display - Simple and sober */}
      {state.activeIndex !== null && (
      <Box
        onClick={handleWheelClick}
        sx={{
          position: 'relative',
            width: innerRadius * 2,
            height: innerRadius * 2,
          borderRadius: '50%',
            background: 'transparent',
            border: `1px solid ${darkMode ? 'rgba(255, 149, 0, 0.4)' : 'rgba(255, 149, 0, 0.35)'}`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: isActive && !isBusy && isReady ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s ease',
          opacity: isActive && !isBusy && isReady ? 1 : 0.5,
            zIndex: 10,
        }}
      >
        {/* Label */}
        <Typography
          sx={{
            fontSize: 9,
            fontWeight: 600,
              color: darkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)',
            textTransform: 'uppercase',
              letterSpacing: '0.5px',
            textAlign: 'center',
              transition: 'color 0.2s ease',
          }}
        >
            {currentAction?.label || ''}
        </Typography>
        </Box>
      )}
      </Box>
      
      {/* Dice button below the circle, centered */}
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1.5 }}>
        <IconButton
          onClick={handleSpinWheel}
          disabled={isSpinning || !isActive || isBusy || !isReady}
          size="small"
          sx={{
            color: isSpinning ? '#FF9500' : (darkMode ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)'),
            '&:hover': {
              color: '#FF9500',
              bgcolor: 'transparent',
            },
            '&.Mui-disabled': {
              color: isSpinning ? '#FF9500' : (darkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)'),
            },
            transition: 'all 0.2s ease',
          }}
        >
          <CasinoOutlinedIcon sx={{ fontSize: 24 }} />
        </IconButton>
      </Box>
    </Box>
  );
}
