import React, { useCallback, useEffect, useState } from 'react';
import { Box } from '@mui/material';
import SpinningWheel from '../active-robot/application-store/quick-actions/SpinningWheel';
import { CHOREOGRAPHY_DATASETS, QUICK_ACTIONS } from '@constants/choreographies';
import { useRobotCommands } from '@hooks/robot';
import useAppStore from '@store/useAppStore';
import AppTopBar from '@components/AppTopBar';
import QuickActionsHeader from './QuickActionsHeader';
import { useWindowSync } from '@hooks/system/useWindowSync';
import { getCurrentWindow } from '@tauri-apps/api/window';

/**
 * Standalone Expressions Window
 * Displays the Expressions component in a dedicated window
 */
export default function QuickActionsWindow() {
  // Sync with main window state
  useWindowSync();
  
  // Track window close
  useEffect(() => {
    const setupCloseListener = async () => {
      try {
        const window = await getCurrentWindow();
        const unlisten = await window.onCloseRequested(() => {
          // Safely call removeOpenWindow if it exists (may not exist after hot reload)
          const store = useAppStore.getState();
          if (store && typeof store.removeOpenWindow === 'function') {
            store.removeOpenWindow('quick-actions');
          }
        });
        return unlisten;
      } catch (error) {
        console.error('Failed to setup close listener:', error);
      }
    };
    
    setupCloseListener();
  }, []);
  
  const darkMode = useAppStore(state => state.darkMode);
  const isActive = useAppStore(state => state.isActive);
  const robotStatus = useAppStore(state => state.robotStatus);
  const isCommandRunning = useAppStore(state => state.isCommandRunning);
  const isAppRunning = useAppStore(state => state.isAppRunning);
  const isInstalling = useAppStore(state => state.isInstalling);
  
  // Compute isReady and isBusy from state
  const isReady = robotStatus === 'ready';
  const isBusy = robotStatus === 'busy' || isCommandRunning || isAppRunning || isInstalling;
  
  // Debug log to see state values
  useEffect(() => {
    console.log('🔍 QuickActionsWindow state:', {
      isActive,
      robotStatus,
      isReady,
      isBusy,
      isCommandRunning,
      isAppRunning,
      isInstalling,
    });
  }, [isActive, robotStatus, isReady, isBusy, isCommandRunning, isAppRunning, isInstalling]);
  
  const { sendCommand, playRecordedMove } = useRobotCommands();

  // Handler for quick actions (same as in ActiveRobotView)
  const handleQuickAction = useCallback((action) => {
    if (action.type === 'action') {
      // Actions like sleep/wake_up
      sendCommand(`/api/move/play/${action.name}`, action.label);
    } else if (action.type === 'dance') {
      // Dances
      playRecordedMove(CHOREOGRAPHY_DATASETS.DANCES, action.name);
    } else {
      // Emotions
      playRecordedMove(CHOREOGRAPHY_DATASETS.EMOTIONS, action.name);
    }
    
    // Trigger corresponding 3D visual effect
    const effectMap = {
      'goto_sleep': 'sleep',
      'wake_up': null, // No effect for wake up
      'loving1': 'love',
      'sad1': 'sad',
      'surprised1': 'surprised',
    };
    
    const effectType = effectMap[action.name];
    if (effectType) {
      useAppStore.getState().triggerEffect(effectType);
      // Stop effect after 4 seconds
      setTimeout(() => {
        useAppStore.getState().stopEffect();
      }, 4000);
    }
  }, [sendCommand, playRecordedMove]);

  const quickActions = QUICK_ACTIONS;
  const [activeTab, setActiveTab] = useState('emotions');

  return (
    <>
      <AppTopBar />
      <Box
        sx={{
          width: '100vw',
          height: '100vh',
          background: darkMode ? 'rgba(26, 26, 26, 0.95)' : 'rgba(250, 250, 252, 0.85)',
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          pt: 3, // Reduced padding top
          position: 'relative',
          px: 3,
        }}
      >
        <QuickActionsHeader 
          darkMode={darkMode}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
        <Box
          sx={{
            width: '100%',
            height: 'calc(100% - 120px)', // Account for header
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-start',
            bgcolor: 'transparent',
            position: 'relative',
            overflow: 'visible', // Allow wheel to overflow
          }}
        >
          <SpinningWheel
            actions={quickActions}
            onActionClick={handleQuickAction}
            isReady={isReady}
            isActive={isActive}
            isBusy={isBusy}
            darkMode={darkMode}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            emojiSize={72}
            gap={30}
          />
        </Box>
      </Box>
    </>
  );
}

