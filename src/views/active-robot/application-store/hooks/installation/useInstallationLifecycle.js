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
 * 
 * Uses ActiveRobotContext for decoupling from global stores
 */

import { useEffect, useRef, useCallback } from 'react';
import { useActiveRobotContext } from '../../../context';
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
 * @param {boolean} params.isLoading - Whether apps are currently being fetched
 */
export function useInstallationLifecycle({
  activeJobs,
  installedApps,
  showToast,
  refreshApps,
  onInstallSuccess,
  isLoading = false,
}) {
  const pendingTimeouts = useRef([]);
  const { stopPolling } = useInstallationPolling();
  
  // Get state and actions from context
  const { robotState, actions } = useActiveRobotContext();
  const { 
    installingAppName, 
    installJobType, 
    installStartTime, 
    jobSeenOnce, 
    processedJobs 
  } = robotState;
  const { unlockInstall, setInstallResult, markJobAsSeen, markJobAsProcessed } = actions;
  
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
      showToast(`${appName} ${actionType} successfully`, 'success');
    }
  }, [
    unlockInstall,
    onInstallSuccess,
    showToast,
    installJobType,
    installingAppName,
  ]);
  
  /**
   * Show error result (do not close overlay automatically - user must close manually)
   * @param {boolean} shouldCloseModal - Whether to close discover modal
   */
  const showErrorAndClose = useCallback((shouldCloseModal = false) => {
    setInstallResult(RESULT_STATES.FAILED);
    
    // Show toast notification immediately
    if (showToast) {
      const isUninstall = installJobType === JOB_TYPES.REMOVE;
      const actionVerb = isUninstall ? 'uninstall' : 'install';
      showToast(`Failed to ${actionVerb} ${installingAppName}`, 'error');
    }
    
    // Do NOT close overlay automatically - let user see the error and close manually
    // unlockInstall() is not called here - overlay stays open until user closes it
  }, [
    setInstallResult,
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
   * 
   * ✅ IMPROVED: Only close modal when job is REMOVED from activeJobs
   * This ensures the apps list is refreshed BEFORE the modal closes
   * (useAppJobs refreshes the list before removing the job)
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
    
    // ✅ IMPROVED: Only react when job is REMOVED from activeJobs
    // useAppJobs will:
    // 1. Set status to 'refreshing' when job completes
    // 2. Refresh the apps list (await)
    // 3. Set status to 'completed' or 'failed'
    // 4. REMOVE the job from activeJobs
    // We only close the modal at step 4, ensuring the list is updated
    const jobWasRemovedResult = wasJobRemoved(job, installStartTime, jobSeenOnce);
    
    // For failed jobs, we also react to the 'failed' status to show error immediately
    // (user can see the error while apps list refreshes in background)
    const jobIsFailed = isJobFailed(job);
    
    // Wait for apps to finish loading before closing
    const shouldWaitForLoading = jobWasRemovedResult && isLoading;
    
    // Early return: job still in progress or refreshing
    // Note: We deliberately ignore 'completed' status here - we wait for removal
    // ✅ Also wait if apps are still loading (even if job was removed)
    if (!jobWasRemovedResult && !jobIsFailed) {
      return;
    }
    
    // ✅ Wait for loading to finish before closing
    if (shouldWaitForLoading) {
      return;
    }
    
    // Mark job as processed immediately to avoid re-processing
    markJobAsProcessed(installingAppName, installJobType);
    
    // Determine installation result
    // For removed jobs: check last known status or assume success
    // For failed jobs: show error
    if (jobIsFailed) {
      showErrorAndClose(false);
    } else {
      // Job was removed = success (apps list already refreshed by useAppJobs)
      handleSuccessfulCompletion(true);
    }
  }, [
    activeJobs,
    installedApps,
    installingAppName,
    installJobType,
    installStartTime,
    jobSeenOnce,
    processedJobs,
    isLoading,
    markJobAsSeen,
    markJobAsProcessed,
    closeAfterDelay,
    showErrorAndClose,
    handleSuccessfulCompletion,
  ]);
}

