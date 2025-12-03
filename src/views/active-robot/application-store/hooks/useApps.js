import { useState, useEffect, useCallback, useRef } from 'react';
import useAppStore from '@store/useAppStore';
import { DAEMON_CONFIG, fetchWithTimeout, buildApiUrl } from '@config/daemon';
import { useAppFetching } from './useAppFetching';
import { useAppEnrichment } from './useAppEnrichment';
import { useAppJobs } from './useAppJobs';

/**
 * Hook to manage applications (list, installation, launch)
 * Integrated with the FastAPI daemon API
 * 
 * Refactored to use specialized hooks for fetching, enrichment, and job management
 */
export function useApps(isActive, official = true) {
  const appStore = useAppStore();
  const { addFrontendLog } = appStore;
  const [availableApps, setAvailableApps] = useState([]);
  const [installedApps, setInstalledApps] = useState([]);
  const [currentApp, setCurrentApp] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Active jobs (installations/uninstallations)
  const [activeJobs, setActiveJobs] = useState(new Map()); // job_id -> { type: 'install'/'remove', appName, status, logs }
  
  // Specialized hooks
  const { fetchOfficialApps, fetchAllAppsFromDaemon, fetchInstalledApps } = useAppFetching();
  const { enrichApps } = useAppEnrichment();
  
  // Create a ref to store the fetch function for useAppJobs
  const fetchAvailableAppsRef = useRef(null);
  
  /**
   * Fetch all available apps
   * Combines apps from Hugging Face dataset with installed apps from daemon
   * @param {boolean} officialParam - If true, fetch only official apps directly from HF. If false, fetch all apps from daemon.
   */
  const fetchAvailableApps = useCallback(async (officialParam = official) => {
    try {
      setIsLoading(true);
      
      let daemonApps = [];
      let installedAppsFromDaemon = [];
      
      if (officialParam) {
        // Fetch official apps from HF official app store JSON
        console.log(`🔄 Fetching official apps from HF app store`);
        daemonApps = await fetchOfficialApps();
        console.log(`✅ Fetched ${daemonApps.length} official apps from HF app store`);
        
        // Also fetch installed apps from daemon
        installedAppsFromDaemon = await fetchInstalledApps();
      } else {
        // Fetch all apps from daemon
        console.log(`🔄 Fetching all apps from daemon`);
        daemonApps = await fetchAllAppsFromDaemon();
      }
      
      // Create a set of installed app names for fast lookup
      const installedAppNames = new Set(
        installedAppsFromDaemon.map(app => app.name?.toLowerCase()).filter(Boolean)
      );
      
      // For official mode: Only add installed apps that are NOT official
      // Official apps are ALWAYS in the list (from fetchOfficialApps)
      // We just mark them as installed if they're in installedAppsFromDaemon
      if (officialParam && installedAppsFromDaemon.length > 0) {
        const daemonAppNames = new Set(daemonApps.map(app => app.name?.toLowerCase()));
        const uniqueInstalledApps = installedAppsFromDaemon
          .filter(installedApp => !daemonAppNames.has(installedApp.name?.toLowerCase()))
          .map(installedApp => ({
            ...installedApp,
            source_kind: installedApp.source_kind || 'local',
          }));
        
        // Only add non-official installed apps
        daemonApps = [...daemonApps, ...uniqueInstalledApps];
      }
      
      // Enrich apps with Hugging Face metadata
      const { enrichedApps, installed, available } = await enrichApps(daemonApps, installedAppNames);
      
      setAvailableApps(enrichedApps);
      setInstalledApps(installed);
      setIsLoading(false);
      return enrichedApps;
    } catch (err) {
      console.error('❌ Failed to fetch apps:', err);
      setError(err.message);
      setIsLoading(false);
      return [];
    }
  }, [official, fetchOfficialApps, fetchAllAppsFromDaemon, fetchInstalledApps, enrichApps]);
  
  // Store fetch function in ref for useAppJobs
  fetchAvailableAppsRef.current = fetchAvailableApps;
  
  // Initialize job management hook (after fetchAvailableApps is defined)
  const { startJobPolling, stopJobPolling, cleanup: cleanupJobs } = useAppJobs(
    setActiveJobs, 
    () => {
      if (fetchAvailableAppsRef.current) {
        fetchAvailableAppsRef.current();
      }
    }
  );
  
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
        // Check if it's a permission error
        if (response.status === 403 || response.status === 401) {
          const permissionError = new Error('Permission denied: System may have blocked the installation');
          permissionError.name = 'PermissionDeniedError';
          throw permissionError;
        }
        throw new Error(`Installation failed: ${response.status}`);
      }
      
      const result = await response.json();
      
      // Result can be {"job_id": "xxx"} or {"uuid": ...}
      const jobId = result.job_id || Object.keys(result)[0];
      
      if (!jobId) {
        throw new Error('No job_id returned from API');
      }
      
      // Add job to tracking
      setActiveJobs(prev => new Map(prev).set(jobId, {
        type: 'install',
        appName: appInfo.name,
        appInfo,
        status: 'running', // Start directly in "running" for UI
        logs: [],
      }));
      
      // Start job polling
      startJobPolling(jobId);
      
      return jobId;
    } catch (err) {
      console.error('❌ Installation error:', err);
      
      // Specific handling of permission errors
      if (err.name === 'PermissionDeniedError' || err.name === 'SystemPopupTimeoutError') {
        const userMessage = err.name === 'PermissionDeniedError'
          ? `Permission denied: Please accept system permissions to install ${appInfo.name}`
          : `System permission popup detected: Please accept permissions to continue installing ${appInfo.name}`;
        
        addFrontendLog(`🔒 ${userMessage}`);
        setError(userMessage);
        
        // Create error with clear user message
        const userFriendlyError = new Error(userMessage);
        userFriendlyError.name = err.name;
        userFriendlyError.userFriendly = true;
        throw userFriendlyError;
      }
      
      // Standard error
      addFrontendLog(`❌ Failed to start install ${appInfo.name}: ${err.message}`);
      setError(err.message);
      throw err;
    }
  }, [startJobPolling, addFrontendLog]);
  
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
        // Check if it's a permission error
        if (response.status === 403 || response.status === 401) {
          const permissionError = new Error('Permission denied: System may have blocked the removal');
          permissionError.name = 'PermissionDeniedError';
          throw permissionError;
        }
        throw new Error(`Removal failed: ${response.status}`);
      }
      
      const result = await response.json();
      
      // Result can be {"job_id": "xxx"} or {"uuid": ...}
      const jobId = result.job_id || Object.keys(result)[0];
      
      if (!jobId) {
        throw new Error('No job_id returned from API');
      }
      
      // Add job to tracking
      setActiveJobs(prev => new Map(prev).set(jobId, {
        type: 'remove',
        appName,
        status: 'running', // Start directly in "running" for UI
        logs: [],
      }));
      
      // Start job polling
      startJobPolling(jobId);
      
      return jobId;
    } catch (err) {
      console.error('❌ Removal error:', err);
      
      // Specific handling of permission errors
      if (err.name === 'PermissionDeniedError' || err.name === 'SystemPopupTimeoutError') {
        const userMessage = err.name === 'PermissionDeniedError'
          ? `Permission denied: Please accept system permissions to remove ${appName}`
          : `System permission popup detected: Please accept permissions to continue removing ${appName}`;
        
        addFrontendLog(`🔒 ${userMessage}`);
        setError(userMessage);
        
        // Create error with clear user message
        const userFriendlyError = new Error(userMessage);
        userFriendlyError.name = err.name;
        userFriendlyError.userFriendly = true;
        throw userFriendlyError;
      }
      addFrontendLog(`❌ Failed to start uninstall ${appName}: ${err.message}`);
      setError(err.message);
      throw err;
    }
  }, [startJobPolling, addFrontendLog]);
  
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
        // AppState enum: "starting" | "running" | "done" | "stopping" | "error"
        // Active states: "starting", "running" (robot should be locked)
        // Finished states: "done", "stopping", "error" (robot should be unlocked)
        const isAppActive = appState === 'running' || appState === 'starting';
        const isAppFinished = appState === 'done' || appState === 'stopping' || appState === 'error';
        
        if (isAppActive && !hasError) {
          // ✅ App is active (starting or running): ensure store is locked
          if (!store.isAppRunning || store.currentAppName !== appName) {
            store.lockForApp(appName);
          }
        } else if (isAppFinished || hasError) {
          // ✅ App is finished/crashed/stopping: unlock if locked
          // Note: "stopping" means app is shutting down, we should unlock to allow new actions
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
      
      // ✅ On error, also check if we need to unlock (daemon might be down)
      const store = useAppStore.getState();
      if (store.isAppRunning && store.busyReason === 'app-running') {
        // Don't unlock on network errors, only if we're sure no app is running
        // This prevents unlocking when daemon is temporarily unavailable
      }
      
      return null;
    }
  }, []);
  
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
      setError(err.message);
      throw err;
    }
  }, [fetchCurrentAppStatus, addFrontendLog]);
  
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
      setError(err.message);
      // ✅ Ensure unlock even on error
      useAppStore.getState().unlockApp();
      throw err;
    }
  }, [fetchCurrentAppStatus, addFrontendLog]);
  
  /**
   * Cleanup: stop all pollings on unmount
   */
  useEffect(() => {
    return cleanupJobs;
  }, [cleanupJobs]);
  
  /**
   * Initial fetch + polling of current app status
   * Refetches when official changes
   * ✅ Cleans up currentApp when daemon becomes inactive
   */
  useEffect(() => {
    if (!isActive) {
      // ✅ Cleanup: If daemon becomes inactive, clear currentApp state
      setCurrentApp(null);
      return;
    }
    
    // Fetch apps (will refetch when official changes)
    fetchAvailableApps(official);
    fetchCurrentAppStatus();
    
    // Polling current app status
    const interval = setInterval(fetchCurrentAppStatus, DAEMON_CONFIG.INTERVALS.APP_STATUS);
    
    return () => clearInterval(interval);
  }, [isActive, official, fetchAvailableApps, fetchCurrentAppStatus]);
  
  return {
    // Data
    availableApps,
    installedApps,
    currentApp,
    activeJobs, // Map of job_id -> job info
    isLoading,
    error,
    
    // Actions
    fetchAvailableApps,
    installApp,
    removeApp,
    startApp,
    stopCurrentApp,
    fetchCurrentAppStatus,
  };
}

