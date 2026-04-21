import { useState, useCallback, useRef, useEffect } from 'react';
import { DAEMON_CONFIG, fetchWithTimeout, buildApiUrl } from '@config/daemon';
import { useLogger } from '@utils/logging';
import { createJob } from './useAppsStore';

const CHECK_UPDATES_INTERVAL = 5 * 60 * 1000;

interface UpdateStatus {
  app_name?: string;
  update_available?: boolean;
  [key: string]: unknown;
}

interface CheckUpdatesResponse {
  apps_with_updates?: UpdateStatus[];
}

interface InstalledAppLike {
  name?: string;
  [key: string]: unknown;
}

type SetActiveJobs = (updater: (prev: Map<string, unknown>) => Map<string, unknown>) => void;

interface UseAppUpdatesReturn {
  checkForUpdates: (force?: boolean) => Promise<void>;
  hasUpdate: (appName: string) => boolean;
  getAppUpdateStatus: (appName: string) => UpdateStatus | null;
  triggerUpdate: (appName: string) => Promise<string>;
  isCheckingUpdates: boolean;
  hasCheckedOnce: boolean;
}

export function useAppUpdates(
  isActive: boolean,
  installedApps: InstalledAppLike[],
  setActiveJobs: SetActiveJobs,
  startJobPollingRef: React.MutableRefObject<((jobId: string) => void) | null>
): UseAppUpdatesReturn {
  const [updateStatuses, setUpdateStatuses] = useState<Map<string, UpdateStatus>>(new Map());
  const [isCheckingUpdates, setIsCheckingUpdates] = useState<boolean>(false);
  const [hasCheckedOnce, setHasCheckedOnce] = useState<boolean>(false);
  const logger = useLogger();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkForUpdates = useCallback(
    async (_force: boolean = false): Promise<void> => {
      void _force;
      if (!isActive || installedApps.length === 0) return;

      setIsCheckingUpdates(true);
      try {
        const response = await fetchWithTimeout(
          buildApiUrl('/api/apps/check-updates'),
          {},
          DAEMON_CONFIG.TIMEOUTS.APPS_LIST,
          { silent: true }
        );

        if (!response.ok) {
          throw new Error(`Check updates failed: ${response.status}`);
        }

        const data = (await response.json()) as CheckUpdatesResponse;

        const statusMap = new Map<string, UpdateStatus>();
        if (Array.isArray(data?.apps_with_updates)) {
          for (const app of data.apps_with_updates) {
            if (app.app_name) {
              statusMap.set(app.app_name, app);
            }
          }
        }

        setUpdateStatuses(statusMap);
        setHasCheckedOnce(true);
      } catch (err) {
        console.warn('[useAppUpdates] Failed to check for updates:', (err as Error).message);
      } finally {
        setIsCheckingUpdates(false);
      }
    },
    [isActive, installedApps.length]
  );

  const hasUpdate = useCallback(
    (appName: string): boolean => {
      const status = updateStatuses.get(appName);
      return status?.update_available === true;
    },
    [updateStatuses]
  );

  const getAppUpdateStatus = useCallback(
    (appName: string): UpdateStatus | null => {
      return updateStatuses.get(appName) || null;
    },
    [updateStatuses]
  );

  const triggerUpdate = useCallback(
    async (appName: string): Promise<string> => {
      try {
        const response = await fetchWithTimeout(
          buildApiUrl(`/api/apps/update/${encodeURIComponent(appName)}`),
          { method: 'POST' },
          DAEMON_CONFIG.TIMEOUTS.APP_INSTALL,
          { label: `Update ${appName}` }
        );

        if (!response.ok) {
          if (response.status === 403 || response.status === 401) {
            const permissionError = new Error(
              'Permission denied: System may have blocked the update'
            );
            permissionError.name = 'PermissionDeniedError';
            throw permissionError;
          }
          throw new Error(`Update failed: ${response.status}`);
        }

        const result = (await response.json()) as { job_id?: string } & Record<string, unknown>;
        const jobId = result.job_id || Object.keys(result)[0];

        if (!jobId) {
          throw new Error('No job_id returned from API');
        }

        // TODO(ts): createJob signature uses loosely-typed setActiveJobs; bridge here.
        createJob(
          jobId,
          'update',
          appName,
          null,
          setActiveJobs as unknown as Parameters<typeof createJob>[4],
          startJobPollingRef as unknown as Parameters<typeof createJob>[5]
        );

        setUpdateStatuses(prev => {
          const updated = new Map(prev);
          const existing = updated.get(appName);
          if (existing) {
            updated.set(appName, { ...existing, update_available: false });
          }
          return updated;
        });

        return jobId;
      } catch (err) {
        const error = err as Error;
        console.error('[useAppUpdates] Update error:', err);
        logger.error(`Failed to start update ${appName} (${error.message})`);
        throw err;
      }
    },
    [setActiveJobs, startJobPollingRef, logger]
  );

  useEffect(() => {
    if (!isActive || installedApps.length === 0) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    checkForUpdates();

    intervalRef.current = setInterval(() => checkForUpdates(), CHECK_UPDATES_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isActive, installedApps.length, checkForUpdates]);

  return {
    checkForUpdates,
    hasUpdate,
    getAppUpdateStatus,
    triggerUpdate,
    isCheckingUpdates,
    hasCheckedOnce,
  };
}
