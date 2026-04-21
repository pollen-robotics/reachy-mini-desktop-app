import { useCallback, useRef, useEffect } from 'react';
import { DAEMON_CONFIG, fetchWithTimeout, buildApiUrl } from '@config/daemon';
import { useLogger } from '@utils/logging';
import { TIMINGS, NETWORK_ERROR_MESSAGE } from './installation/constants';

type JobTypeLabelInput = 'install' | 'update' | 'remove' | string;

const jobTypeLabel = (type: JobTypeLabelInput): string =>
  type === 'install' ? 'Install' : type === 'update' ? 'Update' : 'Uninstall';

interface JobEntry {
  type?: string;
  appName?: string;
  appInfo?: unknown;
  status?: string;
  logs?: string[];
  fetchFailCount?: number;
  finalStatus?: string;
  isNetworkError?: boolean;
  [key: string]: unknown;
}

type ActiveJobsMap = Map<string, JobEntry>;
type SetActiveJobs = (updater: (prev: ActiveJobsMap) => ActiveJobsMap) => void;

interface JobStatusPayload {
  status?: string;
  logs?: string[];
}

interface UseAppJobsReturn {
  fetchJobStatus: (jobId: string) => Promise<JobStatusPayload | null>;
  startJobPolling: (jobId: string) => void;
  stopJobPolling: (jobId: string) => void;
  cleanup: () => void;
}

