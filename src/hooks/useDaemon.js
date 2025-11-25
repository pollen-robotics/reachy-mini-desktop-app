import { useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import useAppStore from '../store/useAppStore';
import { DAEMON_CONFIG, fetchWithTimeout, fetchWithTimeoutSkipInstall, buildApiUrl } from '../config/daemon';
import { isSimulationMode } from '../utils/simulationMode';
import { findErrorConfig, createErrorFromConfig } from '../utils/hardwareErrors';

export const useDaemon = () => {
  const { 
    isActive,
    isStarting,
    isStopping,
    startupError,
    isDaemonCrashed,
    setIsActive, 
    setIsStarting, 
    setIsStopping,
    setIsTransitioning,
    setDaemonVersion,
    setStartupError,
    setHardwareError,
    addFrontendLog
  } = useAppStore();

  // ✅ checkStatus removed - useDaemonHealthCheck handles all status checking
  // It polls every 1.33s, updates isActive, and handles crash detection
  // No need for duplicate functionality

  const fetchDaemonVersion = useCallback(async () => {
    try {
      // Use skip-install wrapper to avoid checking during installations
      const response = await fetchWithTimeoutSkipInstall(
        buildApiUrl(DAEMON_CONFIG.ENDPOINTS.DAEMON_STATUS),
        {},
        DAEMON_CONFIG.TIMEOUTS.VERSION,
        { silent: true } // ⚡ Don't log version checks
      );
      if (response.ok) {
        const data = await response.json();
        // API returns an object with the version
        setDaemonVersion(data.version || null);
        // ✅ No resetTimeouts() here, handled by useDaemonHealthCheck
      }
    } catch (error) {
      // Skip during installation (expected)
      if (error.name === 'SkippedError') {
        return;
      }
      // ✅ No incrementTimeouts() here, handled by useDaemonHealthCheck
    }
  }, [setDaemonVersion]);

  // Listen to sidecar stderr events to detect hardware errors
  // Only process errors when daemon is starting
  useEffect(() => {
    let unlistenStderr;
    
    const setupStderrListener = async () => {
      try {
        unlistenStderr = await listen('sidecar-stderr', (event) => {
          // Only process errors when starting
          if (!isStarting) {
            return;
          }
          
          // Extract error line from payload (can be string or object)
          const errorLine = typeof event.payload === 'string' 
            ? event.payload 
            : event.payload?.toString() || '';
          
          // Use centralized error detection
          const errorConfig = findErrorConfig(errorLine);
          
          if (errorConfig) {
            console.warn(`⚠️ Hardware error detected (${errorConfig.type}):`, errorLine);
            const errorObject = createErrorFromConfig(errorConfig, errorLine);
            setHardwareError(errorObject);
            // Keep isStarting = true to stay on StartingView/scan view
          } else if (errorLine.includes('RuntimeError')) {
            // Generic runtime error - no specific config found
            console.warn('⚠️ Generic hardware runtime error detected:', errorLine);
            // Don't override specific error if already set
            const currentError = useAppStore.getState().hardwareError;
            if (!currentError || !currentError.type) {
              setHardwareError({
                type: 'hardware',
                message: errorLine,
                messageParts: null,
                code: null,
                cameraPreset: 'scan',
              });
            }
          }
        });
      } catch (error) {
        console.error('Failed to setup sidecar-stderr listener:', error);
      }
    };
    
    setupStderrListener();
    
    return () => {
      if (unlistenStderr) {
        unlistenStderr();
      }
    };
  }, [isStarting, setHardwareError, setIsStarting]);

  const startDaemon = useCallback(async () => {
    // First reset errors but don't change view yet
    setStartupError(null);
    setHardwareError(null);
    
    // Wait a moment for React to render the spinner
    await new Promise(resolve => setTimeout(resolve, DAEMON_CONFIG.ANIMATIONS.SPINNER_RENDER_DELAY));
    
    try {
      // Check if daemon already running
      try {
        const response = await fetchWithTimeout(
          buildApiUrl(DAEMON_CONFIG.ENDPOINTS.STATE_FULL),
          {},
          DAEMON_CONFIG.TIMEOUTS.STARTUP_CHECK,
          { label: 'Check existing daemon' }
        );
        if (response.ok) {
          // Wait to see the spinner in the button
          await new Promise(resolve => setTimeout(resolve, DAEMON_CONFIG.ANIMATIONS.BUTTON_SPINNER_DELAY));
          setIsStarting(true);
          return;
        }
      } catch (e) {
        // No daemon detected, starting new one
      }

      // 🎭 Check if simulation mode is enabled
      const simMode = isSimulationMode();

      // Launch new daemon (non-blocking - we don't wait for it)
      // Pass sim_mode parameter to backend
      invoke('start_daemon', { simMode: simMode }).then(() => {
        // Daemon started
        if (simMode) {
          addFrontendLog('🎭 Daemon started in simulation mode (MuJoCo)');
        }
      }).catch((e) => {
        console.error('❌ Daemon startup error:', e);
        setStartupError(e.message || 'Error starting the daemon');
        setIsStarting(false);
      });
      
      // Wait to see the spinner in the button, then switch to scan view
      await new Promise(resolve => setTimeout(resolve, DAEMON_CONFIG.ANIMATIONS.BUTTON_SPINNER_DELAY));
      setIsStarting(true);
      
      // ✅ useDaemonHealthCheck will detect when daemon is ready automatically
      // It polls every 1.33s and updates isActive when daemon responds
      // No need for manual polling or checkStatus calls
    } catch (e) {
      console.error('❌ Daemon startup error:', e);
      setStartupError(e.message || 'Error starting the daemon');
      setIsStarting(false);
    }
  }, [setIsStarting, setIsActive, setStartupError, setHardwareError, setIsTransitioning, addFrontendLog]);

  const stopDaemon = useCallback(async () => {
    setIsStopping(true);
    try {
      // First send robot to sleep position
      try {
        await fetchWithTimeout(
          buildApiUrl('/api/move/play/goto_sleep'),
          { method: 'POST' },
          DAEMON_CONFIG.TIMEOUTS.COMMAND,
          { label: 'Sleep before shutdown' }
        );
        // Wait for movement to complete
        await new Promise(resolve => setTimeout(resolve, DAEMON_CONFIG.ANIMATIONS.SLEEP_DURATION));
      } catch (e) {
        // Robot already inactive or sleep error
      }
      
      // Then kill the daemon
      await invoke('stop_daemon');
      // ✅ No need to manually checkStatus - useDaemonHealthCheck will detect the change automatically
      setTimeout(() => {
        setIsStopping(false);
      }, DAEMON_CONFIG.ANIMATIONS.STOP_DAEMON_DELAY);
    } catch (e) {
      console.error(e);
      setIsStopping(false);
    }
  }, [setIsStopping]);

  return {
    isActive,
    isStarting,
    isStopping,
    startupError,
    startDaemon,
    stopDaemon,
    fetchDaemonVersion,
  };
};

