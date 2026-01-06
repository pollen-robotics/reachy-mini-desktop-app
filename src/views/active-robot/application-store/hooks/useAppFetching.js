import { useCallback } from 'react';
import { DAEMON_CONFIG, fetchWithTimeout, buildApiUrl, fetchExternal } from '@config/daemon';

// Official app list URL - shared across functions
const OFFICIAL_APP_LIST_URL = 'https://huggingface.co/datasets/pollen-robotics/reachy-mini-official-app-store/raw/main/app-list.json';

/**
 * Hook for fetching apps from different sources
 * Handles official apps, all apps, and installed apps
 */
export function useAppFetching() {
  /**
   * Fetch the list of official app IDs from HF dataset
   * @returns {Promise<string[]>} Array of official app IDs
   */
  const fetchOfficialAppIds = useCallback(async () => {
    try {
      const listResponse = await fetchExternal(OFFICIAL_APP_LIST_URL, {}, DAEMON_CONFIG.TIMEOUTS.APPS_LIST, { silent: true });
      if (!listResponse.ok) {
        const error = new Error(`HTTP ${listResponse.status}`);
        error.name = 'NetworkError';
        throw error;
      }
      const authorizedIds = await listResponse.json();
      return Array.isArray(authorizedIds) ? authorizedIds : [];
    } catch (err) {
      throw err;
    }
  }, []);

  /**
   * Fetch official apps using daemon API (which filters by tag "reachy mini")
   */
  const fetchOfficialApps = useCallback(async () => {
    try {
      const authorizedIds = await fetchOfficialAppIds();
      
      if (authorizedIds.length === 0) {
        return [];
      }
      
      let daemonSpaces = [];
      try {
        const daemonUrl = buildApiUrl('/api/apps/list-available/hf_space');
        const daemonResponse = await fetchWithTimeout(
          daemonUrl,
          {},
          DAEMON_CONFIG.TIMEOUTS.APPS_LIST,
          { silent: true }
        );
        
        if (daemonResponse.ok) {
          daemonSpaces = await daemonResponse.json();
        }
      } catch (daemonErr) {
        // Daemon not available, will return empty
      }
      
      // Create a map of spaces by ID for fast lookup
      const spacesMap = new Map();
      for (const space of daemonSpaces) {
        if (space && space.id) {
          spacesMap.set(space.id, space);
        }
        if (space && space.name) {
          const fullId = space.id || `${space.extra?.id || space.name}`;
          if (fullId.includes('/')) {
            spacesMap.set(fullId, space);
          }
        }
      }
      
      // Build AppInfo list - GUARANTEE all official apps are included
      const apps = [];
      for (const officialId of authorizedIds) {
        let space = spacesMap.get(officialId);
        
        if (!space) {
          const officialName = officialId.split('/').pop();
          space = daemonSpaces.find(s => 
            s.name === officialName || 
            s.id === officialId ||
            s.extra?.id === officialId
          );
        }
        
        if (space) {
          const spaceData = space.extra || space;
          
          apps.push({
            name: space.name || officialId.split('/').pop(),
            id: space.id || spaceData.id || officialId,
            description: space.description || spaceData.cardData?.short_description || '',
            url: space.url || `https://huggingface.co/spaces/${space.id || spaceData.id || officialId}`,
            source_kind: 'hf_space',
            extra: spaceData,
          });
        } else {
          apps.push({
            name: officialId.split('/').pop(),
            id: officialId,
            description: '',
            url: `https://huggingface.co/spaces/${officialId}`,
            source_kind: 'hf_space',
            extra: {
              id: officialId,
              cardData: {},
            },
          });
        }
      }
      
      return apps;
    } catch (error) {
      const isNetworkError = 
        error.name === 'NetworkError' || 
        error.name === 'AbortError' ||
        error.name === 'TimeoutError' ||
        error.isOffline || 
        error.message?.toLowerCase().includes('network') ||
        error.message?.toLowerCase().includes('timeout') ||
        error.message?.toLowerCase().includes('connection') ||
        error.message?.toLowerCase().includes('fetch');
      
      if (isNetworkError) {
        const networkError = new Error('No internet connection');
        networkError.name = 'NetworkError';
        networkError.originalError = error;
        throw networkError;
      }
      
      console.error('[Apps] Failed to fetch official apps:', error.message);
      throw error;
    }
  }, [fetchOfficialAppIds]);
  
  /**
   * Fetch all apps from daemon (non-official mode)
   */
  const fetchAllAppsFromDaemon = useCallback(async () => {
    try {
      const url = buildApiUrl(`/api/apps/list-available?official=false`);
      const response = await fetchWithTimeout(
        url,
        {},
        DAEMON_CONFIG.TIMEOUTS.APPS_LIST,
        { silent: true }
      );
      
      if (!response.ok) {
        return [];
      }
      
      let daemonApps = await response.json();
      
      // Deduplicate apps by name
      const seenNames = new Set();
      daemonApps = daemonApps.filter(app => {
        const name = app.name?.toLowerCase();
        if (!name || seenNames.has(name)) {
          return false;
        }
        seenNames.add(name);
        return true;
      });
      
      // Exclude apps with source_kind 'installed'
      daemonApps = daemonApps.filter(app => app.source_kind !== 'installed');
      
      // Exclude official apps from the list
      const officialAppIds = await fetchOfficialAppIds();
      if (officialAppIds.length > 0) {
        const officialIdsSet = new Set(officialAppIds.map(id => id.toLowerCase()));
        const officialNamesSet = new Set(officialAppIds.map(id => id.split('/').pop().toLowerCase()));
        
        daemonApps = daemonApps.filter(app => {
          const appId = (app.id || app.extra?.id || '').toLowerCase();
          const appName = (app.name || '').toLowerCase();
          const isOfficial = officialIdsSet.has(appId) || officialNamesSet.has(appName);
          return !isOfficial;
        });
      }
      
      // Enrich non-official apps with runtime data from Hugging Face API
      const HF_SPACES_API_URL = 'https://huggingface.co/api/spaces';
      const runtimePromises = daemonApps.map(async (app) => {
        if (app.extra?.runtime) {
          return app;
        }
        
        const spaceId = app.id || app.extra?.id;
        if (!spaceId) {
          return app;
        }
        
        try {
          const fullSpaceId = spaceId.includes('/') ? spaceId : `pollen-robotics/${spaceId}`;
          const spaceResponse = await fetchExternal(`${HF_SPACES_API_URL}/${fullSpaceId}`, {}, DAEMON_CONFIG.TIMEOUTS.APPS_LIST, { silent: true });
          if (spaceResponse.ok) {
            const spaceData = await spaceResponse.json();
            if (spaceData.runtime) {
              app.extra = {
                ...app.extra,
                runtime: spaceData.runtime,
              };
            }
          }
        } catch (err) {
          // Skip runtime enrichment on error
        }
        return app;
      });
      
      daemonApps = await Promise.all(runtimePromises);
      return daemonApps;
    } catch (daemonErr) {
      return [];
    }
  }, [fetchOfficialAppIds]);
  
  /**
   * Fetch installed apps from daemon
   */
  const fetchInstalledApps = useCallback(async (retryCount = 0) => {
    const MAX_RETRIES = 3;
    const RETRY_DELAYS = [1000, 2000, 3000];
    
    try {
      const installedUrl = buildApiUrl('/api/apps/list-available/installed');
      const installedResponse = await fetchWithTimeout(
        installedUrl,
        {},
        DAEMON_CONFIG.TIMEOUTS.APPS_LIST,
        { silent: true }
      );
      
      if (installedResponse.ok) {
        const rawInstalledApps = await installedResponse.json();
        const installedApps = rawInstalledApps.map(app => ({
          ...app,
          source_kind: app.source_kind || 'local',
        }));
        return { apps: installedApps, error: null };
      }
      
      if (installedResponse.status >= 500) {
        if (retryCount < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[retryCount]));
          return fetchInstalledApps(retryCount + 1);
        }
        return { apps: [], error: `Server error: ${installedResponse.status}` };
      }
      
      return { apps: [], error: `HTTP ${installedResponse.status}` };
    } catch (err) {
      const isRetryableError = 
        err.name === 'TimeoutError' || 
        err.name === 'AbortError' || 
        err.message?.includes('timeout') ||
        err.message?.includes('Load failed') ||
        err.message?.includes('Failed to fetch') ||
        err.message?.includes('network') ||
        err.message?.includes('ECONNREFUSED');
      
      if (retryCount < MAX_RETRIES && isRetryableError) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[retryCount]));
        return fetchInstalledApps(retryCount + 1);
      }
      
      return { apps: [], error: err.message };
    }
  }, []);
  
  return {
    fetchOfficialApps,
    fetchAllAppsFromDaemon,
    fetchInstalledApps,
  };
}
