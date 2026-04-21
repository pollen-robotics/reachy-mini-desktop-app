/**
 * 🚀 useStartupStages Hook
 *
 * Centralized management of startup stages with:
 * - Automatic stage detection from sidecar logs
 * - Progress calculation
 * - Simulation mode awareness
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { isSimulationMode } from '../../utils/simulationMode';
import {
  STARTUP_STAGES,
  getStagesForMode,
  detectStageFromLog,
  calculateStageProgress,
  getStageDisplayText,
  type StartupStage,
} from '../../config/startupStages';

export type { StartupStage };

export interface UseStartupStagesOptions {
  isStarting?: boolean;
  scanComplete?: boolean;
  scanProgress?: number;
  currentScanPart?: string | null;
  hasError?: boolean;
}

export interface StageDisplayText {
  title: string;
  subtitle: string;
  boldText: string;
}

export interface UseStartupStagesResult {
  currentStage: StartupStage;
  stageAttempts: number;
  progress: number;
  displayText: StageDisplayText;
  isSimMode: boolean;
  detectedFromLog: boolean;
  stages: StartupStage[];
  advanceToStage: (stageId: string) => void;
  incrementAttempts: () => void;
  isScanning: boolean;
  isStartingSimulation: boolean;
  isConnecting: boolean;
  isInitializing: boolean;
  isDetectingMovements: boolean;
  isComplete: boolean;
  isError: boolean;
}

/**
 * Hook to manage startup stages with automatic detection.
 */
export function useStartupStages({
  isStarting = false,
  scanComplete = false,
  scanProgress = 0,
  currentScanPart = null,
  hasError = false,
}: UseStartupStagesOptions = {}): UseStartupStagesResult {
  const isSimMode: boolean = isSimulationMode();
  const stages: StartupStage[] = getStagesForMode(isSimMode);

  // Current stage state
  const [currentStage, setCurrentStage] = useState<StartupStage>(STARTUP_STAGES.SCANNING);
  const [stageAttempts, setStageAttempts] = useState<number>(0);
  const [detectedFromLog, setDetectedFromLog] = useState<boolean>(false);

  // Track stage progression
  const stageIndexRef = useRef<number>(0);
  const lastDetectedStageRef = useRef<StartupStage | null>(null);

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
      const nextStage: StartupStage = isSimMode
        ? STARTUP_STAGES.STARTING_SIMULATION
        : STARTUP_STAGES.CONNECTING;
      setCurrentStage(nextStage);
      setStageAttempts(0);
    }
  }, [scanComplete, currentStage.id, isStarting, hasError, isSimMode]);

  // Listen to sidecar logs for automatic stage detection
  const unlistenStdoutRef = useRef<UnlistenFn | null>(null);

  useEffect(() => {
    if (!isStarting) return;

    let isMounted = true;

    const setupListener = async (): Promise<void> => {
      // Cleanup previous listener first
      if (unlistenStdoutRef.current) {
        unlistenStdoutRef.current();
        unlistenStdoutRef.current = null;
      }

      try {
        const unlisten = await listen<unknown>('sidecar-stdout', event => {
          if (!isMounted) return;

          const payload = event.payload;
          const logMessage =
            typeof payload === 'string' ? payload : payload != null ? String(payload) : '';

          const detected = detectStageFromLog(logMessage, isSimMode);

          if (detected && detected.id !== lastDetectedStageRef.current?.id) {
            // Only advance forward, never go back
            const detectedIndex = stages.findIndex(s => s.id === detected.id);
            const currentIndex = stages.findIndex(s => s.id === currentStage.id);

            if (detectedIndex > currentIndex) {
              setCurrentStage(detected);
              setStageAttempts(0);
              setDetectedFromLog(true);
              lastDetectedStageRef.current = detected;
              stageIndexRef.current = detectedIndex;
            }
          }
        });

        if (isMounted) {
          unlistenStdoutRef.current = unlisten;
        } else {
          unlisten();
        }
      } catch {
        // Listener setup can fail outside of Tauri; nothing to do.
      }
    };

    setupListener();

    return () => {
      isMounted = false;
      if (unlistenStdoutRef.current) {
        unlistenStdoutRef.current();
        unlistenStdoutRef.current = null;
      }
    };
  }, [isStarting, currentStage, stages, isSimMode]);

  const advanceToStage = useCallback((stageId: string): void => {
    const stage = (Object.values(STARTUP_STAGES) as ReadonlyArray<StartupStage>).find(
      s => s.id === stageId
    );
    if (stage) {
      setCurrentStage(stage);
      setStageAttempts(0);
    }
  }, []);

  // Increment attempts for current stage (for progress calculation)
  const incrementAttempts = useCallback((): void => {
    setStageAttempts(prev => prev + 1);
  }, []);

  // Calculate overall progress
  const progress: number = (() => {
    if (hasError) return 0;

    // During scanning phase, use scan progress for first 50%
    if (currentStage.id === 'scanning') {
      return (scanProgress / 100) * 50;
    }

    // For other stages, use stage progress
    return calculateStageProgress(currentStage, stageAttempts);
  })();

  const displayText = getStageDisplayText(currentStage, {
    currentPart: currentScanPart ?? '',
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
