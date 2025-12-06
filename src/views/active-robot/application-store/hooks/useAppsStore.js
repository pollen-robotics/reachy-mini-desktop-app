import { useEffect, useCallback, useRef, useMemo } from 'react';
import useAppStore from '@store/useAppStore';
import { DAEMON_CONFIG, fetchWithTimeout, buildApiUrl } from '@config/daemon';
import { useAppFetching } from './useAppFetching';
import { useAppEnrichment } from './useAppEnrichment';
import { useAppJobs } from './useAppJobs';

/**
 * ✅ DRY: Helper to handle permission errors consistently
 */
const handlePermissionError = (err, action, appName, addFrontendLog, setAppsError) => {
  if (err.name === 'PermissionDeniedError' || err.name === 'SystemPopupTimeoutError') {
    const userMessage = err.name === 'PermissionDeniedError'
      ? `Permission denied: Please accept system permissions to ${action} ${appName}`
      : `System permission popup detected: Please accept permissions to continue ${action} ${appName}`;
    
    addFrontendLog(`🔒 ${userMessage}`);
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
const createJob = (jobId, jobType, appName, appInfo, setActiveJobs, startJobPollingRef) => {
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
export function useAppsStore(isActive, official = true) {
  const appStore = useAppStore();
  const {
    availableApps,
    installedApps,
    currentApp,
    activeJobs: activeJobsObj, // Store uses Object, we convert to Map for convenience
    appsLoading,
    appsError,
    appsLastFetch,
    appsOfficialMode,
    appsCacheValid,
    setAvailableApps,
    setInstalledApps,
    setCurrentApp,
    setActiveJobs,
    setAppsLoading,
    setAppsError,
    setAppsOfficialMode,
    invalidateAppsCache,
    clearApps,
    addFrontendLog,
  } = appStore;
  
  // ✅ OPTIMIZED: Convert activeJobs Object to Map with useMemo to avoid re-creation on every render
  const activeJobs = useMemo(() => {
    return new Map(Object.entries(activeJobsObj || {}));
  }, [activeJobsObj]);
  
  // Specialized hooks
  const { fetchOfficialApps, fetchAllAppsFromDaemon, fetchInstalledApps } = useAppFetching();
  const { enrichApps } = useAppEnrichment();
  
  // Track if we're currently fetching to avoid duplicate fetches
  const isFetchingRef = useRef(false);
  
  // Cache duration: 30 seconds (apps don't change that often)
  const CACHE_DURATION = 30000;
  
  /**
   * Check if cache is still valid
   */
  const isCacheValid = useCallback(() => {
    if (!appsCacheValid || !appsLastFetch) return false;
    const age = Date.now() - appsLastFetch;
    return age < CACHE_DURATION;
  }, [appsCacheValid, appsLastFetch]);
  
  /**
   * Fetch all available apps
   * Combines apps from Hugging Face dataset with installed apps from daemon
   * Uses cache if available and valid
   * @param {boolean} forceRefresh - Force refresh even if cache is valid
   */
  const fetchAvailableApps = useCallback(async (forceRefresh = false) => {
    // Prevent duplicate fetches
    if (isFetchingRef.current) {
      console.log('⏭️ Fetch already in progress, skipping...');
      return availableApps;
    }
    
    // Check if mode changed (need to refetch)
    const modeChanged = appsOfficialMode !== official;
    if (modeChanged) {
      console.log(`🔄 Mode changed: ${appsOfficialMode} → ${official}, forcing refresh`);
      invalidateAppsCache();
      setAppsOfficialMode(official);
      // Continue to fetch with new mode (don't use cache)
    }
    
    // ✅ IMPROVED: Don't use cache if it's empty (prevents showing empty list when apps exist)
    // Use cache if valid and not forcing refresh and mode hasn't changed
    if (!forceRefresh && !modeChanged && isCacheValid() && availableApps.length > 0) {
      console.log('✅ Using cached apps (valid for', Math.round((CACHE_DURATION - (Date.now() - appsLastFetch)) / 1000), 's)');
      return availableApps;
    }
    
    // ✅ IMPROVED: If cache is empty, force refresh to avoid showing empty list
    if (!forceRefresh && !modeChanged && isCacheValid() && availableApps.length === 0) {
      console.log('⚠️ Cache is empty, forcing refresh to fetch apps');
      // Continue to fetch below
    }
    
    try {
      isFetchingRef.current = true;
      setAppsLoading(true);
      setAppsError(null);
      
      let daemonApps = [];
      let installedAppsFromDaemon = [];
      let installedAppsError = null;
      
      if (official) {
        // Fetch official apps from HF official app store JSON
        console.log(`🔄 Fetching official apps from HF app store`);
        daemonApps = await fetchOfficialApps();
        console.log(`✅ Fetched ${daemonApps.length} official apps from HF app store`);
        
        // Also fetch installed apps from daemon
        const installedResult = await fetchInstalledApps();
        installedAppsFromDaemon = installedResult.apps || [];
        installedAppsError = installedResult.error;
        
        if (installedAppsError) {
          console.warn(`⚠️ Error fetching installed apps: ${installedAppsError}`);
          // Don't fail completely - continue with empty installed list
          // This allows official apps to still be marked as installed if they're in the daemon
        }
      } else {
        // Fetch all apps from daemon
        console.log(`🔄 Fetching all apps from daemon`);
        daemonApps = await fetchAllAppsFromDaemon();
      }
      
      // Create a set of installed app names for fast lookup
      const installedAppNames = new Set(
        installedAppsFromDaemon.map(app => app.name?.toLowerCase()).filter(Boolean)
      );
      
      console.log(`🔍 DEBUG: installedAppsFromDaemon count: ${installedAppsFromDaemon.length}`);
      console.log(`🔍 DEBUG: installedAppNames Set:`, Array.from(installedAppNames));
      console.log(`🔍 DEBUG: installedAppsFromDaemon:`, installedAppsFromDaemon.map(app => ({ name: app.name, source_kind: app.source_kind })));
      
      // For official mode: Only add installed apps that are NOT official
      // Official apps are ALWAYS in the list (from fetchOfficialApps)
      // We just mark them as installed if they're in installedAppsFromDaemon
      if (official && installedAppsFromDaemon.length > 0) {
        const daemonAppNames = new Set(daemonApps.map(app => app.name?.toLowerCase()));
        const uniqueInstalledApps = installedAppsFromDaemon
          .filter(installedApp => !daemonAppNames.has(installedApp.name?.toLowerCase()))
          .map(installedApp => ({
            ...installedApp,
            source_kind: installedApp.source_kind || 'local',
          }));
        
        console.log(`🔍 DEBUG: uniqueInstalledApps (non-official):`, uniqueInstalledApps.map(app => ({ name: app.name, source_kind: app.source_kind })));
        
        // Only add non-official installed apps
        daemonApps = [...daemonApps, ...uniqueInstalledApps];
      }
      
      console.log(`🔍 DEBUG: daemonApps before enrichment: ${daemonApps.length} apps`);
      
      // Enrich apps with Hugging Face metadata
      const { enrichedApps, installed, available } = await enrichApps(daemonApps, installedAppNames);
      
      console.log(`🔍 DEBUG: After enrichment - installed: ${installed.length}, available: ${available.length}`);
      console.log(`🔍 DEBUG: installed apps details:`, installed.map(app => ({ name: app.name, isInstalled: app.isInstalled, source_kind: app.source_kind })));
      
      // Update store
      setAvailableApps(enrichedApps);
      setInstalledApps(installed);
      setAppsLoading(false);
      
      // ✅ IMPROVED: Log error if installed apps fetch failed but continue
      if (installedAppsError) {
        console.warn(`⚠️ Installed apps fetch had errors but continuing with available data: ${installedAppsError}`);
        // Don't set appsError here - it's not critical, we can still show apps
      }
      
      console.log(`✅ Apps fetched and stored in global store: ${enrichedApps.length} total, ${installed.length} installed`);
      
      return enrichedApps;
    } catch (err) {
      console.error('❌ Failed to fetch apps:', err);
      setAppsError(err.message);
      setAppsLoading(false);
      return availableApps; // Return cached apps on error
    } finally {
      isFetchingRef.current = false;
    }
  }, [
    official,
    appsOfficialMode,
    availableApps,
    appsLastFetch,
    isCacheValid,
    fetchOfficialApps,
    fetchAllAppsFromDaemon,
    fetchInstalledApps,
    enrichApps,
    setAvailableApps,
    setInstalledApps,
    setAppsLoading,
    setAppsError,
    setAppsOfficialMode,
  ]);
  
  // Store fetch function in ref for useAppJobs
  const fetchAvailableAppsRef = useRef(null);
  fetchAvailableAppsRef.current = fetchAvailableApps;
  
  // Initialize job management hook EARLY (before installApp/removeApp)
  const { startJobPolling, stopJobPolling, cleanup: cleanupJobs } = useAppJobs(
    setActiveJobs, 
    () => {
      if (fetchAvailableAppsRef.current) {
        fetchAvailableAppsRef.current(true); // Force refresh after job completion
      }
    }
  );
  
  // Store startJobPolling in ref for use in installApp/removeApp
  const startJobPollingRef = useRef(startJobPolling);
  startJobPollingRef.current = startJobPolling;
  
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
        setCurrentApp(status);
        
        const appState = status.state;
        const appName = status.info.name;
        const hasError = !!status.error;
        
        // ✅ Production-grade state handling based on API schema
        const isAppActive = appState === 'running' || appState === 'starting';
        const isAppFinished = appState === 'done' || appState === 'stopping' || appState === 'error';
        
        if (isAppActive && !hasError) {
          // ✅ App is active (starting or running): ensure store is locked
          if (!store.isAppRunning || store.currentAppName !== appName) {
            store.lockForApp(appName);
          }
        } else if (isAppFinished || hasError) {
          // ✅ App is finished/crashed/stopping: unlock if locked
          if (store.isAppRunning) {
            let logMessage;
            if (hasError) {
              logMessage = `❌ ${appName} crashed: ${status.error}`;
            } else if (appState === 'error') {
              logMessage = `❌ ${appName} error state`;
            } else if (appState === 'done') {
              logMessage = `✓ ${appName} completed`;
            } else if (appState === 'stopping') {
              logMessage = `⏹️ ${appName} stopping`;
            } else {
              logMessage = `⚠️ ${appName} stopped (${appState})`;
            }
            
            console.warn(`⚠️ App ${appName} state changed to ${appState}${hasError ? ` with error: ${status.error}` : ''}`);
            store.addFrontendLog(logMessage);
            store.unlockApp();
          }
        }
      } else {
        // ✅ No app running (status is null or incomplete): unlock if locked (crash detection)
        setCurrentApp(null);
        
        if (store.isAppRunning && store.busyReason === 'app-running') {
          const lastAppName = store.currentAppName || 'unknown';
          console.warn(`⚠️ App crash detected: currentApp is null but store thinks "${lastAppName}" is running`);
          store.addFrontendLog(`⚠️ App ${lastAppName} stopped unexpectedly`);
          store.unlockApp();
        }
      }
      
      return status;
    } catch (err) {
      // No error if no app running
      setCurrentApp(null);
      return null;
    }
  }, [setCurrentApp]);
  
  /**
   * Install an app (returns job_id)
   */
  const installApp = useCallback(async (appInfo) => {
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
          const permissionError = new Error('Permission denied: System may have blocked the installation');
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
      const permissionErr = handlePermissionError(err, 'install', appInfo.name, addFrontendLog, setAppsError);
      if (permissionErr) throw permissionErr;
      
      addFrontendLog(`❌ Failed to start install ${appInfo.name}: ${err.message}`);
      setAppsError(err.message);
      throw err;
    }
  }, [setActiveJobs, addFrontendLog, setAppsError]);
  
  /**
   * Uninstall an app (returns job_id)
   */
  const removeApp = useCallback(async (appName) => {
    try {
      const response = await fetchWithTimeout(
        buildApiUrl(`/api/apps/remove/${encodeURIComponent(appName)}`),
        { method: 'POST' },
        DAEMON_CONFIG.TIMEOUTS.APP_REMOVE,
        { label: `Uninstall ${appName}` } // ⚡ Automatic log
      );
      
      if (!response.ok) {
        if (response.status === 403 || response.status === 401) {
          const permissionError = new Error('Permission denied: System may have blocked the removal');
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
      const permissionErr = handlePermissionError(err, 'remove', appName, addFrontendLog, setAppsError);
      if (permissionErr) throw permissionErr;
      
      addFrontendLog(`❌ Failed to start uninstall ${appName}: ${err.message}`);
      setAppsError(err.message);
      throw err;
    }
  }, [setActiveJobs, addFrontendLog, setAppsError]);
  
  /**
   * Launch an app
   */
  const startApp = useCallback(async (appName) => {
    try {
      const response = await fetchWithTimeout(
        buildApiUrl(`/api/apps/start-app/${encodeURIComponent(appName)}`),
        { method: 'POST' },
        DAEMON_CONFIG.TIMEOUTS.APP_START,
        { label: `Start ${appName}` } // ⚡ Automatic log
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
      addFrontendLog(`❌ Failed to start ${appName}: ${err.message}`);
      setAppsError(err.message);
      throw err;
    }
  }, [fetchCurrentAppStatus, addFrontendLog, setAppsError]);
  
  /**
   * Stop current app
   */
  const stopCurrentApp = useCallback(async () => {
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
      
      // Reset state immediately
      setCurrentApp(null);
      
      // ✅ Unlock robot to allow quick actions
      useAppStore.getState().unlockApp();
      
      // Refresh to verify
      setTimeout(() => fetchCurrentAppStatus(), DAEMON_CONFIG.INTERVALS.CURRENT_APP_REFRESH);
      
      return message;
    } catch (err) {
      console.error('❌ Failed to stop app:', err);
      addFrontendLog(`❌ Failed to stop app: ${err.message}`);
      setAppsError(err.message);
      // ✅ Ensure unlock even on error
      useAppStore.getState().unlockApp();
      throw err;
    }
  }, [fetchCurrentAppStatus, setCurrentApp, addFrontendLog, setAppsError]);
  
  /**
   * Cleanup: stop all pollings on unmount
   */
  useEffect(() => {
    return cleanupJobs;
  }, [cleanupJobs]);
  
  // ✅ Track if this is the first time isActive becomes true (startup)
  const isFirstActiveRef = useRef(true);
  
  /**
   * Initial fetch + polling of current app status
   * Refetches when official changes or when daemon becomes active
   * ✅ IMPROVED: Adds delay on startup to avoid race condition with daemon
   * ✅ Cleans up currentApp when daemon becomes inactive
   */
  useEffect(() => {
    if (!isActive) {
      // ✅ Cleanup: If daemon becomes inactive, clear currentApp state
      setCurrentApp(null);
      clearApps(); // Clear apps when daemon is inactive
      isFirstActiveRef.current = true; // Reset flag when daemon becomes inactive
      return;
    }
    
    // ✅ IMPROVED: On first activation (startup), daemon is already verified by HardwareScanView
    // We can fetch apps immediately since healthcheck was done before transition
    const isFirstActivation = isFirstActiveRef.current;
    if (isFirstActivation) {
      isFirstActiveRef.current = false;
      console.log('🔄 Robot just became active, daemon healthcheck already verified, fetching apps...');
      
      // ✅ Daemon healthcheck was already done in HardwareScanView before transition
      // We can fetch apps immediately (retry logic in fetchInstalledApps will handle any edge cases)
      const modeChanged = appsOfficialMode !== official;
      if (modeChanged) {
        console.log(`🔄 Mode changed: ${appsOfficialMode} → ${official}, invalidating cache and refetching`);
        invalidateAppsCache();
        setAppsOfficialMode(official);
        fetchAvailableApps(true);
      } else {
        fetchAvailableApps(false);
      }
      
      // Start polling immediately
      fetchCurrentAppStatus();
      const interval = setInterval(fetchCurrentAppStatus, DAEMON_CONFIG.INTERVALS.APP_STATUS);
      
      return () => {
        clearInterval(interval);
      };
    }
    
    // ✅ If mode changed, invalidate cache and force refresh
    const modeChanged = appsOfficialMode !== official;
    if (modeChanged) {
      console.log(`🔄 Mode changed: ${appsOfficialMode} → ${official}, invalidating cache and refetching`);
      invalidateAppsCache();
      setAppsOfficialMode(official);
      fetchAvailableApps(true); // Force refresh when mode changes
    } else {
      // Fetch apps (will use cache if valid)
      fetchAvailableApps(false); // Don't force refresh on mount if cache is valid
    }
    
    fetchCurrentAppStatus();
    
    // Polling current app status
    const interval = setInterval(fetchCurrentAppStatus, DAEMON_CONFIG.INTERVALS.APP_STATUS);
    
    return () => clearInterval(interval);
  }, [isActive, official, appsOfficialMode, fetchAvailableApps, fetchCurrentAppStatus, setCurrentApp, clearApps, invalidateAppsCache, setAppsOfficialMode]);
  
  return {
    // Data from store
    availableApps,
    installedApps,
    currentApp,
    activeJobs,
    isLoading: appsLoading,
    error: appsError,
    
    // Actions
    fetchAvailableApps,
    installApp,
    removeApp,
    startApp,
    stopCurrentApp,
    fetchCurrentAppStatus,
    startJobPolling, // Expose for useAppHandlers
    invalidateCache: invalidateAppsCache,
  };
}

