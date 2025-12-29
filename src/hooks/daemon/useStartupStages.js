/**
 * 🚀 useStartupStages Hook
 * 
 * Centralized management of startup stages with:
 * - Automatic stage detection from sidecar logs
 * - Progress calculation
 * - Simulation mode awareness
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { isSimulationMode } from '../../utils/simulationMode';
import { 
  STARTUP_STAGES, 
  getStagesForMode, 
  detectStageFromLog,
  calculateStageProgress,
  getStageDisplayText,
} from '../../config/startupStages';

/**
 * Hook to manage startup stages with automatic detection
 * @param {object} options - Hook options
 * @param {boolean} options.isStarting - Whether startup is in progress
 * @param {boolean} options.scanComplete - Whether hardware scan is complete
 * @param {number} options.scanProgress - Current scan progress (0-100)
 * @param {string} options.currentScanPart - Current part being scanned
 * @param {boolean} options.hasError - Whether there's an error
 * @returns {object} Stage state and helpers
 */
export function useStartupStages({
  isStarting = false,
  scanComplete = false,
  scanProgress = 0,
  currentScanPart = null,
  hasError = false,
} = {}) {
  const isSimMode = isSimulationMode();
  const stages = getStagesForMode(isSimMode);
  
  // Current stage state
  const [currentStage, setCurrentStage] = useState(STARTUP_STAGES.SCANNING);
  const [stageAttempts, setStageAttempts] = useState(0);
  const [detectedFromLog, setDetectedFromLog] = useState(false);
  
  // Track stage progression
  const stageIndexRef = useRef(0);
  const lastDetectedStageRef = useRef(null);
  
  // Reset when starting changes
  useEffect(() => {
    if (isStarting) {
      setCurrentStage(STARTUP_STAGES.SCANNING);
      setStageAttempts(0);
      setDetectedFromLog(false);
      stageIndexRef.current = 0;
      lastDetectedStageRef.current = null;
    }
  }, [isStarting]);
  
  // Handle error state
  useEffect(() => {
    if (hasError) {
      setCurrentStage(STARTUP_STAGES.ERROR);
    }
  }, [hasError]);
  
  // Progress through stages based on scan completion
  useEffect(() => {
    if (!isStarting || hasError) return;
    
    // If scan is complete and we're still in scanning stage, move to next
    if (scanComplete && currentStage.id === 'scanning') {
      const nextStage = isSimMode 
        ? STARTUP_STAGES.STARTING_SIMULATION 
        : STARTUP_STAGES.CONNECTING;
      setCurrentStage(nextStage);
      setStageAttempts(0);
    }
  }, [scanComplete, currentStage.id, isStarting, hasError, isSimMode]);
  
  // Listen to sidecar logs for automatic stage detection
  useEffect(() => {
    if (!isStarting) return;
    
    let unlistenStdout;
    
    const setupListener = async () => {
      try {
        unlistenStdout = await listen('sidecar-stdout', (event) => {
          const logMessage = typeof event.payload === 'string' 
            ? event.payload 
            : event.payload?.toString() || '';
          
          // Try to detect stage from log
          const detected = detectStageFromLog(logMessage, isSimMode);
          
          if (detected && detected.id !== lastDetectedStageRef.current?.id) {
            // Only advance forward, never go back
            const detectedIndex = stages.findIndex(s => s.id === detected.id);
            const currentIndex = stages.findIndex(s => s.id === currentStage.id);
            
            if (detectedIndex > currentIndex) {
              console.log(`🚀 Stage detected from log: ${detected.label}`);
              setCurrentStage(detected);
              setStageAttempts(0);
              setDetectedFromLog(true);
              lastDetectedStageRef.current = detected;
              stageIndexRef.current = detectedIndex;
            }
          }
        });
      } catch (error) {
        console.error('Failed to setup sidecar-stdout listener for stages:', error);
      }
    };
    
    setupListener();
    
    return () => {
      if (unlistenStdout) {
        unlistenStdout();
      }
    };
  }, [isStarting, currentStage, stages, isSimMode]);
  
  // Advance to a specific stage manually
  const advanceToStage = useCallback((stageId) => {
    const stage = Object.values(STARTUP_STAGES).find(s => s.id === stageId);
    if (stage) {
      setCurrentStage(stage);
      setStageAttempts(0);
    }
  }, []);
  
  // Increment attempts for current stage (for progress calculation)
  const incrementAttempts = useCallback(() => {
    setStageAttempts(prev => prev + 1);
  }, []);
  
  // Calculate overall progress
  const progress = (() => {
    if (hasError) return 0;
    
    // During scanning phase, use scan progress for first 50%
    if (currentStage.id === 'scanning') {
      return (scanProgress / 100) * 50;
    }
    
    // For other stages, use stage progress
    return calculateStageProgress(currentStage, stageAttempts);
  })();
  
  // Get display text for current stage
  const displayText = getStageDisplayText(currentStage, {
    currentPart: currentScanPart,
  });
  
  return {
    // Current state
    currentStage,
    stageAttempts,
    progress,
    displayText,
    isSimMode,
    detectedFromLog,
    
    // Available stages
    stages,
    
    // Actions
    advanceToStage,
    incrementAttempts,
    
    // Helpers
    isScanning: currentStage.id === 'scanning',
    isStartingSimulation: currentStage.id === 'starting_simulation',
    isConnecting: currentStage.id === 'connecting',
    isInitializing: currentStage.id === 'initializing',
    isDetectingMovements: currentStage.id === 'detecting',
    isComplete: currentStage.id === 'complete',
    isError: currentStage.id === 'error',
  };
}

export default useStartupStages;

