/**
 * Installation Lifecycle Hook
 * Main hook for managing app installation/uninstallation lifecycle
 * 
 * Architecture:
 * 1. Track job progress in activeJobs
 * 2. Detect completion (explicit status or job removal)
 * 3. Determine result (success/failed) with confidence levels
 * 4. Handle minimum display times
 * 5. Poll for app appearance (install only)
 * 6. Show result and close overlay
 */

import { useEffect, useRef, useCallback } from 'react';
import useAppStore from '../../../store/useAppStore';
import { TIMINGS, JOB_TYPES, RESULT_STATES } from './constants';
import {
  findJobByAppName,
  wasJobRemoved,
  isJobCompleted,
  isJobFailed,
  determineInstallationResult,
  calculateRemainingDisplayTime,
  generateJobKey,
} from './helpers';
import { useInstallationPolling } from './useInstallationPolling';

/**
 * Hook to manage app installation/uninstallation lifecycle
 * 
 * @param {object} params - Hook parameters
 * @param {Map} params.activeJobs - Map of active installation jobs
 * @param {Array} params.installedApps - List of installed apps
 * @param {Function} params.showToast - Toast notification function
 * @param {Function} params.refreshApps - Function to refresh apps list
 * @param {Function} params.onInstallSuccess - Callback when installation succeeds
 */
export function useInstallationLifecycle({
  activeJobs,
  installedApps,
  showToast,
  refreshApps,
  onInstallSuccess,
}) {
  const pendingTimeouts = useRef([]);
  const { stopPolling } = useInstallationPolling();
  
  // Get state from store
  const installingAppName = useAppStore(state => state.installingAppName);
  const installJobType = useAppStore(state => state.installJobType);
  const installStartTime = useAppStore(state => state.installStartTime);
  const jobSeenOnce = useAppStore(state => state.jobSeenOnce);
  const processedJobs = useAppStore(state => state.processedJobs);
  
  // Get actions from store
  const { unlockInstall, setInstallResult, markJobAsSeen, markJobAsProcessed } = useAppStore();
  
  /**
   * Cleanup all pending operations
   */
  useEffect(() => {
    return () => {
      // Clear all pending timeouts
      pendingTimeouts.current.forEach(clearTimeout);
      pendingTimeouts.current = [];
      
      // Stop polling
      stopPolling();
    };
  }, [stopPolling]);
  
  /**
   * Stop polling when installation is cancelled
   */
  useEffect(() => {
    if (!installingAppName) {
      stopPolling();
    }
  }, [installingAppName, stopPolling]);
  
  /**
   * Close overlay immediately (for successful installations)
   * Close directly without delay - job completion is definitive
   * @param {boolean} shouldCloseModal - Whether to close discover modal
   */
  const closeAfterDelay = useCallback((shouldCloseModal = false) => {
    const appName = installingAppName; // Capture before unlock
    const isUninstall = installJobType === JOB_TYPES.REMOVE;
    
    // Close immediately - no delay needed
    // Job says "completed", so we trust it and close right away
    unlockInstall();
    
    // Close discover modal if needed
    if (shouldCloseModal && onInstallSuccess) {
      onInstallSuccess();
    }
    
    // Show toast notification
    if (showToast) {
      const actionType = isUninstall ? 'uninstalled' : 'installed';
      showToast(`✅ ${appName} ${actionType} successfully`, 'success');
    }
  }, [
    unlockInstall,
    onInstallSuccess,
    showToast,
    installJobType,
    installingAppName,
  ]);
  
  /**
   * Show error result and close overlay after short delay
   * @param {boolean} shouldCloseModal - Whether to close discover modal
   */
  const showErrorAndClose = useCallback((shouldCloseModal = false) => {
    setInstallResult(RESULT_STATES.FAILED);
    
    // Short delay to show error state (1s instead of 3s)
    const closeTimeout = setTimeout(() => {
      unlockInstall();
      
      // Close discover modal if needed
      if (shouldCloseModal && onInstallSuccess) {
        onInstallSuccess();
      }
      
      // Show toast notification
      if (showToast) {
        const isUninstall = installJobType === JOB_TYPES.REMOVE;
        const actionVerb = isUninstall ? 'uninstall' : 'install';
        showToast(`❌ Failed to ${actionVerb} ${installingAppName}`, 'error');
      }
    }, 1000); // 1s delay for errors (user needs to see the error)
    
    pendingTimeouts.current.push(closeTimeout);
  }, [
    setInstallResult,
    unlockInstall,
    onInstallSuccess,
    showToast,
    installJobType,
    installingAppName,
  ]);
  
  /**
   * Handle successful installation completion
   * Close immediately - no polling, no delays
   */
  const handleSuccessfulCompletion = useCallback((wasCompleted) => {
    const isUninstall = installJobType === JOB_TYPES.REMOVE;
    
    // For failed install: show error
    if (!wasCompleted) {
      showErrorAndClose(false);
      return;
    }
    
    // For successful install/uninstall: close IMMEDIATELY
    // No polling, no waiting - if job says "completed", it's done
    closeAfterDelay(!isUninstall); // Close discover modal only for install
  }, [
    installJobType,
    closeAfterDelay,
    showErrorAndClose,
  ]);
  
  /**
   * Main effect: Track job progress and handle completion
   */
  useEffect(() => {
    // Early return: no installation in progress
    if (!installingAppName) {
      return;
    }
    
    // Early return: job already processed (avoid infinite loops)
    const jobKey = generateJobKey(installingAppName, installJobType);
    if (processedJobs.includes(jobKey)) {
      return;
    }
    
    // Find job in activeJobs
    const job = findJobByAppName(activeJobs, installingAppName);
    
    // Mark job as seen if found
    if (job && !jobSeenOnce) {
      markJobAsSeen();
    }
    
    // Determine if job is finished
    const jobWasRemoved = wasJobRemoved(job, installStartTime, jobSeenOnce);
    const jobIsCompleted = isJobCompleted(job);
    const jobIsFailed = isJobFailed(job);
    
    // Early return: job still in progress
    if (!jobWasRemoved && !jobIsCompleted && !jobIsFailed) {
      return;
    }
    
    // Mark job as processed immediately to avoid re-processing
    markJobAsProcessed(installingAppName, installJobType);
    
    // Determine installation result with confidence level
    const result = determineInstallationResult(job);
    
    // Log warning if low confidence (default assumption)
    if (result.confidence === 'low') {
      console.warn(
        `⚠️ Installation result determined with low confidence for ${installingAppName}. ` +
        `Job status: ${job?.status || 'unknown'}, Logs: ${job?.logs?.length || 0} entries. ` +
        `Assuming success by default.`
      );
    }
    
    // For successful installations: close immediately (no minimum display time)
    // For failed installations: show error immediately
    if (result.wasFailed) {
      showErrorAndClose(false);
    } else {
      // Success: close immediately, no delay
      handleSuccessfulCompletion(result.wasCompleted);
    }
  }, [
    activeJobs,
    installedApps,
    installingAppName,
    installJobType,
    installStartTime,
    jobSeenOnce,
    processedJobs,
    markJobAsSeen,
    markJobAsProcessed,
    closeAfterDelay,
    showErrorAndClose,
    handleSuccessfulCompletion,
  ]);
}

