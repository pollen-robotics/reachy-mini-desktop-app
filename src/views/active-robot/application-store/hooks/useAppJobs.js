import { useCallback, useRef } from 'react';
import { DAEMON_CONFIG, fetchWithTimeout, buildApiUrl } from '@config/daemon';
import useAppStore from '@store/useAppStore';
import { useLogger } from '@utils/logging';
import { invoke } from '@utils/tauriCompat';
import { TIMINGS, NETWORK_ERROR_MESSAGE } from './installation/constants';

/**
 * Hook for managing app installation/uninstallation jobs
 * Handles polling, status updates, and error handling
 * Uses tauriCompat for web mode support
 */
export function useAppJobs(setActiveJobs, fetchAvailableApps) {
  const jobPollingIntervals = useRef(new Map());
  // ✅ FIX: Track timeouts to prevent memory leaks
  const jobTimeouts = useRef(new Map()); // Map<jobId, Set<timeoutId>>
  // ✅ NEW: Track last log update time per job to detect stale downloads
  const jobLastLogUpdate = useRef(new Map()); // Map<jobId, { time: number, logCount: number }>
  const logger = useLogger();
  
  /**
   * Fetch job status (install/remove)
   */
  const fetchJobStatus = useCallback(async (jobId) => {
    try {
      const response = await fetchWithTimeout(
        buildApiUrl(`/api/apps/job-status/${encodeURIComponent(jobId)}`),
        {},
        DAEMON_CONFIG.TIMEOUTS.JOB_STATUS,
        { silent: true } // Silent job status polling
      );
      
      if (!response.ok) {
        // Don't throw for permission errors during polling
        // Continue polling, job can resume after acceptance
        if (response.status === 403 || response.status === 401) {
          return null; // Return null to continue polling
        }
        throw new Error(`Failed to fetch job status: ${response.status}`);
      }
      
      const jobStatus = await response.json();
      return jobStatus;
    } catch (err) {
      // Gracefully handle system popup timeouts during polling
      if (err.name === 'SystemPopupTimeoutError' || err.name === 'PermissionDeniedError') {
        console.warn(`⚠️ System popup detected while polling job ${jobId}, continuing...`);
        return null; // Continue polling, popup can be accepted later
      }
      
      console.error('❌ Failed to fetch job status:', err);
      return null;
    }
  }, []);
  
  /**
   * Stop job polling and cleanup all associated timeouts
   */
  const stopJobPolling = useCallback((jobId) => {
    const interval = jobPollingIntervals.current.get(jobId);
    if (interval) {
      clearInterval(interval);
      jobPollingIntervals.current.delete(jobId);
    }
    
    // ✅ FIX: Cleanup all timeouts for this job
    const timeouts = jobTimeouts.current.get(jobId);
    if (timeouts) {
      timeouts.forEach(timeoutId => clearTimeout(timeoutId));
      jobTimeouts.current.delete(jobId);
    }
    
    // ✅ NEW: Cleanup stale tracking for this job
    jobLastLogUpdate.current.delete(jobId);
  }, []);
  
  /**
   * Helper to track and cleanup timeouts for a job
   */
  const addJobTimeout = useCallback((jobId, timeoutId) => {
    if (!jobTimeouts.current.has(jobId)) {
      jobTimeouts.current.set(jobId, new Set());
    }
    jobTimeouts.current.get(jobId).add(timeoutId);
    
    // Return cleanup function
    return () => {
      clearTimeout(timeoutId);
      const timeouts = jobTimeouts.current.get(jobId);
      if (timeouts) {
        timeouts.delete(timeoutId);
        if (timeouts.size === 0) {
          jobTimeouts.current.delete(jobId);
        }
      }
    };
  }, []);
  
  /**
   * Start job polling
   */
  const startJobPolling = useCallback((jobId) => {
    // Avoid duplicates
    if (jobPollingIntervals.current.has(jobId)) {
      return;
    }
    
    const pollJob = async () => {
      // Check if polling is still active (may have been stopped)
      if (!jobPollingIntervals.current.has(jobId)) {
        return; // Polling stopped, don't continue
      }
      
      const jobStatus = await fetchJobStatus(jobId);
      
      if (!jobStatus) {
        // Job not found: increment failure counter
        setActiveJobs(prev => {
          const job = prev.get(jobId);
          if (!job) return prev;
          
          const failCount = (job.fetchFailCount || 0) + 1;
          
          // Stop only after N failed attempts
          if (failCount > DAEMON_CONFIG.CRASH_DETECTION.JOB_MAX_FAILS) {
            console.warn(`⚠️ Job ${jobId} polling failed after ${failCount} attempts (network timeout), marking as failed`);
            stopJobPolling(jobId);
            
            // Log to LogConsole
            if (job.appName) {
              logger.warning(`${job.type === 'install' ? 'Install' : 'Uninstall'} ${job.appName} timeout - daemon not responsive`);
            }
            
            // Mark job as failed instead of deleting it
            const updated = new Map(prev);
            updated.set(jobId, {
              ...job,
              status: 'failed',
              logs: [...(job.logs || []), '❌ Installation timed out - Network error or daemon overloaded'],
              fetchFailCount: failCount,
            });
            
            // Cleanup after delay so user can see the error
            // ✅ FIX: Track timeout for cleanup
            const cleanupTimeoutId = setTimeout(() => {
              setActiveJobs(prevJobs => {
                const clean = new Map(prevJobs);
                clean.delete(jobId);
                return clean;
              });
              // Remove from tracking when executed
              const timeouts = jobTimeouts.current.get(jobId);
              if (timeouts) {
                timeouts.delete(cleanupTimeoutId);
                if (timeouts.size === 0) {
                  jobTimeouts.current.delete(jobId);
                }
              }
            }, DAEMON_CONFIG.CRASH_DETECTION.JOB_CLEANUP_DELAY);
            addJobTimeout(jobId, cleanupTimeoutId);
            
            return updated;
          }
          
          // Otherwise, keep job and increment counter
          const updated = new Map(prev);
          updated.set(jobId, {
            ...job,
            fetchFailCount: failCount,
          });
          return updated;
        });
        return;
      }
      
      // If job finished, stop IMMEDIATELY before updating state
      // Also detect completion via logs if API doesn't return status:"completed"
      const logsText = (jobStatus.logs || []).join('\n').toLowerCase();
      const isSuccessInLogs = logsText.includes('completed successfully') || 
                              logsText.includes("job 'install' completed") || 
                              logsText.includes("job 'remove' completed");
      const isFinished = jobStatus.status === 'completed' || jobStatus.status === 'failed' || isSuccessInLogs;
      
      if (isFinished) {
        stopJobPolling(jobId);
        const finalStatus = jobStatus.status === 'failed' ? 'failed' : 'completed';
        
        // Log to visible LogConsole
        // Get current job from state
        let jobInfo = null;
        setActiveJobs(prev => {
          jobInfo = prev.get(jobId);
          return prev;
        });
        
        if (jobInfo) {
          if (finalStatus === 'failed') {
            console.error('❌ Job failed with logs:', jobStatus.logs);
            const errorSummary = jobStatus.logs?.slice(-2).join(' | ') || 'Unknown error';
            logger.error(`${jobInfo.type === 'install' ? 'Install' : 'Uninstall'} ${jobInfo.appName} failed: ${errorSummary}`);
          } else {
            logger.success(`${jobInfo.type === 'install' ? 'Install' : 'Uninstall'} ${jobInfo.appName} completed`);
            
            // ✅ macOS: Re-sign Python binaries after successful installation
            // This fixes Team ID mismatch issues with pip-installed packages
            // The Rust command handles platform detection, so safe to call on all platforms
            // Run asynchronously to avoid blocking the UI (signing can take 10-30s)
            if (jobInfo.type === 'install') {
              // Don't await - let it run in background to avoid UI freeze
              invoke('sign_python_binaries')
                .then((result) => {
                  
                  // Don't log to frontend to avoid noise, but log to console for debugging
                })
                .catch((err) => {
                  console.warn('[AppJobs] Failed to re-sign Python binaries:', err);
                  // Non-critical error, don't fail the installation
                });
            }
          }
        }
        
        // Force status to "completed" if detected in logs
        jobStatus.status = finalStatus;
      }
      
      // Update job in activeJobs
      // ⚠️ IMPORTANT: If job is finished, we DON'T update status here
      // We'll set it to 'refreshing' in the isFinished block below
      // This prevents useInstallationLifecycle from seeing 'completed' before the refresh
      setActiveJobs(prev => {
        const job = prev.get(jobId);
        if (!job) return prev;
        
        const updated = new Map(prev);
        updated.set(jobId, {
          ...job,
          // Only update status if job is NOT finished
          // Otherwise, keep current status until we set 'refreshing'
          status: isFinished ? job.status : jobStatus.status,
          logs: jobStatus.logs || [],
          fetchFailCount: 0,
        });
        return updated;
      });
      
      // ✅ NEW: Track log updates for stale detection
      const currentLogCount = (jobStatus.logs || []).length;
      const lastUpdate = jobLastLogUpdate.current.get(jobId);
      
      if (!lastUpdate) {
        // First poll: initialize tracking
        jobLastLogUpdate.current.set(jobId, { time: Date.now(), logCount: currentLogCount });
      } else if (currentLogCount > lastUpdate.logCount) {
        // Logs changed: reset timer
        jobLastLogUpdate.current.set(jobId, { time: Date.now(), logCount: currentLogCount });
      } else {
        // No new logs: check for stale timeout
        const timeSinceLastLog = Date.now() - lastUpdate.time;
        
        if (timeSinceLastLog > TIMINGS.STALE_JOB.TIMEOUT) {
          console.warn(`⚠️ Job ${jobId} appears stale - no new logs for ${Math.round(timeSinceLastLog / 1000)}s`);
          stopJobPolling(jobId);
          
          // Get job info for logging
          let jobInfo = null;
          setActiveJobs(prev => {
            jobInfo = prev.get(jobId);
            return prev;
          });
          
          if (jobInfo) {
            logger.warning(`${jobInfo.appName}: ${NETWORK_ERROR_MESSAGE}`);
          }
          
          // Mark job as failed with network error
          setActiveJobs(prev => {
            const job = prev.get(jobId);
            if (!job) return prev;
            
            const updated = new Map(prev);
            updated.set(jobId, {
              ...job,
              status: 'failed',
              isNetworkError: true, // ✅ Flag for UI to show specific message
              logs: [...(job.logs || []), `⚠️ ${NETWORK_ERROR_MESSAGE}`],
            });
            return updated;
          });
          
          // Cleanup after delay so user can see the error
          const cleanupTimeoutId = setTimeout(() => {
            setActiveJobs(prevJobs => {
              const clean = new Map(prevJobs);
              clean.delete(jobId);
              return clean;
            });
            const timeouts = jobTimeouts.current.get(jobId);
            if (timeouts) {
              timeouts.delete(cleanupTimeoutId);
              if (timeouts.size === 0) {
                jobTimeouts.current.delete(jobId);
              }
            }
          }, DAEMON_CONFIG.CRASH_DETECTION.JOB_CLEANUP_DELAY);
          addJobTimeout(jobId, cleanupTimeoutId);
          
          return; // Stop processing, job is now failed
        }
      }
      
      // If finished, mark as "refreshing" then refresh, then mark as "completed"
      // This ensures the modal waits for the apps list to update before closing
      if (isFinished) {
        const finalStatus = jobStatus.status; // "completed" or "failed"
        
        // Step 1: Mark job as "refreshing" (modal stays open during refresh)
        setActiveJobs(prev => {
          const job = prev.get(jobId);
          if (!job) return prev;
          
          const updated = new Map(prev);
          updated.set(jobId, {
            ...job,
            status: 'refreshing', // Intermediate state - modal stays open
            finalStatus: finalStatus, // Store final status for later
          });
          return updated;
        });
        
        // Step 2: Refresh apps list and WAIT for it to complete
        const refreshAndComplete = async () => {
          // Short delay to let daemon update its DB
          await new Promise(resolve => setTimeout(resolve, DAEMON_CONFIG.APP_INSTALLATION.REFRESH_DELAY));
          
          // Refresh apps list and WAIT for it to complete
          try {
            await fetchAvailableApps();
          } catch (err) {
            console.warn('[AppJobs] Failed to refresh apps after job completion:', err);
          }
          
          // Step 3: NOW mark job as truly completed (this triggers modal close)
          setActiveJobs(prev => {
            const job = prev.get(jobId);
            if (!job) return prev;
            
            const updated = new Map(prev);
            updated.set(jobId, {
              ...job,
              status: job.finalStatus || finalStatus, // Use stored final status
            });
            return updated;
          });
          
          // Step 4: Remove job after delay (instant for success, 8s for failure to see error)
          const extraDelay = finalStatus === 'failed' ? 8000 : 100;
          await new Promise(resolve => setTimeout(resolve, extraDelay));
          
          setActiveJobs(prev => {
            const updated = new Map(prev);
            updated.delete(jobId);
            return updated;
          });
        };
        
        // Execute the async cleanup
        refreshAndComplete();
      }
    };
    
    // Job polling
    const interval = setInterval(pollJob, DAEMON_CONFIG.INTERVALS.JOB_POLLING);
    jobPollingIntervals.current.set(jobId, interval);
    
    // First poll immediately
    pollJob();
  }, [fetchJobStatus, stopJobPolling, setActiveJobs, fetchAvailableApps, logger]);
  
  /**
   * Cleanup: stop all pollings and timeouts on unmount
   */
  const cleanup = useCallback(() => {
    // Cleanup all intervals
    jobPollingIntervals.current.forEach((interval) => clearInterval(interval));
    jobPollingIntervals.current.clear();
    
    // ✅ FIX: Cleanup all timeouts
    jobTimeouts.current.forEach((timeouts) => {
      timeouts.forEach(timeoutId => clearTimeout(timeoutId));
    });
    jobTimeouts.current.clear();
    
    // ✅ NEW: Cleanup stale tracking
    jobLastLogUpdate.current.clear();
  }, []);
  
  return {
    fetchJobStatus,
    startJobPolling,
    stopJobPolling,
    cleanup,
  };
}

