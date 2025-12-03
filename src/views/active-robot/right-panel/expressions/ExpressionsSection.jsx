import React, { useCallback, useState, useRef, useEffect } from 'react';
import { Box, IconButton, Typography, Button, Stack } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SpinningWheel from '@components/wheel/SpinningWheel';
import { CHOREOGRAPHY_DATASETS, QUICK_ACTIONS, EMOTIONS, DANCES } from '@constants/choreographies';
import { useRobotCommands } from '@hooks/robot';
import useAppStore from '@store/useAppStore';
import { setAppStoreInstance } from '@config/daemon';

// Constants - moved outside component to avoid recreation
const BUSY_DEBOUNCE_MS = 150;
const EFFECT_DURATION_MS = 4000;

// Effect mapping for 3D visual effects - moved outside component
const EFFECT_MAP = {
  'goto_sleep': 'sleep',
  'wake_up': null,
  'loving1': 'love',
  'sad1': 'sad',
  'surprised1': 'surprised',
};

/**
 * Expressions Section - Wrapper for SpinningWheel in right panel
 * Displays the Expressions component in the right column instead of a separate window
 */
export default function ExpressionsSection({ 
  isActive: isActiveProp = false,
  isBusy: isBusyProp = false,
  darkMode = false,
}) {
  // Initialize store instance for logging (ensures logs go to main window's store)
  useEffect(() => {
    setAppStoreInstance(useAppStore);
  }, []);

  // Get isActive directly from store (same as ExpressionsWindow) to ensure consistency
  const isActiveFromStore = useAppStore(state => state.isActive);
  const isActive = isActiveFromStore ?? isActiveProp;
  
  const robotStatus = useAppStore(state => state.robotStatus);
  const isCommandRunning = useAppStore(state => state.isCommandRunning);
  const isAppRunning = useAppStore(state => state.isAppRunning);
  const isInstalling = useAppStore(state => state.isInstalling);
  
  // Compute isReady and isBusy from state
  const isReady = robotStatus === 'ready';
  
  // Debounce isBusy to prevent flickering when state changes rapidly
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
  
  const { sendCommand, playRecordedMove } = useRobotCommands();

  // Store timeout ref for effect cleanup
  const effectTimeoutRef = useRef(null);

  // Handler for quick actions
  const handleQuickAction = useCallback((action) => {
    if (action.type === 'action') {
      sendCommand(`/api/move/play/${action.name}`, action.label);
    } else if (action.type === 'dance') {
      playRecordedMove(CHOREOGRAPHY_DATASETS.DANCES, action.name);
    } else {
      playRecordedMove(CHOREOGRAPHY_DATASETS.EMOTIONS, action.name);
    }
    
    // Trigger corresponding 3D visual effect
    const effectType = EFFECT_MAP[action.name];
    if (effectType) {
      const store = useAppStore.getState();
      if (store && typeof store.triggerEffect === 'function') {
        store.triggerEffect(effectType);
        
        // Clear previous timeout if exists
        if (effectTimeoutRef.current) {
          clearTimeout(effectTimeoutRef.current);
        }
        
        effectTimeoutRef.current = setTimeout(() => {
          if (store && typeof store.stopEffect === 'function') {
            store.stopEffect();
          }
          effectTimeoutRef.current = null;
        }, EFFECT_DURATION_MS);
      }
    }
  }, [sendCommand, playRecordedMove]);

  // Cleanup effect timeout on unmount
  useEffect(() => {
    return () => {
      if (effectTimeoutRef.current) {
        clearTimeout(effectTimeoutRef.current);
        effectTimeoutRef.current = null;
      }
    };
  }, []);

  const quickActions = QUICK_ACTIONS;
  const [activeTab, setActiveTab] = useState('emotions');
  const setRightPanelView = useAppStore(state => state.setRightPanelView);


  const handleBack = () => {
    setRightPanelView(null);
  };

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'transparent',
        overflow: 'visible', // Allow wheel to overflow container
      }}
    >
      {/* Header with back button, title and library tabs */}
      <Box
        sx={{
          px: 2,
          pt: 1.5,
          bgcolor: 'transparent',
          position: 'relative',
          zIndex: 1000, // Above wheel and all its components
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
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
            Expressions
          </Typography>
        </Box>
        
        {/* Libraries section - centered */}
        <Box 
          sx={{ 
            display: 'flex', 
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1.5,
            mt: 5,
            mb: 1,
          }}
        >
          {/* Libraries label */}
          <Typography
            sx={{
              fontSize: 11,
              fontWeight: 500,
              color: darkMode ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)',
              textTransform: 'uppercase',
              letterSpacing: '1px',
            }}
          >
            Libraries
          </Typography>
          
          {/* Library buttons - side by side with shared borders */}
          <Stack direction="row" spacing={0} sx={{ width: '100%', maxWidth: '300px' }}>
            <Button
              variant="outlined"
              onClick={() => setActiveTab('emotions')}
              sx={{
                borderColor: activeTab === 'emotions' ? '#FF9500' : (darkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'),
                color: activeTab === 'emotions' ? '#FF9500' : (darkMode ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)'),
                fontWeight: activeTab === 'emotions' ? 600 : 400,
                fontSize: 15,
                textTransform: 'none',
                padding: '10px 24px',
                borderRadius: '8px 0 0 8px', // Arrondi seulement à gauche
                borderRight: 'none', // Pas de bordure droite (bordure commune)
                bgcolor: 'transparent',
                flex: 1,
                transition: 'all 0.2s ease',
                '&:hover': {
                  borderColor: activeTab === 'emotions' ? '#FF9500' : (darkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)'),
                  bgcolor: activeTab === 'emotions' ? 'rgba(255, 149, 0, 0.1)' : (darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)'),
                  color: activeTab === 'emotions' ? '#FF9500' : (darkMode ? '#f5f5f5' : '#333'),
                },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%', justifyContent: 'center' }}>
                <span>Emotions</span>
                <Typography
                  component="span"
                  sx={{
                    fontSize: 12,
                    fontWeight: 300,
                    opacity: 0.7,
                    letterSpacing: '0.5px',
                  }}
                >
                  {EMOTIONS.length}
                </Typography>
              </Box>
            </Button>
            <Button
              variant="outlined"
              onClick={() => setActiveTab('dances')}
              sx={{
                borderColor: activeTab === 'dances' ? '#FF9500' : (darkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'),
                color: activeTab === 'dances' ? '#FF9500' : (darkMode ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)'),
                fontWeight: activeTab === 'dances' ? 600 : 400,
                fontSize: 15,
                textTransform: 'none',
                padding: '10px 24px',
                borderRadius: '0 8px 8px 0', // Arrondi seulement à droite
                borderLeft: '1px solid',
                borderLeftColor: activeTab === 'emotions' || activeTab === 'dances' 
                  ? '#FF9500' 
                  : (darkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'),
                bgcolor: 'transparent',
                flex: 1,
                transition: 'all 0.2s ease',
                '&:hover': {
                  borderColor: activeTab === 'dances' ? '#FF9500' : (darkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)'),
                  bgcolor: activeTab === 'dances' ? 'rgba(255, 149, 0, 0.1)' : (darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)'),
                  color: activeTab === 'dances' ? '#FF9500' : (darkMode ? '#f5f5f5' : '#333'),
                  borderLeftColor: activeTab === 'emotions' || activeTab === 'dances' 
                    ? '#FF9500' 
                    : (darkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)'),
                },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%', justifyContent: 'center' }}>
                <span>Dances</span>
                <Typography
                  component="span"
                  sx={{
                    fontSize: 12,
                    fontWeight: 300,
                    opacity: 0.7,
                    letterSpacing: '0.5px',
                  }}
                >
                  {DANCES.length}
                </Typography>
              </Box>
            </Button>
          </Stack>
        </Box>
      </Box>
      <Box
        sx={{
          width: '100%',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          bgcolor: 'transparent',
          position: 'relative',
          overflow: 'visible', // Allow wheel to overflow
          minHeight: 0, // Allow flex shrinking
          // Allow more overflow on sides
          paddingLeft: 0,
          paddingRight: 0,
          marginLeft: 0,
          marginRight: 0,
        }}
      >
        <SpinningWheel
          actions={quickActions}
          onActionClick={handleQuickAction}
          isReady={isReady}
          isActive={isActive}
          isBusy={debouncedIsBusy}
          darkMode={darkMode}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          gap={30}
          sizeMultiplier={2.8} // Larger wheel (280% instead of 200%)
        />
      </Box>
    </Box>
  );
}