export function useAppJobs(
  setActiveJobs: SetActiveJobs,
  fetchAvailableApps: () => Promise<unknown>
): UseAppJobsReturn {
  const jobPollingIntervals = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const jobTimeouts = useRef<Map<string, Set<ReturnType<typeof setTimeout>>>>(new Map());
  const jobLastLogUpdate = useRef<Map<string, { time: number; logCount: number }>>(new Map());
  const logger = useLogger();

  const fetchJobStatus = useCallback(async (jobId: string): Promise<JobStatusPayload | null> => {
    try {
      const response = await fetchWithTimeout(
        buildApiUrl(`/api/apps/job-status/${encodeURIComponent(jobId)}`),
        {},
        DAEMON_CONFIG.TIMEOUTS.JOB_STATUS,
        { silent: true }
      );

      if (!response.ok) {
        if (response.status === 403 || response.status === 401) {
          return null;
        }
        throw new Error(`Failed to fetch job status: ${response.status}`);
      }

      const jobStatus = (await response.json()) as JobStatusPayload;
      return jobStatus;
    } catch (err) {
      const error = err as Error;
      if (error.name === 'SystemPopupTimeoutError' || error.name === 'PermissionDeniedError') {
        console.warn(`⚠️ System popup detected while polling job ${jobId}, continuing...`);
        return null;
      }

      console.error('❌ Failed to fetch job status:', err);
      return null;
    }
  }, []);

  const stopJobPolling = useCallback((jobId: string): void => {
    const interval = jobPollingIntervals.current.get(jobId);
    if (interval) {
      clearInterval(interval);
      jobPollingIntervals.current.delete(jobId);
    }

    const timeouts = jobTimeouts.current.get(jobId);
    if (timeouts) {
      timeouts.forEach(timeoutId => clearTimeout(timeoutId));
      jobTimeouts.current.delete(jobId);
    }

    jobLastLogUpdate.current.delete(jobId);
  }, []);

  const addJobTimeout = useCallback(
    (jobId: string, timeoutId: ReturnType<typeof setTimeout>): (() => void) => {
      if (!jobTimeouts.current.has(jobId)) {
        jobTimeouts.current.set(jobId, new Set());
      }
      jobTimeouts.current.get(jobId)!.add(timeoutId);

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
    },
    []
  );

  const startJobPolling = useCallback(
    (jobId: string): void => {
      if (jobPollingIntervals.current.has(jobId)) {
        return;
      }

      const pollJob = async (): Promise<void> => {
        if (!jobPollingIntervals.current.has(jobId)) {
          return;
        }

        const jobStatus = await fetchJobStatus(jobId);

        if (!jobStatus) {
          setActiveJobs(prev => {
            const job = prev.get(jobId);
            if (!job) return prev;

            const failCount = (job.fetchFailCount || 0) + 1;

            if (failCount > DAEMON_CONFIG.CRASH_DETECTION.JOB_MAX_FAILS) {
              console.warn(
                `⚠️ Job ${jobId} polling failed after ${failCount} attempts (network timeout), marking as failed`
              );
              stopJobPolling(jobId);

              if (job.appName) {
                logger.warning(
                  `${jobTypeLabel(job.type || '')} ${job.appName} timeout - daemon not responsive`
                );
              }

              const updated = new Map(prev);
              updated.set(jobId, {
                ...job,
                status: 'failed',
                logs: [
                  ...(job.logs || []),
                  '❌ Installation timed out - Network error or daemon overloaded',
                ],
                fetchFailCount: failCount,
              });

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

              return updated;
            }

            const updated = new Map(prev);
            updated.set(jobId, {
              ...job,
              fetchFailCount: failCount,
            });
            return updated;
          });
          return;
        }

        const logsText = (jobStatus.logs || []).join('\n').toLowerCase();
        const isSuccessInLogs =
          logsText.includes('completed successfully') ||
          logsText.includes("job 'install' completed") ||
          logsText.includes("job 'remove' completed") ||
          logsText.includes("job 'update' completed");
        const isFinished =
          jobStatus.status === 'completed' || jobStatus.status === 'failed' || isSuccessInLogs;

        if (isFinished) {
          stopJobPolling(jobId);
          const finalStatus = jobStatus.status === 'failed' ? 'failed' : 'completed';

          let jobInfo: JobEntry | null = null;
          setActiveJobs(prev => {
            jobInfo = prev.get(jobId) || null;
            return prev;
          });

          if (jobInfo) {
            const info = jobInfo as JobEntry;
            if (finalStatus === 'failed') {
              console.error('❌ Job failed with logs:', jobStatus.logs);
              const errorSummary = jobStatus.logs?.slice(-2).join(' | ') || 'Unknown error';
              logger.error(
                `${jobTypeLabel(info.type || '')} ${info.appName} failed: ${errorSummary}`
              );
            } else {
              logger.success(`${jobTypeLabel(info.type || '')} ${info.appName} completed`);
            }
          }

          jobStatus.status = finalStatus;
        }

        setActiveJobs(prev => {
          const job = prev.get(jobId);
          if (!job) return prev;

          const newStatus = isFinished ? job.status : jobStatus.status;
          const newLogs = jobStatus.logs || [];

          if (
            job.status === newStatus &&
            job.fetchFailCount === 0 &&
            job.logs?.length === newLogs.length
          ) {
            return prev;
          }

          const updated = new Map(prev);
          updated.set(jobId, {
            ...job,
            status: newStatus,
            logs: newLogs,
            fetchFailCount: 0,
          });
          return updated;
        });

        const currentLogCount = (jobStatus.logs || []).length;
        const lastUpdate = jobLastLogUpdate.current.get(jobId);

        if (!lastUpdate) {
          jobLastLogUpdate.current.set(jobId, { time: Date.now(), logCount: currentLogCount });
        } else if (currentLogCount > lastUpdate.logCount) {
          jobLastLogUpdate.current.set(jobId, { time: Date.now(), logCount: currentLogCount });
        } else {
          const timeSinceLastLog = Date.now() - lastUpdate.time;

          if (timeSinceLastLog > TIMINGS.STALE_JOB.TIMEOUT) {
            console.warn(
              `⚠️ Job ${jobId} appears stale - no new logs for ${Math.round(timeSinceLastLog / 1000)}s`
            );
            stopJobPolling(jobId);

            let jobInfo: JobEntry | null = null;
            setActiveJobs(prev => {
              jobInfo = prev.get(jobId) || null;
              return prev;
            });

            if (jobInfo) {
              logger.warning(`${(jobInfo as JobEntry).appName}: ${NETWORK_ERROR_MESSAGE}`);
            }

            setActiveJobs(prev => {
              const job = prev.get(jobId);
              if (!job) return prev;

              const updated = new Map(prev);
              updated.set(jobId, {
                ...job,
                status: 'failed',
                isNetworkError: true,
                logs: [...(job.logs || []), `⚠️ ${NETWORK_ERROR_MESSAGE}`],
              });
              return updated;
            });

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

            return;
          }
        }

        if (isFinished) {
          const finalStatus = jobStatus.status;

          setActiveJobs(prev => {
            const job = prev.get(jobId);
            if (!job) return prev;

            const updated = new Map(prev);
            updated.set(jobId, {
              ...job,
              status: 'refreshing',
              finalStatus: finalStatus,
            });
            return updated;
          });

          const refreshAndComplete = async (): Promise<void> => {
            await new Promise(resolve =>
              setTimeout(resolve, DAEMON_CONFIG.APP_INSTALLATION.REFRESH_DELAY)
            );

            try {
              await fetchAvailableApps();
            } catch (err) {
              console.warn('[AppJobs] Failed to refresh apps after job completion:', err);
            }

            setActiveJobs(prev => {
              const job = prev.get(jobId);
              if (!job) return prev;

              const updated = new Map(prev);
              updated.set(jobId, {
                ...job,
                status: job.finalStatus || finalStatus,
              });
              return updated;
            });

            const extraDelay = finalStatus === 'failed' ? 8000 : 100;
            await new Promise(resolve => setTimeout(resolve, extraDelay));

            setActiveJobs(prev => {
              const updated = new Map(prev);
              updated.delete(jobId);
              return updated;
            });
          };

          refreshAndComplete();
        }
      };

      const interval = setInterval(pollJob, DAEMON_CONFIG.INTERVALS.JOB_POLLING);
      jobPollingIntervals.current.set(jobId, interval);

      pollJob();
    },
    [fetchJobStatus, stopJobPolling, setActiveJobs, fetchAvailableApps, logger, addJobTimeout]
  );

  useEffect(() => {
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'visible' && jobLastLogUpdate.current.size > 0) {
        const now = Date.now();
        jobLastLogUpdate.current.forEach((value, key) => {
          jobLastLogUpdate.current.set(key, { ...value, time: now });
        });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const cleanup = useCallback((): void => {
    jobPollingIntervals.current.forEach(interval => clearInterval(interval));
    jobPollingIntervals.current.clear();

    jobTimeouts.current.forEach(timeouts => {
      timeouts.forEach(timeoutId => clearTimeout(timeoutId));
    });
    jobTimeouts.current.clear();

    jobLastLogUpdate.current.clear();
  }, []);

  return {
    fetchJobStatus,
    startJobPolling,
    stopJobPolling,
    cleanup,
  };
}
