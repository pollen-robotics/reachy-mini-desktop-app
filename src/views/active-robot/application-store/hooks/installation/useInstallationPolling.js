/**
 * Installation Polling Hook
 * Handles polling logic for waiting for app to appear in installed list
 */

import { useRef, useCallback } from 'react';
import { TIMINGS } from './constants';
import { isAppInInstalledList } from './helpers';

/**
 * Hook to manage polling for app installation completion
 * @returns {object} - Polling control functions
 */
export function useInstallationPolling() {
  const pollingIntervalRef = useRef(null);
  const attemptsRef = useRef(0);
  
  /**
   * Start polling for app to appear in installed list
   * @param {object} params - Polling parameters
   * @param {string} params.appName - Name of the app
   * @param {Array} params.installedApps - Current installed apps list
   * @param {Function} params.onAppFound - Callback when app is found
   * @param {Function} params.onTimeout - Callback when polling times out
   * @param {Function} params.refreshApps - Function to refresh apps list
   */
  const startPolling = useCallback(({
    appName,
    installedApps,
    onAppFound,
    onTimeout,
    refreshApps,
  }) => {
    // Clear any existing polling
    stopPolling();
    
    attemptsRef.current = 0;
    
    // Initial refresh
    if (refreshApps) {
      refreshApps();
    }
    
    pollingIntervalRef.current = setInterval(() => {
      attemptsRef.current++;
      
      // Check if app is now in the list
      if (isAppInInstalledList(appName, installedApps)) {
        stopPolling();
        onAppFound();
        return;
      }
      
      // Check timeout
      if (attemptsRef.current >= TIMINGS.POLLING.MAX_ATTEMPTS) {
        stopPolling();
        onTimeout();
        return;
      }
      
      // Periodic refresh of apps list
      if (refreshApps && attemptsRef.current % TIMINGS.POLLING.REFRESH_INTERVAL === 0) {
        refreshApps();
      }
    }, TIMINGS.POLLING.INTERVAL);
  }, []);
  
  /**
   * Stop polling
   */
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    attemptsRef.current = 0;
  }, []);
  
  /**
   * Get current polling status
   * @returns {{isPolling: boolean, attempts: number}}
   */
  const getPollingStatus = useCallback(() => {
    return {
      isPolling: pollingIntervalRef.current !== null,
      attempts: attemptsRef.current,
      maxAttempts: TIMINGS.POLLING.MAX_ATTEMPTS,
    };
  }, []);
  
  return {
    startPolling,
    stopPolling,
    getPollingStatus,
  };
}

