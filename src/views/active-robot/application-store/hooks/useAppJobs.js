import { useCallback, useRef } from 'react';
import { DAEMON_CONFIG, fetchWithTimeout, buildApiUrl } from '@config/daemon';
import useAppStore from '@store/useAppStore';

/**
 * Hook for managing app installation/uninstallation jobs
 * Handles polling, status updates, and error handling
 */
export function useAppJobs(setActiveJobs, fetchAvailableApps) {
  const jobPollingIntervals = useRef(new Map());
  // ✅ FIX: Track timeouts to prevent memory leaks
  const jobTimeouts = useRef(new Map()); // Map<jobId, Set<timeoutId>>
  const { addFrontendLog } = useAppStore();
  
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
          console.warn(`⚠️ Permission issue while polling job ${jobId}, continuing...`);
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
              addFrontendLog(`❌ ${job.type === 'install' ? 'Install' : 'Uninstall'} ${job.appName} TIMEOUT - Daemon non responsive`);
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
            addFrontendLog(`❌ ${jobInfo.type === 'install' ? 'Install' : 'Uninstall'} ${jobInfo.appName} FAILED: ${errorSummary}`);
          } else {
            addFrontendLog(`✓ ${jobInfo.type === 'install' ? 'Installed' : 'Uninstalled'} ${jobInfo.appName}`);
          }
        }
        
        // Force status to "completed" if detected in logs
        jobStatus.status = finalStatus;
      }
      
      // Update job in activeJobs
      setActiveJobs(prev => {
        const job = prev.get(jobId);
        if (!job) return prev;
        
        const updated = new Map(prev);
        updated.set(jobId, {
          ...job,
          status: jobStatus.status,
          logs: jobStatus.logs || [],
          fetchFailCount: 0,
        });
        return updated;
      });
      
      // If finished, mark as finished IMMEDIATELY then cleanup
      if (isFinished) {
        // Mark job as finished (changes status)
        setActiveJobs(prev => {
          const job = prev.get(jobId);
          if (!job) return prev;
          
          const updated = new Map(prev);
          updated.set(jobId, {
            ...job,
            status: jobStatus.status, // "completed" or "failed"
          });
          return updated;
        });
        
        // Refresh list after short delay (let daemon update its DB)
        // ✅ FIX: Track timeout for cleanup
        const refreshTimeoutId = setTimeout(() => {
          fetchAvailableApps();
          // Remove from tracking when executed
          const timeouts = jobTimeouts.current.get(jobId);
          if (timeouts) {
            timeouts.delete(refreshTimeoutId);
            if (timeouts.size === 0) {
              jobTimeouts.current.delete(jobId);
            }
          }
        }, DAEMON_CONFIG.APP_INSTALLATION.REFRESH_DELAY);
        addJobTimeout(jobId, refreshTimeoutId);
        
        // Remove job: very fast if success, 8s if failure (to see error)
        const delay = jobStatus.status === 'failed' ? 8000 : 100;
        const removeTimeoutId = setTimeout(() => {
          setActiveJobs(prev => {
            const updated = new Map(prev);
            updated.delete(jobId);
            return updated;
          });
          // Remove from tracking when executed
          const timeouts = jobTimeouts.current.get(jobId);
          if (timeouts) {
            timeouts.delete(removeTimeoutId);
            if (timeouts.size === 0) {
              jobTimeouts.current.delete(jobId);
            }
          }
        }, delay);
        addJobTimeout(jobId, removeTimeoutId);
      }
    };
    
    // Job polling
    const interval = setInterval(pollJob, DAEMON_CONFIG.INTERVALS.JOB_POLLING);
    jobPollingIntervals.current.set(jobId, interval);
    
    // First poll immediately
    pollJob();
  }, [fetchJobStatus, stopJobPolling, setActiveJobs, fetchAvailableApps, addFrontendLog]);
  
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
  }, []);
  
  return {
    fetchJobStatus,
    startJobPolling,
    stopJobPolling,
    cleanup,
  };
}

