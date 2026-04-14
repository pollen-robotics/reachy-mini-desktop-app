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

/**
 * ✅ DRY: Helper to handle permission errors consistently
 */
const handlePermissionError = (err, action, appName, logger, setAppsError) => {
  if (err.name === 'PermissionDeniedError' || err.name === 'SystemPopupTimeoutError') {
    const userMessage =
      err.name === 'PermissionDeniedError'
        ? `Permission denied: Please accept system permissions to ${action} ${appName}`
        : `System permission popup detected: Please accept permissions to continue ${action} ${appName}`;

    logger.warning(userMessage);
    setAppsError(userMessage);

    const userFriendlyError = new Error(userMessage);
    userFriendlyError.name = err.name;
    userFriendlyError.userFriendly = true;
    return userFriendlyError;
  }
  return null;
};

/**
 * ✅ DRY: Helper to create and track a job
 */
export const createJob = (jobId, jobType, appName, appInfo, setActiveJobs, startJobPollingRef) => {
  setActiveJobs(prev => {
    const updated = new Map(prev instanceof Map ? prev : new Map(Object.entries(prev || {})));
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

/**
 * ✅ REFACTORED: Centralized hook for apps management using global store
 *
 * This hook manages:
 * - Fetching apps from daemon/HF
 * - Storing apps in global store (shared across all components)
 * - Polling current app status
 * - Job management (install/remove)
 * - Cache management to avoid unnecessary refetches
 *
 * All components should use this hook instead of useApps directly.
 */
export function useAppsStore(isActive) {
  const logger = useLogger();
  const availableApps = useAppStore(s => s.availableApps);
  const installedApps = useAppStore(s => s.installedApps);
  const currentApp = useAppStore(s => s.currentApp);
  const activeJobsObj = useAppStore(s => s.activeJobs);
  const appsLoading = useAppStore(s => s.appsLoading);
  const appsError = useAppStore(s => s.appsError);
  const isStoppingApp = useAppStore(s => s.isStoppingApp);
  const setAvailableApps = useAppStore(s => s.setAvailableApps);
  const setInstalledApps = useAppStore(s => s.setInstalledApps);
  const setCurrentApp = useAppStore(s => s.setCurrentApp);
  const setActiveJobs = useAppStore(s => s.setActiveJobs);
  const setAppsLoading = useAppStore(s => s.setAppsLoading);
  const setAppsError = useAppStore(s => s.setAppsError);
  const invalidateAppsCache = useAppStore(s => s.invalidateAppsCache);

  // ✅ OPTIMIZED: Convert activeJobs Object to Map with useMemo to avoid re-creation on every render
  const activeJobs = useMemo(() => {
    return new Map(Object.entries(activeJobsObj || {}));
  }, [activeJobsObj]);

  // Specialized hooks
  const { fetchAppsFromWebsite, fetchInstalledApps } = useAppFetching();

  // Track if we're currently fetching to avoid duplicate fetches
  const isFetchingRef = useRef(false);

  // Timer for auto-clearing error state after display duration
  const errorClearTimerRef = useRef(null);

  // Track the last app whose error was auto-dismissed to prevent re-detection loop
  const lastDismissedErrorAppRef = useRef(null);

  // Cache duration: 1 day (apps don't change that often, filter client-side)
  const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Fetch ALL available apps from website API (single request)
   * Website API provides pre-enriched data with official/community flags
   * Uses cache if available and valid (1 day)
   * @param {boolean} forceRefresh - Force refresh even if cache is valid
   */
  const fetchAvailableApps = useCallback(
    async (forceRefresh = false) => {
      // Prevent duplicate fetches
      if (isFetchingRef.current) {
        return useAppStore.getState().availableApps;
      }

      // Read current state DIRECTLY from store (avoid stale closure issues)
      const storeState = useAppStore.getState();
      const currentAvailableApps = storeState.availableApps;
      const currentInstalledApps = storeState.installedApps;
      const currentCacheValid = storeState.appsCacheValid;
      const currentLastFetch = storeState.appsLastFetch;

      // Check cache validity using fresh store values
      const isCacheFresh =
        currentCacheValid && currentLastFetch && Date.now() - currentLastFetch < CACHE_DURATION;

      // Use cache if valid and not forcing refresh
      if (!forceRefresh && isCacheFresh && currentAvailableApps.length > 0) {
        // Re-check network status
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

        // ========================================
        // STEP 1: Fetch ALL apps from website API (single request!)
        // ========================================
        let availableAppsFromWebsite = [];
        let fetchError = null;

        try {
          availableAppsFromWebsite = await fetchAppsFromWebsite();
        } catch (err) {
          fetchError = err;
          console.error('❌ Failed to fetch apps from website:', err.message);
        }

        // ========================================
        // STEP 2: Fetch installed apps from daemon
        // ========================================
        const installedResult = await fetchInstalledApps();
        const installedAppsFromDaemon = installedResult.apps || [];

        if (installedResult.error) {
          console.warn(`⚠️ Error fetching installed apps: ${installedResult.error}`);
        }

        // Check for network issues
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

        // ========================================
        // STEP 3: Merge website + daemon apps
        // ========================================
        const { enrichedApps, installedApps: installed } = mergeAppsData(
          availableAppsFromWebsite,
          installedAppsFromDaemon
        );

        setAvailableApps(enrichedApps);
        setInstalledApps(installed);

        // When website fetch failed, we only have daemon (installed) apps.
        // Don't keep this as a valid cache - next fetch should retry from website.
        if (hasNetworkIssue) {
          invalidateAppsCache();
        }

        setAppsLoading(false);

        return enrichedApps;
      } catch (err) {
        console.error('❌ Failed to fetch apps:', err);
        setAppsError(err.message);
        setAppsLoading(false);
        return useAppStore.getState().availableApps;
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
    ]
  );

  // Store fetch function in ref for useAppJobs
  const fetchAvailableAppsRef = useRef(null);
  fetchAvailableAppsRef.current = fetchAvailableApps;

  // Initialize job management hook EARLY (before installApp/removeApp)
  const {
    startJobPolling,
    stopJobPolling,
    cleanup: cleanupJobs,
  } = useAppJobs(setActiveJobs, () => {
    if (fetchAvailableAppsRef.current) {
      return fetchAvailableAppsRef.current(true); // Force refresh after job completion
    }
  });

  // Store startJobPolling in ref for use in installApp/removeApp
  const startJobPollingRef = useRef(startJobPolling);
  startJobPollingRef.current = startJobPolling;

  // Initialize app updates hook
  const {
    checkForUpdates,
    hasUpdate,
    getAppUpdateStatus,
    triggerUpdate,
    isCheckingUpdates,
    hasCheckedOnce,
  } = useAppUpdates(isActive, installedApps, setActiveJobs, startJobPollingRef);

  /**
   * Fetch current app status
   * ✅ Automatically synchronizes with store to detect crashes and clean up state
   */
  const fetchCurrentAppStatus = useCallback(async () => {
    try {
      const response = await fetchWithTimeout(
        buildApiUrl('/api/apps/current-app-status'),
        {},
        DAEMON_CONFIG.TIMEOUTS.APPS_LIST,
        { silent: true } // ⚡ Silent polling
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch current app: ${response.status}`);
      }

      const status = await response.json();
      const store = useAppStore.getState();

      // ✅ API returns (object | null) - null when no app running
      // AppStatus structure: { info: { name, ... }, state: AppState, error?: string }
      // AppState enum: "starting" | "running" | "done" | "stopping" | "error"

      if (status && status.info && status.state) {
        const appState = status.state;
        const appName = status.info.name;
        const hasError = !!status.error;

        // Skip re-detection of an already-dismissed error for the same app
        // to prevent the 12s oscillation loop (setCurrentApp → timer null → poll → repeat)
        if (appState === 'error' && appName === lastDismissedErrorAppRef.current) {
          return status;
        }

        // Clear dismissed flag when a healthy state or different app is detected
        if (appState === 'running' || appState === 'starting') {
          lastDismissedErrorAppRef.current = null;
        }

        setCurrentApp(status);

        // ✅ Production-grade state handling based on API schema
        const isAppActive = appState === 'running' || appState === 'starting';
        const isAppFinished =
          appState === 'done' || appState === 'stopping' || appState === 'error';

        if (isAppActive && !hasError) {
          // App is active: cancel any pending error-clear timer
          if (errorClearTimerRef.current) {
            clearTimeout(errorClearTimerRef.current);
            errorClearTimerRef.current = null;
          }
          // App is active (starting or running): ensure store is locked
          if (!store.isAppRunning || store.currentAppName !== appName) {
            store.lockForApp(appName);
          }
        } else if (isAppFinished || hasError) {
          if (store.isAppRunning) {
            let logMessage;
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
            store.unlockApp();
          }

          if (appState === 'done') {
            setCurrentApp(null);
            store.closeEmbeddedApp();
          } else if (appState === 'error') {
            // Keep error visible in the UI; close the dead Tauri window
            closeAppWindow(appName).catch(() => {});
            store.closeEmbeddedApp();

            // Auto-clear the error after a delay so the user can launch another app
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
        // No app running (status is null or incomplete): unlock if locked (crash detection)
        setCurrentApp(null);

        if (store.isAppRunning && store.busyReason === 'app-running') {
          const lastAppName = store.currentAppName || 'unknown';

          // Close the dead Tauri window / embedded view if one was open
          if (lastAppName !== 'unknown') {
            closeAppWindow(lastAppName).catch(() => {});
          }
          store.closeEmbeddedApp();

          logger.warning(`App ${lastAppName} stopped unexpectedly`);
          store.unlockApp();
        }
      }

      return status;
    } catch (err) {
      // Network error: keep last known currentApp state.
      // Daemon crashes are detected separately by the health check system
      // (CRASH_DETECTION.MAX_TIMEOUTS), which triggers resetAll().
      return null;
    }
  }, [setCurrentApp]);

  /**
   * Install an app (returns job_id)
   */
  const installApp = useCallback(
    async appInfo => {
      try {
        const response = await fetchWithTimeout(
          buildApiUrl('/api/apps/install'),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(appInfo),
          },
          DAEMON_CONFIG.TIMEOUTS.APP_INSTALL,
          { label: `Install ${appInfo.name}` } // ⚡ Automatic log
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

        const result = await response.json();
        const jobId = result.job_id || Object.keys(result)[0];

        if (!jobId) {
          throw new Error('No job_id returned from API');
        }

        // ✅ DRY: Use helper to create job
        createJob(jobId, 'install', appInfo.name, appInfo, setActiveJobs, startJobPollingRef);

        return jobId;
      } catch (err) {
        console.error('❌ Installation error:', err);

        // ✅ DRY: Use helper for permission errors
        const permissionErr = handlePermissionError(
          err,
          'install',
          appInfo.name,
          logger,
          setAppsError
        );
        if (permissionErr) throw permissionErr;

        logger.error(`Failed to start install ${appInfo.name} (${err.message})`);
        setAppsError(err.message);
        throw err;
      }
    },
    [setActiveJobs, logger, setAppsError]
  );

  /**
   * Uninstall an app (returns job_id)
   */
  const removeApp = useCallback(
    async appName => {
      try {
        const response = await fetchWithTimeout(
          buildApiUrl(`/api/apps/remove/${encodeURIComponent(appName)}`),
          { method: 'POST' },
          DAEMON_CONFIG.TIMEOUTS.APP_REMOVE,
          { label: `Uninstall ${appName}` } // ⚡ Automatic log
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

        const result = await response.json();
        const jobId = result.job_id || Object.keys(result)[0];

        if (!jobId) {
          throw new Error('No job_id returned from API');
        }

        // ✅ DRY: Use helper to create job
        createJob(jobId, 'remove', appName, null, setActiveJobs, startJobPollingRef);

        return jobId;
      } catch (err) {
        console.error('❌ Removal error:', err);

        // ✅ DRY: Use helper for permission errors
        const permissionErr = handlePermissionError(err, 'remove', appName, logger, setAppsError);
        if (permissionErr) throw permissionErr;

        logger.error(`Failed to start uninstall ${appName} (${err.message})`);
        setAppsError(err.message);
        throw err;
      }
    },
    [setActiveJobs, logger, setAppsError]
  );

  /**
   * Launch an app
   */
  const startApp = useCallback(
    async appName => {
      // Cancel any lingering error-display timer from a previous crash
      if (errorClearTimerRef.current) {
        clearTimeout(errorClearTimerRef.current);
        errorClearTimerRef.current = null;
      }
      setCurrentApp(null);

      // Clean up any previous app on the daemon (e.g. crashed app still in ERROR state).
      // The daemon considers ERROR as "running", so start-app would 400 without this.
      try {
        await fetchWithTimeout(
          buildApiUrl('/api/apps/stop-current-app'),
          { method: 'POST' },
          DAEMON_CONFIG.TIMEOUTS.APP_STOP,
          { silent: true }
        );
      } catch {
        // Expected when no app was running — safe to ignore
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

        // Refresh current app status
        fetchCurrentAppStatus();

        return status;
      } catch (err) {
        console.error('❌ Failed to start app:', err);
        logger.error(`Failed to start ${appName} (${err.message})`);
        setAppsError(err.message);
        throw err;
      }
    },
    [fetchCurrentAppStatus, logger, setAppsError]
  );

  /**
   * Stop current app
   * ✅ Sets isStoppingApp immediately for UI feedback (spinner on button)
   */
  const stopCurrentApp = useCallback(async () => {
    // ✅ Set stopping state immediately for UI feedback
    useAppStore.getState().setIsStoppingApp(true);

    try {
      const response = await fetchWithTimeout(
        buildApiUrl('/api/apps/stop-current-app'),
        { method: 'POST' },
        DAEMON_CONFIG.TIMEOUTS.APP_STOP,
        { label: 'Stop current app' } // ⚡ Automatic log
      );

      if (!response.ok) {
        throw new Error(`Failed to stop app: ${response.status}`);
      }

      const message = await response.json();

      // Close the app's Tauri window / embedded view if it was open
      const appInfo = useAppStore.getState().currentApp?.info;
      if (appInfo?.name) {
        closeAppWindow(appInfo.name).catch(() => {});
      }
      useAppStore.getState().closeEmbeddedApp();

      // Reset state immediately
      setCurrentApp(null);

      // ✅ Unlock robot to allow quick actions
      useAppStore.getState().unlockApp();

      // ✅ Clear stopping state
      useAppStore.getState().setIsStoppingApp(false);

      // Refresh to verify
      setTimeout(() => fetchCurrentAppStatus(), DAEMON_CONFIG.INTERVALS.CURRENT_APP_REFRESH);

      return message;
    } catch (err) {
      console.error('❌ Failed to stop app:', err);
      logger.error(`Failed to stop app (${err.message})`);
      setAppsError(err.message);
      // ✅ Ensure unlock even on error
      useAppStore.getState().unlockApp();
      // ✅ Clear stopping state even on error
      useAppStore.getState().setIsStoppingApp(false);
      throw err;
    }
  }, [fetchCurrentAppStatus, setCurrentApp, logger, setAppsError]);

  /**
   * Cleanup: stop all pollings on unmount
   */
  useEffect(() => {
    return () => {
      cleanupJobs();
      if (errorClearTimerRef.current) {
        clearTimeout(errorClearTimerRef.current);
        errorClearTimerRef.current = null;
      }
    };
  }, [cleanupJobs]);

  // ✅ Track if this is the first time isActive becomes true (startup)
  const isFirstActiveRef = useRef(true);

  /**
   * Initial fetch + polling of current app status
   * ✅ SIMPLIFIED: Fetches ALL apps once, filtering is done client-side
   * Cache is valid for 1 day - no refetch when switching official/community mode
   *
   * NOTE: We do NOT call clearApps() here anymore. The apps are pre-fetched in
   * HardwareScanView and stored globally. Clearing should only happen on actual
   * daemon disconnect (handled by transitionTo.disconnected), not when components unmount.
   */
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
    // Data from store
    availableApps,
    installedApps,
    currentApp,
    activeJobs,
    isLoading: appsLoading,
    error: appsError,
    isStoppingApp,

    // Actions
    fetchAvailableApps,
    installApp,
    removeApp,
    startApp,
    stopCurrentApp,
    fetchCurrentAppStatus,
    startJobPolling, // Expose for useAppHandlers
    invalidateCache: invalidateAppsCache,

    // Update-related
    checkForUpdates,
    hasUpdate,
    getAppUpdateStatus,
    triggerUpdate,
    isCheckingUpdates,
    hasCheckedOnce,
  };
}
