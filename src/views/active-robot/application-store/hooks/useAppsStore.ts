import { useEffect, useCallback, useRef, useMemo } from 'react';
import useAppStore from '@store/useAppStore';
import { DAEMON_CONFIG, fetchWithTimeout, buildApiUrl } from '@config/daemon';
import { useLogger } from '@utils/logging';
import { useAppFetching, mergeAppsData } from './useAppFetching';
import { useAppJobs } from './useAppJobs';
import { useAppUpdates } from './useAppUpdates';
import { useWindowVisible } from '../../../../hooks/system/useWindowVisible';
import { closeAppWindow } from '../../../../utils/windowManager';

const APP_ERROR_DISPLAY_DURATION_MS = 10_000;

type AnyRecord = Record<string, unknown>;

interface AppLike extends AnyRecord {
  name?: string;
  source_kind?: string;
  isOfficial?: boolean;
  extra?: AnyRecord;
}

interface AppInfo {
  name: string;
  [key: string]: unknown;
}

interface JobLike {
  type?: string;
  appName?: string;
  appInfo?: unknown;
  status?: string;
  logs?: string[];
  [key: string]: unknown;
}

type ActiveJobsMap = Map<string, JobLike>;

interface CurrentAppStatus {
  info?: { name?: string };
  state?: string;
  error?: string;
  [key: string]: unknown;
}

// TODO(ts): setActiveJobs from the store is loosely typed (Object vs Map). This helper
// bridges both shapes.
export const createJob = (
  jobId: string,
  jobType: string,
  appName: string,
  appInfo: AppInfo | null,
  setActiveJobs: (updater: (prev: ActiveJobsMap) => ActiveJobsMap) => void,
  startJobPollingRef: React.MutableRefObject<((jobId: string) => void) | null>
): void => {
  setActiveJobs(prev => {
    const updated: ActiveJobsMap = new Map(
      prev instanceof Map ? prev : new Map(Object.entries(prev || {}))
    );
    updated.set(jobId, {
      type: jobType,
      appName,
      ...(appInfo && { appInfo }),
      status: 'running',
      logs: [],
    });
    return updated;
  });

  if (startJobPollingRef.current) {
    startJobPollingRef.current(jobId);
  }
};

const handlePermissionError = (
  err: Error & { userFriendly?: boolean },
  action: string,
  appName: string,
  logger: ReturnType<typeof useLogger>,
  setAppsError: (message: string | null) => void
): (Error & { name: string; userFriendly: boolean }) | null => {
  if (err.name === 'PermissionDeniedError' || err.name === 'SystemPopupTimeoutError') {
    const userMessage =
      err.name === 'PermissionDeniedError'
        ? `Permission denied: Please accept system permissions to ${action} ${appName}`
        : `System permission popup detected: Please accept permissions to continue ${action} ${appName}`;

    logger.warning(userMessage);
    setAppsError(userMessage);

    const userFriendlyError = new Error(userMessage) as Error & {
      name: string;
      userFriendly: boolean;
    };
    userFriendlyError.name = err.name;
    userFriendlyError.userFriendly = true;
    return userFriendlyError;
  }
  return null;
};

export function useAppsStore(isActive: boolean) {
  const logger = useLogger();
  const availableApps = useAppStore(s => s.availableApps) as AppLike[];
  const installedApps = useAppStore(s => s.installedApps) as AppLike[];
  const currentApp = useAppStore(s => s.currentApp) as CurrentAppStatus | null;
  const activeJobsObj = useAppStore(s => s.activeJobs) as Record<string, JobLike> | null;
  const appsLoading = useAppStore(s => s.appsLoading) as boolean;
  const appsError = useAppStore(s => s.appsError) as string | null;
  const isStoppingApp = useAppStore(s => (s as unknown as AnyRecord).isStoppingApp) as boolean;
  const setAvailableApps = useAppStore(s => s.setAvailableApps) as (apps: AppLike[]) => void;
  const setInstalledApps = useAppStore(s => s.setInstalledApps) as (apps: AppLike[]) => void;
  const setCurrentApp = useAppStore(s => s.setCurrentApp) as (app: CurrentAppStatus | null) => void;
  const setActiveJobs = useAppStore(s => s.setActiveJobs) as unknown as (
    updater: (prev: ActiveJobsMap) => ActiveJobsMap
  ) => void;
  const setAppsLoading = useAppStore(s => s.setAppsLoading) as (loading: boolean) => void;
  const setAppsError = useAppStore(s => s.setAppsError) as (error: string | null) => void;
  const invalidateAppsCache = useAppStore(s => s.invalidateAppsCache) as () => void;

  const activeJobs = useMemo<ActiveJobsMap>(() => {
    return new Map(Object.entries(activeJobsObj || {}));
  }, [activeJobsObj]);

  const { fetchAppsFromWebsite, fetchInstalledApps } = useAppFetching();

  const isFetchingRef = useRef<boolean>(false);

  const errorClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lastDismissedErrorAppRef = useRef<string | null>(null);

  const CACHE_DURATION = 24 * 60 * 60 * 1000;

  const fetchAvailableApps = useCallback(
    async (forceRefresh: boolean = false): Promise<AppLike[]> => {
      if (isFetchingRef.current) {
        return useAppStore.getState().availableApps as AppLike[];
      }

      const storeState = useAppStore.getState() as unknown as AnyRecord;
      const currentAvailableApps = storeState.availableApps as AppLike[];
      const currentInstalledApps = storeState.installedApps as AppLike[];
      const currentCacheValid = storeState.appsCacheValid as boolean;
      const currentLastFetch = storeState.appsLastFetch as number | null;

      const isCacheFresh =
        currentCacheValid && currentLastFetch && Date.now() - currentLastFetch < CACHE_DURATION;

      if (!forceRefresh && isCacheFresh && currentAvailableApps.length > 0) {
        if (!navigator.onLine && currentInstalledApps.length > 0) {
          setAppsError(
            `No internet connection - showing ${currentInstalledApps.length} installed app${currentInstalledApps.length > 1 ? 's' : ''} only`
          );
        } else if (!navigator.onLine) {
          setAppsError('No internet connection. Please check your network and try again.');
        } else {
          setAppsError(null);
        }

        return currentAvailableApps;
      }

      try {
        isFetchingRef.current = true;
        setAppsLoading(true);
        setAppsError(null);

        let availableAppsFromWebsite: AppLike[] = [];
        let fetchError: Error | null = null;

        try {
          availableAppsFromWebsite = (await fetchAppsFromWebsite()) as AppLike[];
        } catch (err) {
          fetchError = err as Error;
          console.error('❌ Failed to fetch apps from website:', (err as Error).message);
        }

        const installedResult = await fetchInstalledApps();
        const installedAppsFromDaemon = (installedResult.apps || []) as AppLike[];

        if (installedResult.error) {
          console.warn(`⚠️ Error fetching installed apps: ${installedResult.error}`);
        }

        const hasNetworkIssue =
          availableAppsFromWebsite.length === 0 && (fetchError || !navigator.onLine);

        if (hasNetworkIssue) {
          if (installedAppsFromDaemon.length === 0) {
            const errorMessage = 'No internet connection. Please check your network and try again.';
            console.error(`❌ ${errorMessage}`);
            setAppsError(errorMessage);
            setAppsLoading(false);
            isFetchingRef.current = false;
            return [];
          } else {
            const warningMessage = `No internet connection - showing ${installedAppsFromDaemon.length} installed app${installedAppsFromDaemon.length > 1 ? 's' : ''} only`;
            console.warn(`⚠️ ${warningMessage}`);
            setAppsError(warningMessage);
          }
        } else {
          setAppsError(null);
        }

        const { enrichedApps, installedApps: installed } = mergeAppsData(
          availableAppsFromWebsite,
          installedAppsFromDaemon
        );

        setAvailableApps(enrichedApps as AppLike[]);
        setInstalledApps(installed as AppLike[]);

        if (hasNetworkIssue) {
          invalidateAppsCache();
        }

        setAppsLoading(false);

        return enrichedApps as AppLike[];
      } catch (err) {
        console.error('❌ Failed to fetch apps:', err);
        setAppsError((err as Error).message);
        setAppsLoading(false);
        return useAppStore.getState().availableApps as AppLike[];
      } finally {
        isFetchingRef.current = false;
      }
    },
    [
      fetchAppsFromWebsite,
      fetchInstalledApps,
      setAvailableApps,
      setInstalledApps,
      setAppsLoading,
      setAppsError,
      invalidateAppsCache,
      CACHE_DURATION,
    ]
  );

  const fetchAvailableAppsRef = useRef<typeof fetchAvailableApps | null>(null);
  fetchAvailableAppsRef.current = fetchAvailableApps;

  const {
    startJobPolling,
    stopJobPolling,
    cleanup: cleanupJobs,
  } = useAppJobs(setActiveJobs, () => {
    if (fetchAvailableAppsRef.current) {
      return fetchAvailableAppsRef.current(true);
    }
    return Promise.resolve();
  });
  void stopJobPolling;

  const startJobPollingRef = useRef<typeof startJobPolling | null>(startJobPolling);
  startJobPollingRef.current = startJobPolling;

  const {
    checkForUpdates,
    hasUpdate,
    getAppUpdateStatus,
    triggerUpdate,
    isCheckingUpdates,
    hasCheckedOnce,
  } = useAppUpdates(
    isActive,
    installedApps,
    setActiveJobs as unknown as Parameters<typeof useAppUpdates>[2],
    startJobPollingRef as unknown as Parameters<typeof useAppUpdates>[3]
  );

  const fetchCurrentAppStatus = useCallback(async (): Promise<CurrentAppStatus | null> => {
    try {
      const response = await fetchWithTimeout(
        buildApiUrl('/api/apps/current-app-status'),
        {},
        DAEMON_CONFIG.TIMEOUTS.APPS_LIST,
        { silent: true }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch current app: ${response.status}`);
      }

      const status = (await response.json()) as CurrentAppStatus | null;
      const store = useAppStore.getState() as unknown as AnyRecord;

      if (status && status.info && status.state) {
        const appState = status.state;
        const appName = status.info.name as string;
        const hasError = !!status.error;

        if (appState === 'error' && appName === lastDismissedErrorAppRef.current) {
          return status;
        }

        if (appState === 'running' || appState === 'starting') {
          lastDismissedErrorAppRef.current = null;
        }

        setCurrentApp(status);

        const isAppActive = appState === 'running' || appState === 'starting';
        const isAppFinished =
          appState === 'done' || appState === 'stopping' || appState === 'error';

        if (isAppActive && !hasError) {
          if (errorClearTimerRef.current) {
            clearTimeout(errorClearTimerRef.current);
            errorClearTimerRef.current = null;
          }
          if (!store.isAppRunning || store.currentAppName !== appName) {
            (store.lockForApp as (name: string) => void)(appName);
          }
        } else if (isAppFinished || hasError) {
          if (store.isAppRunning) {
            let logMessage: string;
            if (hasError) {
              logMessage = `${appName} crashed: ${status.error}`;
            } else if (appState === 'error') {
              logMessage = `${appName} error state`;
            } else if (appState === 'done') {
              logMessage = `${appName} completed`;
            } else if (appState === 'stopping') {
              logMessage = `${appName} stopping`;
            } else {
              logMessage = `${appName} stopped (${appState})`;
            }

            logger.info(logMessage);
            (store.unlockApp as () => void)();
          }

          if (appState === 'done') {
            setCurrentApp(null);
            (store.closeEmbeddedApp as () => void)();
          } else if (appState === 'error') {
            closeAppWindow(appName).catch(() => {});
            (store.closeEmbeddedApp as () => void)();

            if (!errorClearTimerRef.current) {
              errorClearTimerRef.current = setTimeout(() => {
                lastDismissedErrorAppRef.current = appName;
                setCurrentApp(null);
                errorClearTimerRef.current = null;
              }, APP_ERROR_DISPLAY_DURATION_MS);
            }
          }
        }
      } else {
        setCurrentApp(null);

        if (store.isAppRunning && store.busyReason === 'app-running') {
          const lastAppName = (store.currentAppName as string) || 'unknown';

          if (lastAppName !== 'unknown') {
            closeAppWindow(lastAppName).catch(() => {});
          }
          (store.closeEmbeddedApp as () => void)();

          logger.warning(`App ${lastAppName} stopped unexpectedly`);
          (store.unlockApp as () => void)();
        }
      }

      return status;
    } catch {
      return null;
    }
  }, [setCurrentApp, logger]);

  const installApp = useCallback(
    async (appInfo: AppInfo): Promise<string> => {
      try {
        const response = await fetchWithTimeout(
          buildApiUrl('/api/apps/install'),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(appInfo),
          },
          DAEMON_CONFIG.TIMEOUTS.APP_INSTALL,
          { label: `Install ${appInfo.name}` }
        );

        if (!response.ok) {
          if (response.status === 403 || response.status === 401) {
            const permissionError = new Error(
              'Permission denied: System may have blocked the installation'
            );
            permissionError.name = 'PermissionDeniedError';
            throw permissionError;
          }
          throw new Error(`Installation failed: ${response.status}`);
        }

        const result = (await response.json()) as { job_id?: string } & Record<string, unknown>;
        const jobId = result.job_id || Object.keys(result)[0];

        if (!jobId) {
          throw new Error('No job_id returned from API');
        }

        createJob(jobId, 'install', appInfo.name, appInfo, setActiveJobs, startJobPollingRef);

        return jobId;
      } catch (err) {
        console.error('❌ Installation error:', err);

        const permissionErr = handlePermissionError(
          err as Error,
          'install',
          appInfo.name,
          logger,
          setAppsError
        );
        if (permissionErr) throw permissionErr;

        const error = err as Error;
        logger.error(`Failed to start install ${appInfo.name} (${error.message})`);
        setAppsError(error.message);
        throw err;
      }
    },
    [setActiveJobs, logger, setAppsError]
  );

  const removeApp = useCallback(
    async (appName: string): Promise<string> => {
      try {
        const response = await fetchWithTimeout(
          buildApiUrl(`/api/apps/remove/${encodeURIComponent(appName)}`),
          { method: 'POST' },
          DAEMON_CONFIG.TIMEOUTS.APP_REMOVE,
          { label: `Uninstall ${appName}` }
        );

        if (!response.ok) {
          if (response.status === 403 || response.status === 401) {
            const permissionError = new Error(
              'Permission denied: System may have blocked the removal'
            );
            permissionError.name = 'PermissionDeniedError';
            throw permissionError;
          }
          throw new Error(`Removal failed: ${response.status}`);
        }

        const result = (await response.json()) as { job_id?: string } & Record<string, unknown>;
        const jobId = result.job_id || Object.keys(result)[0];

        if (!jobId) {
          throw new Error('No job_id returned from API');
        }

        createJob(jobId, 'remove', appName, null, setActiveJobs, startJobPollingRef);

        return jobId;
      } catch (err) {
        console.error('❌ Removal error:', err);

        const permissionErr = handlePermissionError(
          err as Error,
          'remove',
          appName,
          logger,
          setAppsError
        );
        if (permissionErr) throw permissionErr;

        const error = err as Error;
        logger.error(`Failed to start uninstall ${appName} (${error.message})`);
        setAppsError(error.message);
        throw err;
      }
    },
    [setActiveJobs, logger, setAppsError]
  );

  const startApp = useCallback(
    async (appName: string): Promise<unknown> => {
      if (errorClearTimerRef.current) {
        clearTimeout(errorClearTimerRef.current);
        errorClearTimerRef.current = null;
      }
      setCurrentApp(null);

      try {
        await fetchWithTimeout(
          buildApiUrl('/api/apps/stop-current-app'),
          { method: 'POST' },
          DAEMON_CONFIG.TIMEOUTS.APP_STOP,
          { silent: true }
        );
      } catch {
        // Expected when no app was running - safe to ignore
      }

      try {
        const response = await fetchWithTimeout(
          buildApiUrl(`/api/apps/start-app/${encodeURIComponent(appName)}`),
          { method: 'POST' },
          DAEMON_CONFIG.TIMEOUTS.APP_START,
          { label: `Start ${appName}` }
        );

        if (!response.ok) {
          throw new Error(`Failed to start app: ${response.status}`);
        }

        const status = await response.json();

        fetchCurrentAppStatus();

        return status;
      } catch (err) {
        const error = err as Error;
        console.error('❌ Failed to start app:', err);
        logger.error(`Failed to start ${appName} (${error.message})`);
        setAppsError(error.message);
        throw err;
      }
    },
    [fetchCurrentAppStatus, logger, setAppsError, setCurrentApp]
  );

  const stopCurrentApp = useCallback(async (): Promise<unknown> => {
    const setIsStoppingAppFn = (useAppStore.getState() as unknown as AnyRecord).setIsStoppingApp as
      | ((v: boolean) => void)
      | undefined;
    if (setIsStoppingAppFn) {
      setIsStoppingAppFn(true);
    }

    try {
      const response = await fetchWithTimeout(
        buildApiUrl('/api/apps/stop-current-app'),
        { method: 'POST' },
        DAEMON_CONFIG.TIMEOUTS.APP_STOP,
        { label: 'Stop current app' }
      );

      if (!response.ok) {
        throw new Error(`Failed to stop app: ${response.status}`);
      }

      const message = await response.json();

      const storeState = useAppStore.getState() as unknown as AnyRecord;
      const appInfo = (storeState.currentApp as CurrentAppStatus | null)?.info;
      if (appInfo?.name) {
        closeAppWindow(appInfo.name).catch(() => {});
      }
      (storeState.closeEmbeddedApp as () => void)();

      setCurrentApp(null);

      (storeState.unlockApp as () => void)();

      ((useAppStore.getState() as unknown as AnyRecord).setIsStoppingApp as (v: boolean) => void)(
        false
      );

      setTimeout(() => fetchCurrentAppStatus(), DAEMON_CONFIG.INTERVALS.CURRENT_APP_REFRESH);

      return message;
    } catch (err) {
      const error = err as Error;
      console.error('❌ Failed to stop app:', err);
      logger.error(`Failed to stop app (${error.message})`);
      setAppsError(error.message);
      ((useAppStore.getState() as unknown as AnyRecord).unlockApp as () => void)();
      ((useAppStore.getState() as unknown as AnyRecord).setIsStoppingApp as (v: boolean) => void)(
        false
      );
      throw err;
    }
  }, [fetchCurrentAppStatus, setCurrentApp, logger, setAppsError]);

  useEffect(() => {
    return () => {
      cleanupJobs();
      if (errorClearTimerRef.current) {
        clearTimeout(errorClearTimerRef.current);
        errorClearTimerRef.current = null;
      }
    };
  }, [cleanupJobs]);

  const isFirstActiveRef = useRef<boolean>(true);

  const isWindowVisible = useWindowVisible();

  useEffect(() => {
    if (!isActive || !isWindowVisible) {
      if (!isActive) isFirstActiveRef.current = true;
      return;
    }

    fetchAvailableApps(false);

    fetchCurrentAppStatus();
    const interval = setInterval(fetchCurrentAppStatus, DAEMON_CONFIG.INTERVALS.APP_STATUS);

    return () => clearInterval(interval);
  }, [isActive, isWindowVisible, fetchAvailableApps, fetchCurrentAppStatus]);

  return {
    availableApps,
    installedApps,
    currentApp,
    activeJobs,
    isLoading: appsLoading,
    error: appsError,
    isStoppingApp,

    fetchAvailableApps,
    installApp,
    removeApp,
    startApp,
    stopCurrentApp,
    fetchCurrentAppStatus,
    startJobPolling,
    invalidateCache: invalidateAppsCache,

    checkForUpdates,
    hasUpdate,
    getAppUpdateStatus,
    triggerUpdate,
    isCheckingUpdates,
    hasCheckedOnce,
  };
}
